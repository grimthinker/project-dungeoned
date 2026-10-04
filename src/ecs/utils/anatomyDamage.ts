import { World } from '../World';
import { EntityId } from '../types';
import { getAnatomyParts, getRootOwner, invalidateAnatomyCache } from './hierarchy';
import { getPartArmor, getConnectionArmor, selectDamageTarget } from './combat';
import { DeathService } from '../services/DeathService';
import { evaluateConsciousness } from './anatomyStatus';
import { ConsciousnessState } from '../types';
import { EventBus } from '../../core/EventBus';

export function forceDropItemFromPart(world: World, partId: EntityId): void {
  const slot = world.getComponent(partId, 'interactionSlots');
  if (!slot || slot.itemId === null) return;

  const itemId = slot.itemId;
  slot.itemId = null;
  world.removeComponent(itemId, 'ownership');
  EventBus.emit('inventory:updated');

  const partTransform = world.getComponent(partId, 'transform');
  const dropX = partTransform ? partTransform.x : 0;
  const dropY = partTransform ? partTransform.y : 0;
  const dropZ = partTransform ? partTransform.z : 0;

  const itemTransform = world.getComponent(itemId, 'transform');
  if (itemTransform) {
    itemTransform.x = dropX;
    itemTransform.y = dropY;
    itemTransform.z = dropZ;
    itemTransform.isDirty = true;
  }

  const renderable = world.getComponent(itemId, 'renderable');
  if (renderable) {
    renderable.isVisible = true;
  }

  world.addComponent(itemId, 'droppedItemIntent', {
    position: { x: dropX, y: dropY + 0.5, z: dropZ },
  });
}

export function destroyPartRecursive(world: World, partId: EntityId): void {
  if (!world.getEntity(partId)) return;

  // Выбрасываем предмет из уничтожаемой части тела через интент
  forceDropItemFromPart(world, partId);

  // 1. Находим все остальные части в мире и обрываем связи, ведущие к удаляемой части
  const allEntities = world.getAllEntities();
  for (const [otherId, comp] of allEntities) {
    if (comp.socketLink && comp.socketLink.links) {
      for (const [sockId, link] of Object.entries(comp.socketLink.links)) {
        if (link.targetEntityId === partId) {
          delete comp.socketLink.links[sockId];
        }
      }
    }
  }

  // 2. Удаляем саму сущность части тела
  world.removeEntity(partId);
  invalidateAnatomyCache();
}

export function applyDamageToPart(
  world: World,
  partId: EntityId,
  rawDamage: number,
  visited: Set<string>
): void {
  const fp = world.getComponent(partId, 'functionalHealth');
  if (!fp) return;

  const partKey = `part_${partId}`;
  if (visited.has(partKey)) return;
  visited.add(partKey);

  const minFp = -2 * fp.max.current;
  const nextFp = fp.current - rawDamage;

  if (nextFp < minFp) {
    const overflow = minFp - nextFp;
    fp.current = minFp;
    fp.isFunctional = false;

    if (overflow > 0) {
      resolveOverflowFromPart(world, partId, overflow, visited);
    }
  } else {
    fp.current = nextFp;
    fp.isFunctional = fp.current >= 0;
  }

  invalidateAnatomyCache();

  // При полном разрушении руки (ФП <= -max) сбрасываем удерживаемый предмет и прерываем атаку
  if (fp.current <= -fp.max.current) {
    forceDropItemFromPart(world, partId);

    const rootId = getRootOwner(world, partId) ?? partId;
    const activeAttacks = world.getComponent(rootId, 'activeAttacks');
    if (activeAttacks) {
      activeAttacks.attacks = activeAttacks.attacks.filter((a) => a.partId !== partId);
    }
  }
}

function resolveOverflowFromPart(
  world: World,
  partId: EntityId,
  overflow: number,
  visited: Set<string>
): void {
  const socketLink = world.getComponent(partId, 'socketLink');
  if (!socketLink || !socketLink.links) {
    handleDeadEndOverflow(world, partId, overflow);
    return;
  }

  interface ConnCandidate {
    socketId: string;
    targetPartId: string;
    targetSocketId: string;
    weight: number;
    edgeKey: string;
  }

  const candidates: ConnCandidate[] = [];
  for (const [socketId, link] of Object.entries(socketLink.links)) {
    const targetPartId = link.targetEntityId;
    const edgeKey = [partId, targetPartId].sort().join(':') + `_${socketId}_${link.targetSocketId}`;
    if (visited.has(edgeKey)) continue;

    candidates.push({
      socketId,
      targetPartId,
      targetSocketId: link.targetSocketId,
      weight: Math.max(1, link.socketSize ?? 20),
      edgeKey,
    });
  }

  if (candidates.length === 0) {
    handleDeadEndOverflow(world, partId, overflow);
    return;
  }

  // Взвешенный случайный выбор соединения (рулетка)
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen = candidates[0];
  for (const c of candidates) {
    if (r < c.weight) {
      chosen = c;
      break;
    }
    r -= c.weight;
  }

  visited.add(chosen.edgeKey);
  applyDamageToConnection(
    world,
    partId,
    chosen.socketId,
    chosen.targetPartId,
    chosen.targetSocketId,
    overflow,
    visited
  );
}

export function applyDamageToConnection(
  world: World,
  partA: EntityId,
  socketIdA: string,
  partB: EntityId,
  socketIdB: string,
  rawDamage: number,
  visited: Set<string>
): void {
  const linkA = world.getComponent(partA, 'socketLink')?.links[socketIdA];
  if (!linkA) return;

  const maxStr = linkA.maxStrength.current;
  const nextStr = linkA.currentStrength - rawDamage;

  const edgeKey = [partA, partB].sort().join(':') + `_${socketIdA}_${socketIdB}`;
  visited.add(edgeKey);

  if (nextStr < -maxStr) {
    const overflow = -maxStr - nextStr;

    // Разрыв соединения: удаляем линк из обеих частей
    delete world.getComponent(partA, 'socketLink')?.links[socketIdA];
    delete world.getComponent(partB, 'socketLink')?.links[socketIdB];
    invalidateAnatomyCache();

    if (overflow > 0) {
      // Перелив на одну из двух соединенных частей пропорционально их размеру
      const sizeA = world.getComponent(partA, 'physicsStats')?.size ?? 10;
      const sizeB = world.getComponent(partB, 'physicsStats')?.size ?? 10;
      const totalSize = sizeA + sizeB;
      const targetPart = Math.random() * totalSize < sizeA ? partA : partB;

      applyDamageToPart(world, targetPart, overflow, visited);
    }
  } else {
    linkA.currentStrength = nextStr;
    const linkB = world.getComponent(partB, 'socketLink')?.links[socketIdB];
    if (linkB) linkB.currentStrength = nextStr;
  }
}

function handleDeadEndOverflow(world: World, partId: EntityId, overflow: number): void {
  const rootId = getRootOwner(world, partId) ?? partId;
  const isDead = evaluateConsciousness(world, rootId) === ConsciousnessState.DEAD;

  if (isDead) {
    // Урон переходит в структурную прочность (СП / health) этой части тела
    const health = world.getComponent(partId, 'health');
    if (health) {
      health.current = Math.max(0, health.current - overflow);
      if (health.current <= 0) {
        destroyPartRecursive(world, partId);
      }
    }
  }
}

export function checkCreatureDeath(world: World, rootEntityId: EntityId): void {
  DeathService.checkCreatureDeath(world, rootEntityId);
}

export function applyWeaponDamageToCreature(
  world: World,
  creatureRootId: EntityId,
  rawDamage: number
): void {
  const target = selectDamageTarget(world, creatureRootId);
  if (!target) return;

  const visited = new Set<string>();

  if (target.type === 'part') {
    const armor = getPartArmor(world, target.partId);
    const mitigated = Math.max(
      0,
      rawDamage * (1 - Math.min(0.9, Math.max(0, armor.defense / 100))) - armor.flatReduction
    );
    applyDamageToPart(world, target.partId, mitigated, visited);
  } else {
    const armor = getConnectionArmor(world, target.partA, target.partB);
    const mitigated = Math.max(
      0,
      rawDamage * (1 - Math.min(0.9, Math.max(0, armor.defense / 100))) - armor.flatReduction
    );
    applyDamageToConnection(
      world,
      target.partA,
      target.socketIdA,
      target.partB,
      target.socketIdB,
      mitigated,
      visited
    );
  }

  checkCreatureDeath(world, creatureRootId);
}

export function applyZoneDamageToCreature(
  world: World,
  creatureRootId: EntityId,
  damageAmount: number
): void {
  const parts = getAnatomyParts(world, creatureRootId);
  const visited = new Set<string>();
  // Зоны наносят урон всем частям одновременно, минуя соединения и броню
  for (const partId of parts) {
    applyDamageToPart(world, partId, damageAmount, visited);
  }
  checkCreatureDeath(world, creatureRootId);
}

export function applyZoneJointDamageToCreature(
  world: World,
  creatureRootId: EntityId,
  damageAmount: number
): void {
  const parts = getAnatomyParts(world, creatureRootId);
  const visitedEdges = new Set<string>();

  for (const partId of parts) {
    const socketLink = world.getComponent(partId, 'socketLink');
    if (!socketLink || !socketLink.links) continue;

    for (const [socketIdA, link] of Object.entries(socketLink.links)) {
      const targetPartId = link.targetEntityId;
      const socketIdB = link.targetSocketId;
      const edgeKey = [partId, targetPartId].sort().join(':') + `_${socketIdA}_${socketIdB}`;

      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      applyDamageToConnection(
        world,
        partId,
        socketIdA,
        targetPartId,
        socketIdB,
        damageAmount,
        new Set<string>()
      );
    }
  }

  checkCreatureDeath(world, creatureRootId);
}
