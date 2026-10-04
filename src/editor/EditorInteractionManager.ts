import { GameApp } from '../GameApp';
import { SelectionController } from './SelectionController';
import { GizmoController } from './GizmoController';
import { EditorMutationsAPI } from './EditorMutationsAPI';
import { ItemTransferService } from './ItemTransferService';
import { EntityClonerService } from './EntityClonerService';
import { CommandHistory } from '../history/CommandHistory';
import { TransactionBuilder } from '../history/TransactionBuilder';
import { EntitySnapshotCommand } from '../history/commands/EntitySnapshotCommand';
import { SerializedWorldData, SerializedEntityData } from '../ecs/WorldSerializer';
import { TerrainBrushState, PropBrushState, PropBrushPreset } from '../types';
import { EDITOR_CONFIG } from '../config/editorConfig';
import { GameMode } from '../config/gameConfig';

export class EditorInteractionManager {
  public selection: SelectionController;
  public gizmo: GizmoController;
  public mutations: EditorMutationsAPI;
  public itemTransfer: ItemTransferService;
  public cloner: EntityClonerService;
  public commandHistory: CommandHistory;
  public editorSnapshot: SerializedWorldData | null = null;

  public terrainBrush: TerrainBrushState = {
    active: false,
    tool: 'raise',
    texture: 0,
    customTextureMix: [25, 25, 25, 25],
    foliageZone: 0,
    shape: 'circle',
    rotation: 0,
    radius: 3.0,
    strength: 2.0,
    hillSize: 18.0,
  };

  public propBrush: PropBrushState = {
    active: false,
    mode: 'paint',
    shape: 'circle',
    rotation: 0,
    radius: 5.0,
    density: 0.5,
    minDistance: 2.0,
    activePresetId: null,
  };
  public propBrushPresets: PropBrushPreset[] = []; // Заполняется из компонента UI

  private baseStateForCommit: SerializedEntityData[] = [];
  private baseSelectionForCommit = { id: null as string | null, ids: [] as string[] };

  constructor(private app: GameApp) {
    this.commandHistory = new CommandHistory(EDITOR_CONFIG.historyMaxDepth);
    this.selection = new SelectionController(app);
    this.gizmo = new GizmoController(app);
    this.mutations = new EditorMutationsAPI(app.world);
    this.itemTransfer = new ItemTransferService(app);
    this.cloner = new EntityClonerService(app);
  }

  public captureBaseState(): void {
    const ids = Array.from(this.selection.selectedEntityIds);
    this.baseStateForCommit = this.app.serializer.serializeEntities(
      this.app.simulation.gatherHierarchyIds(ids)
    );
    this.baseSelectionForCommit = {
      id: this.selection.selectedEntityId,
      ids: [...ids],
    };
  }

  public executeTransaction<T>(description: string, action: () => T): T {
    const tx = new TransactionBuilder(this.app, description);
    tx.captureBefore(Array.from(this.selection.selectedEntityIds));
    const result = action();
    tx.includeAdded(Array.from(this.selection.selectedEntityIds));
    tx.commit();
    this.captureBaseState();
    return result;
  }

  public commitHistory(description: string = 'Изменение'): void {
    if (this.app.gameMode !== GameMode.EDITOR) return;

    const currentIds = Array.from(this.selection.selectedEntityIds);
    const currentExpanded = this.app.gatherHierarchyIds(currentIds);

    const allAffected = new Set<string>();
    this.baseStateForCommit.forEach((e) => allAffected.add(e.id));
    currentExpanded.forEach((id) => allAffected.add(id));

    const affectedArr = Array.from(allAffected);
    const afterEntities = this.app.serializer.serializeEntities(affectedArr);

    const command = new EntitySnapshotCommand(
      description,
      this.app,
      affectedArr,
      this.baseStateForCommit,
      afterEntities,
      this.baseSelectionForCommit,
      { id: this.selection.selectedEntityId, ids: currentIds }
    );
    this.commandHistory.push(command);
    this.app.syncPhysicsStructures();
    this.captureBaseState();
  }

  public undo(): boolean {
    if (this.app.gameMode !== GameMode.EDITOR || !this.commandHistory.canUndo()) return false;
    this.commandHistory.undo();
    this.captureBaseState();
    return true;
  }

  public redo(): boolean {
    if (this.app.gameMode !== GameMode.EDITOR || !this.commandHistory.canRedo()) return false;
    this.commandHistory.redo();
    this.captureBaseState();
    return true;
  }

  public deleteSelectedEntity(): void {
    this.deleteSelectedEntities();
  }

  public deleteSelectedEntities(): void {
    const ids = Array.from(
      this.selection.selectedEntityIds.size > 0
        ? this.selection.selectedEntityIds
        : this.selection.selectedEntityId
          ? [this.selection.selectedEntityId]
          : []
    );

    if (ids.length === 0) return;

    const tx = new TransactionBuilder(this.app, 'Удаление объектов');
    tx.captureBefore(ids);

    for (const id of ids) {
      this.app.deleteEntityRecursive(id);
      if (this.selection.hoveredEntityId === id) this.selection.hoverEntity(null);
    }

    this.app.syncPhysicsStructures();
    this.selection.clear();
    tx.commit();
    this.captureBaseState();
  }

  public duplicateEntities(
    ids: string[],
    offset: { x: number; z: number; y?: number } = EDITOR_CONFIG.cloneOffset
  ): string[] {
    return this.cloner.duplicateEntities(ids, offset);
  }
}
