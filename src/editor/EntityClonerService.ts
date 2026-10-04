import type { IEntityClonerContext } from '../core/contexts';
import { EDITOR_CONFIG } from '../config/editorConfig';
import { TransactionBuilder } from '../history/TransactionBuilder';
import { getAnatomyParts, getAllContainedItems, getRootOwner } from '../ecs/utils/hierarchy';
import { SerializedEntityData } from '../ecs/WorldSerializer';

export class EntityClonerService {
  constructor(private ctx: IEntityClonerContext) {}

  public duplicateEntities(
    ids: string[],
    offset: { x: number; z: number; y?: number } = EDITOR_CONFIG.cloneOffset
  ): string[] {
    const validIds = ids.filter((id) => this.ctx.world.getEntity(id));
    if (validIds.length === 0) return [];

    const tx = new TransactionBuilder(this.ctx, 'Клонирование объектов');
    tx.captureBefore([]);

    // Оставляем только верхнеуровневые корни для клонирования, исключая вложенные части и экипированные предметы
    const rootIdsToClone = validIds.filter((id) => {
      const tag = this.ctx.world.getComponent(id, 'tag');
      if (tag?.archetype === 'bodyPart') {
        const root = getRootOwner(this.ctx.world, id);
        if (root && validIds.includes(root)) return false;
      }
      const ownership = this.ctx.world.getComponent(id, 'ownership');
      if (ownership && validIds.includes(ownership.ownerId)) return false;
      return true;
    });

    if (rootIdsToClone.length === 0) return [];

    // 1. Собираем полный список сущностей всех затронутых иерархий (корни, части тела, вложенные предметы)
    const allClusterIds = new Set<string>();
    for (const rootId of rootIdsToClone) {
      allClusterIds.add(rootId);
      const parts = getAnatomyParts(this.ctx.world, rootId).filter((p) => p !== rootId);
      for (const p of parts) allClusterIds.add(p);
      const items = getAllContainedItems(this.ctx.world, rootId);
      for (const it of items) allClusterIds.add(it);
    }

    // 2. Генерируем маппинг новых уникальных ID для каждого клонируемого элемента
    const idMap = new Map<string, string>();
    for (const oldId of allClusterIds) {
      const prefix = oldId.split('_').slice(0, 2).join('_') || 'ent';
      idMap.set(oldId, this.ctx.generateEntityId(prefix));
    }

    // 3. Сериализуем структуры данных через существующий WorldSerializer (DRY)
    const serializedEntities: SerializedEntityData[] = this.ctx.serializeEntities(
      Array.from(allClusterIds)
    );

    // 4. Модифицируем сериализованные данные: ремаппинг ID, сдвиг координат и обновление имени
    for (const ent of serializedEntities) {
      const oldId = ent.id;
      const newId = idMap.get(oldId);
      if (!newId) continue;

      ent.id = newId;
      const comps = ent.components as Record<string, any>;

      // Смещение 3D координат
      if (comps.transform) {
        comps.transform.x += offset.x;
        comps.transform.y += offset.y ?? 0;
        comps.transform.z += offset.z;
        comps.transform.isDirty = true;
      }

      // Добавление постфикса (Копия) к имени корневых объектов
      if (rootIdsToClone.includes(oldId)) {
        if (comps.meta?.name) {
          comps.meta.name = `${comps.meta.name} (Копия)`;
        } else if (comps.item?.name) {
          comps.item.name = `${comps.item.name} (Копия)`;
        }
      }

      // Ремаппинг ссылок внутри компонентов
      if (comps.assemblyRoot) {
        if (idMap.has(comps.assemblyRoot.rootPartId)) {
          comps.assemblyRoot.rootPartId = idMap.get(comps.assemblyRoot.rootPartId)!;
        }
        if (Array.isArray(comps.assemblyRoot.partIds)) {
          comps.assemblyRoot.partIds = comps.assemblyRoot.partIds.map(
            (pId: string) => idMap.get(pId) || pId
          );
        }
      }

      if (comps.bodyBrain?.rootEntityId && idMap.has(comps.bodyBrain.rootEntityId)) {
        comps.bodyBrain.rootEntityId = idMap.get(comps.bodyBrain.rootEntityId);
      }

      if (comps.socketLink?.links) {
        for (const link of Object.values(comps.socketLink.links) as any[]) {
          if (link.targetEntityId && idMap.has(link.targetEntityId)) {
            link.targetEntityId = idMap.get(link.targetEntityId);
          }
        }
      }

      if (comps.ownership?.ownerId && idMap.has(comps.ownership.ownerId)) {
        comps.ownership.ownerId = idMap.get(comps.ownership.ownerId);
      }

      if (comps.equip?.equipmentAreas) {
        for (const area of comps.equip.equipmentAreas) {
          if (Array.isArray(area.itemIds)) {
            area.itemIds = area.itemIds
              .map((itId: string) => idMap.get(itId))
              .filter((itId: string | undefined): itId is string => Boolean(itId));
          }
        }
      }

      if (comps.inventory?.slots) {
        for (const row of comps.inventory.slots) {
          for (const cell of row) {
            if (cell.itemId) {
              cell.itemId = idMap.get(cell.itemId) || null;
              if (!cell.itemId) cell.count = 0;
            }
          }
        }
      }

      if (comps.interactionSlots?.itemId) {
        comps.interactionSlots.itemId = idMap.get(comps.interactionSlots.itemId) || null;
      }

      if (comps.attachment?.parentId && idMap.has(comps.attachment.parentId)) {
        comps.attachment.parentId = idMap.get(comps.attachment.parentId);
      }

      if (comps.thrownObject?.throwerId && idMap.has(comps.thrownObject.throwerId)) {
        comps.thrownObject.throwerId = idMap.get(comps.thrownObject.throwerId);
      }

      if (comps.fetchStick) {
        if (comps.fetchStick.ownerMasterId && idMap.has(comps.fetchStick.ownerMasterId)) {
          comps.fetchStick.ownerMasterId = idMap.get(comps.fetchStick.ownerMasterId);
        }
        if (comps.fetchStick.lastCarrierDogId && idMap.has(comps.fetchStick.lastCarrierDogId)) {
          comps.fetchStick.lastCarrierDogId = idMap.get(comps.fetchStick.lastCarrierDogId);
        }
      }

      if (comps.brain?.blackboardData) {
        const bb = comps.brain.blackboardData as Record<string, unknown>;
        for (const [bbKey, bbVal] of Object.entries(bb)) {
          if (typeof bbVal === 'string' && idMap.has(bbVal)) {
            bb[bbKey] = idMap.get(bbVal);
          } else if (Array.isArray(bbVal)) {
            bb[bbKey] = bbVal.map((v) =>
              typeof v === 'string' && idMap.has(v) ? idMap.get(v) : v
            );
          }
        }
      }
    }

    // 5. Десериализуем клонированные сущности через WorldSerializer (создание физики, нормализация статов, биндинг мозга)
    this.ctx.deserializeEntities(serializedEntities);

    const newRootIds = rootIdsToClone.map((oldId) => idMap.get(oldId)!);

    // 6. Выделяем созданные объекты и фиксируем транзакцию истории
    if (newRootIds.length > 0) {
      this.ctx.selection.selectEntities(newRootIds);
    }

    this.ctx.syncPhysicsStructures();
    tx.includeAdded(newRootIds);
    tx.commit();
    this.ctx.captureBaseState();

    return newRootIds;
  }
}
