import * as THREE from 'three';
import { WaterData } from '../../types';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';

export function createWaterMaterial(
  comp: WaterData,
  rippleTexture?: THREE.Texture | null
): THREE.ShaderMaterial {
  const baseColor = new THREE.Color(comp.color || '#3498db');
  const deepColor = new THREE.Color(comp.deepColor || '#0b3954');

  const flowDir = new THREE.Vector2(comp.flowDirection?.x ?? 0, comp.flowDirection?.z ?? 0);
  if (flowDir.lengthSq() > 0.001) {
    flowDir.normalize();
  }

  const defaultRippleTex = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 1]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  defaultRippleTex.needsUpdate = true;

  const rippleRes = GRAPHICS_CONFIG.water.ripples.resolution;

  const waterUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib['lights'],
    THREE.UniformsLib['fog'],
    {
      receiveShadow: { value: true },
      uTime: { value: 0 },
      // Цвета мелководья и глубины
      uColor: { value: baseColor },
      uDeepColor: { value: deepColor },
      // Прозрачность у берега и на глубине
      uOpacity: { value: comp.opacity ?? 0.88 },
      uShallowOpacity: { value: comp.shallowOpacity ?? 0.25 },
      uClarity: { value: comp.clarity ?? 2.5 },
      // Параметры волн и течения
      uWaveSpeed: { value: comp.waveSpeed ?? 1.2 },
      uWaveHeight: { value: comp.waveHeight ?? 0.12 },
      uFlowDirection: { value: flowDir },
      uFlowSpeed: { value: comp.flowSpeed ?? 0.0 },
      uFoamIntensity: { value: comp.foamIntensity ?? 1.0 },
      // Интерактивная рябь: инициализируем null для предотвращения попытки клонирования RenderTarget текстуры
      tRipple: { value: null },
      uRippleTexel: { value: new THREE.Vector2(1.0 / rippleRes, 1.0 / rippleRes) },
      uRippleDisplacement: { value: GRAPHICS_CONFIG.water.ripples.displacementScale },
      uHasRipples: { value: 0.0 },
      uRippleCenter: { value: new THREE.Vector2(0, 0) },
      uRippleSize: { value: 48.0 },
      // Переключатели тяжелых эффектов (низкий пресет): управляются из GRAPHICS_CONFIG.water.fx
      uFxDepth: { value: GRAPHICS_CONFIG.water.fx.depth ? 1.0 : 0.0 },
      uFxCaustics: { value: GRAPHICS_CONFIG.water.fx.caustics ? 1.0 : 0.0 },
      // Освещение
      uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
      uAmbientColor: { value: new THREE.Color(0.25, 0.3, 0.4) },
      // Глубина сцены
      tDepth: { value: null },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000.0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // Размер одного текселя таргета глубины в UV: нужен для ручной билинейной
      // выборки, потому что depth-текстуры в GLES3 не поддерживают аппаратный
      // LINEAR-фильтр (формат не filterable — текстура становится неполной).
      uDepthTexel: { value: new THREE.Vector2(1.0 / rippleRes, 1.0 / rippleRes) },
    },
  ]);

  // Присваиваем текстуру напрямую по ссылке в обход cloneUniforms
  waterUniforms.tRipple.value = rippleTexture || defaultRippleTex;

  const material = new THREE.ShaderMaterial({
    lights: true, // Включаем прием теней от источников света Three.js
    fog: true,
    uniforms: waterUniforms,
    vertexShader: `
    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>

    uniform float uTime;
    uniform float uWaveSpeed;
    uniform float uWaveHeight;
  uniform vec2 uFlowDirection;
    uniform float uFlowSpeed;
    uniform sampler2D tRipple;
    uniform float uRippleDisplacement;
    uniform vec2 uRippleCenter;
    uniform float uRippleSize;

    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vWaveHeight;

    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      
      vec2 flow = uFlowDirection * (uFlowSpeed * uTime * 0.5);
      vec2 p = worldPos.xz * 0.4 + flow;
      
      // Органическая деформация геометрии: наложение непараллельных волн
      float w1 = sin(p.x * 1.2 + uTime * uWaveSpeed) * cos(p.y * 1.1 + uTime * uWaveSpeed * 0.8);
      float w2 = sin(p.x * 0.8 - p.y * 1.3 + uTime * uWaveSpeed * 1.1) * 0.6;
      float w3 = cos(p.x * 1.5 + p.y * 0.7 - uTime * uWaveSpeed * 0.9) * 0.4;
      
      float totalWave = (w1 + w2 + w3) * uWaveHeight * 0.6;

      // Смещение вершин от интерактивных расходящихся волн (в мировых координатах для независимости от размера меша)
      vec2 rippleUv = (worldPos.xz - uRippleCenter) / uRippleSize + 0.5;
      float rippleSample = 0.0;
      if (rippleUv.x >= 0.0 && rippleUv.x <= 1.0 && rippleUv.y >= 0.0 && rippleUv.y <= 1.0) {
        rippleSample = texture2D(tRipple, rippleUv).r;
      }
      float rippleHeight = rippleSample * uRippleDisplacement;

      vec3 transformed = position;
      transformed.y += totalWave + rippleHeight;

      vWaveHeight = totalWave + rippleHeight;
      vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;

      // Базовая нормаль плоского меша (обычно (0,1,0))
      vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vec3 transformedNormal = normalMatrix * normal;
      
      vec4 worldPosition = vec4(vWorldPosition, 1.0);
      
      vec4 mvPosition = viewMatrix * worldPosition;
      gl_Position = projectionMatrix * mvPosition;
      
      #include <shadowmap_vertex>
      #include <fog_vertex>
    }
  `,
    fragmentShader: `
    #include <common>
    #include <packing>
    uniform bool receiveShadow;
    #include <fog_pars_fragment>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>

      uniform vec3 uColor;
      uniform vec3 uDeepColor;
      uniform float uOpacity;
      uniform float uShallowOpacity;
      uniform float uClarity;

      uniform float uTime;
      uniform vec2 uFlowDirection;
      uniform float uFlowSpeed;
      uniform float uWaveHeight;
      uniform float uWaveSpeed;
      uniform float uFoamIntensity;

      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uAmbientColor;

      uniform sampler2D tDepth;
      uniform float uCameraNear;
      uniform float uCameraFar;
      uniform vec2 uResolution;
      uniform vec2 uDepthTexel;

      uniform sampler2D tRipple;
      uniform vec2 uRippleTexel;
      uniform float uHasRipples;
      uniform float uRippleDisplacement;
      uniform vec2 uRippleCenter;
      uniform float uRippleSize;

      // Переключатели тяжелых эффектов (низкий пресет качества): 1 — включено, 0 — выключено
      uniform float uFxDepth;
      uniform float uFxCaustics;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;

      /**
       * Interleaved Gradient Noise — детерминированный дешёвый хеш по пикселю.
       *
       * Используется в двух местах: джиттер выборки карты глубины (разбивает
       * контуры, привязанные к сетке depth-таргета) и дизеринг выходного цвета
       * (гасит полосы 8-битного буфера кадра на больших плавных заливках).
       */
      float ignNoise(vec2 p) {
        return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
      }

      float linearizeDepth(float rawDepth) {
        return (uCameraNear * uCameraFar) / (uCameraFar - rawDepth * (uCameraFar - uCameraNear));
      }

      /**
       * Билинейная выборка сырой глубины по 4 соседним текселям.
       *
       * Таргет глубины вчетверо меньше кадра, а depth-текстуры в GLES3 не
       * поддерживают аппаратный билинейный фильтр (формат не filterable, текстура
       * становится неполной и читается как нулевая). Поэтому интерполяцию делаем
       * вручную: одна выборка давала бы блоки 4x4 пикселя и лесенку на границе
       * пены, четыре — гладкий градиент. Стоимость: 3 доп. выборки из крошечной
       * текстуры, сдвинутые индексы лежат рядом и почти всегда в кэше.
       */
      float readDepthBilinear(vec2 coord, vec2 texel) {
        vec2 base = coord / texel - 0.5;
        vec2 f = fract(base);
        vec2 idx = (floor(base) + 0.5) * texel;

        float d00 = texture2D(tDepth, idx).r;
        float d10 = texture2D(tDepth, idx + vec2(texel.x, 0.0)).r;
        float d01 = texture2D(tDepth, idx + vec2(0.0, texel.y)).r;
        float d11 = texture2D(tDepth, idx + texel).r;

        return mix(mix(d00, d10, f.x), mix(d01, d11, f.x), f.y);
      }

      float getLinearDepthFromFragCoord(float fragCoordZ) {
        return (uCameraNear * uCameraFar) / (uCameraFar - fragCoordZ * (uCameraFar - uCameraNear));
      }

      void main() {
        // --- 1. РАСЧЕТ ТОЛЩИНЫ ВОДЫ (DEPTH) И ПОГЛОЩЕНИЯ СВЕТА ---
        float waterDepth = 2.0;
        float waterDepthSmooth = 2.0;
        if (uFxDepth > 0.5 && uResolution.x > 10.0) {
          // uResolution — размер ИТОГОВОГО кадра: gl_FragCoord находится в его
          // пикселях. Таргет глубины имеет меньшее разрешение, но нормированные
          // UV у него те же, поэтому приведение к [0,1] обязательно.
          // Clamp защищает от выхода за границы при любой потере синхронизации.
          vec2 screenUv = clamp(gl_FragCoord.xy / uResolution, 0.0, 1.0);

          // Джиттер точки выборки на ±0.5 текселя depth-таргета.
          //
          // Данные в таргете кусочно-постоянные в пределах своего текселя, поэтому
          // толщина воды меняется ступенями по сетке: на пологом берегу (уклон
          // дна ~0.01 м на пиксель кадра) шаг в 4 пикселя давал скачок цвета
          // ~4.5%, и билинейная выборка превращала его в волнистые полосы вдоль
          // контуров дна. Смещение точки выборки ломает эту привязку к сетке:
          // ступени превращаются в мелкий шум, который глаз читает как текстуру,
          // а не как дефект. Стоимость — две ALU-операции, новых выборок нет.
          vec2 depthJitter = vec2(
            ignNoise(gl_FragCoord.xy),
            ignNoise(gl_FragCoord.yx + vec2(37.0, 17.0))
          ) - 0.5;
          screenUv = clamp(screenUv + depthJitter * uDepthTexel, 0.0, 1.0);
          // Половинный текель с каждой стороны: билинейная выборка должна
          // покрывать в том числе рамку кадра, иначе край лодочки будет грубым.
          vec2 texel = max(uDepthTexel * 0.5, vec2(1e-6));
          float sceneDepth = linearizeDepth(readDepthBilinear(screenUv, texel));
          float surfaceDepth = getLinearDepthFromFragCoord(gl_FragCoord.z);
          waterDepth = max(0.0, sceneDepth - surfaceDepth);

          /**
           * Толщина воды БЕЗ джиттера — только для расчёта кромки пены.
           *
           * Джиттер решает одну задачу (ломает контуры, привязанные к сетке
           * depth-таргета) и портит другую: и порог пены, и fwidth для её
           * размытия брались из зашумлённого значения, поэтому край пены
           * получался зернистым. Считаем второе значение той же ручной
           * билинейной выборкой, но без смещения точки: это +4 чтения из
           * крошечного таргета, а кромка снова становится гладкой.
           */
          vec2 screenUvSmooth = clamp(gl_FragCoord.xy / uResolution, 0.0, 1.0);
          waterDepthSmooth = max(
            0.0,
            linearizeDepth(readDepthBilinear(screenUvSmooth, texel)) - surfaceDepth
          );
        }

        // Нормализованный коэффициент глубины от 0.0 (кромка берега) до 1.0 (на дистанции uClarity)
        float depthRatio = clamp(waterDepth / max(0.1, uClarity), 0.0, 1.0);
        float absorption = 1.0 - exp(-depthRatio * 2.8);

        // Градиент цвета: у берега - uColor, на глубине - uDeepColor
        vec3 waterBase = mix(uColor, uDeepColor, absorption);

        // Игра светотени на гребнях волн
        float hFactor = clamp((vWaveHeight / max(0.01, uWaveHeight)) * 0.5 + 0.5, 0.0, 1.0);
        waterBase = mix(waterBase * 0.92, waterBase * 1.12, hFactor);

        // Градиент прозрачности: у берега - uShallowOpacity, на глубине - uOpacity
        float dynamicOpacity = mix(uShallowOpacity, uOpacity, absorption);

        // --- 2. ГЕНЕРАТОР КАУСТИКИ, БЕРЕГОВОЙ И КИЛЬВАТЕРНОЙ ПЕНЫ ---
        vec2 flowOffset = uFlowDirection * uFlowSpeed * uTime * 0.5;
        vec2 p = (vWorldPosition.xz + flowOffset) * 0.8; 
        float t = uTime * 0.6;

        // Пена на гребнях аналитических волн (в обычном пресете); в низком — отключается
        float waveFoam = 0.0;
        float shoreFoam = smoothstep(${GRAPHICS_CONFIG.water.shoreFoamDistance.toFixed(2)}, 0.02, waterDepthSmooth);

        /**
         * Сглаживание кромки пены по экранной производной толщины воды.
         *
         * Полоса пены у́же пикселя на большом удалении, поэтому резкий
         * smoothstep дает лесенку. Ширину перехода расширяем на
         * величину изменения толщины за пиксель (fwidth): на большой
         * дистанции кромка автоматически размывается в мягкий градиент,
         * а вблизи остается резкой.
         *
         * И порог, и fwidth берём из waterDepthSmooth: джиттер выборки глубины
         * нужен для цвета, но на кромке пены он давал зерно. Верхняя отсечка
         * защищает от противоположной проблемы — на скользящих к камере
         * поверхностях производная огромна, и без неё пена заливала бы пол-кадра.
         */
        float foamEdge = min(fwidth(waterDepthSmooth), ${GRAPHICS_CONFIG.water.shoreFoamDistance.toFixed(2)});
        if (foamEdge > 1e-4) {
          shoreFoam = smoothstep(
            ${GRAPHICS_CONFIG.water.shoreFoamDistance.toFixed(2)} + foamEdge,
            0.02 - foamEdge,
            waterDepthSmooth
          );
        }

        if (uFxCaustics > 0.5) {
          float wave1 = sin(p.x + t) * cos(p.y - t);
          float wave2 = sin(p.x * 0.7 - p.y * 1.3 + t * 1.2) * cos(p.y * 0.8 + p.x * 1.1 - t * 0.9);
          float wave3 = sin(p.x * 1.5 + p.y * 0.5 - t * 1.4) * cos(p.y * 1.2 - p.x * 0.6 + t * 1.1);
          float ripple = wave1 + wave2 + wave3;
          float highlights = smoothstep(1.0, 1.8, abs(ripple));
          waveFoam = highlights * smoothstep(-0.02, 0.05, vWaveHeight);
        }

        // Расчет нормалей и пены от интерактивной ряби (только при активных волнах)
        vec3 rippleNormal = vec3(0.0);
        float wakeFoam = 0.0;

        vec2 rippleUv = (vWorldPosition.xz - uRippleCenter) / uRippleSize + 0.5;

        if (uHasRipples > 0.5 && rippleUv.x >= 0.0 && rippleUv.x <= 1.0 && rippleUv.y >= 0.0 && rippleUv.y <= 1.0) {
          float rL = texture2D(tRipple, rippleUv - vec2(uRippleTexel.x, 0.0)).r;
          float rR = texture2D(tRipple, rippleUv + vec2(uRippleTexel.x, 0.0)).r;
          float rD = texture2D(tRipple, rippleUv - vec2(0.0, uRippleTexel.y)).r;
          float rU = texture2D(tRipple, rippleUv + vec2(0.0, uRippleTexel.y)).r;
          float rCenter = texture2D(tRipple, rippleUv).r;

          float physicalDistX = 2.0 * uRippleTexel.x * uRippleSize;
          float physicalDistY = 2.0 * uRippleTexel.y * uRippleSize;
          
          float dy_dx = (rR - rL) * uRippleDisplacement / physicalDistX;
          float dy_dz = (rU - rD) * uRippleDisplacement / physicalDistY;
          
          rippleNormal = vec3(-dy_dx, 0.0, -dy_dz);
          
          float wavePeak = max(0.0, rCenter);
          float waveSlope = length(vec2(rR - rL, rU - rD));
          float waveEnergy = wavePeak * 0.65 + waveSlope * 0.35;
          wakeFoam = smoothstep(${GRAPHICS_CONFIG.water.ripples.foamThreshold.toFixed(2)}, 0.16, waveEnergy) * 0.35;
        }

        // Аналитические нормали для фоновых волн (расчет во фрагментном шейдере для детализации)
        vec3 proceduralNormal = vec3(0.0);
        if (uFxCaustics > 0.5) {
          vec2 pWave = vWorldPosition.xz * 0.4 + flowOffset;
          float dw1_dx = 1.2 * cos(pWave.x * 1.2 + uTime * uWaveSpeed) * cos(pWave.y * 1.1 + uTime * uWaveSpeed * 0.8);
          float dw1_dz = -1.1 * sin(pWave.x * 1.2 + uTime * uWaveSpeed) * sin(pWave.y * 1.1 + uTime * uWaveSpeed * 0.8);

          float dw2_dx = 0.8 * cos(pWave.x * 0.8 - pWave.y * 1.3 + uTime * uWaveSpeed * 1.1) * 0.6;
          float dw2_dz = -1.3 * cos(pWave.x * 0.8 - pWave.y * 1.3 + uTime * uWaveSpeed * 1.1) * 0.6;

          float dw3_dx = -1.5 * sin(pWave.x * 1.5 + pWave.y * 0.7 - uTime * uWaveSpeed * 0.9) * 0.4;
          float dw3_dz = -0.7 * sin(pWave.x * 1.5 + pWave.y * 0.7 - uTime * uWaveSpeed * 0.9) * 0.4;

          float dH_dx = (dw1_dx + dw2_dx + dw3_dx) * (uWaveHeight * 0.6 * 0.4);
          float dH_dz = (dw1_dz + dw2_dz + dw3_dz) * (uWaveHeight * 0.6 * 0.4);

          proceduralNormal = vec3(-dH_dx, 0.0, -dH_dz);
        }

        float totalFoam = clamp((max(waveFoam, shoreFoam * 0.85) + wakeFoam * 0.5) * uFoamIntensity, 0.0, 0.85);
        // Мягкое смешивание цвета пены без аддитивного пересвета
        waterBase = mix(waterBase, vec3(0.85, 0.95, 1.0), totalFoam);

        // --- 3. ДИНАМИЧЕСКИЙ РАСЧЕТ ОСВЕЩЕНИЯ И ТЕНЕЙ (SHADOW MAP) ---
        vec3 perturbedN = normalize(vNormal + proceduralNormal + rippleNormal);
        vec3 N = normalize(perturbedN);
        if (!gl_FrontFacing) N = -N;

        float shadow = 1.0;
        #ifdef USE_SHADOWMAP
          shadow = getShadowMask();
        #endif

        float NdotL = max(0.0, dot(N, uSunDirection));
        vec3 diffuseLight = uSunColor * NdotL * shadow;
        vec3 totalLight = uAmbientColor + diffuseLight;

        vec3 V = normalize(cameraPosition - vWorldPosition);
        vec3 H = normalize(uSunDirection + V);
        float NdotH = max(0.0, dot(N, H));
        float specFactor = pow(NdotH, 64.0);
        vec3 specular = uSunColor * (specFactor * 0.85) * shadow;

        vec3 finalColor = waterBase * totalLight + specular;

        gl_FragColor = vec4(finalColor, dynamicOpacity);
        
        #include <fog_fragment>

        // Дизеринг выходного цвета (±1/255).
        //
        // Переход «мелководье -> глубина» уложен в clarity = 2..3 м, поэтому на
        // отмелом берегу это сотни пикселей с изменением цвета меньше одного
        // уровня на пиксель — и 8-битный буфер кадра честно показывает полосы
        // Маха, тем более заметные на удалении. Дизеринг после тумана убирает
        // и градиент тумана. Работа идёт в линейном пространстве шейдера, но
        // перевод в sRGB только растягивает амплитуду (в тенях сильнее), так
        // что ±1/255 заведомо перекрывает половину уровня 8-битной шкалы.
        gl_FragColor.rgb += (ignNoise(gl_FragCoord.xy) - 0.5) / 128.0;
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // Возвращаем двусторонний рендер: предотвращает исчезновение воды при низких углах камеры
  });

  material.userData.isSharedMaterial = true;
  material.customProgramCacheKey = () => 'WaterShaderMaterial_v13';
  return material;
}
