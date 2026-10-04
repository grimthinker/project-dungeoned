import { ICommand } from '../ICommand';
import { ICommandContext } from '../../core/contexts';

export class TerrainModifyCommand implements ICommand {
  constructor(
    public readonly description: string,
    private ctx: ICommandContext,
    private entityId: string,
    private beforeHeights: Float32Array,
    private afterHeights: Float32Array,
    private beforeSplat: Uint8Array,
    private afterSplat: Uint8Array,
    private beforeFoliage?: Uint8Array,
    private afterFoliage?: Uint8Array
  ) {}

  public execute(): void {
    this.applyState(this.afterHeights, this.afterSplat, this.afterFoliage);
  }

  public undo(): void {
    this.applyState(this.beforeHeights, this.beforeSplat, this.beforeFoliage);
  }

  private applyState(heights: Float32Array, splatData: Uint8Array, foliageData?: Uint8Array): void {
    const comp = this.ctx.world.getComponent(this.entityId, 'terrain');
    if (comp) {
      comp.heights.set(heights);
      comp.splatData.set(splatData);
      if (foliageData && comp.foliageData) {
        comp.foliageData.set(foliageData);
        comp.isFoliageDirty = true;
        comp.foliageVersion = (comp.foliageVersion ?? 0) + 1;
      }

      if (comp.dirtyChunks) {
        comp.dirtyChunks.clear();
      }

      comp.isGeometryDirty = true;
      comp.isSplatDirty = true;
      comp.isPhysicsDirty = true;
      comp.geometryVersion = (comp.geometryVersion ?? 0) + 1;
      comp.splatVersion = (comp.splatVersion ?? 0) + 1;

      this.ctx.syncPhysicsStructures();
    }
  }
}
