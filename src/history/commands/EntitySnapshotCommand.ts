import { ICommand } from '../ICommand';
import { SerializedEntityData } from '../../ecs/WorldSerializer';
import { ICommandContext } from '../../core/contexts';

export class EntitySnapshotCommand implements ICommand {
  constructor(
    public readonly description: string,
    private ctx: ICommandContext,
    private allAffectedIds: string[],
    private beforeEntities: SerializedEntityData[],
    private afterEntities: SerializedEntityData[],
    private beforeSelection: { id: string | null; ids: string[] },
    private afterSelection: { id: string | null; ids: string[] }
  ) {}

  public execute(): void {
    this.applyState(this.afterEntities, this.afterSelection);
  }

  public undo(): void {
    this.applyState(this.beforeEntities, this.beforeSelection);
  }

  private applyState(
    entitiesData: SerializedEntityData[],
    selection: { id: string | null; ids: string[] }
  ): void {
    // 1. Быстрое удаление всех затронутых сущностей из физики и мира перед накатом состояния
    for (const id of this.allAffectedIds) {
      this.ctx.removeEntityDirectly(id);
    }

    // 2. Десериализация (восстановление) нужной версии сущностей из JSON-дампа
    if (entitiesData.length > 0) {
      this.ctx.deserializeEntities(entitiesData);
    }

    // 3. Восстановление правильного выделения
    this.ctx.selection.restoreSelection(selection.id, selection.ids);

    // 4. Синхронизация вторичных систем и физических структур
    this.ctx.syncPhysicsStructures();
    this.ctx.selection.emitSelectionChanged();
  }
}
