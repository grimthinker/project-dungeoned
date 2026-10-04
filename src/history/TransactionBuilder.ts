import { EntitySnapshotCommand } from './commands/EntitySnapshotCommand';
import { SerializedEntityData } from '../ecs/WorldSerializer';
import { IEditorContext } from '../core/contexts';

export class TransactionBuilder {
  private beforeEntities: SerializedEntityData[] = [];
  private allAffectedIds = new Set<string>();
  private beforeSelection: { id: string | null; ids: string[] };

  constructor(
    private ctx: IEditorContext,
    private description: string
  ) {
    this.beforeSelection = {
      id: ctx.selection.selectedEntityId,
      ids: Array.from(ctx.selection.selectedEntityIds),
    };
  }

  /**
   * Захватывает состояние указанных сущностей и всей их иерархии (дети, инвентарь) ДО изменений.
   */
  public captureBefore(rootIds: string[]): void {
    const expandedIds = this.ctx.gatherHierarchyIds(rootIds);
    for (const id of expandedIds) {
      this.allAffectedIds.add(id);
    }
    this.beforeEntities = this.ctx.serializeEntities(Array.from(this.allAffectedIds));
  }

  /**
   * Вызывается после создания новых сущностей (Спавн, Клонирование), чтобы включить их в транзакцию.
   */
  public includeAdded(newRootIds: string[]): void {
    const expandedIds = this.ctx.gatherHierarchyIds(newRootIds);
    for (const id of expandedIds) {
      this.allAffectedIds.add(id);
    }
  }

  /**
   * Завершает транзакцию: делает слепок ПОСЛЕ изменений и пушит Команду в историю.
   */
  public commit(): void {
    const affectedArr = Array.from(this.allAffectedIds);
    const afterEntities = this.ctx.serializeEntities(affectedArr);

    const afterSelection = {
      id: this.ctx.selection.selectedEntityId,
      ids: Array.from(this.ctx.selection.selectedEntityIds),
    };

    const command = new EntitySnapshotCommand(
      this.description,
      this.ctx,
      affectedArr,
      this.beforeEntities,
      afterEntities,
      this.beforeSelection,
      afterSelection
    );

    this.ctx.pushCommand(command);
  }
}
