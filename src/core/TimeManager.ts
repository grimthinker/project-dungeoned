import { GameApp } from '../GameApp';
import { EventBus } from './EventBus';
import { GameMode } from '../config/gameConfig';

export class TimeManager {
  private lastTime: number = 0;
  private isRunning: boolean = false;
  public physicsAccumulator: number = 0;
  public readonly FIXED_DT: number = 1 / 60;
  private readonly MAX_ACCUMULATOR_DT: number = 0.2;

  private _isPaused: boolean = true;
  public get isPaused() {
    return this._isPaused;
  }
  public set isPaused(val: boolean) {
    if (this._isPaused === val) return;
    this._isPaused = val;
    this.app.emitState();
  }

  private _globalTimeScale: number = 1.0;
  public get globalTimeScale() {
    return this._globalTimeScale;
  }
  public set globalTimeScale(val: number) {
    if (this._globalTimeScale === val) return;
    this._globalTimeScale = val;
    this.app.emitState();
  }

  constructor(private app: GameApp) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  public stop(): void {
    this.isRunning = false;
  }

  private loop(time: number): void {
    if (!this.isRunning) return;

    const realDt = Math.min(this.MAX_ACCUMULATOR_DT, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.app.fpsMonitor.update(realDt);

    if (!this.isPaused) {
      const simulatedDt = realDt * this.globalTimeScale;
      this.physicsAccumulator += simulatedDt;

      while (this.physicsAccumulator >= this.FIXED_DT) {
        this.app.simulation.fixedUpdate(this.FIXED_DT);
        this.physicsAccumulator -= this.FIXED_DT;
      }

      this.app.simulation.syncDynamicBodiesToTransforms();

      if (this.app.gameMode === GameMode.GAME) {
        const playerId = this.app.getPlayerEntityId();
        if (!playerId) {
          EventBus.emit('game:playerDied');
        }
      }
    } else {
      this.physicsAccumulator = 0;

      if (this.app.simulation.isPhysicsStructureDirty) {
        this.app.simulation.syncPhysicsStructures();
      }
    }

    this.app.updateBTData(false);

    // Синхронизация ручных изменений трансформаций (из UI/Gizmo) с физическим движком (даже на паузе)
    this.app.simulation.physics.syncDirtyTransforms(this.app.world);

    // Плавное подтягивание позиции, поворота, наклона и зума камеры на каждом кадре
    this.app.camera.update(realDt, this.app.gameMode === GameMode.GAME);

    // Плавная синхронизация Three.js сцены и миксеров анимаций по честному времени кадра рендера
    const renderDt = this.isPaused ? realDt : realDt * this.globalTimeScale;
    this.app.simulation.threeSyncSystem.update(
      renderDt,
      this.app.world,
      this.app.gameMode,
      this.app.selection.selectedEntityIds,
      this.app.celShading,
      this.app.camera.targetX,
      this.app.camera.targetZ,
      this.physicsAccumulator,
      this.FIXED_DT
    );

    this.app.renderFrame();

    // Очистка грязных чанков террейна после отработки всех систем
    const terrains = this.app.world.getEntitiesWith('terrain');
    for (const [, { terrain }] of terrains) {
      if (terrain.dirtyChunks && terrain.dirtyChunks.size > 0) {
        terrain.dirtyChunks.clear();
      }
    }

    if (this.app.onFrame) this.app.onFrame();

    requestAnimationFrame((t) => this.loop(t));
  }
}
