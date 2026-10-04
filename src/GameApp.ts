import { Camera } from './Camera';
import { ThreeRenderer } from './rendering/ThreeRenderer';
import { IRenderer } from './rendering/IRenderer';
import { Point, Vec3 } from './types';
import { GameMode } from './config/gameConfig';
import { SerializedEntityData, SerializedWorldData } from './ecs/WorldSerializer';
import { EntityConfig } from './ecs/types';
import { EventBus } from './core/EventBus';
import { serializeBTNode } from './ai/serializer';
import { getEffectiveLogicBrain } from './ecs/utils/anatomy';
import { compileTreeBlackboardSchema } from './ai/schema';
import { AssetManager } from './rendering/AssetManager';

import { TimeManager } from './core/TimeManager';
import { GameSimulation } from './core/GameSimulation';
import { EditorInteractionManager } from './editor/EditorInteractionManager';
import { PhysicalRaycastResult } from './physics/IPhysicsDriver';
import { calculateThrowVelocity } from './utils';
import { FPSMonitor } from './core/FPSMonitor';
import { IEditorContext } from './core/contexts';
import { ICommand } from './history/ICommand';

export { EntityAdapter } from './EntityAdapter';

export class GameApp implements IEditorContext {
  private container: HTMLDivElement;
  public renderer: IRenderer;
  public camera: Camera;

  public time: TimeManager;
  public simulation: GameSimulation;
  public editor: EditorInteractionManager;
  public fpsMonitor: FPSMonitor = new FPSMonitor();

  public throwTargeting: { slotIndex: number; partId: string; itemId: string } | null = null;
  private mouseScreenPos: Point | null = null;

  private _showUIOverlays: boolean = true;
  public get showUIOverlays() {
    return this._showUIOverlays;
  }
  public set showUIOverlays(val: boolean) {
    if (this._showUIOverlays === val) return;
    this._showUIOverlays = val;
    this.emitState();
  }

  private _showAIDebug: boolean = (() => {
    const saved = localStorage.getItem('engine_show_ai_debug');
    return saved !== null ? saved === 'true' : true;
  })();
  public get showAIDebug() {
    return this._showAIDebug;
  }
  public set showAIDebug(val: boolean) {
    if (this._showAIDebug === val) return;
    this._showAIDebug = val;
    localStorage.setItem('engine_show_ai_debug', String(val));
    this.emitState();
  }

  private _celShading: boolean = (() => {
    const saved = localStorage.getItem('engine_cel_shading');
    return saved !== null ? saved === 'true' : true;
  })();
  public get celShading() {
    return this._celShading;
  }
  public set celShading(val: boolean) {
    if (this._celShading === val) return;
    this._celShading = val;
    localStorage.setItem('engine_cel_shading', String(val));
    this.emitState();
  }

  private _showFPSMonitor: boolean = (() => {
    const saved = localStorage.getItem('engine_show_fps_monitor');
    return saved !== null ? saved === 'true' : true;
  })();
  public get showFPSMonitor() {
    return this._showFPSMonitor;
  }
  public set showFPSMonitor(val: boolean) {
    if (this._showFPSMonitor === val) return;
    this._showFPSMonitor = val;
    localStorage.setItem('engine_show_fps_monitor', String(val));
    this.emitState();
  }

  private _gameMode: GameMode = GameMode.MENU;
  public get gameMode() {
    return this._gameMode;
  }
  public set gameMode(val: GameMode) {
    if (this._gameMode === val) return;
    this._gameMode = val;
    this.emitState();
  }

  public onFrame: (() => void) | null = null;

  private lastBTUpdate: number = 0;
  private lastBTTargetId: string | null = null;

  // --- ФАСАДЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ (UI / ECS) ---
  public get world() {
    return this.simulation.world;
  }
  public get physics() {
    return this.simulation.physics;
  }
  public get physicsDriver() {
    return this.simulation.physicsDriver;
  }
  public get aiSystem() {
    return this.simulation.aiSystem;
  }
  public get interactionSystem() {
    return this.simulation.interactionSystem;
  }
  public get damageSystem() {
    return this.simulation.damageSystem;
  }
  public get attachmentSystem() {
    return this.simulation.attachmentSystem;
  }
  public get entityFactory() {
    return this.simulation.entityFactory;
  }
  public get serializer() {
    return this.simulation.serializer;
  }
  public get playerEntityId() {
    return this.simulation.playerEntityId;
  }
  public set playerEntityId(val) {
    this.simulation.playerEntityId = val;
  }

  public get commandHistory() {
    return this.editor.commandHistory;
  }
  public get history() {
    return this.editor.commandHistory;
  }
  public get selection() {
    return this.editor.selection;
  }
  public get gizmo() {
    return this.editor.gizmo;
  }
  public get mutations() {
    return this.editor.mutations;
  }
  public get itemTransfer() {
    return this.editor.itemTransfer;
  }
  public get cloner() {
    return this.editor.cloner;
  }
  public get terrainBrush() {
    return this.editor.terrainBrush;
  }
  public set terrainBrush(val) {
    this.editor.terrainBrush = val;
  }
  public get propBrush() {
    return this.editor.propBrush;
  }
  public set propBrush(val) {
    this.editor.propBrush = val;
  }
  public get propBrushPresets() {
    return this.editor.propBrushPresets;
  }
  public set propBrushPresets(val) {
    this.editor.propBrushPresets = val;
  }
  public get editorSnapshot() {
    return this.editor.editorSnapshot;
  }
  public set editorSnapshot(val) {
    this.editor.editorSnapshot = val;
  }

  public get isPaused() {
    return this.time.isPaused;
  }
  public set isPaused(val) {
    this.time.isPaused = val;
  }
  public get globalTimeScale() {
    return this.time.globalTimeScale;
  }
  public set globalTimeScale(val) {
    this.time.globalTimeScale = val;
  }

  constructor(container: HTMLDivElement) {
    this.container = container;
    const threeRenderer = new ThreeRenderer(container);
    this.renderer = threeRenderer;
    this.camera = new Camera();

    this.simulation = new GameSimulation(this);
    this.editor = new EditorInteractionManager(this);
    this.time = new TimeManager(this);

    this.resizeCanvas();
    window.addEventListener('resize', this.handleResize);

    EventBus.on('selection:changed', () => {
      if (this.gameMode === GameMode.EDITOR) {
        this.captureBaseState();
      }
    });

    EventBus.on('input:cancelTargeting', () => {
      if (this.throwTargeting) {
        this.throwTargeting = null;
      }
    });
  }

  private handleResize = () => this.resizeCanvas();

  public get canvas(): HTMLCanvasElement {
    return this.renderer.getCanvas();
  }

  public resizeCanvas(width?: number, height?: number): void {
    let w = width;
    let h = height;
    if (w === undefined || h === undefined) {
      w = this.container.clientWidth;
      h = this.container.clientHeight;
    }
    this.renderer.resize(w, h);
  }

  public applyGlobalSettings(): void {
    if (this.renderer instanceof ThreeRenderer) {
      this.renderer.applySettings();
    }
    this.simulation.threeSyncSystem.applySettings();
  }

  public emitState(): void {
    EventBus.emit('engine:state-changed', {
      mode: this._gameMode,
      isPaused: this.isPaused,
      timeScale: this.globalTimeScale,
      showUIOverlays: this._showUIOverlays,
      showAIDebug: this._showAIDebug,
      celShading: this._celShading,
      showFPSMonitor: this._showFPSMonitor,
    });
  }

  public start(): void {
    this.time.start();
  }

  public destroy(): void {
    this.time.stop();
    window.removeEventListener('resize', this.handleResize);
    this.simulation.destroy();
    if (this.renderer.destroy) {
      this.renderer.destroy();
    }
    AssetManager.getInstance().clear();
  }

  // --- ДЕЛЕГАТЫ СИМУЛЯЦИИ И ФИЗИКИ ---
  public markPhysicsStructureDirty(): void {
    this.simulation.markPhysicsStructureDirty();
  }
  public syncPhysicsStructures(): void {
    this.simulation.syncPhysicsStructures();
  }
  public spawnEntity(config: EntityConfig, position?: Vec3, forcedId?: string): string {
    return this.simulation.spawnEntity(config, position, forcedId);
  }
  public gatherHierarchyIds(rootIds: string[]): string[] {
    return this.simulation.gatherHierarchyIds(rootIds);
  }
  public startPickup(entityId: string, targetItemId: string): boolean {
    return this.simulation.startPickup(entityId, targetItemId);
  }
  public cancelInteraction(entityId: string): boolean {
    return this.simulation.cancelInteraction(entityId);
  }
  public deleteItemFromInteractionSlot(partId: string): boolean {
    return this.simulation.deleteItemFromInteractionSlot(partId);
  }
  public deleteItemFromEquipmentArea(containerId: string, areaId: string, itemId: string): boolean {
    return this.simulation.deleteItemFromEquipmentArea(containerId, areaId, itemId);
  }
  public deleteEntityRecursive(id: string): void {
    this.simulation.deleteEntityRecursive(id);
  }
  public clearWorld(): void {
    this.simulation.clearWorld();
  }
  public initEmptyWorld(width: number, depth: number): void {
    this.simulation.initEmptyWorld(width, depth);
  }
  public initDefaultWorld(center?: Vec3): void {
    this.simulation.initDefaultWorld(center);
  }
  public serializeWorld(): SerializedWorldData {
    return this.simulation.serializeWorld();
  }
  public deserializeWorld(data: SerializedWorldData | Record<string, any>): void {
    this.simulation.deserializeWorld(data);
  }
  public serializeEntities(ids: string[]): SerializedEntityData[] {
    return this.serializer.serializeEntities(ids);
  }
  public deserializeEntities(entitiesData: SerializedEntityData[]): void {
    this.serializer.deserializeEntities(entitiesData);
  }
  public removeEntityDirectly(id: string): void {
    if (this.world.getEntity(id)) {
      const phys = this.world.getComponent(id, 'physicsBody');
      if (phys && phys.rawBody) {
        this.physicsDriver?.removeRigidBody(phys.rawBody);
      }
      this.world.removeEntity(id);
      this.aiSystem.unregisterEntity(id);
    }
  }
  public pushCommand(command: ICommand): void {
    this.commandHistory.push(command);
  }
  public clearPlayerAim(): void {
    this.simulation.clearPlayerAim();
  }
  public getPlayerEntityId(): string | null {
    return this.simulation.getPlayerEntityId();
  }

  // --- ДЕЛЕГАТЫ РЕДАКТОРА ---
  public executeTransaction<T>(description: string, action: () => T): T {
    return this.editor.executeTransaction(description, action);
  }
  public captureBaseState(): void {
    this.editor.captureBaseState();
  }
  public commitHistory(description?: string): void {
    this.editor.commitHistory(description);
  }
  public undo(): boolean {
    return this.editor.undo();
  }
  public redo(): boolean {
    return this.editor.redo();
  }
  public deleteSelectedEntity(): void {
    this.editor.deleteSelectedEntity();
  }
  public deleteSelectedEntities(): void {
    this.editor.deleteSelectedEntities();
  }
  public duplicateEntities(ids: string[], offset?: any): string[] {
    return this.editor.duplicateEntities(ids, offset);
  }

  // --- ВЗАИМОДЕЙСТВИЕ И РЕНДЕР ---
  public updateBTData(force: boolean = false): void {
    const targetId = this.selection.selectedEntityId;
    const now = performance.now();
    if (!force && !this.isPaused && now - this.lastBTUpdate < 100) return;
    this.lastBTUpdate = now;

    if (!targetId) {
      if (this.lastBTTargetId !== null) {
        this.lastBTTargetId = null;
        EventBus.emit('bt:updated', { btData: null, btBlackboard: null, btSchema: null });
      }
      return;
    }

    this.lastBTTargetId = targetId;
    const brain = getEffectiveLogicBrain(this.world, targetId);

    let schema = null;
    if (brain && brain.root_node) {
      schema = compileTreeBlackboardSchema(brain.root_node);
    }

    EventBus.emit('bt:updated', {
      btData: !brain || !brain.root_node ? null : serializeBTNode(brain.root_node),
      btBlackboard: !brain ? null : { ...brain.blackboard.getData() },
      btSchema: schema,
    });
  }

  public updateEntityBlackboard(entityId: string, key: string, value: any): void {
    const brain = getEffectiveLogicBrain(this.world, entityId);
    if (brain) {
      brain.blackboard.set(key, value);
      this.updateBTData(true);
    }
  }

  public removeEntityBlackboardKey(entityId: string, key: string): void {
    const brain = getEffectiveLogicBrain(this.world, entityId);
    if (brain) {
      brain.blackboard.remove(key);
      this.updateBTData(true);
    }
  }

  public setMouseScreenPos(clientX: number | null, clientY: number | null): void {
    if (clientX === null || clientY === null) {
      this.mouseScreenPos = null;
    } else {
      this.mouseScreenPos = { x: clientX, y: clientY };
    }
  }

  public getMouseScreenPos(): Point | null {
    return this.mouseScreenPos;
  }

  public startPan(clientX: number, clientY: number): void {
    this.camera.startPan(clientX, clientY);
  }
  public pan(clientX: number, clientY: number): void {
    this.camera.pan(clientX, clientY);
  }
  public endPan(): boolean {
    return this.camera.endPan();
  }
  public zoomAt(clientX: number, clientY: number, deltaY: number): void {
    this.camera.zoomAt(clientX, clientY, deltaY, this.canvas);
  }

  public raycastPhysics(
    clientX: number,
    clientY: number,
    filterExcludeEntityId?: string
  ): PhysicalRaycastResult | null {
    if (!this.physicsDriver || !this.physicsDriver.isReady) return null;
    const ray = this.renderer.getScreenRay ? this.renderer.getScreenRay(clientX, clientY) : null;
    if (!ray) return null;

    return this.physicsDriver.castRay(ray.origin, ray.direction, 1000, true, filterExcludeEntityId);
  }

  public getCanvasPoint(clientX: number, clientY: number, excludeEntityId?: string): Vec3 {
    const hit = this.raycastPhysics(clientX, clientY, excludeEntityId);
    if (hit) return hit.point;
    return this.renderer.screenToWorld(clientX, clientY, this.camera);
  }

  public renderFrame(): void {
    let cursorWorldPos: Vec3 | null = null;
    let throwTrajectory: { start: Vec3; v0: Vec3 } | null = null;

    const isBrushActive = Boolean(this.terrainBrush?.active || this.propBrush?.active);
    const isThrowTargeting = Boolean(this.throwTargeting && this.gameMode === GameMode.GAME);

    if (this.mouseScreenPos && (isBrushActive || isThrowTargeting)) {
      const pt = this.getCanvasPoint(this.mouseScreenPos.x, this.mouseScreenPos.y);
      cursorWorldPos = { x: pt.x, y: pt.y, z: pt.z };

      if (isThrowTargeting && this.throwTargeting) {
        const slot = this.world.getComponent(this.throwTargeting.partId, 'interactionSlots');
        const physStats = this.world.getComponent(this.throwTargeting.itemId, 'physicsStats');
        const transform =
          this.world.getComponent(this.throwTargeting.partId, 'transform') ??
          this.world.getComponent(this.getPlayerEntityId() ?? '', 'transform');

        if (slot && physStats && transform) {
          const dx = pt.x - transform.x;
          const dz = pt.z - transform.z;
          const d = Math.max(0.001, Math.hypot(dx, dz));
          const spawnOffset = 0.65;
          const startPos = {
            x: transform.x + (dx / d) * spawnOffset,
            y: transform.y + 1.2,
            z: transform.z + (dz / d) * spawnOffset,
          };
          const v0 = calculateThrowVelocity(startPos, pt, slot.strength, physStats.weight.current);
          throwTrajectory = { start: startPos, v0 };
        }
      }
    }

    this.renderer.render({
      camera: this.camera,
      world: this.world,
      physics: this.physics,
      gameMode: this.gameMode,
      editorData: {
        selectedId: this.selection.selectedEntityId,
        selectedIds: this.selection.selectedEntityIds,
        hoveredId: this.selection.hoveredEntityId,
        marqueeBox: this.selection.marqueeBox,
        showAIDebug: this.gameMode === GameMode.GAME ? false : this.showAIDebug,
        gizmoTool: this.gizmo.tool,
        terrainBrush: this.terrainBrush,
        propBrush: this.propBrush,
        cursorWorldPos,
        throwTrajectory,
      },
      showUIOverlays: this.showUIOverlays,
      showFPSMonitor: this.showFPSMonitor,
      fpsStats: this.fpsMonitor.getStats(),
    });
  }
}
