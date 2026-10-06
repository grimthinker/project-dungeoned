import * as THREE from 'three';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';

export interface WaterDisturbance {
  x: number;
  z: number;
  radius: number;
  strength: number;
}

export class WaterRippleManager {
  public readonly resolution: number;
  public readonly simSize: number;
  public center = new THREE.Vector2(0, 0);
  private lastCenter = new THREE.Vector2(0, 0);
  private isFirstFrame: boolean = true;

  private readTarget: THREE.WebGLRenderTarget;
  private writeTarget: THREE.WebGLRenderTarget;
  private simScene: THREE.Scene;
  private simCamera: THREE.OrthographicCamera;
  private simMaterial: THREE.ShaderMaterial;
  private quadMesh: THREE.Mesh;

  private disturbancesUniform: THREE.Vector4[];

  // Оптимизация: фиксированный шаг симуляции и спящий режим
  private simAccumulator: number = 0;
  private activityTimer: number = 0;
  private isSleeping: boolean = false;

  constructor(
    resolution: number = GRAPHICS_CONFIG.water.ripples.resolution,
    simSize: number = 48.0
  ) {
    this.resolution = resolution;
    this.simSize = simSize;

    const options: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.readTarget = new THREE.WebGLRenderTarget(resolution, resolution, options);
    this.writeTarget = new THREE.WebGLRenderTarget(resolution, resolution, options);

    this.disturbancesUniform = Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0));

    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: this.readTarget.texture },
        uTexelSize: { value: new THREE.Vector2(1.0 / resolution, 1.0 / resolution) },
        uDamping: { value: GRAPHICS_CONFIG.water.ripples.damping },
        uWaveSpeedSq: { value: 0.5 },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uDisturbances: { value: this.disturbancesUniform },
        uDisturbanceCount: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
    uniform sampler2D tPrev;
        uniform vec2 uTexelSize;
        uniform float uDamping;
        uniform float uWaveSpeedSq;
        uniform vec2 uOffset;
        uniform vec4 uDisturbances[32];
        uniform int uDisturbanceCount;

        varying vec2 vUv;

        void main() {
          vec2 prevUv = vUv + uOffset;
          vec4 prevSample = (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0)
            ? texture2D(tPrev, prevUv)
            : vec4(0.0);

          float currentH = prevSample.r;
          float pastH = prevSample.g;
          
          float nL = (prevUv.x - uTexelSize.x >= 0.0) ? texture2D(tPrev, prevUv - vec2(uTexelSize.x, 0.0)).r : 0.0;
          float nR = (prevUv.x + uTexelSize.x <= 1.0) ? texture2D(tPrev, prevUv + vec2(uTexelSize.x, 0.0)).r : 0.0;
          float nD = (prevUv.y - uTexelSize.y >= 0.0) ? texture2D(tPrev, prevUv - vec2(0.0, uTexelSize.y)).r : 0.0;
          float nU = (prevUv.y + uTexelSize.y <= 1.0) ? texture2D(tPrev, prevUv + vec2(0.0, uTexelSize.y)).r : 0.0;

          // Физическое 2D-волновое уравнение с параметрической скоростью распространения (S = uWaveSpeedSq):
          float neighborSum = nL + nR + nD + nU;
          float nextH = ((2.0 - 4.0 * uWaveSpeedSq) * currentH - pastH + uWaveSpeedSq * neighborSum) * uDamping;

          // Поглощающие границы у берегов (предотвращают неестественное отражение от краев меша)
          float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          if (borderDist < uTexelSize.x * 3.5) {
            nextH *= smoothstep(0.0, uTexelSize.x * 3.5, borderDist);
          }

          // Нанесение возмущений от движущихся в воде объектов
          for (int i = 0; i < 32; i++) {
            if (i >= uDisturbanceCount) break;
            vec4 dist = uDisturbances[i];
            float radius = dist.z;
            if (radius <= 0.0001) continue;

            vec2 delta = vUv - dist.xy;
            float d = length(delta);
            if (d < radius) {
              float falloff = cos(d / radius * 1.5707963);
              nextH += dist.w * falloff * falloff;
            }
          }

          nextH = clamp(nextH, -2.0, 2.0);
          gl_FragColor = vec4(nextH, currentH, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
    this.simScene.add(this.quadMesh);
  }

  public get isSleepingState(): boolean {
    return this.isSleeping;
  }

  public getTexture(): THREE.Texture {
    return this.readTarget.texture;
  }

  public update(
    renderer: THREE.WebGLRenderer,
    dt: number,
    disturbances: WaterDisturbance[],
    camX: number,
    camZ: number,
    rippleSpeed: number = 1.0,
    rippleDamping: number = GRAPHICS_CONFIG.water.ripples.damping
  ): void {
    const count = Math.min(32, disturbances.length);

    // 1. Управление сном (Dormant Mode): если в воде никого нет и волны растворились — полностью выключаем расчет
    if (count > 0) {
      this.activityTimer = 3.5;
      this.isSleeping = false;
    } else if (this.activityTimer > 0) {
      this.activityTimer -= dt;
    } else {
      if (!this.isSleeping) {
        this.clear(renderer);
        this.isSleeping = true;
      }
      return; // Вода в покое: 0 проходов рендера GPU
    }

    // 2. Ограничение частоты симуляции (Fixed Simulation Rate, 30 FPS)
    const targetSimInterval = 1.0 / GRAPHICS_CONFIG.water.ripples.simFps;
    this.simAccumulator += dt;

    if (this.simAccumulator < targetSimInterval) {
      return; // Пропускаем тяжелый рендер, текущий кадр интерполируется билинейно
    }

    this.simAccumulator = Math.min(
      targetSimInterval * 2.0,
      this.simAccumulator - targetSimInterval
    );

    // 3. Обновление координат сетки и применение смещения только в активный шаг симуляции
    const texelSize = this.simSize / this.resolution;
    const snappedX = Math.floor(camX / texelSize) * texelSize;
    const snappedZ = Math.floor(camZ / texelSize) * texelSize;

    if (this.isFirstFrame) {
      this.lastCenter.set(snappedX, snappedZ);
      this.center.set(snappedX, snappedZ);
      this.isFirstFrame = false;
    }

    const offsetX = (snappedX - this.lastCenter.x) / this.simSize;
    const offsetZ = (snappedZ - this.lastCenter.y) / this.simSize;

    this.center.set(snappedX, snappedZ);
    this.lastCenter.set(snappedX, snappedZ);

    // 4. Физически точный расчет коэффициента скорости на основе размера ячеек
    const physicalDx = this.simSize / this.resolution;
    const physicalSpeed = 2.5 * Math.max(0.1, rippleSpeed);

    // Расчет подшагов для обеспечения стабильности 2D волнового уравнения (CFL условие)
    const baseCfl = (physicalSpeed * targetSimInterval) / physicalDx;
    const subSteps = Math.min(3, Math.ceil(baseCfl / 0.6));
    const stepDt = targetSimInterval / subSteps;

    const cfl = (physicalSpeed * stepDt) / physicalDx;
    const waveSpeedSq = cfl * cfl;

    const decayRate = 1.0 - Math.max(0.85, Math.min(0.999, rippleDamping));
    const stepDamping = Math.max(0.85, Math.min(0.9999, 1.0 - decayRate / subSteps));

    this.simMaterial.uniforms.uWaveSpeedSq.value = waveSpeedSq;
    this.simMaterial.uniforms.uDamping.value = stepDamping;

    for (let i = 0; i < 32; i++) {
      if (i < count) {
        const d = disturbances[i];
        const uvX = (d.x - snappedX) / this.simSize + 0.5;
        const uvY = (d.z - snappedZ) / this.simSize + 0.5;
        const uvRadius = d.radius / this.simSize;

        if (uvX >= -0.1 && uvX <= 1.1 && uvY >= -0.1 && uvY <= 1.1) {
          this.disturbancesUniform[i].set(uvX, uvY, uvRadius, d.strength);
        } else {
          this.disturbancesUniform[i].set(0, 0, 0, 0);
        }
      } else {
        this.disturbancesUniform[i].set(0, 0, 0, 0);
      }
    }

    const prevTarget = renderer.getRenderTarget();

    // 5. Выполнение легкого шага симуляции
    for (let step = 0; step < subSteps; step++) {
      // Применяем адвекцию текстуры только на самом первом микрошаге
      if (step === 0) {
        this.simMaterial.uniforms.uOffset.value.set(offsetX, offsetZ);
      } else {
        this.simMaterial.uniforms.uOffset.value.set(0.0, 0.0);
      }

      this.simMaterial.uniforms.uDisturbanceCount.value = step === 0 ? count : 0;
      this.simMaterial.uniforms.tPrev.value = this.readTarget.texture;

      renderer.setRenderTarget(this.writeTarget);
      renderer.render(this.simScene, this.simCamera);

      const temp = this.readTarget;
      this.readTarget = this.writeTarget;
      this.writeTarget = temp;
    }

    renderer.setRenderTarget(prevTarget);
  }

  public clear(renderer?: THREE.WebGLRenderer): void {
    if (renderer) {
      const prevTarget = renderer.getRenderTarget();
      const clearColor = renderer.getClearColor(new THREE.Color());
      const clearAlpha = renderer.getClearAlpha();

      renderer.setClearColor(new THREE.Color(0.0, 0.0, 0.0), 1.0);
      renderer.setRenderTarget(this.readTarget);
      renderer.clear();
      renderer.setRenderTarget(this.writeTarget);
      renderer.clear();

      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  public destroy(): void {
    this.readTarget.dispose();
    this.writeTarget.dispose();
    this.simMaterial.dispose();
    this.quadMesh.geometry.dispose();
  }
}
