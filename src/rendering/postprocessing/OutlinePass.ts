import * as THREE from 'three';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import {
  CEL_OUTLINE_LAYER,
  SELECT_OUTLINE_LAYER,
  OUTLINE_OCCLUDER_LAYER,
  OUTLINE_ID_SCALE,
  outlineObjectIdUniform,
  setOutlineOccluderMeshes,
} from '../outlineMask';

/** Максимальное число точек в графике толщины контура (ограничение uniform-массива в GLSL) */
const MAX_THICKNESS_STEPS = 8;

/**
 * Порог (в метрах), отделяющий «сосед другого объекта дальше» от шума half-float.
 * Нужен, чтобы касающиеся или почти соприкасающиеся силуэты не давали ложную грань,
 * и при этом реальные перекрытия объектов (деревья, дома) распознавались уверенно.
 */
const OBJECT_EDGE_DEPTH_EPSILON = 0.05;

/** Потолок числа субсэмплов сглаживания (ограничение uniform/цикла в GLSL) */
const MAX_SUBPIXEL_SAMPLES = 8;

/** Каналы маски, которые пишет плоский материал-заменитель */
const MASK_CHANNEL_CEL = 0; // красный канал (обводка cel)
const MASK_CHANNEL_SELECT = 1; // зеленый канал (обводка выделения)
const MASK_CHANNEL_DEPTH_ONLY = 2; // только глубина (без цвета), когда cel-обводка выключена

export interface OutlineRenderOptions {
  /** Рисовать ли cel-обводку (кандидаты: существа, предметы, все препятствия) */
  cel: boolean;
  /** Рисовать ли обводку выделения */
  select: boolean;
  /** Цвет обводки выделения (зависит от режима: редактор/игра) */
  selectColor: number | string;
}

/**
 * Пост-процесс обводок.
 *
 * Вместо клона-обводки на каждый объект силуэты рендерятся в отдельный буфер
 * плоскими материалами-заменителями (`scene.overrideMaterial`), а полноэкранный
 * квад находит границы масок и смешивает контур поверх кадра. Стоимость —
 * 3 прохода по геометрии вместо удвоения геометрии в основном рендере.
 *
 * Проходы идут строго в порядке возрастания приоритета и используют буфер глубины:
 *  1. Перекрывающая геометрия (рельеф) — только глубина, без цвета;
 *  2. Кандидаты cel-обводки — красный канал + глубина;
 *  3. Выделение — зеленый канал, проверяется по глубине из шагов 1-2.
 *
 * Благодаря тесту глубины контур не просвечивает сквозь горы и дома, а при
 * пересечении двух силуэтов контур заднего объекта обрезается передним, а не
 * рисуется поверх него.
 *
 * В синий канал маски пишется линейная дистанция до камеры (half-float таргет),
 * по которой композит подбирает толщину контура из графика в конфиге.
 */
export class OutlinePass {
  private maskTarget: THREE.WebGLRenderTarget | null = null;

  /** Плоский материал-заменитель маски: пишет флаг канала и дистанцию */
  private maskMaterial = OutlinePass.createMaskMaterial();

  /** Материал перекрывающей геометрии: пишет только глубину (цвет отключен) */
  private occluderMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthTest: true,
    depthWrite: true,
    colorWrite: false,
    fog: false,
  });

  // Полноэкранный композит: детекция границ масок и смешивание контура с кадром
  private compositeScene = new THREE.Scene();
  private compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compositeQuad: THREE.Mesh;
  private compositeMaterial: THREE.ShaderMaterial;

  private _prevClearColor = new THREE.Color();

  constructor() {
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCelColor: { value: new THREE.Color(GRAPHICS_CONFIG.outlines.celColor) },
        uSelectColor: {
          value: new THREE.Color(VISUAL_CONFIG.selection.editorSelectedColor),
        },
        uMaxThickness: { value: GRAPHICS_CONFIG.outlines.maxThicknessPx },
        uStepDistance: { value: new Float32Array(MAX_THICKNESS_STEPS) },
        uStepThickness: { value: new Float32Array(MAX_THICKNESS_STEPS) },
        uStepCount: { value: 0 },
        uSamples: { value: GRAPHICS_CONFIG.outlines.smoothing.samples },
        uSoftness: { value: GRAPHICS_CONFIG.outlines.smoothing.softness },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        #define OUTLINE_STEPS ${MAX_THICKNESS_STEPS}
        #define MAX_SUBPIXEL_SAMPLES ${MAX_SUBPIXEL_SAMPLES}

        uniform sampler2D tMask;
        uniform vec2 uResolution;
        uniform vec3 uCelColor;
        uniform vec3 uSelectColor;
        uniform float uMaxThickness;
        uniform float uStepDistance[OUTLINE_STEPS];
        uniform float uStepThickness[OUTLINE_STEPS];
        uniform int uStepCount;
        uniform int uSamples;
        uniform float uSoftness;

        varying vec2 vUv;

        // Толщина контура (в пикселях) для дистанции d (в метрах) по графику конфига.
        // Индексы uniform-массивов берутся только из индекса цикла — это единственная
        // форма динамической индексации, разрешенная в GLSL ES 1.00.
        float thicknessAtDistance(float d) {
          if (uStepCount <= 1) {
            return uStepCount == 1 ? uStepThickness[0] : 1.0;
          }
          if (d <= uStepDistance[0]) return uStepThickness[0];

          for (int i = 1; i < OUTLINE_STEPS; i++) {
            if (i >= uStepCount) break;
            if (d <= uStepDistance[i]) {
              float span = max(0.0001, uStepDistance[i] - uStepDistance[i - 1]);
              float t = clamp((d - uStepDistance[i - 1]) / span, 0.0, 1.0);
              return mix(uStepThickness[i - 1], uStepThickness[i], t);
            }
            // Дистанция за последней точкой графика — берем толщину последней точки
            if (i == uStepCount - 1) return uStepThickness[i];
          }
          return uStepThickness[0];
        }

        /**
         * Покрытие контурной полосы в точке uv (0..1).
         *
         * Границы двух видов:
         *  - красный/зеленый каналы: граница «объект <-> фон» (внешний силуэт);
         *  - альфа-канал (id объекта): граница двух соседних объектов.
         */
        float edgeCoverage(vec2 uv) {
          vec4 c = texture2D(tMask, uv);

          // Покрытие объектом в этой точке. Маска фильтруется линейно, поэтому на
          // границе силуэта значение дробное — из него и получается сглаживание.
          float inCenter = max(c.r, c.g);
          if (inCenter <= 0.01) return 0.0;

          // Шаг выборки пересчитывается под дистанцию объекта (c.b — метры до камеры)
          float k = clamp(thicknessAtDistance(c.b), 0.0, uMaxThickness);
          vec2 offTexels = vec2(k);
          vec2 offUv = offTexels / uResolution;

          vec2 dirs[8];
          dirs[0] = vec2(-1.0, 0.0);
          dirs[1] = vec2(1.0, 0.0);
          dirs[2] = vec2(0.0, -1.0);
          dirs[3] = vec2(0.0, 1.0);
          dirs[4] = vec2(-0.70710678, -0.70710678);
          dirs[5] = vec2(0.70710678, -0.70710678);
          dirs[6] = vec2(-0.70710678, 0.70710678);
          dirs[7] = vec2(0.70710678, 0.70710678);

          // Идентификатор объекта читаем строго из текселя (texelFetch), а не из
          // линейно отфильтрованного значения: на кромке смешивание двух id дает
          // промежуточную «выдуманную» сущность, и граница между объектами
          // начинает расползаться вторым штрихом.
          ivec2 texSize = ivec2(uResolution);
          ivec2 centerTexel = clamp(ivec2(uv * uResolution), ivec2(0), texSize - ivec2(1));
          float centerId = round(texelFetch(tMask, centerTexel, 0).a * ${OUTLINE_ID_SCALE}.0);

          float notMine = 0.0;

          for (int i = 0; i < 8; i++) {
            vec4 s = texture2D(tMask, uv + offUv * dirs[i]);
            float sInside = max(s.r, s.g);

            // id = 0 означает «объекта тут нет»: фон, рельеф или трава (они пишут
            // в маску только глубину). Такой сосед отделяет нас обычным образом.
            ivec2 neighborTexel = clamp(
              centerTexel + ivec2(round(offTexels * dirs[i])),
              ivec2(0),
              texSize - ivec2(1)
            );
            float sId = round(texelFetch(tMask, neighborTexel, 0).a * ${OUTLINE_ID_SCALE}.0);
            bool otherObject = sId >= 0.5 && abs(sId - centerId) >= 0.5;

            float separation = 1.0 - sInside;
            if (otherObject) {
              // Грань двух объектов рисуется ТОЛЬКО со стороны переднего.
              // Если соседний объект впереди нас — нас перекрывают, контур здесь
              // не рисуется. Иначе на стыке двух деревьев получалась бы двойная
              // линия: контур переднего плюс контур заднего.
              separation = s.b > c.b + ${OBJECT_EDGE_DEPTH_EPSILON.toFixed(3)} ? 1.0 : 0.0;
            }
            notMine = max(notMine, separation);
          }

          // Пиксель принадлежит полосе контура, если сам объект здесь есть
          // и на расстоянии k начинается что-то другое (фон или объект позади)
          float band = smoothstep(0.5 - uSoftness * 0.45, 0.5 + uSoftness * 0.45, notMine);
          return inCenter * band;
        }

        void main() {
          vec2 texel = 1.0 / uResolution;

          // Субсэмплы внутри пикселя: усреднение по ним сглаживает «лесенку»
          // на наклонных и коротких участках контура. Количество — из конфига.
          vec2 sub[MAX_SUBPIXEL_SAMPLES];
          sub[0] = vec2(0.125, 0.375);
          sub[1] = vec2(0.625, 0.125);
          sub[2] = vec2(0.375, 0.875);
          sub[3] = vec2(0.875, 0.625);
          sub[4] = vec2(0.5, 0.5);
          sub[5] = vec2(0.0, 0.0);
          sub[6] = vec2(0.75, 0.25);
          sub[7] = vec2(0.25, 0.75);

          float coverage = 0.0;
          for (int i = 0; i < MAX_SUBPIXEL_SAMPLES; i++) {
            if (i >= uSamples) break;
            coverage += edgeCoverage(vUv + sub[i] * texel);
          }
          coverage /= float(max(uSamples, 1));

          if (coverage <= 0.003) discard;

          // Цвет берём из центра пикселя: там же решается, cel это контур или выделение
          vec4 c = texture2D(tMask, vUv);
          // Зеленый канал (выделение) имеет приоритет по цвету над красным (cel)
          gl_FragColor = vec4(mix(uCelColor, uSelectColor, c.g), clamp(coverage, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
    this.compositeScene.add(this.compositeQuad);
  }

  /**
   * Плоский материал-заменитель маски. Пишет в four канала:
   * R — флаг cel-обводки, G — флаг выделения, B — листанция до камеры,
   * A — идентификатор объекта (см. `outlineMask`).
   *
   * Именно ShaderMaterial, а не MeshBasicMaterial: значение `uObjectId` должно
   * меняться для каждого отрисованного объекта, а three перезаливает uniform
   * между объектами только у ShaderMaterial с флагом `uniformsNeedUpdate`.
   *
   * Вершинный шейдер собран из штатных чанков three, поэтому корректно
   * обрабатывает скининг, морф-таргеты, инстансинг и батчинг.
   */
  private static createMaskMaterial(): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMaskChannel: { value: MASK_CHANNEL_DEPTH_ONLY },
        uObjectId: outlineObjectIdUniform,
      },
      vertexShader: `
        #include <common>
        #include <batching_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>

        varying float vViewDepth;

        void main() {
          #include <batching_vertex>
          #include <skinbase_vertex>
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          #include <project_vertex>

          vViewDepth = -mvPosition.z;
        }
      `,
      fragmentShader: `
        #include <common>

        uniform float uMaskChannel;
        uniform float uObjectId;

        varying float vViewDepth;

        void main() {
          gl_FragColor = vec4(
            uMaskChannel < 0.5 ? 1.0 : 0.0,
            uMaskChannel > 0.5 && uMaskChannel < 1.5 ? 1.0 : 0.0,
            vViewDepth,
            uObjectId
          );
        }
      `,
      depthTest: true,
      depthWrite: true,
      fog: false,
    });

    // Ссылка на uniform нужна рендеру, чтобы помечать материал на перезаливку
    material.userData.channelUniform = material.uniforms.uMaskChannel;

    return material;
  }

  /** Создание/пересоздание буфера масок при изменении внутреннего разрешения */
  private ensureMaskTarget(width: number, height: number): boolean {
    if (width <= 0 || height <= 0) return false;
    if (this.maskTarget && this.maskTarget.width === width && this.maskTarget.height === height) {
      return true;
    }

    if (this.maskTarget) this.maskTarget.dispose();
    this.maskTarget = new THREE.WebGLRenderTarget(width, height, {
      // Линейная фильтрация обязательна для сглаживания: маска интерполируется между
      // текселями, и разница каналов у границы нарастает плавно, давая дробное покрытие
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      // Half-float ради дистанции в синем канале (RGBA8 не хватает точности)
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    return true;
  }

  /** Актуализация графика толщины из конфига (живое обновление без пересборки шейдера) */
  private syncThicknessCurve(): void {
    const cfg = GRAPHICS_CONFIG.outlines;
    const steps = cfg.thicknessByDistance;
    const uniforms = this.compositeMaterial.uniforms;
    const count = Math.min(MAX_THICKNESS_STEPS, steps.length);

    for (let i = 0; i < count; i++) {
      (uniforms.uStepDistance.value as Float32Array)[i] = steps[i].distance;
      (uniforms.uStepThickness.value as Float32Array)[i] = steps[i].thickness;
    }
    uniforms.uStepCount.value = count;
    uniforms.uMaxThickness.value = cfg.maxThicknessPx;
    uniforms.uCelColor.value.set(cfg.celColor);
    // Сглаживание берется из конфига, поэтому настройка применяется без пересборки шейдера
    uniforms.uSamples.value = Math.max(
      1,
      Math.min(MAX_SUBPIXEL_SAMPLES, Math.round(cfg.smoothing.samples))
    );
    uniforms.uSoftness.value = Math.max(0.05, cfg.smoothing.softness);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    internalW: number,
    internalH: number,
    opts: OutlineRenderOptions
  ): void {
    if (!this.ensureMaskTarget(internalW, internalH)) return;
    const maskTarget = this.maskTarget;
    if (!maskTarget) return;

    this.syncThicknessCurve();
    this.compositeMaterial.uniforms.uSelectColor.value.set(opts.selectColor);

    // Сохранение состояния рендерера, чтобы пост-процесс был полностью прозрачным
    const prevTarget = renderer.getRenderTarget();
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._prevClearColor);
    const prevAutoClear = renderer.autoClear;
    const prevAutoClearColor = renderer.autoClearColor;
    const prevAutoClearDepth = renderer.autoClearDepth;
    const prevShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const prevCameraLayersMask = camera.layers.mask;

    // Служебные проходы никогда не пересчитывают теневые карты
    renderer.shadowMap.autoUpdate = false;

    // КРИТИЧНО: если у сцены задан scene.background (Color), three принудительно
    // очищает буфер в начале КАЖДОГО render() — это стерло бы каналы масок,
    // накопленные предыдущими проходами. Глубину мы очищаем вручную ниже,
    // а каналы должны накапливаться, поэтому автоочистка на время проходов выключается.
    renderer.autoClearColor = false;
    renderer.autoClearDepth = false;

    renderer.setRenderTarget(maskTarget);
    // Альфа = 0 — признак «объекта тут нет» (фон и перекрывающая геометрия)
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear(true, true, false);
    renderer.autoClear = false;

    // --- 1. ПЕРЕКРЫВАЮЩАЯ ГЕОМЕТРИЯ (рельеф, трава): только глубина ---
    // Рельеф и трава не получают собственного контура, но перекрывают все, что за ними:
    // в том числе контур объекта там, где перед ним стоит трава.
    // Трава на время прохода переключается на дешёвый depth-материал (общий вершинный
    // код сохраняется, поэтому затухание дальних пучков остаётся в силе).
    camera.layers.set(OUTLINE_OCCLUDER_LAYER);
    scene.overrideMaterial = this.occluderMaterial;
    try {
      setOutlineOccluderMeshes(true);
      renderer.render(scene, camera);
    } finally {
      // Трава обязана вернуться на основной материал: иначе она останется
      // depth-only и пропадет из основного рендера
      setOutlineOccluderMeshes(false);
    }

    // --- 2. КАНДИДАТЫ CEL-ОБВОДКИ: красный канал + глубина ---
    // Если cel-обводка выключена, канал все равно нужен для корректной глубины
    camera.layers.set(CEL_OUTLINE_LAYER);
    scene.overrideMaterial = this.maskMaterial;
    this.maskMaterial.userData.channelUniform.value = opts.cel
      ? MASK_CHANNEL_CEL
      : MASK_CHANNEL_DEPTH_ONLY;
    renderer.render(scene, camera);

    // --- 3. ОБВОДКА ВЫДЕЛЕНИЯ: зеленый канал, отсеченный по глубине ---
    if (opts.select) {
      camera.layers.set(SELECT_OUTLINE_LAYER);
      this.maskMaterial.userData.channelUniform.value = MASK_CHANNEL_SELECT;
      renderer.render(scene, camera);
    }

    scene.overrideMaterial = null;
    camera.layers.mask = prevCameraLayersMask;

    // --- 4. КОМПОЗИТ ПОВЕРХ ОСНОВНОГО КАДРА ---
    this.compositeMaterial.uniforms.tMask.value = maskTarget.texture;
    this.compositeMaterial.uniforms.uResolution.value.set(internalW, internalH);

    renderer.setRenderTarget(null);
    renderer.autoClear = false; // НЕ очищаем кадр: композит смешивается поверх сцены
    renderer.render(this.compositeScene, this.compositeCamera);
    renderer.autoClear = prevAutoClear;

    // Восстановление состояния
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this._prevClearColor, prevClearAlpha);
    renderer.autoClearColor = prevAutoClearColor;
    renderer.autoClearDepth = prevAutoClearDepth;
    renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
  }

  public dispose(): void {
    if (this.maskTarget) {
      this.maskTarget.dispose();
      this.maskTarget = null;
    }
    this.maskMaterial.dispose();
    this.occluderMaterial.dispose();
    this.compositeMaterial.dispose();
    this.compositeQuad.geometry.dispose();
    this.compositeScene.remove(this.compositeQuad);
  }
}
