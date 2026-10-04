import type { IItemTransferContext } from '../core/contexts';
import { TransactionBuilder } from '../history/TransactionBuilder';
import {
  TransferTarget,
  findItemLocation,
  validateItemTransfer,
} from '../ecs/utils/itemValidation';

export class ItemTransferService {
  constructor(private ctx: IItemTransferContext) {}

  public transferItem(itemId: string, target: TransferTarget): boolean {
    const world = this.ctx.world;
    const source = findItemLocation(world, itemId);
    if (!source) return false;

    // Исключаем лишние вызовы, если предмет перенесли в ту же самую ячейку
    if (JSON.stringify(source) === JSON.stringify(target)) {
      return false;
    }

    const validation = validateItemTransfer(world, itemId, target);
    if (!validation.valid) return false;

    const tx = new TransactionBuilder(this.ctx, 'Перемещение предмета');
    const affectedIds = new Set<string>([itemId]);

    // Сохраняем состояние источников и приемников для Undo/Redo
    if (source.type === 'slot') affectedIds.add(source.partId);
    if (source.type === 'area') affectedIds.add(source.containerId);
    if (source.type === 'inventory') affectedIds.add(source.containerId);

    if (target.type === 'slot') affectedIds.add(target.partId);
    if (target.type === 'area') affectedIds.add(target.containerId);
    if (target.type === 'inventory') affectedIds.add(target.containerId);

    if (validation.isSwap && validation.swapItemId) {
      affectedIds.add(validation.swapItemId);
    }

    tx.captureBefore(Array.from(affectedIds));

    // Выполнение перемещения / обмена
    if (validation.isSwap && validation.swapItemId) {
      this.removeItem(validation.swapItemId, target);
      this.removeItem(itemId, source);

      this.placeItem(itemId, target, source);
      this.placeItem(validation.swapItemId, source, target);
    } else {
      this.removeItem(itemId, source);
      this.placeItem(itemId, target, source);
    }

    // Если перемещенный предмет был выбран на холсте, а теперь попал в экипировку/инвентарь:
    // снимаем с него выделение, чтобы не оставался фантомный фокус
    if (target.type !== 'ground' && this.ctx.selection.selectedEntityId === itemId) {
      this.ctx.selection.deselectEntity(itemId);
    }
    if (
      validation.isSwap &&
      validation.swapItemId &&
      source.type !== 'ground' &&
      this.ctx.selection.selectedEntityId === validation.swapItemId
    ) {
      this.ctx.selection.deselectEntity(validation.swapItemId);
    }

    this.ctx.syncPhysicsStructures();
    tx.commit();
    this.ctx.captureBaseState();
    return true;
  }

  private removeItem(itemId: string, location: TransferTarget): void {
    const world = this.ctx.world;
    if (location.type === 'slot') {
      const slot = world.getComponent(location.partId, 'interactionSlots');
      if (slot && slot.itemId === itemId) slot.itemId = null;
    } else if (location.type === 'area') {
      const equip = world.getComponent(location.containerId, 'equip');
      if (equip) {
        const area = equip.equipmentAreas.find((a) => a.id === location.areaId);
        if (area) {
          area.itemIds = area.itemIds.filter((id) => id !== itemId);
        }
      }
    } else if (location.type === 'inventory') {
      const inv = world.getComponent(location.containerId, 'inventory');
      if (inv) {
        if (location.row !== undefined && location.col !== undefined) {
          const cell = inv.slots[location.row]?.[location.col];
          if (cell && cell.itemId === itemId) {
            cell.itemId = null;
            cell.count = 0;
          }
        } else {
          for (let r = 0; r < inv.slots.length; r++) {
            for (let c = 0; c < inv.slots[r].length; c++) {
              if (inv.slots[r][c].itemId === itemId) {
                inv.slots[r][c].itemId = null;
                inv.slots[r][c].count = 0;
              }
            }
          }
        }
      }
    } else if (location.type === 'ground') {
      this.ctx.removePhysicsBody(itemId);
    }
    world.removeComponent(itemId, 'ownership');
    const renderable = world.getComponent(itemId, 'renderable');
    if (renderable) renderable.isVisible = false;
  }

  private placeItem(itemId: string, location: TransferTarget, source?: TransferTarget): void {
    const world = this.ctx.world;
    const item = world.getComponent(itemId, 'item');
    if (!item) return;

    if (location.type === 'slot') {
      const slot = world.getComponent(location.partId, 'interactionSlots');
      if (slot) slot.itemId = itemId;
      world.addComponent(itemId, 'ownership', { ownerId: location.partId, status: 'equipped' });
    } else if (location.type === 'area') {
      const equip = world.getComponent(location.containerId, 'equip');
      if (equip) {
        const area = equip.equipmentAreas.find((a) => a.id === location.areaId);
        if (area && !area.itemIds.includes(itemId)) {
          area.itemIds.push(itemId);
        }
      }
      world.addComponent(itemId, 'ownership', {
        ownerId: location.containerId,
        status: 'equipped',
      });
    } else if (location.type === 'inventory') {
      const inv = world.getComponent(location.containerId, 'inventory');
      if (inv) {
        let placed = false;
        if (location.row !== undefined && location.col !== undefined) {
          const cell = inv.slots[location.row]?.[location.col];
          if (cell && !cell.itemId) {
            cell.itemId = itemId;
            cell.count = item.count;
            placed = true;
          }
        }
        if (!placed) {
          for (let r = 0; r < inv.slots.length; r++) {
            for (let c = 0; c < inv.slots[r].length; c++) {
              if (!inv.slots[r][c].itemId) {
                inv.slots[r][c].itemId = itemId;
                inv.slots[r][c].count = item.count;
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
        }
      }
      world.addComponent(itemId, 'ownership', {
        ownerId: location.containerId,
        status: 'inventory',
      });
    } else if (location.type === 'ground') {
      const transform = world.getComponent(itemId, 'transform');
      let posX = location.position?.x ?? transform?.x;
      let posY = location.position?.y ?? transform?.y;
      let posZ = location.position?.z ?? transform?.z;

      if (location.parentEntityId) {
        const parentTrans = world.getComponent(location.parentEntityId, 'transform');
        if (parentTrans) {
          posX = parentTrans.x;
          posY = parentTrans.y;
          posZ = parentTrans.z;
        }
      }

      if ((posX === undefined || posY === undefined || posZ === undefined) && source) {
        if (source.type === 'slot') {
          const sTrans = world.getComponent(source.partId, 'transform');
          if (sTrans) {
            posX = sTrans.x;
            posY = sTrans.y;
            posZ = sTrans.z;
          }
        } else if (source.type === 'area' || source.type === 'inventory') {
          const sTrans = world.getComponent(source.containerId, 'transform');
          if (sTrans) {
            posX = sTrans.x;
            posY = sTrans.y;
            posZ = sTrans.z;
          }
        }
      }

      const defaultPos = this.ctx.getViewFocusPosition();
      posX = posX ?? defaultPos.x;
      posY = posY ?? defaultPos.y;
      posZ = posZ ?? defaultPos.z;

      if (transform) {
        transform.x = posX;
        transform.y = posY;
        transform.z = posZ;
        transform.isDirty = true;
      } else {
        world.addComponent(itemId, 'transform', {
          x: posX,
          y: posY,
          z: posZ,
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          angle: 0,
        });
      }

      const physStats = world.getComponent(itemId, 'physicsStats');
      if (physStats) {
        const pos3D = { x: posX, y: posY ?? 1.5, z: posZ };
        this.ctx.createDynamicItemBody(itemId, pos3D);
      }
      const renderable = world.getComponent(itemId, 'renderable');
      if (renderable) renderable.isVisible = true;
    }
  }
}
