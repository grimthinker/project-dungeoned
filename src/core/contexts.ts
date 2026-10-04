import { World } from '../ecs/World';
import { SerializedEntityData } from '../ecs/WorldSerializer';
import type { ICommand } from '../history/ICommand';

export interface ISelectionContext {
  readonly selectedEntityId: string | null;
  readonly selectedEntityIds: Set<string>;
  selectEntity(id: string | null, clearGroup?: boolean): void;
  selectEntities(ids: string[]): void;
  restoreSelection(id: string | null, ids: string[]): void;
  emitSelectionChanged(): void;
}

export interface ICommandContext {
  readonly world: World;
  readonly selection: ISelectionContext;

  syncPhysicsStructures(): void;

  // История и сериализация
  serializeEntities(ids: string[]): SerializedEntityData[];
  deserializeEntities(entitiesData: SerializedEntityData[]): void;
  gatherHierarchyIds(rootIds: string[]): string[];

  // Изолированное безопасное удаление для команд (без рекурсии и физических остатков)
  removeEntityDirectly(id: string): void;
}

export interface IEditorContext extends ICommandContext {
  pushCommand(command: ICommand): void;
}
