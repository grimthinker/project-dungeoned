import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { EntityId } from '../types';
import { Vec3, Radians } from '../../types';
import { calculateThrowVelocity, angleDifference } from '../../utils';
import { getAggregatedInteractionSlots } from '../utils/hierarchy';
import { EventBus } from '../../core/EventBus';
import { LOGIC_CONFIG } from '../../ai/config';

export class ThrowingSystem {
  public update(dt: number, world: World, physics: PhysicsSystem): void {
    this.processThrowIntents(world);

    const entities = world.getEntitiesWith('interactionAction', 'transform', 'health');

    for (const [id, { interactionAction, transform, health }] of entities) {
      if (interactionAction.type !== 'throw') continue;

      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      const localDt = dt * ts;

      if (!health.isAlive) {
        world.removeComponent(id, 'interactionAction');
        continue;
      }

      if (interactionAction.wantsCancel) {
        this.cancelThrow(world, id);
        continue;
      }

      if (interactionAction.phase === 'throw_turn') {
        if (interactionAction.targetItemPos) {
          const dx = interactionAction.targetItemPos.x - transform.x;
          const dz = interactionAction.targetItemPos.z - transform.z;
          const targetAngle = Math.atan2(dz, dx);
          const diff = Math.abs(angleDifference(targetAngle, transform.angle));
          const tolerance = LOGIC_CONFIG.throwTurnTolerance ?? Math.PI / 12;

          if (diff <= tolerance) {
            const movementStats = world.getComponent(id, 'movementStats');
            const prepTime = movementStats?.throwPrepTime?.current ?? 0.25;

            interactionAction.phase = 'throw_prep';
            interactionAction.timer = prepTime;
            interactionAction.totalDuration = prepTime;
          }
        }
      } else if (interactionAction.phase === 'throw_prep') {
        interactionAction.timer -= localDt;
        if (interactionAction.timer <= 0) {
          if (interactionAction.partId && interactionAction.targetItemPos) {
            this.executePhysicalThrow(
              world,
              physics,
              id,
              interactionAction.partId,
              interactionAction.targetItemPos
            );
          }
          const movementStats = world.getComponent(id, 'movementStats');
          const recTime = movementStats?.throwRecoveryTime?.current ?? 0.2;

          interactionAction.phase = 'throw_recovery';
          interactionAction.timer = recTime;
          interactionAction.totalDuration = recTime;
        }
      } else if (
        interactionAction.phase === 'throw_recovery' ||
        interactionAction.phase === 'abort_throw'
      ) {
        interactionAction.timer -= localDt;
        if (interactionAction.timer <= 0) {
          world.removeComponent(id, 'interactionAction');
        }
      }
    }
  }

  public cancelThrow(world: World, entityId: EntityId): boolean {
    const action = world.getComponent(entityId, 'interactionAction');
    if (!action || action.type !== 'throw') return false;

    if (action.phase === 'throw_turn') {
      world.removeComponent(entityId, 'interactionAction');
      return true;
    }
    if (action.phase === 'throw_prep') {
      const elapsed = Math.max(0.01, action.totalDuration - action.timer);
      action.phase = 'abort_throw';
      action.timer = elapsed;
      action.totalDuration = elapsed;
      action.wantsCancel = false;
      return true;
    }
    if (action.phase === 'abort_throw' || action.phase === 'throw_recovery') {
      return false;
    }

    world.removeComponent(entityId, 'interactionAction');
    return true;
  }

  private processThrowIntents(world: World): void {
    const intents = world.getEntitiesWith('throwItemIntent', 'health', 'transform');

    for (const [id, { throwItemIntent, health, transform }] of intents) {
      world.removeComponent(id, 'throwItemIntent');

      if (!health.isAlive) continue;
      if (world.getComponent(id, 'interactionAction')) continue;

      const aggSlots = getAggregatedInteractionSlots(world, id);
      const slotInfo = aggSlots[throwItemIntent.slotIndex];
      if (!slotInfo || !slotInfo.slot.itemId) continue;

      const meta = world.getComponent(id, 'meta');
      const input = world.getComponent(id, 'input');

      // Бросок разрешен в стойках standing и crouching. Если лежит — переводим в присед
      if (meta?.stance === 'prone' || meta?.stance?.includes('prone')) {
        if (input) input.desiredStance = 'crouching';
        continue;
      }
      if (meta?.stance === 'airborne' || meta?.stance === 'sliding') {
        continue;
      }

      world.addComponent(id, 'interactionAction', {
        type: 'throw',
        phase: 'throw_turn',
        slotIndex: slotInfo.localSlotIndex,
        partId: slotInfo.partId,
        slotKind: slotInfo.slot.slotKind ?? 'left_hand',
        targetItemPos: throwItemIntent.targetPos,
        timer: 0,
        totalDuration: 0,
      });
    }
  }

  private executePhysicalThrow(
    world: World,
    physics: PhysicsSystem,
    entityId: EntityId,
    partId: EntityId,
    targetPos: Vec3
  ): void {
    const slot = world.getComponent(partId, 'interactionSlots');
    const transform = world.getComponent(entityId, 'transform');
    if (!slot || !slot.itemId || !transform) return;

    const itemId = slot.itemId;
    slot.itemId = null;

    world.removeComponent(itemId, 'ownership');
    EventBus.emit('inventory:updated');

    const renderable = world.getComponent(itemId, 'renderable');
    if (renderable) {
      renderable.isVisible = true;
    }

    const itemTransform = world.getComponent(itemId, 'transform');
    const physStats = world.getComponent(itemId, 'physicsStats');

    if (itemTransform && physStats) {
      const itemRadius = physStats.radius.current ?? 0.3;
      const creatureRadius = world.getComponent(entityId, 'physicsStats')?.radius.current ?? 0.4;
      const defaultDropOffset = creatureRadius + itemRadius + 0.05;

      const currentStance = world.getComponent(entityId, 'meta')?.stance || 'standing';
      let creatureHeight = 1.8;
      if (currentStance.includes('crouch')) creatureHeight = 1.2;
      else if (currentStance.includes('prone')) creatureHeight = 0.4;

      const comY = transform.y + creatureHeight * 0.65;
      const spawnY = Math.max(transform.y + itemRadius, comY);

      const dir = { x: Math.cos(transform.angle), y: 0, z: Math.sin(transform.angle) };

      let spawnOffset = defaultDropOffset;
      let isConstrainedByObstacle = false;

      // Проверка препятствия непосредственно перед персонажем
      if (physics.driver && physics.driver.isReady) {
        const rayStart = { x: transform.x, y: spawnY, z: transform.z };
        const hits = physics.driver.castRayMultiple(
          rayStart,
          dir,
          defaultDropOffset,
          true,
          entityId
        );

        for (const hit of hits) {
          const hitTag = world.getComponent(hit.entityId, 'tag');
          const hitMeta = world.getComponent(hit.entityId, 'meta');
          const hitArch = hitTag?.archetype ?? hitMeta?.entityType;
          const hitPhysStats = world.getComponent(hit.entityId, 'physicsStats');

          if (hitArch === 'obstacle' && hitPhysStats?.isSolid !== false) {
            const L = hit.toi;
            spawnOffset = L - (itemRadius + 0.05);
            isConstrainedByObstacle = true;
            break;
          }
        }
      }

      const endX = transform.x + dir.x * spawnOffset;
      const endZ = transform.z + dir.z * spawnOffset;

      itemTransform.x = endX;
      itemTransform.y = spawnY;
      itemTransform.z = endZ;
      itemTransform.isDirty = false;

      const bodyHandle = physics.createDynamicItemBody(world, itemId, {
        x: endX,
        y: spawnY,
        z: endZ,
      });

      if (bodyHandle !== undefined && !isConstrainedByObstacle && physics.driver) {
        const startPos = { x: endX, y: spawnY, z: endZ };
        const strength = slot.strength ?? 15;
        const weight = physStats.weight.current ?? 1;
        const vel = calculateThrowVelocity(startPos, targetPos, strength, weight);

        physics.driver.applyBodyImpulse(
          bodyHandle,
          { x: vel.x * weight, y: vel.y * weight, z: vel.z * weight },
          true
        );
        physics.driver.setBodyLinearVelocity(bodyHandle, { x: vel.x, y: vel.y, z: vel.z }, true);
        physics.driver.wakeUpBody(bodyHandle);

        physics.driver.setBodyAngularVelocity(
          bodyHandle,
          { x: (Math.random() - 0.5) * 4, y: 2.0, z: (Math.random() - 0.5) * 4 },
          true
        );
      }

      world.addComponent(itemId, 'thrownObject', {
        throwerId: entityId,
        timestamp: Date.now(),
        isAirborne: true,
      });
    }
  }
}
