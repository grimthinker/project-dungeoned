import { World } from '../ecs/World';
import { PhysicsSystem } from '../ecs/systems/PhysicsSystem';
import { MovementSystem } from '../ecs/systems/MovementSystem';
import { StealthSystem } from '../ecs/systems/StealthSystem';
import { AttackSystem } from '../ecs/systems/AttackSystem';
import { DamageSystem } from '../ecs/systems/DamageSystem';
import { AISystem } from '../ecs/systems/AISystem';
import { InteractionSystem } from '../ecs/systems/InteractionSystem';
import { ThrowingSystem } from '../ecs/systems/ThrowingSystem';
import { FetchGameplaySystem } from '../ecs/systems/FetchGameplaySystem';
import { WaterSystem } from '../ecs/systems/WaterSystem';
import { AreaEffectorSystem } from '../ecs/systems/AreaEffectorSystem';
import { TriggerVolumeSystem } from '../ecs/systems/TriggerVolumeSystem';
import { AnatomySystem } from '../ecs/systems/AnatomySystem';
import { AnimationSyncSystem } from '../ecs/systems/AnimationSyncSystem';
import { ModifierSystem } from '../ecs/systems/ModifierSystem';
import { AttachmentSystem } from '../ecs/systems/AttachmentSystem';
import { ThreeSyncSystem } from '../ecs/systems/ThreeSyncSystem';
import { EnvironmentSystem } from '../ecs/systems/EnvironmentSystem';
import { DialogueSystem } from '../ecs/systems/DialogueSystem';
import { EntityFactory } from '../ecs/EntityFactory';
import { WorldSerializer, SerializedWorldData } from '../ecs/WorldSerializer';
import { IPhysicsDriver } from '../physics/IPhysicsDriver';
import { RapierPhysicsDriver } from '../physics/RapierPhysicsDriver';
import { GameApp } from '../GameApp';
import { GameMode } from '../config/gameConfig';
import { Vec3 } from '../types';
import { EntityConfig } from '../ecs/types';
import { createFlatTerrainConfig } from '../ecs/archetypes/TerrainArchetype';
import { createDefaultEnvironmentConfig } from '../ecs/archetypes/EnvironmentArchetype';
import { getAnatomyParts, getAllContainedItems } from '../ecs/utils/hierarchy';
import { Radians } from '../utils';
import { EventBus } from './EventBus';
import { initDefaultWorldPrefab } from '../ecs/prefabs/defaultWorldPrefab';
import { BALANCE_CONFIG } from '../config/balanceConfig';
import { GAMEPLAY_CONFIG } from '../config/gameplayConfig';
import { GlobalInput } from '../input/GlobalInput';
import { LOGIC_CONFIG } from '../ai/config';

export class GameSimulation {
  public world: World;
  private playerNavTimer: number = 0;
  public physicsDriver: IPhysicsDriver;
  public physics: PhysicsSystem;
  public movementSystem: MovementSystem;
  public stealthSystem: StealthSystem;
  public attackSystem: AttackSystem;
  public damageSystem: DamageSystem;
  public aiSystem: AISystem;
  public anatomySystem: AnatomySystem;
  public threeSyncSystem: ThreeSyncSystem;
  public interactionSystem: InteractionSystem;
  public throwingSystem: ThrowingSystem;
  public fetchGameplaySystem: FetchGameplaySystem;
  public waterSystem: WaterSystem;
  public areaEffectorSystem: AreaEffectorSystem;
  public triggerVolumeSystem: TriggerVolumeSystem;
  public animationSyncSystem: AnimationSyncSystem;
  public modifierSystem: ModifierSystem;
  public attachmentSystem: AttachmentSystem;
  public environmentSystem: EnvironmentSystem;
  public dialogueSystem: DialogueSystem;

  public entityFactory: EntityFactory;
  public serializer: WorldSerializer;

  public playerEntityId: string | null = null;
  public isPhysicsStructureDirty: boolean = false;

  constructor(private app: GameApp) {
    this.world = new World();
    this.physicsDriver = new RapierPhysicsDriver();
    this.physics = new PhysicsSystem();
    this.physics.driver = this.physicsDriver;
    this.movementSystem = new MovementSystem();
    this.stealthSystem = new StealthSystem();
    this.attackSystem = new AttackSystem();
    this.damageSystem = new DamageSystem();
    this.aiSystem = new AISystem();
    this.anatomySystem = new AnatomySystem();
    this.interactionSystem = new InteractionSystem();
    this.throwingSystem = new ThrowingSystem();
    this.fetchGameplaySystem = new FetchGameplaySystem();
    this.waterSystem = new WaterSystem();
    this.areaEffectorSystem = new AreaEffectorSystem();
    this.triggerVolumeSystem = new TriggerVolumeSystem();
    this.animationSyncSystem = new AnimationSyncSystem();
    this.modifierSystem = new ModifierSystem();
    this.attachmentSystem = new AttachmentSystem();
    this.environmentSystem = new EnvironmentSystem();
    this.dialogueSystem = new DialogueSystem(app);
    this.entityFactory = new EntityFactory();
    this.serializer = new WorldSerializer(app);

    this.threeSyncSystem = new ThreeSyncSystem(
      (app.renderer as any).scene,
      (app.renderer as any).renderer
    );
    this.threeSyncSystem.physicsDriver = this.physicsDriver;
  }

  public fixedUpdate(dt: number): void {
    // Сохраняем предыдущие позиции для суб-кадровой интерполяции рендера
    const allTransforms = this.world.getEntitiesWith('transform');
    for (const [, { transform }] of allTransforms) {
      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.prevZ = transform.z;
    }

    const mousePos = this.app.getMouseScreenPos();
    const playerId = this.getPlayerEntityId() ?? undefined;

    if (this.app.gameMode === GameMode.GAME && mousePos) {
      const worldPoint = this.app.getCanvasPoint(mousePos.x, mousePos.y, playerId);

      const selectedId = this.app.selection.selectedEntityId;
      let isAimingAtTarget = false;

      if (selectedId && playerId && selectedId !== playerId) {
        const targetEntity = this.world.getEntity(selectedId);
        const targetTrans = this.world.getComponent(selectedId, 'transform');
        const playerTrans = this.world.getComponent(playerId, 'transform');
        const health = this.world.getComponent(selectedId, 'health');

        const playerPerception = this.world.getComponent(playerId, 'perception');
        const playerAi = this.world.getComponent(playerId, 'aiStats');
        const loseDist =
          (playerPerception?.visionMaxDistance
            ? playerPerception.visionMaxDistance * 1.4
            : undefined) ??
          playerAi?.stats?.loseTargetDist ??
          LOGIC_CONFIG.loseTargetDist;

        const ownership = this.world.getComponent(selectedId, 'ownership');

        let shouldLose = false;
        if (!targetEntity || (health && !health.isAlive) || ownership) {
          shouldLose = true;
        } else if (playerTrans && targetTrans) {
          const dist = Math.hypot(
            targetTrans.x - playerTrans.x,
            targetTrans.y - playerTrans.y,
            targetTrans.z - playerTrans.z
          );
          if (dist > loseDist) {
            shouldLose = true;
          }
        }

        const playerInput = this.world.getComponent(playerId, 'input');
        // Если игрок зажал спринт и движется (убегает от цели), не фиксируем взгляд назад
        const isSprintingAway =
          playerInput?.isRunning &&
          (playerInput.desiredMoveVector !== null ||
            playerInput.isMovingForward ||
            (playerInput.moveForward ?? 0) !== 0 ||
            (playerInput.moveStrafe ?? 0) !== 0);

        if (shouldLose) {
          this.app.selection.selectGameTarget(null);
        } else if (!this.app.throwTargeting && targetTrans && !isSprintingAway) {
          const targetPhys = this.world.getComponent(selectedId, 'physicsStats');
          const targetH = targetPhys?.height?.current ?? 1.8;
          const headRatio = BALANCE_CONFIG.camera.gameMode.headHeightRatio ?? 0.88;
          const targetCenter: Vec3 = {
            x: targetTrans.x,
            y: targetTrans.y + targetH * headRatio,
            z: targetTrans.z,
          };
          this.updatePlayerAim(targetCenter);
          isAimingAtTarget = true;
        }
      }

      if (!isAimingAtTarget) {
        this.updatePlayerAim(worldPoint);
      }

      if (GlobalInput.isRmbDown) {
        this.playerNavTimer += dt;
        if (this.playerNavTimer >= GAMEPLAY_CONFIG.rmbNavUpdateInterval) {
          this.playerNavTimer = 0;
          const physHit = this.app.raycastPhysics(mousePos.x, mousePos.y);
          const targetPos = physHit ? physHit.point : worldPoint;
          this.setPlayerNavigationTarget(targetPos);
        }
      } else {
        this.playerNavTimer = 0;
      }
    } else {
      this.playerNavTimer = 0;
    }

    if (this.app.gameMode === GameMode.GAME) {
      const alpha = Math.min(1.0, this.app.time.physicsAccumulator / this.app.time.FIXED_DT);
      const headPos = this.getPlayerHeadPosition(null, alpha);
      if (headPos) {
        this.app.camera.setDesiredTarget(headPos.x, headPos.y, headPos.z);
      }
    }

    this.environmentSystem.update(dt, this.world);
    this.anatomySystem.update(dt, this.world, this.physics);
    this.modifierSystem.update(dt, this.world);
    this.aiSystem.update(dt, this.world);
    this.interactionSystem.update(dt, this.world, this.physics);
    this.throwingSystem.update(dt, this.world, this.physics);
    this.fetchGameplaySystem.update(dt, this.world);
    this.attackSystem.update(dt, this.world, this.physics);
    this.movementSystem.update(dt, this.world, this.physics);
    this.stealthSystem.update(dt, this.world);
    this.physics.update(dt, this.world);
    this.syncDynamicBodiesToTransforms();
    this.attachmentSystem.update(this.world, this.physics);
    this.areaEffectorSystem.update(dt, this.world, this.physics);
    this.triggerVolumeSystem.update(dt, this.world, this.physics);
    this.waterSystem.update(dt, this.world, this.physics);
    this.damageSystem.update(dt, this.world);
    this.animationSyncSystem.update(dt, this.world);
    this.dialogueSystem.update(dt, this.world);
  }

  public getPlayerEntityId(): string | null {
    if (this.playerEntityId && this.world.hasEntity(this.playerEntityId)) {
      const health = this.world.getComponent(this.playerEntityId, 'health');
      if (health?.isAlive) return this.playerEntityId;
      this.playerEntityId = null;
    }
    const entities = this.world.getEntitiesWith('aiStats', 'health');
    for (const [id, comp] of entities) {
      if (comp.aiStats.behavior.current === 'PlayerTree' && comp.health.isAlive) {
        this.playerEntityId = id;
        return id;
      }
    }
    this.playerEntityId = null;
    return null;
  }

  public getPlayerHeadPosition(playerId?: string | null, alpha: number = 0): Vec3 | null {
    const id = playerId ?? this.getPlayerEntityId();
    if (!id) return null;
    const tr = this.world.getComponent(id, 'transform');
    if (!tr) return null;

    const x = tr.prevX !== undefined ? tr.prevX + (tr.x - tr.prevX) * alpha : tr.x;
    const y = tr.prevY !== undefined ? tr.prevY + (tr.y - tr.prevY) * alpha : tr.y;
    const z = tr.prevZ !== undefined ? tr.prevZ + (tr.z - tr.prevZ) * alpha : tr.z;

    const physStats = this.world.getComponent(id, 'physicsStats');
    const baseHeight = physStats?.height?.current ?? 1.8;
    const meta = this.world.getComponent(id, 'meta');
    const stance = meta?.stance ?? 'standing';

    const stanceMult = BALANCE_CONFIG.creature.stanceHeightMultipliers[stance] ?? 1.0;
    const currentHeight = baseHeight * stanceMult;
    const headRatio = BALANCE_CONFIG.camera.gameMode.headHeightRatio;

    return {
      x,
      y: y + currentHeight * headRatio,
      z,
    };
  }

  public updatePlayerAim(worldPoint: Vec3): void {
    const entities = this.world.getEntitiesWith(
      'transform',
      'input',
      'health',
      'aiStats',
      'physicsStats'
    );
    for (const [, { transform, input, health, aiStats, physicsStats }] of entities) {
      if (health.isAlive && aiStats.behavior.current === 'PlayerTree') {
        const dx = worldPoint.x - transform.x;
        const dz = worldPoint.z - transform.z;
        const headHeight = physicsStats.height.current ?? 1.8;
        const dy = worldPoint.y - (transform.y + headHeight * 0.88);
        const distXZ = Math.hypot(dx, dz);

        if (distXZ > 0.05) {
          input.targetLookAngle = Math.atan2(dz, dx) as Radians;
          input.targetLookPitch = Math.atan2(dy, distXZ) as Radians;
        }
      }
    }
  }

  public setPlayerNavigationTarget(targetPos: Vec3): void {
    const playerId = this.getPlayerEntityId();
    if (playerId) {
      const bb = this.world.getComponent(playerId, 'brain')?.blackboard;
      if (bb) {
        bb.remove('followTargetId');
        bb.set('navTargetPos', targetPos);
      }
    }
  }

  public clearPlayerNavigationTarget(): void {
    const playerId = this.getPlayerEntityId();
    if (playerId) {
      const bb = this.world.getComponent(playerId, 'brain')?.blackboard;
      if (bb) {
        bb.remove('navTargetPos');
        bb.remove('currentPath');
      }
      const input = this.world.getComponent(playerId, 'input');
      if (input) {
        input.desiredMoveVector = null;
        input.moveForward = 0;
        input.moveStrafe = 0;
        input.isMovingForward = false;
      }
    }
  }

  public clearPlayerAim(): void {
    this.clearPlayerNavigationTarget();
    const entities = this.world.getEntitiesWith('input');
    for (const [, { input }] of entities) {
      input.targetLookAngle = undefined;
    }
  }

  public syncDynamicBodiesToTransforms(): void {
    const dynamicEntities = this.world.getEntitiesWith('transform', 'physicsBody');
    for (const [id, { transform, physicsBody }] of dynamicEntities) {
      if (physicsBody.bodyHandle !== undefined && physicsBody.bodyType === 'dynamic') {
        const state = this.physicsDriver.getBodyState(physicsBody.bodyHandle);
        if (!state || state.isSleeping) continue;

        const translation = state.translation;
        const rotation = state.rotation;
        const linvel = state.linvel;
        const angvel = state.angvel;

        transform.x = translation.x;
        transform.y = translation.y;
        transform.z = translation.z;
        transform.rotation.x = rotation.x;
        transform.rotation.y = rotation.y;
        transform.rotation.z = rotation.z;
        transform.rotation.w = rotation.w;

        const siny_cosp = 2 * (rotation.w * rotation.y + rotation.x * rotation.z);
        const cosy_cosp = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
        transform.angle = Math.atan2(siny_cosp, cosy_cosp) as Radians;

        let vel = this.world.getComponent(id, 'velocity');
        if (!vel) {
          this.world.addComponent(id, 'velocity', {
            vx: linvel.x,
            vy: linvel.y,
            vz: linvel.z,
            currentSpeed: Math.hypot(linvel.x, linvel.z),
            currentTurnSpeed: 0 as Radians,
            angvel: { x: angvel.x, y: angvel.y, z: angvel.z },
          });
        } else {
          vel.vx = linvel.x;
          vel.vy = linvel.y;
          vel.vz = linvel.z;
          vel.angvel = { x: angvel.x, y: angvel.y, z: angvel.z };
        }

        const thrownObj = this.world.getComponent(id, 'thrownObject');
        if (thrownObj && thrownObj.isAirborne) {
          const speed = Math.hypot(linvel.x, linvel.y, linvel.z);
          const ts = this.world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
          if (speed < 0.1 * ts) {
            thrownObj.isAirborne = false;
          }
        }
      }
    }
  }

  public markPhysicsStructureDirty(): void {
    this.isPhysicsStructureDirty = true;
  }

  public syncPhysicsStructures(): void {
    if (!this.physicsDriver || !this.physicsDriver.isReady) return;
    this.anatomySystem.update(0, this.world, this.physics);
    this.attachmentSystem.update(this.world, this.physics);
    this.physics.syncDirtyTransforms(this.world);
    this.physicsDriver.updateSceneQueries();
    this.isPhysicsStructureDirty = false;
  }

  public spawnEntity(config: EntityConfig, position?: Vec3, forcedId?: string): string {
    const id = this.entityFactory.spawnEntity(
      this.world,
      this.physics,
      this.aiSystem,
      config,
      position,
      forcedId
    );
    this.syncPhysicsStructures();
    return id;
  }

  public gatherHierarchyIds(rootIds: string[]): string[] {
    const resultSet = new Set<string>();
    for (const id of rootIds) {
      if (resultSet.has(id)) continue;
      resultSet.add(id);
      const parts = getAnatomyParts(this.world, id);
      for (const partId of parts) {
        resultSet.add(partId);
        const items = getAllContainedItems(this.world, partId);
        for (const itemId of items) {
          resultSet.add(itemId);
        }
      }
    }
    return Array.from(resultSet);
  }

  public startPickup(entityId: string, targetItemId: string): boolean {
    return InteractionSystem.requestPickup(this.world, entityId, targetItemId);
  }

  public cancelInteraction(entityId: string): boolean {
    return (
      this.interactionSystem.cancelInteraction(this.world, this.physics, entityId) ||
      this.throwingSystem.cancelThrow(this.world, entityId)
    );
  }

  public deleteItemFromInteractionSlot(partId: string): boolean {
    const slot = this.world.getComponent(partId, 'interactionSlots');
    if (slot && slot.itemId) {
      const itemId = slot.itemId;
      slot.itemId = null;
      this.deleteEntityRecursive(itemId);
      this.attachmentSystem.update(this.world, this.physics);
      return true;
    }
    return false;
  }

  public deleteItemFromEquipmentArea(containerId: string, areaId: string, itemId: string): boolean {
    const equip = this.world.getComponent(containerId, 'equip');
    if (!equip) return false;
    const area = equip.equipmentAreas.find((a) => a.id === areaId);
    if (!area) return false;
    const idx = area.itemIds.indexOf(itemId);
    if (idx !== -1) {
      area.itemIds.splice(idx, 1);
      this.deleteEntityRecursive(itemId);
      this.attachmentSystem.update(this.world, this.physics);
      return true;
    }
    return false;
  }

  public deleteEntityRecursive(id: string): void {
    if (!this.world.getEntity(id)) return;
    if (this.playerEntityId === id) this.playerEntityId = null;

    const tag = this.world.getComponent(id, 'tag');
    const isAssembly = this.world.getComponent(id, 'assemblyRoot');
    if (tag?.archetype === 'creature' || isAssembly) {
      const parts = getAnatomyParts(this.world, id);
      for (const partId of parts) {
        if (partId !== id) {
          this.deleteEntityRecursive(partId);
        }
      }
    }

    const attachedEntities = this.world.getEntitiesWith('attachment');
    for (const [childId, { attachment }] of attachedEntities) {
      if (attachment.parentId === id) {
        this.deleteEntityRecursive(childId);
      }
    }

    const slotsComp = this.world.getComponent(id, 'interactionSlots');
    if (slotsComp && slotsComp.itemId) {
      this.deleteEntityRecursive(slotsComp.itemId);
    }
    const eq = this.world.getComponent(id, 'equip');
    if (eq && eq.equipmentAreas) {
      for (const area of eq.equipmentAreas) {
        for (const itemId of area.itemIds) {
          this.deleteEntityRecursive(itemId);
        }
      }
    }
    const inv = this.world.getComponent(id, 'inventory');
    if (inv) {
      for (const row of inv.slots) {
        for (const cell of row) {
          if (cell.itemId) this.deleteEntityRecursive(cell.itemId);
        }
      }
    }
    const phys = this.world.getComponent(id, 'physicsBody');
    if (phys && phys.bodyHandle !== undefined) {
      this.physicsDriver.removeRigidBody(phys.bodyHandle);
    }
    this.aiSystem.unregisterEntity(id);
    this.world.removeEntity(id);
  }

  public clearWorld(): void {
    this.dialogueSystem.closeDialogue(this.world);
    this.playerEntityId = null;
    const entities = this.world.getAllEntities();
    for (const [id, comp] of entities) {
      if (comp.physicsBody?.bodyHandle !== undefined) {
        this.physicsDriver.removeRigidBody(comp.physicsBody.bodyHandle);
      }
      this.world.removeEntity(id);
    }
    this.aiSystem.clear();
    this.app.editor.selection.clear();
    this.app.editor.commandHistory.clear();
    this.threeSyncSystem.clearMeshes();
    EventBus.emit('world:updated');
  }

  public initEmptyWorld(width: number, depth: number): void {
    this.clearWorld();
    this.app.editor.commandHistory.clear();

    this.spawnEntity(createFlatTerrainConfig(width, depth), { x: 0, y: 0, z: 0 }, 'terrain');
    this.spawnEntity(createDefaultEnvironmentConfig(), { x: 0, y: 0, z: 0 }, 'environment');

    this.playerEntityId = this.entityFactory.spawnModularHumanoid(
      this.world,
      this.physics,
      this.aiSystem,
      { x: 0, y: 0, z: 0 },
      'PlayerTree',
      'Игрок'
    );

    this.syncPhysicsStructures();
  }

  public initDefaultWorld(center?: Vec3): void {
    this.clearWorld();
    this.app.editor.commandHistory.clear();
    initDefaultWorldPrefab(this, center);
  }

  public serializeWorld(): SerializedWorldData {
    return this.serializer.serializeWorld();
  }

  public deserializeWorld(data: SerializedWorldData | Record<string, any>): void {
    this.serializer.deserializeWorld(data);
    this.syncPhysicsStructures();
  }

  public destroy(): void {
    this.threeSyncSystem.destroy();
    this.physicsDriver.destroy();
  }
}
