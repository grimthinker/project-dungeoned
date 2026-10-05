import { GameApp } from '../GameApp';
import {
  EntityComponents,
  CollisionCategory,
  COLLISION_MASK_ALL,
  COLLISION_MASK_NONE,
  SERIALIZABLE_COMPONENT_KEYS,
  StatValue,
} from './types';
import { PhysicsBodyHandle, PhysicsColliderHandle } from '../physics/IPhysicsDriver';
import { Radians } from '../utils';
import { evaluateStat, createStat } from './stats/StatEvaluator';
import { fastClone } from './utils/clone';
import { BALANCE_CONFIG } from '../config/balanceConfig';

import {
  packBitsCompress,
  packBitsDecompress,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './utils/terrainCompression';
import { TerrainComponent } from './components/terrain';
import { buildObstacleColliders } from './utils/obstacleColliders';
import { StoryFlagsManager } from '../dialogue/StoryFlagsManager';

export interface SerializedTerrainData {
  width?: number;
  depth?: number;
  size?: number; // Для обратной совместимости со старыми сохранениями
  resolution: number;
  splatResolution: number;
  textureTiling: number;
  heights?: number[];
  splatData?: number[];
  foliageData?: number[];
  heightsRleBase64?: string;
  splatRleBase64?: string;
  foliageRleBase64?: string;
  heightsBase64?: string;
  splatBase64?: string;
}

export interface SerializedBrainData {
  blackboardData: Record<string, unknown>;
}

export type SerializedComponents = Omit<Partial<EntityComponents>, 'brain' | 'terrain'> & {
  brain?: SerializedBrainData;
  terrain?: SerializedTerrainData;
  [key: string]: unknown;
};

export interface SerializedEntityData {
  id: string;
  components: SerializedComponents;
}

export interface SerializedWorldData {
  entities: SerializedEntityData[];
  storyFlags?: Record<string, any>;
}

export class WorldSerializer {
  constructor(private app: GameApp) {}

  public serializeEntities(ids: string[]): SerializedEntityData[] {
    const entitiesData: SerializedEntityData[] = [];

    for (const id of ids) {
      const comp = this.app.world.getEntity(id);
      if (!comp) continue;

      const data: SerializedEntityData = { id, components: {} };

      for (const key of SERIALIZABLE_COMPONENT_KEYS) {
        const componentValue = comp[key];
        if (componentValue !== undefined) {
          if (key === 'terrain') {
            const t = componentValue as TerrainComponent;
            const heightsBytes = new Uint8Array(
              t.heights.buffer,
              t.heights.byteOffset,
              t.heights.byteLength
            );
            const heightsRle = packBitsCompress(heightsBytes);
            const splatRle = packBitsCompress(t.splatData);
            const foliageRle = packBitsCompress(t.foliageData);

            data.components[key] = {
              width: t.width,
              depth: t.depth,
              resolution: t.resolution,
              splatResolution: t.splatResolution || 512,
              textureTiling: t.textureTiling,
              heightsRleBase64: uint8ArrayToBase64(heightsRle),
              splatRleBase64: uint8ArrayToBase64(splatRle),
              foliageRleBase64: uint8ArrayToBase64(foliageRle),
            };
          } else {
            (data.components as Record<string, unknown>)[key] = fastClone(componentValue);
          }
        }
      }

      if (comp.brain) {
        const bbData = { ...comp.brain.blackboard.getData() };
        delete bbData.pressedKeys;
        delete bbData.pressed_keys;
        data.components.brain = {
          blackboardData: fastClone(bbData),
        };
      }

      entitiesData.push(data);
    }

    return entitiesData;
  }

  public serializeWorld(): SerializedWorldData {
    const allIds = this.app.world.getAllEntities().map(([id]) => id);
    return {
      entities: this.serializeEntities(allIds),
      storyFlags: StoryFlagsManager.getAllFlags(),
    };
  }

  public deserializeEntities(entitiesData: SerializedEntityData[]): void {
    if (!entitiesData || !Array.isArray(entitiesData)) return;

    const entityMap = new Map<string, SerializedEntityData>();
    const allAssemblyPartIds = new Set<string>();

    for (const ent of entitiesData) {
      entityMap.set(ent.id, ent);
      if (ent.components?.assemblyRoot?.partIds) {
        for (const pId of ent.components.assemblyRoot.partIds) {
          allAssemblyPartIds.add(pId);
        }
      }
    }

    const injectOwnershipRecursive = (
      parentId: string,
      childId: string,
      status: 'equipped' | 'inventory'
    ) => {
      const childEnt = entityMap.get(childId);
      if (!childEnt || !childEnt.components) return;

      childEnt.components.ownership = { ownerId: parentId, status };

      if (childEnt.components.interactionSlots?.itemId) {
        injectOwnershipRecursive(childId, childEnt.components.interactionSlots.itemId, 'equipped');
      }

      if (childEnt.components.equip?.equipmentAreas) {
        for (const area of childEnt.components.equip.equipmentAreas) {
          if (Array.isArray(area.itemIds)) {
            for (const subItemId of area.itemIds) {
              injectOwnershipRecursive(childId, subItemId, 'equipped');
            }
          }
        }
      }

      if (childEnt.components.inventory?.slots) {
        for (const row of childEnt.components.inventory.slots) {
          for (const cell of row) {
            if (cell.itemId) {
              injectOwnershipRecursive(childId, cell.itemId, 'inventory');
            }
          }
        }
      }
    };

    for (const ent of entitiesData) {
      if (!ent.components) continue;

      if (ent.components.interactionSlots?.itemId) {
        injectOwnershipRecursive(ent.id, ent.components.interactionSlots.itemId, 'equipped');
      }
      if (ent.components.equip?.equipmentAreas) {
        for (const area of ent.components.equip.equipmentAreas) {
          if (Array.isArray(area.itemIds)) {
            for (const subItemId of area.itemIds) {
              injectOwnershipRecursive(ent.id, subItemId, 'equipped');
            }
          }
        }
      }
      if (ent.components.inventory?.slots) {
        for (const row of ent.components.inventory.slots) {
          for (const cell of row) {
            if (cell.itemId) injectOwnershipRecursive(ent.id, cell.itemId, 'inventory');
          }
        }
      }
    }

    for (const ent of entitiesData) {
      if (!ent.components) continue;

      // Удаляем старую сущность, если восстанавливаем поверх (например, при Undo)
      if (this.app.world.getEntity(ent.id)) {
        const phys = this.app.world.getComponent(ent.id, 'physicsBody');
        if (phys && phys.bodyHandle !== undefined && this.app.physicsDriver) {
          this.app.physicsDriver.removeRigidBody(phys.bodyHandle);
        }
        this.app.world.removeEntity(ent.id);
        this.app.aiSystem.unregisterEntity(ent.id);
      }

      this.app.world.createEntity(ent.id);
      const comps = ent.components;

      // 1. Восстановление сериализуемых компонентов согласно белому списку
      for (const key of SERIALIZABLE_COMPONENT_KEYS) {
        if (comps[key] !== undefined) {
          if (key === 'terrain') {
            const rawT = comps[key] as SerializedTerrainData;
            const res = rawT.resolution || 128;
            const splatRes = rawT.splatResolution || 512;
            let heights: Float32Array;
            let splatData: Uint8Array;
            let foliageData: Uint8Array;

            // 1. Десериализация высот
            if (rawT.heightsRleBase64) {
              const comp = base64ToUint8Array(rawT.heightsRleBase64);
              const decomp = packBitsDecompress(comp, res * res * 4);
              heights = new Float32Array(
                decomp.buffer.slice(decomp.byteOffset, decomp.byteOffset + res * res * 4)
              );
            } else if (rawT.heightsBase64) {
              const bytes = base64ToUint8Array(rawT.heightsBase64);
              heights = new Float32Array(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + res * res * 4)
              );
            } else if (rawT.heights && Array.isArray(rawT.heights)) {
              heights = new Float32Array(rawT.heights);
            } else {
              heights = new Float32Array(res * res);
            }

            // 2. Десериализация Splatmap
            if (rawT.splatRleBase64) {
              const comp = base64ToUint8Array(rawT.splatRleBase64);
              splatData = packBitsDecompress(comp, splatRes * splatRes * 4);
            } else if (rawT.splatBase64) {
              splatData = base64ToUint8Array(rawT.splatBase64);
            } else if (rawT.splatData && Array.isArray(rawT.splatData)) {
              splatData = new Uint8Array(rawT.splatData);
            } else {
              splatData = new Uint8Array(splatRes * splatRes * 4);
            }

            // 3. Десериализация Foliage Density Map
            if (rawT.foliageRleBase64) {
              const comp = base64ToUint8Array(rawT.foliageRleBase64);
              foliageData = packBitsDecompress(comp, splatRes * splatRes * 5);
            } else if (rawT.foliageData && Array.isArray(rawT.foliageData)) {
              foliageData = new Uint8Array(rawT.foliageData);
            } else {
              foliageData = new Uint8Array(splatRes * splatRes * 5);
              for (let i = 0; i < splatRes * splatRes; i++) {
                foliageData[i * 5] = splatData[i * 4];
              }
            }

            // Валидация размеров
            if (heights.length !== res * res) {
              const fixed = new Float32Array(res * res);
              fixed.set(heights.subarray(0, Math.min(heights.length, res * res)));
              heights = fixed;
            }

            if (splatData.length !== splatRes * splatRes * 4) {
              const fixed = new Uint8Array(splatRes * splatRes * 4);
              fixed.set(splatData.subarray(0, Math.min(splatData.length, splatRes * splatRes * 4)));
              splatData = fixed;
            }

            if (foliageData.length !== splatRes * splatRes * 5) {
              const fixed = new Uint8Array(splatRes * splatRes * 5);
              fixed.set(
                foliageData.subarray(0, Math.min(foliageData.length, splatRes * splatRes * 5))
              );
              foliageData = fixed;
            }

            for (let i = 0; i < heights.length; i++) {
              if (Number.isNaN(heights[i]) || !Number.isFinite(heights[i])) {
                heights[i] = 0;
              }
            }

            this.app.world.addComponent(ent.id, 'terrain', {
              width: rawT.width || rawT.size || 100,
              depth: rawT.depth || rawT.size || 100,
              resolution: res,
              splatResolution: splatRes,
              heights,
              splatData,
              foliageData,
              textureTiling: rawT.textureTiling || 24,
              dirtyChunks: new Set<string>(),
              geometryVersion: 1,
              splatVersion: 1,
              foliageVersion: 1,
              isGeometryDirty: true,
              isSplatDirty: true,
              isFoliageDirty: true,
              isPhysicsDirty: true,
            });
          } else {
            this.app.world.addComponent(ent.id, key, comps[key]);
          }
        }
      }

      // Нормализация 3D трансформации
      const trans = this.app.world.getComponent(ent.id, 'transform');
      if (trans) {
        trans.z = trans.z ?? 0;
        if (!trans.rotation) {
          const yaw = trans.angle ?? 0;
          trans.rotation = { x: 0, y: Math.sin(yaw * 0.5), z: 0, w: Math.cos(yaw * 0.5) };
        }
        if (trans.angle === undefined) {
          const siny_cosp =
            2 * (trans.rotation.w * trans.rotation.y + trans.rotation.x * trans.rotation.z);
          const cosy_cosp =
            1 - 2 * (trans.rotation.y * trans.rotation.y + trans.rotation.z * trans.rotation.z);
          trans.angle = Math.atan2(siny_cosp, cosy_cosp);
        }
      }

      // Фолбэк для обратной совместимости старых сейвов:
      if (!comps.timeScale) {
        this.app.world.addComponent(ent.id, 'timeScale', {
          multiplier: { base: 1.0, current: 1.0, modifiers: [] },
        });
      }

      const isPossessedItem = !!comps.ownership;

      if (comps.renderable && isPossessedItem) {
        comps.renderable.isVisible = false;
      }

      // Инициализация мозга и восстановление памяти (blackboard) для агентов
      const shouldInitBrain = comps.bodyBrain || comps.aiStats;
      if (shouldInitBrain) {
        let behaviorId = comps.aiStats?.behavior?.current ?? 'IdleTree';
        if (comps.bodyBrain?.rootEntityId) {
          const rootEnt = entityMap.get(comps.bodyBrain.rootEntityId);
          behaviorId = rootEnt?.components?.aiStats?.behavior?.current ?? behaviorId;
        }
        this.app.aiSystem.initBotBrain(this.app.world, ent.id, behaviorId);

        if (comps.brain?.blackboardData) {
          const brain = this.app.world.getComponent(ent.id, 'brain');
          if (brain && brain.blackboard) {
            const sanitizedBBData = { ...comps.brain.blackboardData };
            delete sanitizedBBData.pressedKeys;
            delete sanitizedBBData.pressed_keys;
            Object.assign(brain.blackboard.getData(), sanitizedBBData);
            brain.blackboard.remove('pressedKeys');
          }
        }
      }

      // 2. Нормализация характеристик до создания физики
      const normalizeStat = (stat: StatValue<number> | undefined) => {
        if (stat && typeof stat === 'object' && 'base' in stat) {
          stat.modifiers = Array.isArray(stat.modifiers) ? stat.modifiers : [];
          stat.current = evaluateStat(stat);
        }
      };

      if (comps.health) {
        if (comps.health.max) normalizeStat(comps.health.max);
        comps.health.current = Math.min(
          comps.health.current,
          comps.health.max?.current ?? comps.health.current
        );
        comps.health.isAlive = comps.health.current > 0;
        comps.health.hitFlashTimer = 0;
        comps.health.healFlashTimer = 0;
      }

      if (comps.physicsStats) {
        normalizeStat(comps.physicsStats.radius);
        normalizeStat(comps.physicsStats.weight);
        if (comps.physicsStats.height === undefined) {
          // Обратная совместимость для старых сохранений
          const defaultH =
            comps.tag?.archetype === 'item' ? comps.physicsStats.radius.base * 2 : 1.8;
          comps.physicsStats.height = { base: defaultH, current: defaultH, modifiers: [] };
        } else {
          normalizeStat(comps.physicsStats.height as any);
        }
      }

      if (comps.headOrientation) {
        normalizeStat(comps.headOrientation.turnSpeed);
        comps.headOrientation.yawVelocity = 0;
        comps.headOrientation.pitchVelocity = 0;
      } else if (comps.movementStats || comps.animator || comps.tag?.archetype === 'creature') {
        const headTurnSpeed = BALANCE_CONFIG.creature.defaultHeadTurnSpeed;
        this.app.world.addComponent(ent.id, 'headOrientation', {
          yaw: (trans?.angle ?? 0) as Radians,
          pitch: 0 as Radians,
          relativeYaw: 0 as Radians,
          relativePitch: 0 as Radians,
          yawVelocity: 0,
          pitchVelocity: 0,
          turnSpeed: createStat(headTurnSpeed),
        });
      }

      if (comps.movementStats) {
        normalizeStat(comps.movementStats.maxSpeed);
        normalizeStat(comps.movementStats.maxTurnSpeed);
        normalizeStat(comps.movementStats.standToCrouchTime);
        normalizeStat(comps.movementStats.crouchToStandTime);
        normalizeStat(comps.movementStats.standToProneTime);
        normalizeStat(comps.movementStats.proneToStandTime);
        normalizeStat(comps.movementStats.crouchToProneTime);
        normalizeStat(comps.movementStats.proneToCrouchTime);
        normalizeStat(comps.movementStats.dropPrepTime);
        normalizeStat(comps.movementStats.dropRecoveryTime);
        comps.movementStats.proneSpeedMultiplier = comps.movementStats.proneSpeedMultiplier ?? 0.2;
        comps.movementStats.proneTurnMultiplier = comps.movementStats.proneTurnMultiplier ?? 0.3;
        comps.movementStats.strafeSpeedMultiplier =
          comps.movementStats.strafeSpeedMultiplier ?? 0.8;
        comps.movementStats.backwardSpeedMultiplier =
          comps.movementStats.backwardSpeedMultiplier ?? 0.6;
        comps.movementStats.strafeTurnMultiplier = comps.movementStats.strafeTurnMultiplier ?? 0.8;
        comps.movementStats.backwardTurnMultiplier =
          comps.movementStats.backwardTurnMultiplier ?? 0.6;
        comps.movementStats.pickupSpeedMultiplier =
          comps.movementStats.pickupSpeedMultiplier ?? 0.5;
        comps.movementStats.pickupTurnMultiplier = comps.movementStats.pickupTurnMultiplier ?? 1.1;
      }

      if (comps.stealthStats) {
        normalizeStat(comps.stealthStats.stealthPower);
        comps.stealthStats.proneStealthMultiplier =
          comps.stealthStats.proneStealthMultiplier ?? 3.0;
      }

      if (comps.weaponStats) {
        normalizeStat(comps.weaponStats.baseDamage);
        normalizeStat(comps.weaponStats.prepTime);
        normalizeStat(comps.weaponStats.castTime);
        normalizeStat(comps.weaponStats.recoveryTime);
      }

      if (comps.armorStats) {
        normalizeStat(comps.armorStats.defense);
        normalizeStat(comps.armorStats.flatReduction);
      }

      if (comps.timeScale) {
        normalizeStat(comps.timeScale.multiplier);
      }

      if (comps.vision) {
        normalizeStat(comps.vision.fovAngle);
        normalizeStat(comps.vision.clarity);
        normalizeStat(comps.vision.maxDistance);
      }

      if (comps.hearing) {
        normalizeStat(comps.hearing.sensitivity);
        normalizeStat(comps.hearing.maxDistance);
      }

      // 3. Реставрация физического тела для объектов с физикой
      if (comps.tag?.archetype === 'marker' && comps.transform && !isPossessedItem) {
        this.app.world.addComponent(ent.id, 'physicsBody', {
          isStatic: true,
          category: CollisionCategory.NONE,
          mask: COLLISION_MASK_NONE,
          isTrigger: true,
        });
      } else if (comps.physicsStats && comps.transform && !isPossessedItem) {
        const isPartOfCreature = allAssemblyPartIds.has(ent.id);
        const archetype =
          comps.tag?.archetype ??
          (comps.areaEffector || (comps as Record<string, unknown>).zoneTrigger
            ? 'zone'
            : comps.item
              ? 'item'
              : comps.physicsStats?.points
                ? 'obstacle'
                : comps.terrain
                  ? 'terrain'
                  : 'creature');

        if (archetype !== 'marker' && (!isPartOfCreature || archetype !== 'bodyPart')) {
          if (archetype === 'obstacle') {
            const points = comps.physicsStats.points ?? [
              { x: -2, y: -0.5 },
              { x: 2, y: -0.5 },
              { x: 2, y: 0.5 },
              { x: -2, y: 0.5 },
            ];
            const category = CollisionCategory.OBSTACLE;
            const isAlive = comps.health ? comps.health.isAlive : true;
            const isSolid = comps.physicsStats.isSolid && isAlive;
            const mask = isSolid ? COLLISION_MASK_ALL : COLLISION_MASK_NONE;

            let bodyHandle: PhysicsBodyHandle | undefined = undefined;
            let colliderHandle: PhysicsColliderHandle | undefined = undefined;
            let colliderHandles: PhysicsColliderHandle[] | undefined = undefined;

            if (this.app.physicsDriver?.isReady) {
              const pos3D = { x: trans?.x ?? 0, y: trans?.y ?? 0, z: trans?.z ?? 0 };
              const angle = trans?.angle ?? 0;
              const rotation = trans?.rotation ?? {
                x: 0,
                y: Math.sin(angle * 0.5),
                z: 0,
                w: Math.cos(angle * 0.5),
              };

              bodyHandle = this.app.physicsDriver.createFixedBody(pos3D, ent.id, { rotation });

              const built = buildObstacleColliders(this.app.physicsDriver, bodyHandle, {
                points,
                height: comps.physicsStats?.height?.current ?? 1.5,
                colliders: comps.physicsStats?.colliders,
              });
              colliderHandle = built.primaryCollider;
              colliderHandles = built.allColliders;
            }

            this.app.world.addComponent(ent.id, 'physicsBody', {
              bodyHandle,
              colliderHandle,
              colliderHandles,
              bodyType: 'fixed',
              isStatic: true,
              category,
              mask,
            });
          } else if (archetype !== 'terrain') {
            let isStatic = false;
            let isTrigger = false;
            let category = CollisionCategory.CREATURE;
            let mask = comps.physicsStats.isSolid ? COLLISION_MASK_ALL : COLLISION_MASK_NONE;

            let bodyHandle: PhysicsBodyHandle | undefined = undefined;
            let colliderHandle: PhysicsColliderHandle | undefined = undefined;

            if (archetype === 'item' || comps.physicsBody?.bodyType === 'dynamic') {
              const pos3D = { x: trans?.x ?? 0, y: trans?.y ?? 0.2, z: trans?.z ?? 0 };
              bodyHandle = this.app.physics.createDynamicItemBody(this.app.world, ent.id, pos3D);

              const newPhys = this.app.world.getComponent(ent.id, 'physicsBody');
              if (newPhys) {
                colliderHandle = newPhys.colliderHandle;
              }

              if (bodyHandle !== undefined && trans?.rotation && this.app.physicsDriver) {
                this.app.physicsDriver.setBodyRotation(bodyHandle, trans.rotation, true);
              }

              // Восстановление физического импульса
              if (bodyHandle !== undefined && comps.velocity && this.app.physicsDriver) {
                this.app.physicsDriver.setBodyLinearVelocity(
                  bodyHandle,
                  { x: comps.velocity.vx, y: comps.velocity.vy, z: comps.velocity.vz },
                  true
                );
                if (comps.velocity.angvel) {
                  this.app.physicsDriver.setBodyAngularVelocity(
                    bodyHandle,
                    comps.velocity.angvel,
                    true
                  );
                }
              }
            } else if (archetype === 'zone') {
              category = CollisionCategory.TRIGGER_ZONE;
              mask = CollisionCategory.CREATURE;
              isTrigger = true;
              isStatic = false;
            }

            if (archetype === 'creature' && this.app.physicsDriver?.isReady) {
              const pos3D = { x: trans?.x ?? 0, y: trans?.y ?? 0, z: trans?.z ?? 0 };
              bodyHandle = this.app.physicsDriver.createKinematicPositionBody(pos3D, ent.id);
              const r = comps.physicsStats?.radius?.current ?? 0.4;
              const w = comps.physicsStats?.weight?.current ?? 75;
              const halfHeight = Math.max(0.01, (1.8 - 2 * r) / 2);
              const offsetY = halfHeight + r;
              colliderHandle = this.app.physicsDriver.createCapsuleCollider(
                halfHeight,
                r,
                bodyHandle,
                {
                  mass: w,
                  offset: { x: 0, y: offsetY, z: 0 },
                }
              );
            }

            this.app.world.addComponent(ent.id, 'physicsBody', {
              bodyHandle,
              colliderHandle,
              bodyType:
                archetype === 'item'
                  ? 'dynamic'
                  : archetype === 'creature'
                    ? 'kinematicPositionBased'
                    : undefined,
              isStatic,
              category,
              mask,
              isTrigger,
              currentColliderStance:
                archetype === 'creature' ? comps.meta?.stance || 'standing' : undefined,
            });
          }
        }
      }

      if (comps.movementStats) {
        if (!this.app.world.getComponent(ent.id, 'velocity')) {
          this.app.world.addComponent(ent.id, 'velocity', {
            vx: 0,
            vy: 0,
            vz: 0,
            currentSpeed: 0,
            currentTurnSpeed: 0 as Radians,
            externalVx: 0,
            externalVy: 0,
            externalVz: 0,
          });
        }
        if (!this.app.world.getComponent(ent.id, 'input')) {
          this.app.world.addComponent(ent.id, 'input', {
            desiredMoveVector: null,
            moveForward: 0,
            moveStrafe: 0,
            targetLookAngle: undefined,
            isMovingForward: false,
            turnDirection: 0,
            turnRatio: 0,
            isRunning: false,
            isCrouching: false,
            isSlowWalking: false,
            wantsAttack: false,
            attackSlotIndex: undefined,
            desiredStance: 'standing',
          });
        }
      }

      if (comps.interactionSlots) {
        if (!this.app.world.getComponent(ent.id, 'activeAttacks')) {
          this.app.world.addComponent(ent.id, 'activeAttacks', { attacks: [] });
        }
      }

      if (comps.meta) {
        if (!comps.meta.directionMode) {
          comps.meta.directionMode = 'immobile';
        }
        if (!comps.meta.actionMode) {
          comps.meta.actionMode = 'idle';
        }
      }
    }
  }

  public deserializeWorld(data: SerializedWorldData | any): void {
    if (!data) return;
    this.app.clearWorld();

    // Поддержка как прямого формата { entities: [...] }, так и { world: { entities: [...] } }
    const entities = Array.isArray(data.entities)
      ? data.entities
      : Array.isArray(data.world?.entities)
        ? data.world.entities
        : null;

    if (entities) {
      this.deserializeEntities(entities);
    }

    StoryFlagsManager.loadFlags(data.storyFlags ?? data.world?.storyFlags);

    const cameraData = data.camera ?? data.world?.camera;
    if (cameraData) {
      this.app.camera.deserialize(cameraData);
    }
  }
}
