import * as THREE from 'three';
import { SkyDome, SkyColors } from './SkyDome';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { EnvironmentData } from '../../utils';

export class EnvironmentManager {
  private skyDome: SkyDome;
  public sunLight: THREE.DirectionalLight;
  public moonLight: THREE.DirectionalLight;
  public hemisphereLight: THREE.HemisphereLight;

  private sunDir = new THREE.Vector3();
  private moonDir = new THREE.Vector3();
  private celestialMatrix = new THREE.Matrix4();
  private rotTilt = new THREE.Matrix4();
  private rotAzimuth = new THREE.Matrix4();
  private rotHour = new THREE.Matrix4();

  private _targetViewPos = new THREE.Vector3();
  private _texelOffsetView = new THREE.Vector3();
  private _texelOffsetWorld = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.skyDome = new SkyDome();
    scene.add(this.skyDome.mesh);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
    this.setupShadowCamera(this.sunLight);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x8faee0, 0.4);
    this.setupShadowCamera(this.moonLight);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    // Полусферический рассеянный свет: моделирует верхний свет неба и отражения от земли снизу
    this.hemisphereLight = new THREE.HemisphereLight(0xc8dcff, 0x5c4a38, 0.65);
    scene.add(this.hemisphereLight);

    scene.fog = new THREE.FogExp2(0xd6e5f5, 0.0012);
  }

  private setupShadowCamera(light: THREE.DirectionalLight): void {
    const cfg = GRAPHICS_CONFIG.shadows;
    light.castShadow = false;
    light.shadow.mapSize.width = cfg.mapSize;
    light.shadow.mapSize.height = cfg.mapSize;
    light.shadow.bias = cfg.bias;
    light.shadow.normalBias = cfg.normalBias;
    light.shadow.radius = cfg.radius;

    const cam = light.shadow.camera;
    const bounds = cfg.bounds;
    cam.left = -bounds;
    cam.right = bounds;
    cam.top = bounds;
    cam.bottom = -bounds;
    cam.near = cfg.near;
    cam.far = cfg.far;
  }

  public setVisibility(visible: boolean): void {
    this.skyDome.mesh.visible = visible;
    this.sunLight.visible = visible;
    this.moonLight.visible = visible;
    this.hemisphereLight.visible = visible;
  }

  public update(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    focusTarget: { x: number; y: number; z: number },
    env: EnvironmentData,
    visibleRadius: number = GRAPHICS_CONFIG.shadows.bounds
  ): void {
    const time = env.timeOfDay;
    const hourAngle = ((time - 6.0) / 24.0) * Math.PI * 2.0;

    // Вращение по часовому углу согласуется с направлением движения светил (rotHour * (1,0,0) = baseSun)
    this.rotHour.makeRotationZ(hourAngle);
    this.rotTilt.makeRotationX(env.axialTilt);
    this.rotAzimuth.makeRotationY(env.azimuth);

    this.celestialMatrix.identity().multiply(this.rotAzimuth).multiply(this.rotTilt);

    const baseSun = new THREE.Vector3(Math.cos(hourAngle), Math.sin(hourAngle), 0);
    this.sunDir.copy(baseSun).applyMatrix4(this.celestialMatrix).normalize();
    this.moonDir.copy(this.sunDir).negate();

    const sunElevation = this.sunDir.y;
    const colors = this.evaluateAtmosphereColors(sunElevation);
    const starFade = Math.max(0.0, Math.min(1.0, (-sunElevation - 0.05) / 0.25));

    // Матрица перевода координат небесной сферы в мировое пространство с учетом наклона оси и времени
    const starMatrix = new THREE.Matrix4()
      .multiply(this.rotAzimuth)
      .multiply(this.rotTilt)
      .multiply(this.rotHour);

    this.skyDome.update(camera.position, this.sunDir, this.moonDir, starMatrix, colors, starFade);

    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(colors.haze);
      scene.fog.density = env.fogDensity;
    }

    const sunMult = env.sunIntensityMultiplier ?? 1.0;
    const ambientIntensity = env.ambientIntensity ?? 0.65;

    this.sunLight.color.copy(colors.sunLight);
    const sunIntensity = Math.max(0.0, Math.min(1.3, (sunElevation + 0.08) * 2.2)) * sunMult;
    this.sunLight.intensity = sunIntensity;

    this.moonLight.color.copy(colors.moonLight);
    const moonIntensity = Math.max(0.0, Math.min(0.45, (-sunElevation + 0.04) * 0.9)) * sunMult;
    this.moonLight.intensity = moonIntensity;

    // Управление рассеянным светом полусферы (HemisphereLight) с учетом цветов из инспектора
    const userSkyColor = new THREE.Color(env.hemiSkyColor ?? '#c8dcff');
    const userGroundColor = new THREE.Color(env.hemiGroundColor ?? '#5c4a38');
    const dayFactor = Math.max(0.0, Math.min(1.0, (sunElevation + 0.08) * 3.5));

    this.hemisphereLight.color.lerpColors(colors.ambient, userSkyColor, dayFactor);
    this.hemisphereLight.groundColor.lerpColors(
      new THREE.Color(0.02, 0.03, 0.05),
      userGroundColor,
      dayFactor
    );
    this.hemisphereLight.intensity = ambientIntensity;

    // Плавный кросс-фейд теней в сумеречной зоне высоты солнца над горизонтом [-0.08, 0.04]
    const twilightRange = 0.12;
    const twilightT = Math.max(0.0, Math.min(1.0, (sunElevation - -0.08) / twilightRange));
    const smoothSunShadow = twilightT * twilightT * (3.0 - 2.0 * twilightT);
    const smoothMoonShadow = 1.0 - smoothSunShadow;

    if (smoothSunShadow > 0.001) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.intensity = smoothSunShadow;
      this.alignLightWithTarget(this.sunLight, this.sunDir, focusTarget, visibleRadius);
    } else {
      this.sunLight.castShadow = false;
      this.sunLight.shadow.intensity = 0.0;
    }

    if (smoothMoonShadow > 0.001) {
      this.moonLight.castShadow = true;
      this.moonLight.shadow.intensity = smoothMoonShadow;
      this.alignLightWithTarget(this.moonLight, this.moonDir, focusTarget, visibleRadius);
    } else {
      this.moonLight.castShadow = false;
      this.moonLight.shadow.intensity = 0.0;
    }
  }

  private alignLightWithTarget(
    light: THREE.DirectionalLight,
    dir: THREE.Vector3,
    target: { x: number; y: number; z: number },
    visibleRadius: number
  ): void {
    const cfg = GRAPHICS_CONFIG.shadows;
    const bounds = Math.max(cfg.minBounds, Math.min(cfg.maxBounds, visibleRadius));
    const cam = light.shadow.camera;

    if (Math.abs(cam.top - bounds) > 0.05) {
      cam.left = -bounds;
      cam.right = bounds;
      cam.top = bounds;
      cam.bottom = -bounds;
      cam.updateProjectionMatrix();
    }

    const dist = cfg.distance;
    const idealX = target.x + dir.x * dist;
    const idealY = target.y + Math.max(10, dir.y * dist);
    const idealZ = target.z + dir.z * dist;

    light.position.set(idealX, idealY, idealZ);
    light.target.position.set(target.x, target.y, target.z);
    light.target.updateMatrixWorld();

    cam.position.copy(light.position);
    cam.lookAt(light.target.position);
    cam.updateMatrixWorld();

    this._targetViewPos.set(target.x, target.y, target.z).applyMatrix4(cam.matrixWorldInverse);

    const texelSize = (bounds * 2.0) / cfg.mapSize;
    const fracX = this._targetViewPos.x % texelSize;
    const fracY = this._targetViewPos.y % texelSize;

    this._texelOffsetView.set(fracX, fracY, 0);
    this._texelOffsetWorld.copy(this._texelOffsetView).transformDirection(cam.matrixWorld);

    light.position.add(this._texelOffsetWorld);
    light.target.position.add(this._texelOffsetWorld);
    light.target.updateMatrixWorld();

    cam.position.copy(light.position);
    cam.lookAt(light.target.position);
    cam.updateMatrixWorld();
  }

  public applySettings(): void {
    const cfg = GRAPHICS_CONFIG.shadows;
    [this.sunLight, this.moonLight].forEach((light) => {
      if (light.shadow.mapSize.width !== cfg.mapSize) {
        light.shadow.mapSize.width = cfg.mapSize;
        light.shadow.mapSize.height = cfg.mapSize;
        if (light.shadow.map) {
          light.shadow.map.dispose();
          light.shadow.map = null as any;
        }
      }
    });
  }

  private evaluateAtmosphereColors(sunY: number): SkyColors {
    const colors: SkyColors = {
      zenith: new THREE.Color(),
      horizon: new THREE.Color(),
      haze: new THREE.Color(),
      sunset: new THREE.Color(),
      sunDisk: new THREE.Color(0xfff5d0),
      moonDisk: new THREE.Color(0xecf0f1),
      ambient: new THREE.Color(),
      sunLight: new THREE.Color(),
      moonLight: new THREE.Color(0x8faee0),
    };

    // Опорные цветовые состояния атмосферы
    const cDayZenith = new THREE.Color(0.15, 0.42, 0.88);
    const cDayHorizon = new THREE.Color(0.65, 0.8, 0.95);
    const cDayHaze = new THREE.Color(0.7, 0.84, 0.96);
    const cDaySunLight = new THREE.Color(1.0, 0.98, 0.9);
    const cDayAmbient = new THREE.Color(0.42, 0.46, 0.52);

    const cSunsetZenith = new THREE.Color(0.1, 0.16, 0.4);
    const cSunsetHorizon = new THREE.Color(0.38, 0.36, 0.52); // Сумеречный лавандовый тыл
    const cSunsetHaze = new THREE.Color(0.42, 0.38, 0.5);
    const cSunsetGlow = new THREE.Color(1.0, 0.45, 0.14); // Огненно-золотой закатный сектор
    const cSunsetLight = new THREE.Color(1.0, 0.55, 0.22);
    const cSunsetAmbient = new THREE.Color(0.28, 0.22, 0.28);

    const cDuskZenith = new THREE.Color(0.03, 0.05, 0.14);
    const cDuskHorizon = new THREE.Color(0.1, 0.09, 0.18);
    const cDuskHaze = new THREE.Color(0.12, 0.1, 0.2);
    const cDuskSunsetGlow = new THREE.Color(0.45, 0.12, 0.16); // Догорающий пурпурный сектор
    const cDuskAmbient = new THREE.Color(0.13, 0.12, 0.18);

    const cNightZenith = new THREE.Color(0.015, 0.025, 0.06);
    const cNightHorizon = new THREE.Color(0.035, 0.05, 0.11);
    const cNightHaze = new THREE.Color(0.045, 0.065, 0.13);
    const cNightAmbient = new THREE.Color(0.08, 0.1, 0.16);

    // Непрерывная 5-фазная шкала высоты солнца (sunY)
    if (sunY >= 0.2) {
      // 1. Полный день
      colors.zenith.copy(cDayZenith);
      colors.horizon.copy(cDayHorizon);
      colors.haze.copy(cDayHaze);
      colors.sunset.setRGB(0, 0, 0);
      colors.sunLight.copy(cDaySunLight);
      colors.ambient.copy(cDayAmbient);
    } else if (sunY >= 0.05) {
      // 2. День -> Золотой час / Закат у горизонта
      const t = (sunY - 0.05) / 0.15; // 0..1
      colors.zenith.lerpColors(cSunsetZenith, cDayZenith, t);
      colors.horizon.lerpColors(cSunsetHorizon, cDayHorizon, t);
      colors.haze.lerpColors(cSunsetHaze, cDayHaze, t);
      colors.sunset.lerpColors(cSunsetGlow, new THREE.Color(0, 0, 0), t);
      colors.sunLight.lerpColors(cSunsetLight, cDaySunLight, t);
      colors.ambient.lerpColors(cSunsetAmbient, cDayAmbient, t);
    } else if (sunY >= -0.08) {
      // 3. Закат у горизонта -> Ранние сумерки (солнце садится под горизонт)
      const t = (sunY - -0.08) / 0.13; // 0..1
      colors.zenith.lerpColors(cDuskZenith, cSunsetZenith, t);
      colors.horizon.lerpColors(cDuskHorizon, cSunsetHorizon, t);
      colors.haze.lerpColors(cDuskHaze, cSunsetHaze, t);
      colors.sunset.lerpColors(cDuskSunsetGlow, cSunsetGlow, t);
      // Плавное угасание цвета солнца к горизонту без резкого скачка в ноль
      const duskSunColor = new THREE.Color(0.5, 0.18, 0.1).multiplyScalar(Math.min(1.0, t * 1.5));
      colors.sunLight.lerpColors(duskSunColor, cSunsetLight, t);
      colors.ambient.lerpColors(cDuskAmbient, cSunsetAmbient, t);
    } else if (sunY >= -0.22) {
      // 4. Глубокие сумерки -> Наступление ночи
      const t = (sunY - -0.22) / 0.14; // 0..1
      colors.zenith.lerpColors(cNightZenith, cDuskZenith, t);
      colors.horizon.lerpColors(cNightHorizon, cDuskHorizon, t);
      colors.haze.lerpColors(cNightHaze, cDuskHaze, t);
      colors.sunset.lerpColors(new THREE.Color(0, 0, 0), cDuskSunsetGlow, t);
      colors.sunLight.setRGB(0, 0, 0);
      colors.ambient.lerpColors(cNightAmbient, cDuskAmbient, t);
    } else {
      // 5. Полная ночь
      colors.zenith.copy(cNightZenith);
      colors.horizon.copy(cNightHorizon);
      colors.haze.copy(cNightHaze);
      colors.sunset.setRGB(0, 0, 0);
      colors.sunLight.setRGB(0, 0, 0);
      colors.ambient.copy(cNightAmbient);
    }

    return colors;
  }

  public destroy(): void {
    if (this.skyDome.mesh.parent) {
      this.skyDome.mesh.parent.remove(this.skyDome.mesh);
    }
    this.skyDome.destroy();
    if (this.sunLight.parent) this.sunLight.parent.remove(this.sunLight);
    if (this.sunLight.target.parent) this.sunLight.target.parent.remove(this.sunLight.target);
    if (this.moonLight.parent) this.moonLight.parent.remove(this.moonLight);
    if (this.moonLight.target.parent) this.moonLight.target.parent.remove(this.moonLight.target);
    if (this.hemisphereLight.parent) this.hemisphereLight.parent.remove(this.hemisphereLight);
  }
}
