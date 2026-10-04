import { IAIWorld } from '../ai/ports';
import { GameMode } from '../config/gameConfig';
import { World } from '../ecs/World';
import { SerializedEntityData } from '../ecs/WorldSerializer';
import type { ICommand } from '../history/ICommand';
import { PhysicalRaycastResult } from '../physics/IPhysicsDriver';
import { Vec3 } from '../types';

export interface ISelectionContext {
  readonly selectedEntityId: string | null;
  readonly selectedEntityIds: Set<string>;
  readonly hoveredEntityId: string | null;
  selectEntity(id: string | null, clearGroup?: boolean): void;
  selectEntities(ids: string[]): void;
  restoreSelection(id: string | null, ids: string[]): void;
  deselectEntity(id: string): void;
  hoverEntity(id: string | null): void;
  clear(): void;
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

export interface ISelectionHostContext {
  readonly world: World;
  readonly aiSystem: IAIWorld;
  readonly canvas: HTMLCanvasElement;
  readonly gameMode: GameMode;
  getPlayerEntityId(): string | null;
  updateBTData(force?: boolean): void;
  raycastPhysics?(
    clientX: number,
    clientY: number,
    filterExcludeEntityId?: string
  ): PhysicalRaycastResult | null;
  readonly renderer: {
    pickEntity?(clientX: number, clientY: number): string | null;
    projectToScreen?(pos: Vec3): Vec3 | null;
  };
}

export interface IHistoryContext {
  pushCommand(command: ICommand): void;
  captureBaseState(): void;
}

export interface IEntityLifecycleContext {
  generateEntityId(prefix?: string): string;
  deleteEntityRecursive(id: string): void;
}

export interface IItemPhysicsContext {
  createDynamicItemBody(itemId: string, pos: Vec3): void;
  removePhysicsBody(itemId: string): void;
}

export interface IViewportFocusContext {
  getViewFocusPosition(): Vec3;
}

export interface ITransactionContext extends ICommandContext, IHistoryContext {}

export interface IItemTransferContext
  extends ITransactionContext, IItemPhysicsContext, IViewportFocusContext {}

export interface IEntityClonerContext extends ITransactionContext, IEntityLifecycleContext {}

export interface IGizmoContext extends ITransactionContext {}

export interface IEditorContext
  extends
    ICommandContext,
    IHistoryContext,
    IEntityLifecycleContext,
    IItemPhysicsContext,
    IViewportFocusContext {}
