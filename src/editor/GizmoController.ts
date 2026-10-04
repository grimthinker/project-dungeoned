import * as THREE from 'three';
import { TransactionBuilder } from '../history/TransactionBuilder';
import { GizmoTool } from '../types';
import { EventBus } from '../core/EventBus';
import { Radians } from '../types';
import type { IGizmoContext } from '../core/contexts';

export class GizmoController {
  public tool: GizmoTool = 'translate';
  private tx: TransactionBuilder | null = null;
  private _isDragging: boolean = false;

  private initialTransforms = new Map<
    string,
    { pos: THREE.Vector3; rot: THREE.Quaternion; angle: number }
  >();
  private anchorInitialPos = new THREE.Vector3();
  private anchorInitialRot = new THREE.Quaternion();

  constructor(private ctx: IGizmoContext) {
    EventBus.on('gizmo:dragging-changed', ({ isDragging }) => {
      this._isDragging = isDragging;
      if (isDragging) {
        const selectedIds = Array.from(this.ctx.selection.selectedEntityIds);
        if (selectedIds.length > 0) {
          this.tx = new TransactionBuilder(this.ctx, 'Трансформация');
          this.tx.captureBefore(selectedIds);

          const primaryId = this.ctx.selection.selectedEntityId;
          this.initialTransforms.clear();

          for (const id of selectedIds) {
            const t = this.ctx.world.getComponent(id, 'transform');
            if (t) {
              const pos = new THREE.Vector3(t.x, t.y, t.z);
              const rot = new THREE.Quaternion(
                t.rotation.x,
                t.rotation.y,
                t.rotation.z,
                t.rotation.w
              );
              this.initialTransforms.set(id, { pos, rot, angle: t.angle });

              if (id === primaryId) {
                this.anchorInitialPos.copy(pos);
                this.anchorInitialRot.copy(rot);
              }
            }
          }
        }
      } else {
        if (this.tx) {
          this.tx.commit();
          this.tx = null;
        }
      }
    });

    EventBus.on('gizmo:drag-update', ({ id, position, quaternion }) => {
      if (!this._isDragging) return;

      const primaryInit = this.initialTransforms.get(id);
      if (!primaryInit) return;

      const deltaPos = new THREE.Vector3().subVectors(position, primaryInit.pos);
      const q = new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      const deltaRot = new THREE.Quaternion().copy(primaryInit.rot).invert().premultiply(q);

      for (const [entId, initData] of this.initialTransforms.entries()) {
        const t = this.ctx.world.getComponent(entId, 'transform');
        if (!t) continue;

        let newPos = new THREE.Vector3().copy(initData.pos);
        let newRot = new THREE.Quaternion().copy(initData.rot);

        if (this.tool === 'translate') {
          newPos.add(deltaPos);
        } else if (this.tool === 'rotate') {
          const offset = new THREE.Vector3().copy(initData.pos).sub(this.anchorInitialPos);
          offset.applyQuaternion(deltaRot);
          newPos.copy(this.anchorInitialPos).add(offset);
          newRot.premultiply(deltaRot);
        }

        t.x = newPos.x;
        t.y = newPos.y;
        t.z = newPos.z;
        t.rotation = { x: newRot.x, y: newRot.y, z: newRot.z, w: newRot.w };

        const siny_cosp = 2 * (newRot.w * newRot.y + newRot.x * newRot.z);
        const cosy_cosp = 1 - 2 * (newRot.y * newRot.y + newRot.z * newRot.z);
        t.angle = Math.atan2(siny_cosp, cosy_cosp) as Radians;

        t.isDirty = true; // Маркируем для безопасного применения в PhysicsSystem
      }
      this.ctx.syncPhysicsStructures();
    });
  }

  public setTool(tool: GizmoTool): void {
    this.tool = tool;
  }

  public isDragging(): boolean {
    return this._isDragging;
  }

  public cancelDrag(revert: boolean = false): void {
    if (revert && this._isDragging) {
      for (const [entId, initData] of this.initialTransforms.entries()) {
        const t = this.ctx.world.getComponent(entId, 'transform');
        if (t) {
          t.x = initData.pos.x;
          t.y = initData.pos.y;
          t.z = initData.pos.z;
          t.rotation = {
            x: initData.rot.x,
            y: initData.rot.y,
            z: initData.rot.z,
            w: initData.rot.w,
          };
          t.angle = initData.angle as Radians;
          t.isDirty = true;
        }
      }
      this.ctx.syncPhysicsStructures();
    }
  }
}
