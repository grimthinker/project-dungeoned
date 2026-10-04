import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { EntityId } from '../types';
import { GAMEPLAY_CONFIG } from '../../config/gameplayConfig';
import { Radians, angleDifference } from '../../utils';
import {
  calculateTotalEntityWeight,
  getAggregatedInteractionSlots,
  AggregatedSlot,
} from '../utils/hierarchy';
import { getPartStatus, PartStatus } from '../utils/anatomyStatus';
import {
  canItemBePickedUp,
  canItemBeEquippedToArea,
  canItemBeHeldInSlot,
} from '../utils/itemValidation';
import { EventBus } from '../../core/EventBus';
import { BALANCE_CONFIG } from '../../config/balanceConfig';

export class InteractionSystem {
  public static requestPickup(world: World, entityId: EntityId, targetItemId: EntityId): boolean {
    const health = world.getComponent(entityId, 'health');
    if (!health || !health.isAlive) return false;

    if (world.getComponent(entityId, 'interactionAction')) return false;
    if (world.getComponent(entityId, 'pickupIntent')) return false;

    const pickupCheck = canItemBePickedUp(world, targetItemId);
    if (!pickupCheck.valid) return false;

    world.addComponent(entityId, 'pickupIntent', { targetItemId });
    return true;
  }

  public requestPickup(world: World, entityId: EntityId, targetItemId: EntityId): boolean {
    return InteractionSystem.requestPickup(world, entityId, targetItemId);
  }

  public static requestEquip(
    world: World,
    entityId: EntityId,
    slotIndex: number,
    areaId: string,
    containerId?: EntityId
  ): boolean {
    const health = world.getComponent(entityId, 'health');
    if (!health || !health.isAlive) return false;
    if (world.getComponent(entityId, 'interactionAction')) return false;

    const aggSlots = getAggregatedInteractionSlots(world, entityId);
    const slotInfo = aggSlots[slotIndex];
    if (!slotInfo || slotInfo.isBroken || !slotInfo.slot.itemId) return false;

    const targetContainerId = containerId ?? entityId;
    const equipCheck = canItemBeEquippedToArea(
      world,
      slotInfo.slot.itemId,
      targetContainerId,
      areaId
    );
    if (!equipCheck.valid) return false;

    const item = world.getComponent(slotInfo.slot.itemId, 'item');

    world.addComponent(entityId, 'interactionAction', {
      type: 'equip',
      slotIndex: slotInfo.localSlotIndex,
      partId: slotInfo.partId,
      areaId,
      containerId: targetContainerId,
      timer: GAMEPLAY_CONFIG.pickupReachDuration * (item?.equipTimeMultiplier || 1.0),
      totalDuration: GAMEPLAY_CONFIG.pickupReachDuration * (item?.equipTimeMultiplier || 1.0),
    });

    return true;
  }

  public static requestUnequip(
    world: World,
    entityId: EntityId,
    slotIndex: number,
    areaId: string,
    targetItemId: EntityId,
    containerId?: EntityId
  ): boolean {
    const health = world.getComponent(entityId, 'health');
    if (!health || !health.isAlive) return false;
    if (world.getComponent(entityId, 'interactionAction')) return false;

    const aggSlots = getAggregatedInteractionSlots(world, entityId);
    const slotInfo = aggSlots[slotIndex];
    if (!slotInfo || slotInfo.isBroken || slotInfo.slot.itemId !== null) return false;

    const targetContainerId = containerId ?? entityId;
    const containerEquip = world.getComponent(targetContainerId, 'equip');
    const area = containerEquip?.equipmentAreas.find((a) => a.id === areaId);
    if (!area || !area.itemIds.includes(targetItemId)) return false;

    const slotCheck = canItemBeHeldInSlot(
      world,
      targetItemId,
      slotInfo.slot.strength,
      slotInfo.partId
    );
    if (!slotCheck.valid) return false;

    const item = world.getComponent(targetItemId, 'item');

    world.addComponent(entityId, 'interactionAction', {
      type: 'unequip',
      slotIndex: slotInfo.localSlotIndex,
      partId: slotInfo.partId,
      areaId,
      targetId: targetItemId,
      containerId: targetContainerId,
      timer: GAMEPLAY_CONFIG.pickupReachDuration * (item?.equipTimeMultiplier || 1.0),
      totalDuration: GAMEPLAY_CONFIG.pickupReachDuration * (item?.equipTimeMultiplier || 1.0),
    });

    return true;
  }

  public dropItem(
    world: World,
    _physics: PhysicsSystem,
    entityId: EntityId,
    globalSlotIndex: number
  ): void {
    const aggSlots = getAggregatedInteractionSlots(world, entityId);
    const slotInfo = aggSlots[globalSlotIndex];
    if (!slotInfo || !slotInfo.slot.itemId) return;

    if (world.getComponent(entityId, 'interactionAction')) return;

    const movementStats = world.getComponent(entityId, 'movementStats');
    const prepTime = movementStats?.dropPrepTime?.current ?? 0.1;

    world.addComponent(entityId, 'interactionAction', {
      type: 'drop',
      phase: 'drop_prep',
      slotIndex: slotInfo.localSlotIndex,
      partId: slotInfo.partId,
      slotKind: slotInfo.slot.slotKind ?? 'left_hand',
      timer: prepTime,
      totalDuration: prepTime,
    });
  }

  public cancelInteraction(world: World, physics: PhysicsSystem, entityId: EntityId): boolean {
    const action = world.getComponent(entityId, 'interactionAction');
    if (!action) return false;

    if (action.type === 'throw') {
      return false;
    }

    if (action.type === 'pickup') {
      if (action.phase === 'reach') {
        const currentRatio = Math.min(
          1,
          Math.max(0, 1 - action.timer / (action.totalDuration || 1))
        );
        const rollbackDuration = Math.max(0.01, action.elapsedInReach ?? 0);
        action.phase = 'abort_reach';
        action.abortStartProgress = currentRatio;
        action.timer = rollbackDuration;
        action.totalDuration = rollbackDuration;
        action.wantsCancel = false;
        return true;
      }

      if (action.phase === 'lift') {
        const currentRatio = Math.min(1, Math.max(0, action.timer / (action.totalDuration || 1)));
        const targetId = action.targetId;
        const transform = world.getComponent(entityId, 'transform');

        if (action.partId && targetId) {
          const slotsComp = world.getComponent(action.partId, 'interactionSlots');
          if (slotsComp && slotsComp.itemId === targetId) {
            slotsComp.itemId = null;
          }
        }

        EventBus.emit('inventory:updated');

        if (targetId && transform) {
          world.removeComponent(targetId, 'ownership');

          let dropX = action.targetItemPos?.x ?? transform.x;
          let dropY = action.targetItemPos?.y ?? transform.y;
          let dropZ = action.targetItemPos?.z ?? transform.z;

          if (action.relativeDist !== undefined && action.relativeAngle !== undefined) {
            const currentAngle = transform.angle + action.relativeAngle;
            dropX = transform.x + Math.cos(currentAngle) * action.relativeDist;
            dropZ = transform.z + Math.sin(currentAngle) * action.relativeDist;
          }

          const itTransform = world.getComponent(targetId, 'transform');
          if (itTransform) {
            itTransform.x = dropX;
            itTransform.y = dropY;
            itTransform.z = dropZ;
            itTransform.isDirty = true;
          }

          const renderable = world.getComponent(targetId, 'renderable');
          if (renderable) {
            renderable.isVisible = true;
          }

          physics.createDynamicItemBody(world, targetId, { x: dropX, y: dropY + 0.5, z: dropZ });
        }

        const remainingTime = action.timer;
        const reachDuration = GAMEPLAY_CONFIG.pickupReachDuration;
        const totalLiftDuration = action.totalDuration > 0 ? action.totalDuration : 1;
        const abortDuration = Math.max(0.01, remainingTime * (reachDuration / totalLiftDuration));

        action.phase = 'abort_lift';
        action.abortStartProgress = currentRatio;
        action.timer = abortDuration;
        action.totalDuration = abortDuration;
        action.wantsCancel = false;
        return true;
      }

      if (action.phase === 'abort_reach' || action.phase === 'abort_lift') {
        return false;
      }
    } else if (action.type === 'drop') {
      if (action.phase === 'drop_prep') {
        const elapsed = Math.max(0.01, action.totalDuration - action.timer);
        action.phase = 'abort_drop';
        action.timer = elapsed;
        action.totalDuration = elapsed;
        action.wantsCancel = false;
        return true;
      }
      if (action.phase === 'abort_drop' || action.phase === 'drop_recovery') {
        return false;
      }
    }

    world.removeComponent(entityId, 'interactionAction');
    return true;
  }

  public update(dt: number, world: World, physics: PhysicsSystem): void {
    this.processPickupIntents(world);
    this.processDropIntents(world, physics);

    const entities = world.getEntitiesWith('interactionAction', 'transform', 'health');

    for (const [id, { interactionAction, transform, health }] of entities) {
      if (interactionAction.type === 'throw') continue;

      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      const localDt = dt * ts;

      if (!health.isAlive) {
        if (interactionAction.type === 'pickup' && interactionAction.phase === 'lift') {
          this.cancelInteraction(world, physics, id);
        }
        world.removeComponent(id, 'interactionAction');
        continue;
      }

      if (interactionAction.wantsCancel) {
        this.cancelInteraction(world, physics, id);
        continue;
      }

      if (interactionAction.type === 'drop') {
        if (interactionAction.phase === 'drop_prep') {
          interactionAction.timer -= localDt;
          if (interactionAction.timer <= 0) {
            if (interactionAction.partId) {
              this.executePhysicalDrop(world, physics, id, interactionAction.partId);
            }
            const movementStats = world.getComponent(id, 'movementStats');
            const recTime = movementStats?.dropRecoveryTime?.current ?? 0.1;

            interactionAction.phase = 'drop_recovery';
            interactionAction.timer = recTime;
            interactionAction.totalDuration = recTime;
          }
        } else if (
          interactionAction.phase === 'drop_recovery' ||
          interactionAction.phase === 'abort_drop'
        ) {
          interactionAction.timer -= localDt;
          if (interactionAction.timer <= 0) {
            world.removeComponent(id, 'interactionAction');
          }
        }
        continue;
      }

      if (interactionAction.type === 'pickup') {
        if (interactionAction.phase === 'reach') {
          interactionAction.elapsedInReach = (interactionAction.elapsedInReach ?? 0) + localDt;
          interactionAction.timer -= localDt;

          if (interactionAction.timer <= 0) {
            const targetId = interactionAction.targetId;
            const slot = interactionAction.partId
              ? world.getComponent(interactionAction.partId, 'interactionSlots')
              : undefined;
            const targetEntity = targetId ? world.getEntity(targetId) : undefined;
            const targetItem = targetId ? world.getComponent(targetId, 'item') : undefined;
            const targetPhysStats = targetId
              ? world.getComponent(targetId, 'physicsStats')
              : undefined;
            const targetOwnership = targetId
              ? world.getComponent(targetId, 'ownership')
              : undefined;

            const partStatus = interactionAction.partId
              ? getPartStatus(world, interactionAction.partId)
              : PartStatus.INTACT;

            if (
              partStatus !== PartStatus.INTACT ||
              !targetId ||
              !targetEntity ||
              !slot ||
              !targetItem ||
              !targetPhysStats ||
              targetOwnership ||
              slot.itemId !== null
            ) {
              const currentRatio = Math.min(
                1,
                Math.max(0, 1 - interactionAction.timer / (interactionAction.totalDuration || 1))
              );
              const rollbackDuration = Math.max(
                0.01,
                interactionAction.elapsedInReach ?? GAMEPLAY_CONFIG.pickupReachDuration
              );
              interactionAction.phase = 'abort_reach';
              interactionAction.abortStartProgress = currentRatio;
              interactionAction.timer = rollbackDuration;
              interactionAction.totalDuration = rollbackDuration;
              continue;
            }

            const targetTransform = world.getComponent(targetId, 'transform');
            const myRadius = world.getComponent(id, 'physicsStats')?.radius.current ?? 0.4;
            const targetRadius = targetPhysStats.radius.current ?? 0.3;

            let isOutOfReach = false;
            if (targetTransform) {
              const currentDist = Math.hypot(
                targetTransform.x - transform.x,
                targetTransform.z - transform.z
              );
              const distBetweenBorders = Math.max(0, currentDist - myRadius - targetRadius);
              if (distBetweenBorders > slot.interactDist) {
                isOutOfReach = true;
              }
            } else {
              isOutOfReach = true;
            }

            const holdCheck = canItemBeHeldInSlot(
              world,
              targetId,
              slot.strength,
              interactionAction.partId
            );
            if (isOutOfReach || !holdCheck.valid) {
              const currentRatio = Math.min(
                1,
                Math.max(0, 1 - interactionAction.timer / (interactionAction.totalDuration || 1))
              );
              const rollbackDuration = Math.max(
                0.01,
                interactionAction.elapsedInReach ?? GAMEPLAY_CONFIG.pickupReachDuration
              );
              interactionAction.phase = 'abort_reach';
              interactionAction.abortStartProgress = currentRatio;
              interactionAction.timer = rollbackDuration;
              interactionAction.totalDuration = rollbackDuration;
              continue;
            }

            const targetTransformEntity = world.getComponent(targetId, 'transform');
            const selfTransform = world.getComponent(id, 'transform');
            let relativeDist = 0;
            let relativeAngle = 0 as Radians;
            if (targetTransformEntity && selfTransform) {
              const dx = targetTransformEntity.x - selfTransform.x;
              const dz = targetTransformEntity.z - selfTransform.z;
              relativeDist = Math.hypot(dx, dz);
              const worldAngle = Math.atan2(dz, dx);
              relativeAngle = angleDifference(worldAngle, selfTransform.angle);
            }

            slot.itemId = targetId;
            const ownerPartId = interactionAction.partId || id;
            world.addComponent(targetId, 'ownership', { ownerId: ownerPartId, status: 'equipped' });
            world.removeComponent(targetId, 'thrownObject');

            EventBus.emit('inventory:updated');

            const physBody = world.getComponent(targetId, 'physicsBody');
            if (physBody && physBody.bodyHandle !== undefined) {
              physics.driver?.removeRigidBody(physBody.bodyHandle);
              world.removeComponent(targetId, 'physicsBody');
            }
            const renderable = world.getComponent(targetId, 'renderable');
            if (renderable) {
              renderable.isVisible = false;
            }

            const totalWeight = calculateTotalEntityWeight(world, targetId);
            const minTime = Math.max(
              GAMEPLAY_CONFIG.pickupReachDuration,
              GAMEPLAY_CONFIG.minInteractionTime
            );
            const maxTime = Math.max(minTime, GAMEPLAY_CONFIG.maxInteractionTime);
            const maxCapacity = Math.max(1, slot.strength * 2);
            const weightRatio = Math.min(1, Math.max(0, totalWeight / maxCapacity));
            const stage2Duration = minTime + weightRatio * (maxTime - minTime);

            interactionAction.phase = 'lift';
            interactionAction.timer = stage2Duration;
            interactionAction.totalDuration = stage2Duration;
            interactionAction.relativeDist = relativeDist;
            interactionAction.relativeAngle = relativeAngle;
          }
        } else if (interactionAction.phase === 'lift') {
          interactionAction.timer -= localDt;
          if (interactionAction.timer <= 0) {
            world.removeComponent(id, 'interactionAction');
          }
        } else if (
          interactionAction.phase === 'abort_reach' ||
          interactionAction.phase === 'abort_lift'
        ) {
          interactionAction.timer -= localDt;
          if (interactionAction.timer <= 0) {
            world.removeComponent(id, 'interactionAction');
          }
        }
        continue;
      }

      interactionAction.timer -= localDt;

      if (interactionAction.timer <= 0) {
        if (
          interactionAction.type === 'equip' &&
          interactionAction.partId &&
          interactionAction.areaId
        ) {
          const slot = world.getComponent(interactionAction.partId, 'interactionSlots');
          const containerId = interactionAction.containerId ?? id;
          const containerEquip = world.getComponent(containerId, 'equip');
          const area = containerEquip?.equipmentAreas.find(
            (a) => a.id === interactionAction.areaId
          );

          if (slot && slot.itemId) {
            const itemId = slot.itemId;
            const equipCheck = canItemBeEquippedToArea(
              world,
              itemId,
              containerId,
              interactionAction.areaId
            );

            if (equipCheck.valid && area) {
              area.itemIds.push(itemId);
              slot.itemId = null;
              world.addComponent(itemId, 'ownership', {
                ownerId: containerId,
                status: 'equipped',
              });
              EventBus.emit('inventory:updated');
            }
          }
        } else if (
          interactionAction.type === 'unequip' &&
          interactionAction.partId &&
          interactionAction.areaId &&
          interactionAction.targetId
        ) {
          const slot = world.getComponent(interactionAction.partId, 'interactionSlots');
          const containerId = interactionAction.containerId ?? id;
          const containerEquip = world.getComponent(containerId, 'equip');
          const area = containerEquip?.equipmentAreas.find(
            (a) => a.id === interactionAction.areaId
          );

          if (slot && slot.itemId === null && area) {
            const itemIdx = area.itemIds.indexOf(interactionAction.targetId);
            if (itemIdx !== -1) {
              const holdCheck = canItemBeHeldInSlot(
                world,
                interactionAction.targetId,
                slot.strength,
                interactionAction.partId
              );

              if (holdCheck.valid) {
                area.itemIds.splice(itemIdx, 1);
                slot.itemId = interactionAction.targetId;
                const ownerPartId = interactionAction.partId || id;
                world.addComponent(interactionAction.targetId, 'ownership', {
                  ownerId: ownerPartId,
                  status: 'equipped',
                });
                EventBus.emit('inventory:updated');
              }
            }
          }
        }

        world.removeComponent(id, 'interactionAction');
      }
    }
  }

  private processPickupIntents(world: World): void {
    const intents = world.getEntitiesWith('pickupIntent', 'transform', 'health');

    for (const [id, { pickupIntent, transform, health }] of intents) {
      world.removeComponent(id, 'pickupIntent');

      if (!health.isAlive) continue;
      if (world.getComponent(id, 'interactionAction')) continue;

      const targetItemId = pickupIntent.targetItemId;
      const targetTransform = world.getComponent(targetItemId, 'transform');
      const targetItem = world.getComponent(targetItemId, 'item');
      const targetPhysStats = world.getComponent(targetItemId, 'physicsStats');
      const targetOwnership = world.getComponent(targetItemId, 'ownership');

      if (!targetTransform || !targetItem || !targetPhysStats || targetOwnership) {
        continue;
      }

      let isTargetAlreadyTargeted = false;
      const activeInteractions = world.getEntitiesWith('interactionAction');
      for (const [, { interactionAction }] of activeInteractions) {
        if (
          interactionAction.type === 'pickup' &&
          interactionAction.targetId === targetItemId &&
          interactionAction.phase !== 'abort_reach' &&
          interactionAction.phase !== 'abort_lift'
        ) {
          isTargetAlreadyTargeted = true;
          break;
        }
      }
      if (isTargetAlreadyTargeted) continue;

      const dx = targetTransform.x - transform.x;
      const dz = targetTransform.z - transform.z;
      const distXZ = Math.hypot(dx, dz);

      const myPhysStats = world.getComponent(id, 'physicsStats');
      const myRadius = myPhysStats?.radius.current ?? 0.4;
      const myBaseHeight = myPhysStats?.height.current ?? 1.8;

      const targetRadius = targetPhysStats.radius.current ?? 0.15;
      const distBetweenBorders = Math.max(0, distXZ - myRadius - targetRadius);

      const meta = world.getComponent(id, 'meta');
      const stance = meta?.stance ?? 'standing';
      let stanceMult =
        BALANCE_CONFIG.creature.stanceHeightMultipliers[
          stance as keyof typeof BALANCE_CONFIG.creature.stanceHeightMultipliers
        ] ?? 1.0;

      if (stance.includes('stand_to_crouch') || stance.includes('crouch_to_stand'))
        stanceMult = 0.82;
      else if (stance.includes('stand_to_prone') || stance.includes('prone_to_stand'))
        stanceMult = 0.62;
      else if (stance.includes('crouch_to_prone') || stance.includes('prone_to_crouch'))
        stanceMult = 0.45;

      const currentHeight = myBaseHeight * stanceMult;

      const yMin = transform.y - currentHeight * 0.2;
      const yMax = transform.y + currentHeight * 1.2;
      const isWithinVerticalReach = targetTransform.y >= yMin && targetTransform.y <= yMax;

      const aggSlots = getAggregatedInteractionSlots(world, id);
      let bestSlotInfo: AggregatedSlot | null = null;
      let maxStrength = -Infinity;

      for (const info of aggSlots) {
        if (
          !info.isBroken &&
          info.slot.itemId === null &&
          distBetweenBorders <= info.slot.interactDist &&
          isWithinVerticalReach
        ) {
          if (info.slot.strength > maxStrength) {
            maxStrength = info.slot.strength;
            bestSlotInfo = info;
          }
        }
      }

      if (!bestSlotInfo) {
        continue;
      }

      world.addComponent(id, 'interactionAction', {
        type: 'pickup',
        phase: 'reach',
        targetId: targetItemId,
        slotIndex: bestSlotInfo.localSlotIndex,
        partId: bestSlotInfo.partId,
        slotKind: bestSlotInfo.slot.slotKind ?? 'left_hand',
        targetItemPos: { x: targetTransform.x, y: targetTransform.y, z: targetTransform.z },
        timer: GAMEPLAY_CONFIG.pickupReachDuration,
        totalDuration: GAMEPLAY_CONFIG.pickupReachDuration,
        elapsedInReach: 0,
      });
    }
  }

  private processDropIntents(world: World, physics: PhysicsSystem): void {
    const intents = world.getEntitiesWith('dropItemIntent', 'health');

    for (const [id, { dropItemIntent, health }] of intents) {
      world.removeComponent(id, 'dropItemIntent');

      if (!health.isAlive) continue;
      this.dropItem(world, physics, id, dropItemIntent.slotIndex);
    }
  }

  private executePhysicalDrop(
    world: World,
    physics: PhysicsSystem,
    entityId: EntityId,
    partId: EntityId
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

      const comY = transform.y + creatureHeight / 2;
      const dropY = Math.max(transform.y + itemRadius, comY);

      const dir = { x: Math.cos(transform.angle), y: 0, z: Math.sin(transform.angle) };

      let dropOffset = defaultDropOffset;
      let isConstrainedByObstacle = false;

      if (physics.driver && physics.driver.isReady) {
        const rayStart = { x: transform.x, y: dropY, z: transform.z };
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
            dropOffset = L - (itemRadius + 0.05);
            isConstrainedByObstacle = true;
            break;
          }
        }
      }

      const endX = transform.x + dir.x * dropOffset;
      const endZ = transform.z + dir.z * dropOffset;

      itemTransform.x = endX;
      itemTransform.y = dropY;
      itemTransform.z = endZ;
      itemTransform.isDirty = false;

      const bodyHandle = physics.createDynamicItemBody(world, itemId, {
        x: endX,
        y: dropY,
        z: endZ,
      });

      if (bodyHandle !== undefined && !isConstrainedByObstacle && physics.driver) {
        const weight = physStats.weight.current ?? 1;
        const targetVelocity = 0.5;
        const impulseMag = weight * targetVelocity;
        physics.driver.applyBodyImpulse(
          bodyHandle,
          { x: dir.x * impulseMag, y: 0, z: dir.z * impulseMag },
          true
        );
      }
    }
  }
}
