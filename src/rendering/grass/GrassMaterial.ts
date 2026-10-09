import * as THREE from 'three';
import { GRASS_CONFIG } from '../../config/grassConfig';

export interface GrassMaterialUniforms {
  uTime: { value: number };
  uWindSpeed: { value: number };
  uWindStrength: { value: number };
  uTrampleMap: { value: THREE.Texture | null };
  uTrampleCenter: { value: THREE.Vector2 };
  uTrampleSize: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uFadeStart: { value: number };
  uFadeEnd: { value: number };
  /** Начало полосы разрежения травы (метры) */
  uLodStart: { value: number };
  /** Конец полосы разрежения травы (метры) */
  uLodEnd: { value: number };
  /** Минимальный множитель плотности на дальней дистанции */
  uMinDensity: { value: number };
  /** Ширина мягкого перехода «инстанс живёт / умер» по шкале плотности */
  uDensityFadeWidth: { value: number };
}

/**
 * Набор uniform-ов травы. Один и тот же объект-хранилище переиспользуется основным
 * материалом и его дешёвым depth-вариантом, поэтому обновления (ветер, приминание,
 * позиция камеры) достаточно применять один раз в кадр — оба шейдера их видят.
 */
export function createGrassUniforms(): GrassMaterialUniforms {
  const defaultTrampleTexture = new THREE.DataTexture(new Uint8Array([0, 128, 128, 255]), 1, 1);
  defaultTrampleTexture.needsUpdate = true;

  return {
    uTime: { value: 0 },
    uWindSpeed: { value: 1.8 },
    uWindStrength: { value: 0.14 },
    uTrampleMap: { value: defaultTrampleTexture },
    uTrampleCenter: { value: new THREE.Vector2(0, 0) },
    uTrampleSize: { value: GRASS_CONFIG.trample.mapSize },
    uCameraPos: { value: new THREE.Vector3(0, 0, 0) },
    uFadeStart: { value: GRASS_CONFIG.fade.fadeStartDistance },
    uFadeEnd: { value: GRASS_CONFIG.fade.fadeEndDistance },
    uLodStart: { value: GRASS_CONFIG.lod.blendStartDistance },
    uLodEnd: { value: GRASS_CONFIG.lod.blendEndDistance },
    uMinDensity: { value: GRASS_CONFIG.lod.minDensityFactor },
    uDensityFadeWidth: { value: GRASS_CONFIG.lod.densityFadeWidth },
  };
}

/** Объявления uniform-ов травы, добавляемые в начало вершинного шейдера */
const GRASS_UNIFORM_DECLARATIONS = `
      uniform float uTime;
      uniform float uWindSpeed;
      uniform float uWindStrength;
      uniform sampler2D uTrampleMap;
      uniform vec2 uTrampleCenter;
      uniform float uTrampleSize;
      uniform vec3 uCameraPos;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uLodStart;
      uniform float uLodEnd;
      uniform float uMinDensity;
      uniform float uDensityFadeWidth;

      /**
       * Стабильный по мировым координатам псевдослучайный шум [0..1).
       *
       * Нужен для разрежения травы в вершинном коде. Важно, что он считается
       * от ПОЗИЦИИ инстанса, а не от номера ячейки: инстансов больше не отбрасывается
       * на CPU, и у шейдера нет их номера. Hash от позиции даёт ту же
       * пространственную случайность, что и хеш от номера ячейки.
       */
      float grassHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
`;

/**
 * Общий вершинный код травы (заменяет <project_vertex>): ветер, приминание и
 * затухание по расстоянию до камеры. Именно здесь дальние пучки схлопываются
 * в ноль — без этого кода окклюдер контуров «съел» бы весь горизонт.
 */
const GRASS_VERTEX_PATCH = `
      // Мировое положение корня текущего пучка травы (pivot у земли)
      #ifdef USE_INSTANCING
        vec4 instanceRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 baseWorldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #else
        vec4 instanceRoot = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 baseWorldPos = modelMatrix * vec4(transformed, 1.0);
      #endif

      // Вектор от корня пучка к текущей вершине
      vec3 bladeOffset = baseWorldPos.xyz - instanceRoot.xyz;

      // uv.y — это ПРОФИЛЬ ИЗГИБА, а не текстурная координата: 0 у корня,
      // максимум на верхушке. У обычной травы он линейный 0..1, поэтому корень
      // неподвижен, а конец выгибается сильнее всего. У соцветий (колосок,
      // початок, венчик цветка) геометрия задаёт его постоянным и равным
      // профилю верха стебля — тогда соцветие едет вместе со стеблем как одно
      // жёсткое целое и не сминается.
      float hFactor = uv.y;

      // 1. Считывание примятости и направления из следящей Trample Texture
      vec2 trampleUv = (instanceRoot.xz - uTrampleCenter) / uTrampleSize + 0.5;
      vec4 trampleSample = (trampleUv.x >= 0.0 && trampleUv.x <= 1.0 && trampleUv.y >= 0.0 && trampleUv.y <= 1.0)
        ? texture2D(uTrampleMap, trampleUv)
        : vec4(0.0, 0.5, 0.5, 1.0);

      float maxTrampleFactor = trampleSample.r;
      vec2 decodedDir = trampleSample.gb * 2.0 - 1.0;
      float dirLen = length(decodedDir);
      vec2 tramplingDir = dirLen > 0.01 ? decodedDir / dirLen : vec2(0.0, 1.0);

      // 2. Изгиб по дуге с сохранением длины (Arc-Length Preserving Bending)
      float origY = max(0.001, bladeOffset.y);

      // Угол изгиба от давления (max ~85 градусов или 1.5 радиан)
      float trampleAngle = maxTrampleFactor * 1.56;
      vec2 trampleVec = tramplingDir * trampleAngle;

      // Процедурный ветер
      float wave = sin(uTime * uWindSpeed + instanceRoot.x * 0.4 + instanceRoot.z * 0.3);
      vec2 windVec = vec2(0.85, 0.52) * (wave * uWindStrength * 0.6);

      // Суммарный вектор изгиба (объединяет ветер и наступание)
      vec2 totalBendVec = trampleVec + windVec;
      float bendAngle = length(totalBendVec);
      vec2 bendDir = bendAngle > 0.001 ? totalBendVec / bendAngle : vec2(0.0, 1.0);

      // Ограничиваем угол, чтобы трава не уходила под землю
      bendAngle = clamp(bendAngle, 0.001, 1.56);

      // Угол наклона конкретно для этой вершины (от 0 до bendAngle)
      float currentAngle = bendAngle * hFactor;

      float forwardOffset;
      float newY;

      // Вычисление координат на дуге окружности
      if (currentAngle < 0.01) {
        // Аппроксимация Тейлора для микро-углов (предотвращает деление на ноль)
        forwardOffset = origY * currentAngle * 0.5;
        newY = origY;
      } else {
        // Точный расчет радиуса кривизны: длина дуги (origY) = Радиус * Угол
        float radius = origY / currentAngle;
        forwardOffset = radius * (1.0 - cos(currentAngle));
        newY = radius * sin(currentAngle);
      }

      // Легкое приплюскивание стебля под тяжестью существа (макс 10% укорочения, без растяжения)
      float compression = 1.0 - (0.1 * maxTrampleFactor * hFactor);

      // Применяем новые координаты
      bladeOffset.xz += bendDir * (forwardOffset * compression);
      bladeOffset.y = newY * compression;

      // 3. Бесшовное затухание высоты по расстоянию до фокуса камеры (Distance Fade)
      float distToCam = length(instanceRoot.xz - uCameraPos.xz);
      float distFactor = clamp((uFadeEnd - distToCam) / max(0.001, uFadeEnd - uFadeStart), 0.0, 1.0);
      float distanceScale = distFactor * distFactor * (3.0 - 2.0 * distFactor);

      /**
       * Разрежение плотности — плавное «схлопывание в ноль», а не вырезание.
       *
       * Раньше порог плотности применялся на CPU бинарным сравнением с хешем
       * ячейки: как только порог опускался ниже хеша, инстанс просто не попадал
       * в буфер и пучок исчезал мгновенно. Поскольку хеш плотности и хеш
       * упрощения геометрии использовали разные сиды, в одной области часть
       * травинок переключалась на упрощённую форму, а часть соседних просто
       * пропадала — отсюда «рваный» вид на дистанции.
       *
       * Теперь порог остаётся тем же (тот же закон 1 + (minDensity - 1) * lodT),
       * но сравнение с ним сглажено: инстанс сжимается до нуля на конечном
       * участке шкалы плотности, поэтому исчезновение выглядит как усадка.
       */
      float lodT = clamp((distToCam - uLodStart) / max(0.001, uLodEnd - uLodStart), 0.0, 1.0);
      lodT = lodT * lodT * (3.0 - 2.0 * lodT);
      float densityThreshold = 1.0 + (uMinDensity - 1.0) * lodT;
      float instanceHash = grassHash(floor(instanceRoot.xz * 2.5));
      float keep = smoothstep(
        -uDensityFadeWidth * 0.5,
        uDensityFadeWidth * 0.5,
        densityThreshold - instanceHash
      );

      bladeOffset *= distanceScale * keep;

      // Итоговая позиция: корень куста + скорректированный по дуге вектор травинки
      vec4 worldPos = vec4(instanceRoot.xyz + bladeOffset, 1.0);

      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Устраняет инверсию нормалей Three.js для двусторонней растительности:
 * обе стороны травинки находятся под открытым небом и должны ловить свет сверху.
 */
const GRASS_NORMAL_PATCH = `
      #include <normal_fragment_begin>
      #ifdef DOUBLE_SIDED
        if ( ! gl_FrontFacing ) {
          normal = - normal;
        }
      #endif
`;

/** Внедряет общий вершинный код травы в любой материал (standard/basic) */
function applyGrassShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  uniforms: GrassMaterialUniforms
): void {
  Object.assign(shader.uniforms, uniforms);

  shader.vertexShader = `${GRASS_UNIFORM_DECLARATIONS}\n${shader.vertexShader}`;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    GRASS_VERTEX_PATCH
  );

  // В MeshBasicMaterial этого чанка нет — replace тогда просто ничего не меняет
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_begin>',
    GRASS_NORMAL_PATCH
  );
}

/** Основной материал травы (освещение, тени, ветер, приминание, затухание) */
export function createGrassMaterial(uniforms: GrassMaterialUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
    vertexColors: true,
  });

  material.defines = {
    USE_UV: '',
  };

  material.userData.isSharedMaterial = true;
  material.customProgramCacheKey = () => 'InteractiveGrassMaterial_v5';
  material.onBeforeCompile = (shader) => applyGrassShader(shader, uniforms);

  return material;
}

/**
 * Дешёвый материал травы для прохода оклюдеров контуров: тот же вершинный код
 * (ветер/приминание/затухание), но без освещения, теней и записи цвета — в маске
 * от травы нужна только глубина, чтобы она перекрывала контуры объектов позади.
 */
export function createGrassOccluderMaterial(
  uniforms: GrassMaterialUniforms
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    // Двусторонность обязательна: иначе обратные стороны травинок не пишут глубину
    side: THREE.DoubleSide,
    vertexColors: true,
    fog: false,
  });

  material.defines = {
    USE_UV: '',
  };

  // Материал не должен подменяться scene.overrideMaterial в проходе оклюдеров:
  // иначе вернётся дешёвый материал без затухания по расстоянию
  material.allowOverride = false;
  material.colorWrite = false;
  material.userData.isSharedMaterial = true;
  material.customProgramCacheKey = () => 'InteractiveGrassOccluderMaterial_v1';
  material.onBeforeCompile = (shader) => applyGrassShader(shader, uniforms);

  return material;
}
