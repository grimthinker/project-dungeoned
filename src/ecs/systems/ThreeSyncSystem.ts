import * as THREE from 'three';
import { World } from '../World';
import { EntityId, AnimatorComponent } from '../types';
import { IPhysicsDriver } from '../../physics/IPhysicsDriver';
import { GameMode } from '../../config/gameConfig';
import { AssetManager } from '../../rendering/AssetManager';
import { CREATURE_RIG_PROFILES } from '../../rendering/rigProfiles';
import { BodyStructureType } from '../templates';
import { getAggregatedInteractionSlots, getRootOwner } from '../utils/hierarchy';
import { computeItemGrip, GripTransform } from '../../rendering/gripCalculators';
import { ProceduralCreatureAssetManager } from '../../rendering/creatures/ProceduralAssetManager';
import { TerrainSyncSystem } from '../../rendering/terrain/TerrainSyncSystem';
import {
  CreatureMeshAssembler,
  RigAnimatorState as AnimatorState,
} from '../../rendering/creatures/CreatureMeshAssembler';
import { RigSocketBinder } from '../../rendering/creatures/RigSocketBinder';
import {
  disposeObject,
  attachOutlines,
  createOutlineShaderMaterial,
} from '../../rendering/renderUtils';
import { AttackVisualsManager } from '../../rendering/attacks/AttackVisualsManager';
import { GrassSyncSystem } from '../../rendering/grass/GrassSyncSystem';
import { BALANCE_CONFIG } from '../../config/balanceConfig';
import { ToonMaterialManager } from '../../rendering/materials/ToonMaterialManager';
import { createWaterMaterial } from '../../rendering/materials/WaterMaterial';
import { WaterRippleManager, WaterDisturbance } from '../../rendering/water/WaterRippleManager';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { WaterComponent } from '../components/water';
import { TransformComponent } from '../components/physics';
import { getTerrainHeightAt } from '../components/terrain';
import { GRASS_CONFIG } from '../../config/grassConfig';

const PROCEDURAL_PROP_SCALES: Record<
  string,
  { baseRadius: number; baseHeight: number; baseWidth?: number; baseDepth?: number }
> = {
  'proc://prop/tree': { baseRadius: 0.6, baseHeight: 4.0, baseWidth: 1.2, baseDepth: 1.2 },
  'proc://prop/tree_2': { baseRadius: 1.2, baseHeight: 4.2, baseWidth: 2.4, baseDepth: 2.4 },
  'proc://prop/tree_3': { baseRadius: 0.8, baseHeight: 4.8, baseWidth: 1.6, baseDepth: 1.6 },
  'proc://prop/tree_spruce': { baseRadius: 1.85, baseHeight: 4.2, baseWidth: 3.7, baseDepth: 3.7 },
  'proc://prop/tree_pine': { baseRadius: 1.4, baseHeight: 5.2, baseWidth: 2.8, baseDepth: 2.8 },
  'proc://prop/well': { baseRadius: 1.15, baseHeight: 2.6, baseWidth: 2.3, baseDepth: 2.3 },
  'proc://prop/signpost': { baseRadius: 0.4, baseHeight: 2.1, baseWidth: 0.8, baseDepth: 0.8 },
  'proc://prop/signpost_single': {
    baseRadius: 0.4,
    baseHeight: 1.6,
    baseWidth: 0.8,
    baseDepth: 0.8,
  },
  'proc://prop/log_pile_1': { baseRadius: 0.85, baseHeight: 0.95, baseWidth: 1.7, baseDepth: 1.6 },
  'proc://prop/log_pile_2': { baseRadius: 0.75, baseHeight: 0.75, baseWidth: 1.5, baseDepth: 1.5 },
  'proc://prop/stump': { baseRadius: 0.45, baseHeight: 0.85, baseWidth: 0.9, baseDepth: 0.9 },
  'proc://prop/toilet': { baseRadius: 0.65, baseHeight: 2.3, baseWidth: 1.2, baseDepth: 1.2 },
  'proc://prop/barrel': { baseRadius: 0.5, baseHeight: 1.1, baseWidth: 1.0, baseDepth: 1.0 },
  'proc://prop/crate': { baseRadius: 0.6, baseHeight: 0.6, baseWidth: 1.1, baseDepth: 0.85 },
  'proc://prop/bridge': { baseRadius: 3.0, baseHeight: 1.2, baseWidth: 2.4, baseDepth: 6.0 },
  'proc://prop/lamp_post': { baseRadius: 0.4, baseHeight: 3.0, baseWidth: 0.8, baseDepth: 0.8 },
  'proc://prop/house': { baseRadius: 2.7, baseHeight: 5.5, baseWidth: 5.0, baseDepth: 5.4 },
  'proc://prop/fence': { baseRadius: 1.2, baseHeight: 1.15, baseWidth: 2.4, baseDepth: 0.25 },
  'proc://prop/rock_1': { baseRadius: 1.1, baseHeight: 1.25, baseWidth: 2.0, baseDepth: 1.4 },
  'proc://prop/rock_2': { baseRadius: 1.2, baseHeight: 0.75, baseWidth: 2.2, baseDepth: 1.7 },
  'proc://prop/rock_3': { baseRadius: 1.2, baseHeight: 1.5, baseWidth: 2.3, baseDepth: 2.1 },
  'proc://prop/rock_4': { baseRadius: 1.2, baseHeight: 1.6, baseWidth: 2.2, baseDepth: 2.0 },
  'proc://prop/rock_5': { baseRadius: 1.1, baseHeight: 1.45, baseWidth: 2.1, baseDepth: 1.7 },
};

export class ThreeSyncSystem {
  public static disposeObject = disposeObject;
  public static attachOutlines = attachOutlines;

  private scene: THREE.Scene;
  private renderer?: THREE.WebGLRenderer;
  private meshes: Map<EntityId, THREE.Object3D> = new Map();
  private loadingMeshes: Set<EntityId> = new Set();
  private loadingGenerations: Map<EntityId, number> = new Map();

  // Кэш для аниматоров (Стейт-машина)
  private animators: Map<EntityId, AnimatorState> = new Map();

  // Делегированные подсистемы
  public physicsDriver: IPhysicsDriver | null = null;
  private attackVisualsManager: AttackVisualsManager;
  private terrainSync: TerrainSyncSystem;
  private creatureAssembler: CreatureMeshAssembler;
  private socketBinder: RigSocketBinder = new RigSocketBinder();
  private grassSync: GrassSyncSystem;
  private toonManager = ToonMaterialManager.getInstance();
  private isCelShading: boolean = false;

  // Кэшированные материалы для производительности (фоллбэк)
  private matPlayer = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
  private matEnemy = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  private matIdle = new THREE.MeshLambertMaterial({ color: 0x34495e });
  private matObstacle = new THREE.MeshLambertMaterial({ color: 0x555555 });
  private matWeapon = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
  private matArmor = new THREE.MeshLambertMaterial({ color: 0x3498db });
  private matBag = new THREE.MeshLambertMaterial({ color: 0x2ecc71 });

  private matZoneDmg = new THREE.MeshBasicMaterial({
    color: 0xe74c3c,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneJoint = new THREE.MeshBasicMaterial({
    color: 0xe67e22,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneHeal = new THREE.MeshBasicMaterial({
    color: 0x2ecc71,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneNeutral = new THREE.MeshBasicMaterial({
    color: 0x9b59b6,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneSlow = new THREE.MeshBasicMaterial({
    color: 0x3498db,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneFast = new THREE.MeshBasicMaterial({
    color: 0x1abc9c,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneQuest = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneAI = new THREE.MeshBasicMaterial({
    color: 0xf1c40f,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matZoneThrowTarget = new THREE.MeshBasicMaterial({
    color: 0xe67e22,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private matSelection = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  private matSilhouetteOutline = createOutlineShaderMaterial(0x2ecc71, 3.2);
  private matCelOutline = createOutlineShaderMaterial(0x151515, 2.0);

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.attackVisualsManager = new AttackVisualsManager(scene);
    this.terrainSync = new TerrainSyncSystem();
    this.creatureAssembler = new CreatureMeshAssembler(
      scene,
      this.matSilhouetteOutline,
      this.loadingMeshes,
      this.loadingGenerations,
      (id, state) => this.animators.set(id, state),
      (id, animator, anim) => this.playAnimation(id, animator, anim)
    );
    this.grassSync = new GrassSyncSystem(scene, renderer);
  }

  public clearMeshes(): void {
    for (const [, mesh] of this.meshes.entries()) {
      if (mesh.userData.rippleManager) {
        mesh.userData.rippleManager.destroy();
        delete mesh.userData.rippleManager;
      }
      ThreeSyncSystem.disposeObject(mesh);
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    }
    this.terrainSync.clear();
    this.attackVisualsManager.clear();
    this.grassSync.clear();
    this.meshes.clear();
    this.animators.clear();
    this.loadingMeshes.clear();
    this.loadingGenerations.clear();
  }

  public applySettings(): void {
    this.grassSync.densityFactor = GRASS_CONFIG.defaultDensityFactor;
  }

  public destroy(): void {
    this.clearMeshes();
    this.attackVisualsManager.destroy();
    this.grassSync.destroy();
    this.toonManager.clear();

    // Очищаем кэшированные фоллбэк-материалы
    this.matPlayer.dispose();
    this.matEnemy.dispose();
    this.matIdle.dispose();
    this.matObstacle.dispose();
    this.matWeapon.dispose();
    this.matArmor.dispose();
    this.matBag.dispose();
    this.matZoneDmg.dispose();
    this.matZoneJoint.dispose();
    this.matZoneHeal.dispose();
    this.matZoneNeutral.dispose();
    this.matZoneSlow.dispose();
    this.matZoneFast.dispose();
    this.matSelection.dispose();
    this.matSilhouetteOutline.dispose();
    this.matCelOutline.dispose();
  }

  public update(
    dt: number,
    world: World,
    _gameMode: GameMode,
    selectedIds: Set<EntityId>,
    celShading: boolean = false,
    cameraTargetX: number = 0,
    cameraTargetZ: number = 0
  ): void {
    if (celShading !== this.isCelShading) {
      this.isCelShading = celShading;
      for (const [, obj] of this.meshes.entries()) {
        if (this.isCelShading) {
          this.toonManager.applyToon(obj);
          obj.userData.isToonApplied = true;
        } else {
          this.toonManager.restoreOriginal(obj);
          delete obj.userData.isToonApplied;
        }
      }
    }

    const activeIds = new Set<EntityId>();
    const renderables = world.getEntitiesWith('transform', 'renderable');

    // Обновляем миксеры с учетом динамической скорости (playbackSpeed) и локального масштаба времени (timeScale) сущности
    for (const [id, state] of this.animators.entries()) {
      const animatorComp = world.getComponent(id, 'animator');
      if (state.currentAction && animatorComp) {
        const structureType = animatorComp.rigType as BodyStructureType;
        const rigProfile = CREATURE_RIG_PROFILES[structureType];
        const profileSpeed = rigProfile?.animationSpeeds?.[state.currentClipName] ?? 1.0;
        const ecsSpeed = animatorComp.playbackSpeed ?? 1.0;
        state.currentAction.setEffectiveTimeScale(profileSpeed * ecsSpeed);
      }

      // Отменяем процедурный поворот головы с прошлого кадра ПЕРЕД применением новых кадров анимации миксером
      const headBone = state.rig.getObjectByName('HeadPivot');
      if (headBone && headBone.userData.lastProceduralQuat) {
        const invQuat = headBone.userData.lastProceduralQuat.clone().invert();
        headBone.quaternion.multiply(invQuat);
      }

      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      state.mixer.timeScale = ts;
      state.mixer.update(dt);
    }

    for (const [id, { transform, renderable }] of renderables) {
      const ownership = world.getComponent(id, 'ownership');

      // Предмет находится в руке, если его держит ячейка взаимодействия части тела или существа
      let isEquippedInHand = false;
      if (ownership && ownership.status === 'equipped') {
        const directSlot = world.getComponent(ownership.ownerId, 'interactionSlots');
        if (directSlot && directSlot.itemId === id) {
          isEquippedInHand = true;
        } else {
          const aggSlots = getAggregatedInteractionSlots(world, ownership.ownerId);
          if (aggSlots.some((s) => s.slot.itemId === id)) {
            isEquippedInHand = true;
          } else {
            const rootOwner = getRootOwner(world, ownership.ownerId);
            if (rootOwner && rootOwner !== ownership.ownerId) {
              const rootSlots = getAggregatedInteractionSlots(world, rootOwner);
              if (rootSlots.some((s) => s.slot.itemId === id)) {
                isEquippedInHand = true;
              }
            }
          }
        }
      }

      // Экипированные в руки предметы не отбрасываются из рендера, даже если скрыты на полу
      if (!renderable.isVisible && !isEquippedInHand) continue;

      activeIds.add(id);

      const tag = world.getComponent(id, 'tag');
      const archetype = tag?.archetype;

      if (archetype === 'marker') continue;

      let obj = this.meshes.get(id);

      // 1. Создание меша
      if (!obj) {
        if (!this.loadingMeshes.has(id)) {
          obj = this.createMeshForEntity(world, id, archetype);
          if (obj) {
            this.scene.add(obj);
            this.meshes.set(id, obj);
          }
        }
      }

      // 2. Обновление состояния меша
      if (obj) {
        // Если предмет не находится в руке, гарантируем его нахождение в корне сцены
        if (!isEquippedInHand) {
          if (obj.parent !== this.scene) {
            this.scene.add(obj);
          }
          obj.position.set(transform.x, transform.y, transform.z);
          if (transform.rotation) {
            obj.quaternion.set(
              transform.rotation.x,
              transform.rotation.y,
              transform.rotation.z,
              transform.rotation.w
            );
          }

          // Модульные существа масштабируются непропорционально: по осям X/Z от радиуса, по оси Y от роста
          if (obj.userData.isModularRig) {
            const physStats = world.getComponent(id, 'physicsStats');
            const animator = world.getComponent(id, 'animator');
            const rigType = animator?.rigType as BodyStructureType;

            let baseRadius = 0.4;
            let baseHeight = 1.8;
            if (rigType === 'quadruped') {
              baseRadius = 0.35;
              baseHeight = 0.8;
            } else if (rigType === 'arachnid') {
              baseRadius = 0.6;
              baseHeight = 0.5;
            }

            const radius = physStats?.radius.current ?? baseRadius;
            const height = physStats?.height.current ?? baseHeight;

            const scaleXZ = radius / baseRadius;
            const scaleY = height / baseHeight;
            obj.scale.set(scaleXZ, scaleY, scaleXZ);
          } else if (obj.userData.isDetachedLimb) {
            // Масштаб отрубленной конечности пропорционален ее реальному сохраненному радиусу
            const physStats = world.getComponent(id, 'physicsStats');
            const limbRadius = physStats?.radius.current ?? 0.3;
            const limbScale = (limbRadius / 0.3) * 0.75;
            obj.scale.set(limbScale, limbScale, limbScale);
          } else if (archetype === 'zone') {
            const shape = world.getComponent(id, 'zoneShape');
            if (shape) {
              // Если форма зоны изменилась в инспекторе — динамически перестраиваем меш геометрии
              if (obj.userData.currentShapeType !== shape.shapeType) {
                this.rebuildZoneMeshGeometry(obj, shape, world, id);
              }

              if (shape.shapeType === 'sphere') {
                obj.scale.set(shape.radius, shape.radius, shape.radius);
              } else if (shape.shapeType === 'cylinder') {
                obj.scale.set(shape.radius, shape.height / 2, shape.radius);
              } else {
                obj.scale.set(shape.width, shape.height, shape.depth);
              }
            } else {
              const effector = world.getComponent(id, 'areaEffector');
              const physStats = world.getComponent(id, 'physicsStats');
              const r = effector?.radius ?? physStats?.radius.current ?? 2.5;
              obj.scale.set(r, 1, r);
            }
          } else if (archetype === 'obstacle') {
            const physStats = world.getComponent(id, 'physicsStats');
            const visual = world.getComponent(id, 'visualModel');
            const propScale = visual?.modelId ? PROCEDURAL_PROP_SCALES[visual.modelId] : undefined;
            const isTree = tag?.subType === 'tree' || visual?.modelId?.includes('tree');

            let curW = (physStats?.radius.current ?? 1.0) * 2;
            let curD = (physStats?.radius.current ?? 1.0) * 2;

            // Для деревьев используем радиус кроны (radius), чтобы узкий ствол в points не сжимал крону
            if (!isTree && physStats?.points && physStats.points.length > 0) {
              let minX = physStats.points[0].x,
                maxX = physStats.points[0].x;
              let minY = physStats.points[0].y,
                maxY = physStats.points[0].y;
              for (let pi = 1; pi < physStats.points.length; pi++) {
                const pt = physStats.points[pi];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }
              curW = Math.max(0.1, maxX - minX);
              curD = Math.max(0.1, maxY - minY);
            }

            const h = physStats?.height?.current ?? 1.5;

            if (propScale) {
              const baseW = propScale.baseWidth ?? propScale.baseRadius * 2;
              const baseD = propScale.baseDepth ?? propScale.baseRadius * 2;
              const baseH = propScale.baseHeight;
              obj.scale.set(curW / baseW, h / baseH, curD / baseD);
            } else {
              const baseW = (obj.userData.baseWidth as number) ?? 2.0;
              const baseD = (obj.userData.baseDepth as number) ?? 2.0;
              const baseH = (obj.userData.baseHeight as number) ?? 1.5;
              obj.scale.set(curW / baseW, h / baseH, curD / baseD);
            }
          } else {
            obj.scale.set(1, 1, 1);
          }
        } else {
          // Применяем рассчитанную точку хвата (Grip Transform)
          const grip = obj.userData.gripTransform as GripTransform | undefined;
          if (grip) {
            obj.position.copy(grip.position);
            obj.quaternion.copy(grip.quaternion);
          } else {
            obj.position.set(0, 0, 0);
            obj.rotation.set(0, 0, 0);
          }
          obj.scale.set(1, 1, 1);
        }

        // Применение Cel Shading к новым и асинхронно загруженным моделям
        if (this.isCelShading && !obj.userData.isToonApplied) {
          this.toonManager.applyToon(obj);
          if (!this.loadingMeshes.has(id)) {
            obj.userData.isToonApplied = true;
          }
        }

        // Синхронизация геометрии и текстурных масок террейна
        if (archetype === 'terrain') {
          const terrainComp = world.getComponent(id, 'terrain');
          if (terrainComp) {
            this.terrainSync.syncTerrain(obj, terrainComp);
          }
        }

        // Анимация волн воды, динамическое освещение и реактивная синхронизация инспектора
        if (archetype === 'water') {
          const waterComp = world.getComponent(id, 'water');
          if (waterComp) {
            const rippleManager = obj.userData.rippleManager as WaterRippleManager | undefined;

            // 1. Динамическая перестройка сетки геометрии при изменении размеров X/Z в инспекторе
            if (
              obj.userData.currentWidth !== waterComp.width ||
              obj.userData.currentDepth !== waterComp.depth
            ) {
              obj.userData.currentWidth = waterComp.width;
              obj.userData.currentDepth = waterComp.depth;

              // Ограничиваем плотность сетки максимум 80 сегментами во избежание просадок FPS на больших водоемах
              const segsX = Math.max(16, Math.min(80, Math.ceil(waterComp.width * 1.2)));
              const segsZ = Math.max(16, Math.min(80, Math.ceil(waterComp.depth * 1.2)));
              const newGeo = new THREE.PlaneGeometry(
                waterComp.width,
                waterComp.depth,
                segsX,
                segsZ
              );
              newGeo.rotateX(-Math.PI / 2);

              obj.traverse((child) => {
                if (child instanceof THREE.Mesh && child.userData.isWaterMesh) {
                  child.geometry.dispose();
                  child.geometry = newGeo;
                }
              });
            }

            // 2. Симуляция расходящейся интерактивной ряби
            if (rippleManager && this.renderer) {
              const disturbances = this.collectWaterDisturbances(world, waterComp, transform);
              rippleManager.update(
                this.renderer,
                dt,
                disturbances,
                cameraTargetX,
                cameraTargetZ,
                waterComp.rippleSpeed ?? 1.0,
                waterComp.rippleDamping ?? GRAPHICS_CONFIG.water.ripples.damping
              );
            }

            // 3. Получение параметров освещения сцены с плавным взвешиванием при закате/восходе
            const sunDir = new THREE.Vector3();
            const sunColor = new THREE.Color(0, 0, 0);
            const ambientColor = new THREE.Color(0.25, 0.3, 0.4);
            let totalDirectionalWeight = 0;

            for (let i = 0; i < this.scene.children.length; i++) {
              const child = this.scene.children[i];
              if (child instanceof THREE.DirectionalLight && child.intensity > 0) {
                const lum =
                  child.intensity *
                  (child.color.r * 0.299 + child.color.g * 0.587 + child.color.b * 0.114);
                if (lum > 0.0001) {
                  const dir = new THREE.Vector3()
                    .copy(child.position)
                    .sub(child.target.position)
                    .normalize();
                  sunDir.addScaledVector(dir, lum);
                  sunColor.add(new THREE.Color().copy(child.color).multiplyScalar(child.intensity));
                  totalDirectionalWeight += lum;
                }
              } else if (child instanceof THREE.HemisphereLight) {
                ambientColor.copy(child.color).multiplyScalar(child.intensity);
              } else if (child instanceof THREE.AmbientLight) {
                ambientColor.copy(child.color).multiplyScalar(child.intensity);
              }
            }

            if (totalDirectionalWeight > 0.0001) {
              sunDir.normalize();
            } else {
              sunDir.set(0.5, 0.8, 0.3).normalize();
              sunColor.setRGB(1.0, 0.95, 0.85);
            }

            // 4. Синхронизация юниформов шейдера
            const rippleTex = rippleManager ? rippleManager.getTexture() : null;

            obj.traverse((child) => {
              if (
                child instanceof THREE.Mesh &&
                child.material &&
                (child.material as any).uniforms?.uTime
              ) {
                const u = (child.material as any).uniforms;

                u.uTime.value += dt;

                // Передача текстуры интерактивных волн и флага активности симуляции
                if (rippleTex && u.tRipple) {
                  u.tRipple.value = rippleTex;
                }
                if (u.uHasRipples) {
                  u.uHasRipples.value = rippleManager && !rippleManager.isSleepingState ? 1.0 : 0.0;
                }
                if (u.uRippleCenter && rippleManager) {
                  u.uRippleCenter.value.copy(rippleManager.center);
                }
                if (u.uRippleSize && rippleManager) {
                  u.uRippleSize.value = rippleManager.simSize;
                }

                // Передача параметров света
                u.uSunDirection.value.copy(sunDir);
                u.uSunColor.value.copy(sunColor);
                u.uAmbientColor.value.copy(ambientColor);

                // Реактивные параметры из Инспектора с защитой от отсутствующих юниформов
                if (waterComp.color && u.uColor) {
                  u.uColor.value.set(waterComp.color);
                }
                if (u.uDeepColor) {
                  if (waterComp.deepColor) {
                    u.uDeepColor.value.set(waterComp.deepColor);
                  } else if (waterComp.color) {
                    u.uDeepColor.value.set(waterComp.color).multiplyScalar(0.55);
                  }
                }
                if (u.uOpacity) u.uOpacity.value = waterComp.opacity ?? 0.88;
                if (u.uShallowOpacity) u.uShallowOpacity.value = waterComp.shallowOpacity ?? 0.25;
                if (u.uClarity) u.uClarity.value = waterComp.clarity ?? 2.5;
                if (u.uWaveSpeed) u.uWaveSpeed.value = waterComp.waveSpeed ?? 1.2;
                if (u.uWaveHeight) u.uWaveHeight.value = waterComp.waveHeight ?? 0.12;
                if (u.uFlowSpeed) u.uFlowSpeed.value = waterComp.flowSpeed ?? 0.0;
                if (waterComp.flowDirection && u.uFlowDirection) {
                  u.uFlowDirection.value.set(waterComp.flowDirection.x, waterComp.flowDirection.z);
                  if (u.uFlowDirection.value.lengthSq() > 0.001) {
                    u.uFlowDirection.value.normalize();
                  }
                }
              }
            });
          }
        }

        const isSelected = selectedIds.has(id);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isSelectionOutline) {
            if (isSelected) {
              child.material = this.matSilhouetteOutline;
              child.visible = true;
            } else if (this.isCelShading) {
              child.material = this.matCelOutline;
              child.visible = true;
            } else {
              child.visible = false;
            }
          }
        });

        // 3. Управление анимацией и ригом модульного существа
        if (obj.userData.isModularRig) {
          const animState = this.animators.get(id);
          const animatorComp = world.getComponent(id, 'animator');

          if (animState && animatorComp) {
            // Воспроизведение анимации строго из состояния ECS без обратной мутации
            if (animState.targetClipName !== animatorComp.currentAnimation) {
              animState.targetClipName = animatorComp.currentAnimation;
              this.playAnimation(id, animatorComp, animatorComp.currentAnimation).catch((e) =>
                console.warn(e)
              );
            }

            // Наложение вращения головы (Пост-обработка после миксера анимаций)
            const headBone = animState.rig.getObjectByName('HeadPivot');
            const health = world.getComponent(id, 'health');
            const consciousness = world.getComponent(id, 'consciousness');
            const isConscious =
              health?.isAlive && (!consciousness || consciousness.state === 'CONSCIOUS');
            const headOrientation = world.getComponent(id, 'headOrientation');

            if (headBone && isConscious && headOrientation) {
              const headPitch = headOrientation.relativePitch ?? 0;
              const headYaw = headOrientation.relativeYaw ?? 0;
              if (Number.isFinite(headPitch) && Number.isFinite(headYaw)) {
                const headQuat = new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(-headPitch, -headYaw, 0, 'YXZ')
                );
                headBone.quaternion.multiply(headQuat);
                headBone.userData.lastProceduralQuat = headQuat;
              } else {
                headBone.userData.lastProceduralQuat = null;
              }
            } else if (headBone) {
              headBone.userData.lastProceduralQuat = null;
            }

            // Управление отрубленными конечностями
            const assembly = world.getComponent(id, 'assemblyRoot');
            if (assembly && assembly.partIds) {
              const currentPartIds = new Set(assembly.partIds);
              obj.traverse((child) => {
                if (child.userData.partId) {
                  child.visible = currentPartIds.has(child.userData.partId);
                }
              });
            }

            // Прикрепление экипированного оружия/предметов в кости рук через RigSocketBinder
            this.socketBinder.syncCreatureSockets(id, animState, world, this.meshes, this.scene);
          }
        }
        // 4. Фоллбэк-визуализация примитивов
        else if (!isEquippedInHand) {
          const health = world.getComponent(id, 'health');
          if (health && !health.isAlive && archetype === 'creature') {
            obj.scale.set(1, 0.1, 1);
            obj.position.y = 0.05;
          } else if (archetype === 'creature') {
            const physStats = world.getComponent(id, 'physicsStats');
            const baseH = physStats?.height.current ?? 1.8;
            const radius = physStats?.radius.current ?? 0.4;
            const scaleXZ = radius / 0.4; // базовая ширина "заглушки"

            const transition = world.getComponent(id, 'stanceTransition');
            let currentHeight = baseH;

            const getH = (st: string) =>
              baseH *
              (BALANCE_CONFIG.creature.stanceHeightMultipliers[
                st as keyof typeof BALANCE_CONFIG.creature.stanceHeightMultipliers
              ] ?? 1.0);

            if (transition && transition.totalDuration > 0) {
              const progress = Math.min(
                1,
                Math.max(0, 1 - transition.timer / transition.totalDuration)
              );
              const fromH = getH(transition.fromStance);
              const toH = getH(transition.toStance);
              currentHeight = fromH + (toH - fromH) * progress;
            } else {
              const currentStance = world.getComponent(id, 'meta')?.stance || 'standing';
              currentHeight = getH(currentStance);
            }

            // Если фоллбэк - это CylinderGeometry, его оригинальная высота была 1.8
            obj.scale.set(scaleXZ, currentHeight / 1.8, scaleXZ);
            obj.position.y = 0;
          }

          if (archetype === 'zone') {
            const gameplayZone = world.getComponent(id, 'gameplayZone');
            // В игровом режиме скрываем отладочные объемы логических зон (квесты, лагеря, цели броска)
            if (_gameMode === GameMode.GAME && gameplayZone) {
              obj.visible = false;
            } else {
              obj.visible = true;
              const mat = this.getZoneMaterial(world, id);
              const mainMesh = obj.children.find(
                (c) => c instanceof THREE.Mesh && !c.userData.isSelectionOutline
              ) as THREE.Mesh;
              if (mainMesh && mainMesh.material !== mat) mainMesh.material = mat;
            }
          }
        }
      }
    }

    // Очистка удаленных из мира сущностей с освобождением VRAM
    for (const [id, mesh] of this.meshes.entries()) {
      if (!activeIds.has(id)) {
        this.loadingGenerations.set(id, (this.loadingGenerations.get(id) ?? 0) + 1);
        if (mesh.userData.rippleManager) {
          mesh.userData.rippleManager.destroy();
          delete mesh.userData.rippleManager;
        }
        ThreeSyncSystem.disposeObject(mesh);
        if (mesh.parent) {
          mesh.parent.remove(mesh);
        }
        this.meshes.delete(id);
        this.animators.delete(id);
      }
    }

    // Синхронизация 3D зон атак только вне игрового режима
    if (_gameMode === GameMode.GAME) {
      this.attackVisualsManager.clear();
    } else {
      this.attackVisualsManager.update(world);
    }

    // Синхронизация процедурной интерактивной травы с поддержкой многоуровневых мешей
    const terrainEntities = world.getEntitiesWith('terrain');
    const terrainComp = terrainEntities.length > 0 ? terrainEntities[0][1].terrain : undefined;
    this.grassSync.update(dt, world, this.physicsDriver, terrainComp, cameraTargetX, cameraTargetZ);
  }

  private async playAnimation(
    entityId: EntityId,
    animatorComp: AnimatorComponent,
    animKey: string
  ) {
    const state = this.animators.get(entityId);
    if (!state) return;

    if (state.currentClipName === animKey && state.currentAction?.isRunning()) {
      return;
    }

    const structureType = animatorComp.rigType as BodyStructureType;
    const rigProfile = CREATURE_RIG_PROFILES[structureType];
    if (!rigProfile) return;

    let clip: THREE.AnimationClip | null = null;

    if (ProceduralCreatureAssetManager.getInstance().hasBuilder(structureType)) {
      clip = ProceduralCreatureAssetManager.getInstance().getAnimationClip(structureType, animKey);
    }

    if (!clip) {
      const animUrl = rigProfile.animations[animKey] || rigProfile.animations['stand_idle'];
      if (!animUrl || animUrl.startsWith('proc://')) return;

      try {
        const gltfAnim = await AssetManager.getInstance().loadGLTF(animUrl);
        if (state.targetClipName !== animKey) return;
        if (gltfAnim.animations && gltfAnim.animations.length > 0) {
          clip = gltfAnim.animations[0];
        }
      } catch (e) {
        console.warn(`[ThreeSyncSystem] Animation failed to load: ${animUrl}`);
        return;
      }
    }

    if (!clip) return;
    if (state.targetClipName !== animKey) return;

    const action = state.mixer.clipAction(clip);
    action.reset();

    const profileSpeed = rigProfile.animationSpeeds?.[animKey] ?? 1.0;
    const ecsSpeed = animatorComp.playbackSpeed ?? 1.0;

    action.setEffectiveTimeScale(profileSpeed * ecsSpeed);
    action.setEffectiveWeight(1);

    const isOneShot =
      animKey === 'dead' ||
      animKey.startsWith('attack') ||
      animKey.startsWith('pickup') ||
      animKey.startsWith('drop_item') ||
      animKey.startsWith('throw_item') ||
      animKey === 'throw' ||
      animKey.includes('_to_');

    if (isOneShot) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }

    action.fadeIn(0.12);
    action.play();

    if (state.currentAction && state.currentAction !== action) {
      state.currentAction.fadeOut(0.12);
    }

    state.currentAction = action;
    state.currentClipName = animKey;
  }

  private createMeshForEntity(
    world: World,
    id: EntityId,
    archetype: string | undefined
  ): THREE.Object3D | undefined {
    // Сборка модульного рига для существ через ассемблер
    if (this.creatureAssembler.canAssembleModularRig(world, id, archetype)) {
      return this.creatureAssembler.createModularRig(world, id);
    }

    // Сборка оторванной составной части тела через ассемблер
    if (this.creatureAssembler.canAssembleDetachedLimb(world, id, archetype)) {
      return this.creatureAssembler.createDetachedLimb(world, id);
    }

    // Загрузка реального 3D меша для сущностей с визуальной моделью (предметы, препятствия, части тела)
    const visual = world.getComponent(id, 'visualModel');
    if (visual && visual.modelId) {
      const group = new THREE.Group();
      group.userData.entityId = id;
      this.loadingMeshes.add(id);

      const currentGen = (this.loadingGenerations.get(id) ?? 0) + 1;
      this.loadingGenerations.set(id, currentGen);

      AssetManager.getInstance()
        .getClonedModel(visual.modelId)
        .then((mesh) => {
          if (this.loadingGenerations.get(id) !== currentGen || !world.getEntity(id)) {
            if (mesh) ThreeSyncSystem.disposeObject(mesh);
            ThreeSyncSystem.disposeObject(group);
            this.scene.remove(group);
            return;
          }

          if (mesh) {
            if (mesh.type === 'Scene' || mesh.type === 'Group') {
              group.add(...mesh.children);
            } else {
              group.add(mesh);
            }

            if (archetype === 'item' || archetype === 'bodyPart') {
              const itemComp = world.getComponent(id, 'item');
              group.userData.gripTransform = computeItemGrip(group, itemComp?.type);
            }

            ThreeSyncSystem.attachOutlines(group, this.matSilhouetteOutline);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (this.loadingGenerations.get(id) === currentGen) {
            this.loadingMeshes.delete(id);
          }
        });

      return group;
    }

    // --- ФОЛЛБЭК ДЛЯ ПРИМИТИВОВ (Зоны, Препятствия) ---
    const physStats = world.getComponent(id, 'physicsStats');
    const radius = physStats ? physStats.radius.current : 0.4;
    const group = new THREE.Group();
    let mainMesh: THREE.Mesh | null = null;

    if (archetype === 'creature') {
      const aiStats = world.getComponent(id, 'aiStats');
      const behavior = aiStats?.behavior?.current;
      let mat = this.matIdle;
      if (behavior === 'PlayerTree') mat = this.matPlayer;
      else if (behavior === 'AttackerTree') mat = this.matEnemy;

      const h = physStats?.height?.current ?? 1.8;
      const geo = new THREE.CylinderGeometry(radius, radius, h, 16);
      mainMesh = new THREE.Mesh(geo, mat);
      mainMesh.position.y = h / 2;

      const noseGeo = new THREE.BoxGeometry(radius, radius * 0.4, radius * 0.4);
      const nose = new THREE.Mesh(noseGeo, mat);
      nose.position.set(radius, h * 0.75, 0);
      group.add(nose);
    } else if (archetype === 'obstacle') {
      let w = 4.0,
        d = 1.0;
      if (physStats?.points && physStats.points.length > 0) {
        let minX = physStats.points[0].x,
          maxX = physStats.points[0].x,
          minY = physStats.points[0].y,
          maxY = physStats.points[0].y;
        physStats.points.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
        w = Math.max(0.2, maxX - minX);
        d = Math.max(0.2, maxY - minY);
      }
      const h = physStats?.height?.current ?? 1.5;
      const geo = new THREE.BoxGeometry(w, h, d);
      mainMesh = new THREE.Mesh(geo, this.matObstacle);
      mainMesh.position.y = h / 2;

      group.userData.baseWidth = w;
      group.userData.baseDepth = d;
      group.userData.baseHeight = h;
    } else if (archetype === 'item' || archetype === 'bodyPart') {
      const item = world.getComponent(id, 'item');
      let mat = this.matWeapon;
      if (archetype === 'bodyPart') mat = this.matEnemy;
      else if (item?.type === 'armor') mat = this.matArmor;
      else if (item?.type === 'bag') mat = this.matBag;

      const size = radius * 0.8;
      const geo = new THREE.BoxGeometry(size, size, size);
      mainMesh = new THREE.Mesh(geo, mat);
      mainMesh.position.y = 0;
    } else if (archetype === 'zone') {
      const shape = world.getComponent(id, 'zoneShape');
      const mat = this.getZoneMaterial(world, id);
      const shapeType = shape?.shapeType ?? 'cylinder';

      let geo: THREE.BufferGeometry;
      let posY = 1;

      if (shapeType === 'sphere') {
        geo = new THREE.SphereGeometry(1, 24, 18);
        posY = 1;
        const r = shape?.radius ?? radius;
        group.scale.set(r, r, r);
      } else if (shapeType === 'box') {
        geo = new THREE.BoxGeometry(1, 1, 1);
        posY = 0.5;
        const w = shape?.width ?? 4;
        const h = shape?.height ?? 2.5;
        const d = shape?.depth ?? 4;
        group.scale.set(w, h, d);
      } else {
        geo = new THREE.CylinderGeometry(1, 1, 2, 32);
        posY = 1;
        const r = shape?.radius ?? radius;
        const h = shape?.height ?? 2.5;
        group.scale.set(r, h / 2, r);
      }

      mainMesh = new THREE.Mesh(geo, mat);
      mainMesh.position.y = posY;
      group.userData.currentShapeType = shapeType;
    } else if (archetype === 'terrain') {
      const terrainComp = world.getComponent(id, 'terrain');
      if (terrainComp) {
        return this.terrainSync.createTerrainMesh(id, terrainComp);
      }
    } else if (archetype === 'water') {
      const waterComp = world.getComponent(id, 'water');
      if (waterComp) {
        // Ограничиваем плотность сетки максимум 80 сегментами во избежание просадок FPS на больших водоемах
        const segsX = Math.max(16, Math.min(100, Math.ceil(waterComp.width * 1.2)));
        const segsZ = Math.max(16, Math.min(100, Math.ceil(waterComp.depth * 1.2)));
        const geo = new THREE.PlaneGeometry(waterComp.width, waterComp.depth, segsX, segsZ);
        geo.rotateX(-Math.PI / 2);

        const rippleManager = new WaterRippleManager(
          GRAPHICS_CONFIG.water.ripples.resolution,
          48.0
        );

        const mat = createWaterMaterial(waterComp, rippleManager.getTexture());
        const waterMesh = new THREE.Mesh(geo, mat);
        waterMesh.receiveShadow = true;
        waterMesh.userData.isWaterMesh = true;
        waterMesh.userData.entityId = id;

        group.add(waterMesh);
        group.userData.isWater = true;
        group.userData.entityId = id;
        group.userData.currentWidth = waterComp.width;
        group.userData.currentDepth = waterComp.depth;
        group.userData.rippleManager = rippleManager;
        return group;
      }
    }

    if (mainMesh) {
      group.userData.entityId = id;
      mainMesh.userData.entityId = id;
      mainMesh.userData.isSharedMaterial = true;
      group.add(mainMesh);

      if (archetype === 'item' || archetype === 'bodyPart') {
        const itemComp = world.getComponent(id, 'item');
        group.userData.gripTransform = computeItemGrip(group, itemComp?.type);
      }

      ThreeSyncSystem.attachOutlines(group, this.matSilhouetteOutline);

      return group;
    }

    return undefined;
  }

  private collectWaterDisturbances(
    world: World,
    waterComp: WaterComponent,
    waterTransform: TransformComponent
  ): WaterDisturbance[] {
    const disturbances: WaterDisturbance[] = [];
    const halfW = waterComp.width / 2;
    const halfD = waterComp.depth / 2;
    const waterSurfaceY = waterTransform.y;
    const maxDepth = waterComp.maxDepth ?? 4.0;

    const terrainEntities = world.getEntitiesWith('terrain');
    const terrainComp = terrainEntities.length > 0 ? terrainEntities[0][1].terrain : undefined;

    // 1. Существа (игрок, собаки)
    const creatures = world.getEntitiesWith('transform', 'meta', 'health');
    for (const [cId, { transform, meta, health }] of creatures) {
      if (!health.isAlive) continue;

      const dx = transform.x - waterTransform.x;
      const dz = transform.z - waterTransform.z;

      // Существо должно быть строго в границах водоема по горизонтали
      if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfD) {
        // Проверяем высоту рельефа под ногами: если грунт выше водной глади — существо на сухом берегу
        let terrainY: number | null = null;
        if (terrainComp) {
          terrainY = getTerrainHeightAt(terrainComp, transform.x, transform.z);
          if (terrainY !== null && terrainY >= waterSurfaceY - 0.02) {
            continue; // Сухой берег
          }
        }

        // Глубина погружения подошв/тела в воду (в метрах)
        const immersion = waterSurfaceY - transform.y;
        // Если ноги выше воды или погружены менее чем на 4 см — вода не реагирует
        if (immersion < 0.04 || transform.y < waterSurfaceY - maxDepth - 0.5) {
          continue;
        }

        // Локальная глубина водоема в данной точке берега
        const localWaterDepth =
          terrainY !== null ? Math.max(0, waterSurfaceY - terrainY) : immersion;
        if (localWaterDepth < 0.04) {
          continue;
        }

        const vel = world.getComponent(cId, 'velocity');
        const speed = Math.hypot(vel?.vx ?? 0, vel?.vz ?? 0);
        const physStats = world.getComponent(cId, 'physicsStats');
        const radius = physStats?.radius.current ?? 0.4;
        const creatureHeight = physStats?.height.current ?? 1.8;

        const isSwimming = meta.stance === 'swim';
        const isMoving = speed > 0.05;

        // Если существо полностью стоит на месте и не плывет — оно не создает волн
        if (!isMoving && !isSwimming) {
          continue;
        }

        if (isMoving || isSwimming) {
          // Плавная кривая отклика: от 0.04м до 50% роста существа
          const targetImmersion = isSwimming ? creatureHeight * 0.45 : 0.5;
          const immersionFactor = Math.min(
            1.0,
            Math.max(0.0, (immersion - 0.04) / Math.max(0.08, targetImmersion - 0.04))
          );

          // Затухание волн на ультра-мелководье у кромки берега (глубина до 25 см)
          const shoreDepthFactor = Math.min(1.0, Math.max(0.0, (localWaterDepth - 0.04) / 0.25));
          const effectiveImmersion = immersionFactor * shoreDepthFactor;

          if (effectiveImmersion <= 0.02) {
            continue;
          }

          const baseStrength = isSwimming
            ? isMoving
              ? Math.min(0.24, 0.05 + speed * 0.04)
              : 0.015
            : Math.min(0.18, speed * 0.035);

          // Плавная пульсация во время нахождения в воде без движения (treading water / idle)
          const timePulse =
            !isMoving && isSwimming
              ? Math.sin(
                  performance.now() * 0.006 +
                    cId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                ) *
                  0.5 +
                0.5
              : 1.0;

          disturbances.push({
            x: transform.x,
            z: transform.z,
            radius: (radius + (isMoving ? 0.25 : 0.12)) * Math.max(0.6, effectiveImmersion),
            strength: baseStrength * effectiveImmersion * timePulse,
          });
        }
      }
    }

    // 2. Динамические физические предметы (мячики, палки, ящики)
    const items = world.getEntitiesWith('transform', 'physicsBody', 'physicsStats');
    for (const [itId, { transform, physicsBody, physicsStats }] of items) {
      if (world.getComponent(itId, 'ownership')) continue;
      if (physicsBody.bodyHandle === undefined || physicsBody.bodyType !== 'dynamic') continue;

      const dx = transform.x - waterTransform.x;
      const dz = transform.z - waterTransform.z;

      if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfD) {
        if (terrainComp) {
          const terrainY = getTerrainHeightAt(terrainComp, transform.x, transform.z);
          if (terrainY !== null && terrainY >= waterSurfaceY - 0.02) {
            continue;
          }
        }

        const radius = physicsStats.radius.current ?? 0.2;
        const itemBottomY = transform.y - radius;
        const itemImmersion = waterSurfaceY - itemBottomY;

        if (itemImmersion < 0.03 || transform.y < waterSurfaceY - maxDepth) {
          continue;
        }

        const bodyState = this.physicsDriver?.getBodyState(physicsBody.bodyHandle);
        if (!bodyState || bodyState.isSleeping) continue;

        const linvel = bodyState.linvel;
        const speed = Math.hypot(linvel.x, linvel.y, linvel.z);

        if (speed > 0.08) {
          const immersionRatio = Math.min(1.0, Math.max(0.0, itemImmersion / (radius * 1.8)));

          disturbances.push({
            x: transform.x,
            z: transform.z,
            radius: (radius + 0.15) * Math.max(0.6, immersionRatio),
            strength: Math.min(0.28, speed * 0.05) * immersionRatio,
          });
        }
      }
    }

    return disturbances;
  }

  private getZoneMaterial(world: World, id: EntityId): THREE.Material {
    const effector = world.getComponent(id, 'areaEffector');
    const gameplayZone = world.getComponent(id, 'gameplayZone');
    let mat = this.matZoneNeutral;

    if (effector) {
      if (effector.effect === 'damage') mat = this.matZoneDmg;
      else if (effector.effect === 'joint_damage') mat = this.matZoneJoint;
      else if (effector.effect === 'heal') mat = this.matZoneHeal;
      else if (effector.effect === 'time_dilation') {
        mat = (effector.valuePerSec ?? 1) > 1.0 ? this.matZoneFast : this.matZoneSlow;
      }
    } else if (gameplayZone) {
      if (gameplayZone.role === 'quest') mat = this.matZoneQuest;
      else if (gameplayZone.role === 'ai_area') mat = this.matZoneAI;
      else if (gameplayZone.role === 'throw_target') mat = this.matZoneThrowTarget;
    }

    return mat;
  }

  private rebuildZoneMeshGeometry(
    group: THREE.Object3D,
    shape: import('../components/zone').ZoneShapeComponent,
    world: World,
    entityId: EntityId
  ): void {
    let oldMesh: THREE.Mesh | null = null;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (child instanceof THREE.Mesh && !child.userData.isSelectionOutline) {
        oldMesh = child;
        group.remove(child);
        break;
      }
    }

    if (oldMesh) {
      ThreeSyncSystem.disposeObject(oldMesh);
    }

    let geo: THREE.BufferGeometry;
    let posY = 1;

    if (shape.shapeType === 'sphere') {
      geo = new THREE.SphereGeometry(1, 24, 18);
      posY = 1;
    } else if (shape.shapeType === 'box') {
      geo = new THREE.BoxGeometry(1, 1, 1);
      posY = 0.5;
    } else {
      geo = new THREE.CylinderGeometry(1, 1, 2, 32);
      posY = 1;
    }

    const mat = this.getZoneMaterial(world, entityId);
    const newMesh = new THREE.Mesh(geo, mat);
    newMesh.position.y = posY;
    newMesh.userData.entityId = entityId;
    newMesh.userData.isSharedMaterial = true;

    group.add(newMesh);
    ThreeSyncSystem.attachOutlines(group, this.matSilhouetteOutline);
    group.userData.currentShapeType = shape.shapeType;
  }
}
