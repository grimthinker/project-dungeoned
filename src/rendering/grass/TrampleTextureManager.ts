import * as THREE from 'three';
import { GRASS_CONFIG } from '../../config/grassConfig';

export interface TrampleStamp {
  x: number;
  z: number;
  radius: number;
  dirX: number;
  dirZ: number;
  strength: number;
}

export class TrampleTextureManager {
  public readonly resolution: number;
  public readonly mapSize: number;
  public center = new THREE.Vector2(0, 0);
  private lastCenter = new THREE.Vector2(0, 0);
  private isFirstFrame: boolean = true;

  /** Управление спящим режимом и фиксированной частотой симуляции (как у WaterRippleManager) */
  private isSleeping: boolean = false;
  private activityTimer: number = 0;
  private simAccumulator: number = 0;
  private readonly simFps: number = GRASS_CONFIG.trample.simFps;
  private readonly idleSleepDelay: number = GRASS_CONFIG.trample.idleSleepDelay;

  private readTarget: THREE.WebGLRenderTarget;
  private writeTarget: THREE.WebGLRenderTarget;
  private simScene: THREE.Scene;
  private simCamera: THREE.OrthographicCamera;
  private simMaterial: THREE.ShaderMaterial;
  private quadMesh: THREE.Mesh;

  private stampsUniform: THREE.Vector4[];
  private dirsUniform: THREE.Vector2[];

  /** Скорость приминания вниз при наступании */
  public bendSpeed: number = GRASS_CONFIG.trample.bendSpeed;
  /** Приоритет вектора движения над боковым расталкиванием */
  public motionBias: number = GRASS_CONFIG.trample.motionBias;

  constructor(
    resolution: number = GRASS_CONFIG.trample.resolution,
    mapSize: number = GRASS_CONFIG.trample.mapSize
  ) {
    this.resolution = resolution;
    this.mapSize = mapSize;

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

    this.stampsUniform = Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.dirsUniform = Array.from({ length: 32 }, () => new THREE.Vector2(0, 0));

    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uDeltaTime: { value: 0.016 },
        uRecoveryTime: { value: GRASS_CONFIG.trample.recoveryDuration },
        uDelay: { value: GRASS_CONFIG.trample.delay },
        uBendSpeed: { value: this.bendSpeed },
        uMotionBias: { value: this.motionBias },
        uStamps: { value: this.stampsUniform },
        uDirs: { value: this.dirsUniform },
        uStampCount: { value: 0 },
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
        uniform vec2 uOffset;
        uniform float uDeltaTime;
        uniform float uRecoveryTime;
        uniform float uDelay;
        uniform float uBendSpeed;
        uniform float uMotionBias;
        uniform vec4 uStamps[32];
        uniform vec2 uDirs[32];
        uniform int uStampCount;

        varying vec2 vUv;

        void main() {
          vec2 prevUv = vUv + uOffset;
          vec4 prev = (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0)
            ? texture2D(tPrev, prevUv)
            : vec4(0.0, 0.5, 0.5, 1.0);

          float prevTrample = prev.r;
          vec2 prevDir = prev.gb * 2.0 - 1.0;
          float prevDirLen = length(prevDir);
          prevDir = prevDirLen > 0.01 ? prevDir / prevDirLen : vec2(0.0, 1.0);
          float prevTimer = prev.a;

          float targetTrample = 0.0;
          vec2 targetDir = prevDir;
          float maxWeight = 0.0;

          for (int i = 0; i < 32; i++) {
            if (i >= uStampCount) break;

            vec4 stamp = uStamps[i];
            float radius = stamp.z;
            if (radius <= 0.0001) continue;

            vec2 toPixel = vUv - stamp.xy;
            float dist = length(toPixel);
            if (dist < radius) {
              float coreRadius = radius * 0.25;
              float falloff = 1.0;
              if (dist > coreRadius) {
                float t = (dist - coreRadius) / (radius - coreRadius);
                falloff = 1.0 - t * t;
              }
              float pressure = falloff * stamp.w;

              if (pressure > targetTrample) {
                targetTrample = pressure;
              }

              vec2 radialDir = dist > 0.0001 ? toPixel / dist : vec2(0.0, 1.0);
              vec2 motionDir = uDirs[i];
              float motionSpeed = length(motionDir);

              vec2 stampDir = radialDir;

              if (motionSpeed > 0.01) {
                vec2 normMotion = motionDir / motionSpeed;
                vec2 lateralNorm = vec2(-normMotion.y, normMotion.x);
                float latOffset = dot(toPixel, lateralNorm);
                float latSign = clamp(latOffset / (radius * 0.4), -1.0, 1.0);
                vec2 lateralPush = lateralNorm * latSign;

                vec2 wakeDir = normMotion * uMotionBias + lateralPush * (1.0 - uMotionBias);
                stampDir = normalize(wakeDir);
              } else {
                if (prevTrample > 0.15 && dot(prevDir, radialDir) < 0.0) {
                  stampDir = prevDir;
                }
              }

              if (pressure > maxWeight) {
                maxWeight = pressure;
                targetDir = stampDir;
              }
            }
          }

          vec2 currentBend = prevDir * prevTrample;
          vec2 nextBend;
          float nextTimer;

          if (maxWeight > 0.01) {
            // Наступание: трава приминается под давлением и взводится задержка перед подъемом
            vec2 targetBend = targetDir * maxWeight;
            float bendFactor = clamp(uBendSpeed * uDeltaTime, 0.0, 1.0);
            nextBend = mix(currentBend, targetBend, bendFactor);
            nextTimer = -uDelay;
          } else {
            // Нога ушла: сначала выдерживаем задержку, затем плавно распрямляемся по S-кривой
            float timer = prevTimer + uDeltaTime;
            nextTimer = timer;

            if (timer < 0.0) {
              // Фаза задержки: трава остается полностью примятой
              nextBend = currentBend;
            } else {
              // Фаза подъема: плавный разгон и замедление (Smoothstep S-curve)
              float prevT = clamp((timer - uDeltaTime) / max(0.005, uRecoveryTime), 0.0, 1.0);
              float currT = clamp(timer / max(0.01, uRecoveryTime), 0.0, 1.0);

              if (currT >= 1.0) {
                nextBend = vec2(0.0);
                nextTimer = uRecoveryTime;
              } else {
                float fPrev = (1.0 - prevT) * (1.0 - prevT) * (1.0 + 2.0 * prevT);
                float fCurr = (1.0 - currT) * (1.0 - currT) * (1.0 + 2.0 * currT);
                float ratio = fCurr / max(0.0001, fPrev);
                nextBend = currentBend * ratio;
              }
            }
          }

          float finalTrample = length(nextBend);
          vec2 finalDir = finalTrample > 0.001 ? nextBend / finalTrample : prevDir;
          vec2 encodedDir = finalDir * 0.5 + 0.5;

          gl_FragColor = vec4(clamp(finalTrample, 0.0, 1.0), encodedDir.x, encodedDir.y, nextTimer);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
    this.simScene.add(this.quadMesh);
  }

  public getTexture(): THREE.Texture {
    return this.readTarget.texture;
  }

  public update(
    renderer: THREE.WebGLRenderer,
    dt: number,
    stamps: TrampleStamp[],
    camX: number,
    camZ: number
  ): void {
    const count = Math.min(32, stamps.length);

    // 1. Спящий режим (Dormant Mode): после полного восстановления травы (idleSleepDelay
    // без наступаний) симуляция очищается и полностью выключается до следующего шага
    if (count > 0) {
      this.activityTimer = this.idleSleepDelay;
      this.isSleeping = false;
    } else if (this.activityTimer > 0) {
      this.activityTimer -= dt;
    } else {
      if (!this.isSleeping) {
        this.clear(renderer);
        this.isSleeping = true;
      }
      return; // Трава в покое: 0 проходов рендера GPU
    }

    // 2. Ограничение частоты симуляции (Fixed Simulation Rate, как у ряби), чтобы
    // при 120fps экранах не считать один и тот же шаг по два раза в кадре
    const targetSimInterval = 1.0 / this.simFps;
    this.simAccumulator += dt;

    if (this.simAccumulator < targetSimInterval) {
      return; // Пропускаем тяжелый рендер, интерполяция/нейтральное состояние не меняются
    }

    this.simAccumulator = Math.min(
      targetSimInterval * 2.0,
      this.simAccumulator - targetSimInterval
    );

    // Привязываем центр окна к дискретной сетке текселей для предотвращения размытия при скроллинге
    const texelSize = this.mapSize / this.resolution;
    const snappedX = Math.floor(camX / texelSize) * texelSize;
    const snappedZ = Math.floor(camZ / texelSize) * texelSize;

    if (this.isFirstFrame) {
      this.lastCenter.set(snappedX, snappedZ);
      this.isFirstFrame = false;
    }

    const offsetX = (snappedX - this.lastCenter.x) / this.mapSize;
    const offsetZ = (snappedZ - this.lastCenter.y) / this.mapSize;
    this.simMaterial.uniforms.uOffset.value.set(offsetX, offsetZ);

    this.center.set(snappedX, snappedZ);
    this.lastCenter.set(snappedX, snappedZ);

    // Восстановление и скорость изгиба работают от фиксированного шага (не от FPS рендера)
    this.simMaterial.uniforms.uDeltaTime.value = targetSimInterval;
    this.simMaterial.uniforms.uRecoveryTime.value = GRASS_CONFIG.trample.recoveryDuration;
    this.simMaterial.uniforms.uDelay.value = GRASS_CONFIG.trample.delay;
    this.simMaterial.uniforms.uBendSpeed.value = this.bendSpeed;
    this.simMaterial.uniforms.uMotionBias.value = this.motionBias;
    this.simMaterial.uniforms.tPrev.value = this.readTarget.texture;

    for (let i = 0; i < 32; i++) {
      if (i < count) {
        const s = stamps[i];
        // Перевод позиции штампа в UV координаты локального окна 96x96 м
        const uvX = (s.x - snappedX) / this.mapSize + 0.5;
        const uvY = (s.z - snappedZ) / this.mapSize + 0.5;
        const uvRadius = s.radius / this.mapSize;

        if (uvX >= -0.2 && uvX <= 1.2 && uvY >= -0.2 && uvY <= 1.2) {
          this.stampsUniform[i].set(uvX, uvY, uvRadius, s.strength);
          this.dirsUniform[i].set(s.dirX, s.dirZ);
        } else {
          this.stampsUniform[i].set(0, 0, 0, 0);
          this.dirsUniform[i].set(0, 0);
        }
      } else {
        this.stampsUniform[i].set(0, 0, 0, 0);
        this.dirsUniform[i].set(0, 0);
      }
    }

    this.simMaterial.uniforms.uStampCount.value = count;

    // Рендер симуляции в writeTarget
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.writeTarget);
    renderer.render(this.simScene, this.simCamera);
    renderer.setRenderTarget(prevTarget);

    // Смена буферов местами (Ping-Pong)
    const temp = this.readTarget;
    this.readTarget = this.writeTarget;
    this.writeTarget = temp;
  }

  public clear(renderer?: THREE.WebGLRenderer): void {
    if (renderer) {
      const prevTarget = renderer.getRenderTarget();
      const clearColor = renderer.getClearColor(new THREE.Color());
      const clearAlpha = renderer.getClearAlpha();

      // Очистка нейтральным состоянием (R=0: прямо, G=0.5, B=0.5: нулевой вектор)
      renderer.setClearColor(new THREE.Color(0.0, 0.5, 0.5), 1.0);
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
