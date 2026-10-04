import { World } from '../World';
import { Point, Vec3 } from '../../types';
import { calculateTotalEntityWeight, isDescendantOf, isItemEquippableToArea } from './hierarchy';

export type TransferTarget =
  | { type: 'slot'; partId: string }
  | { type: 'area'; containerId: string; areaId: string }
  | { type: 'inventory'; containerId: string; row?: number; col?: number }
  | { type: 'ground'; position?: Vec3; parentEntityId?: string };

function hasActiveBrainOrLiving(world: World, entityId: string): boolean {
  // 1. Полноценное живое существо никогда нельзя подобрать как предмет
  const tag = world.getComponent(entityId, 'tag');
  if (tag?.archetype === 'creature') return true;

  // 2. Если сущность уже стала предметом (лутом / останками на полу), её разрешено поднимать
  if (world.getComponent(entityId, 'item')) {
    return false;
  }

  // 3. Защита от поднятия функционирующих частей живого существа прямо "на лету"
  const brain = world.getComponent(entityId, 'bodyBrain');
  if (brain && brain.isActive) return true;

  const assembly = world.getComponent(entityId, 'assemblyRoot');
  if (assembly && assembly.partIds) {
    for (const partId of assembly.partIds) {
      const partBrain = world.getComponent(partId, 'bodyBrain');
      if (partBrain && partBrain.isActive) return true;
    }
  }

  return false;
}

/**
 * Проверяет, может ли предмет быть поднят с земли/карты.
 */
export function canItemBePickedUp(
  world: World,
  itemId: string
): { valid: boolean; reason?: string } {
  const item = world.getComponent(itemId, 'item');
  if (!item) return { valid: false, reason: 'Сущность не является предметом' };

  const ownership = world.getComponent(itemId, 'ownership');
  if (ownership) return { valid: false, reason: 'Предмет уже кому-то принадлежит' };

  if (hasActiveBrainOrLiving(world, itemId)) {
    return { valid: false, reason: 'Нельзя подобрать существо с активным мозгом' };
  }

  return { valid: true };
}

/**
 * Проверяет, может ли предмет удерживаться в ячейке взаимодействия (руке).
 */
export function canItemBeHeldInSlot(
  world: World,
  itemId: string,
  slotStrength: number,
  partId?: string
): { valid: boolean; reason?: string } {
  const item = world.getComponent(itemId, 'item');
  if (!item) return { valid: false, reason: 'Сущность не является предметом' };

  if (hasActiveBrainOrLiving(world, itemId)) {
    return { valid: false, reason: 'Нельзя удерживать существо с активным мозгом' };
  }

  if (partId && isDescendantOf(world, partId, itemId)) {
    return { valid: false, reason: 'Нельзя поместить предмет внутрь самого себя' };
  }

  const totalWeight = calculateTotalEntityWeight(world, itemId);
  if (totalWeight > slotStrength * 2) {
    return { valid: false, reason: 'Слишком тяжело для этой руки' };
  }

  return { valid: true };
}

/**
 * Проверяет, может ли предмет быть экипирован в указанную область контейнера.
 */
export function canItemBeEquippedToArea(
  world: World,
  itemId: string,
  containerId: string,
  areaId: string,
  options?: { ignoreItemIds?: string[] }
): { valid: boolean; reason?: string } {
  const item = world.getComponent(itemId, 'item');
  if (!item) return { valid: false, reason: 'Сущность не является предметом' };

  if (hasActiveBrainOrLiving(world, itemId)) {
    return { valid: false, reason: 'Нельзя экипировать существо с активным мозгом' };
  }

  if (isDescendantOf(world, containerId, itemId)) {
    return { valid: false, reason: 'Нельзя поместить контейнер внутрь самого себя' };
  }

  const equip = world.getComponent(containerId, 'equip');
  const area = equip?.equipmentAreas.find((a) => a.id === areaId);
  if (!area) return { valid: false, reason: 'Область экипировки не найдена' };

  if (!isItemEquippableToArea(item, area.type)) {
    return { valid: false, reason: 'Неподходящий тип области экипировки' };
  }

  let usedSpace = 0;
  for (const id of area.itemIds) {
    if (id !== itemId && (!options?.ignoreItemIds || !options.ignoreItemIds.includes(id))) {
      const childItem = world.getComponent(id, 'item');
      if (childItem) usedSpace += childItem.size;
    }
  }

  if (usedSpace + item.size > area.space) {
    return { valid: false, reason: 'Недостаточно места по объему' };
  }

  return { valid: true };
}

/**
 * Проверяет, может ли предмет быть размещен в сетке инвентаря.
 */
export function canItemBeStoredInInventory(
  world: World,
  itemId: string,
  containerId: string,
  row?: number,
  col?: number
): { valid: boolean; reason?: string } {
  const item = world.getComponent(itemId, 'item');
  if (!item) return { valid: false, reason: 'Сущность не является предметом' };

  if (hasActiveBrainOrLiving(world, itemId)) {
    return { valid: false, reason: 'Нельзя поместить существо с активным мозгом в инвентарь' };
  }

  if (isDescendantOf(world, containerId, itemId)) {
    return { valid: false, reason: 'Нельзя поместить контейнер внутрь самого себя' };
  }

  const inv = world.getComponent(containerId, 'inventory');
  if (!inv) return { valid: false, reason: 'У контейнера отсутствует сетка инвентаря' };

  if (row !== undefined && col !== undefined) {
    const cell = inv.slots[row]?.[col];
    if (!cell) return { valid: false, reason: 'Ячейка вне диапазона сетки' };
    if (cell.itemId && cell.itemId !== itemId) {
      return { valid: false, reason: 'Ячейка уже занята' };
    }
    return { valid: true };
  }

  for (let r = 0; r < inv.slots.length; r++) {
    for (let c = 0; c < inv.slots[r].length; c++) {
      if (!inv.slots[r][c].itemId || inv.slots[r][c].itemId === itemId) {
        return { valid: true };
      }
    }
  }

  return { valid: false, reason: 'В инвентаре нет свободных ячеек' };
}

export function findItemLocation(world: World, itemId: string): TransferTarget | null {
  const ownership = world.getComponent(itemId, 'ownership');
  if (!ownership) return { type: 'ground' };

  const ownerId = ownership.ownerId;
  if (ownership.status === 'equipped') {
    const ownerSlots = world.getComponent(ownerId, 'interactionSlots');
    if (ownerSlots && ownerSlots.itemId === itemId) {
      return { type: 'slot', partId: ownerId };
    }
    const ownerEquip = world.getComponent(ownerId, 'equip');
    if (ownerEquip) {
      for (const area of ownerEquip.equipmentAreas) {
        if (area.itemIds.includes(itemId)) {
          return { type: 'area', containerId: ownerId, areaId: area.id };
        }
      }
    }
  } else if (ownership.status === 'inventory') {
    const ownerInv = world.getComponent(ownerId, 'inventory');
    if (ownerInv) {
      for (let r = 0; r < ownerInv.slots.length; r++) {
        for (let c = 0; c < ownerInv.slots[r].length; c++) {
          if (ownerInv.slots[r][c].itemId === itemId) {
            return { type: 'inventory', containerId: ownerId, row: r, col: c };
          }
        }
      }
    }
  }
  return null;
}

export function validateItemTransferForSwap(
  world: World,
  itemId: string,
  target: TransferTarget,
  vacatingItemId: string
): { valid: boolean } {
  if (target.type === 'ground') return { valid: true };

  if (target.type === 'slot') {
    const slot = world.getComponent(target.partId, 'interactionSlots');
    if (!slot) return { valid: false };
    return canItemBeHeldInSlot(world, itemId, slot.strength, target.partId);
  }

  if (target.type === 'area') {
    return canItemBeEquippedToArea(world, itemId, target.containerId, target.areaId, {
      ignoreItemIds: [vacatingItemId],
    });
  }

  if (target.type === 'inventory') {
    return canItemBeStoredInInventory(world, itemId, target.containerId, target.row, target.col);
  }

  return { valid: false };
}

export function validateItemTransfer(
  world: World,
  itemId: string,
  target: TransferTarget
): { valid: boolean; isSwap: boolean; swapItemId?: string; reason?: string } {
  if (target.type === 'ground') {
    return { valid: true, isSwap: false };
  }

  if (target.type === 'slot') {
    const slot = world.getComponent(target.partId, 'interactionSlots');
    if (!slot) return { valid: false, isSwap: false, reason: 'Слот не найден' };

    const holdCheck = canItemBeHeldInSlot(world, itemId, slot.strength, target.partId);
    if (!holdCheck.valid) return { valid: false, isSwap: false, reason: holdCheck.reason };

    if (slot.itemId && slot.itemId !== itemId) {
      const source = findItemLocation(world, itemId);
      if (!source) return { valid: false, isSwap: false, reason: 'Источник неизвестен' };
      const swapValid = validateItemTransferForSwap(world, slot.itemId, source, itemId);
      if (!swapValid.valid)
        return { valid: false, isSwap: false, reason: 'Невозможен взаимный обмен' };
      return { valid: true, isSwap: true, swapItemId: slot.itemId };
    }
    return { valid: true, isSwap: false };
  }

  if (target.type === 'area') {
    const equipCheck = canItemBeEquippedToArea(world, itemId, target.containerId, target.areaId);
    if (!equipCheck.valid) return { valid: false, isSwap: false, reason: equipCheck.reason };
    return { valid: true, isSwap: false };
  }

  if (target.type === 'inventory') {
    const inv = world.getComponent(target.containerId, 'inventory');
    if (!inv) return { valid: false, isSwap: false, reason: 'Инвентарь не найден' };

    if (target.row !== undefined && target.col !== undefined) {
      const cell = inv.slots[target.row]?.[target.col];
      if (cell && cell.itemId && cell.itemId !== itemId) {
        const source = findItemLocation(world, itemId);
        if (source) {
          const swapValid = validateItemTransferForSwap(world, cell.itemId, source, itemId);
          if (swapValid.valid) return { valid: true, isSwap: true, swapItemId: cell.itemId };
        }
      }
    }

    const storeCheck = canItemBeStoredInInventory(
      world,
      itemId,
      target.containerId,
      target.row,
      target.col
    );
    if (!storeCheck.valid) return { valid: false, isSwap: false, reason: storeCheck.reason };
    return { valid: true, isSwap: false };
  }

  return { valid: false, isSwap: false };
}
