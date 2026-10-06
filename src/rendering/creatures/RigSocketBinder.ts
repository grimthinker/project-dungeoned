import * as THREE from 'three';
import { RigAnimatorState } from './CreatureMeshAssembler';
import { GripTransform } from '../gripCalculators';
import { disposeObject } from '../renderUtils';

export interface SocketItemBinding {
  rigSocketName: string;
  itemId: string | null;
}

export class RigSocketBinder {
  private tempScale = new THREE.Vector3();

  /**
   * Синхронизирует прикрепление предметов из ячеек взаимодействия (оружие, мячи и т.д.)
   * к костям сокетов скелетного рига существа (LeftHandSocket, RightHandSocket, JawsSocket и др.)
   */
  public syncCreatureSockets(
    creatureId: string,
    animState: RigAnimatorState,
    bindings: SocketItemBinding[],
    meshes: Map<string, THREE.Object3D>,
    scene: THREE.Scene,
    isEntityActive?: (id: string) => boolean
  ): void {
    for (const info of bindings) {
      if (!info.rigSocketName) continue;

      const socketBone =
        animState.socketBones.get(info.rigSocketName) ||
        animState.rig.getObjectByName(info.rigSocketName);

      if (!socketBone) continue;

      if (info.itemId) {
        const itemObj = meshes.get(info.itemId);

        // Удаляем из кости все посторонние меши (если предмет был заменен или сброшен)
        for (let c = socketBone.children.length - 1; c >= 0; c--) {
          const child = socketBone.children[c];
          if (child !== itemObj) {
            socketBone.remove(child);
            const entId = child.userData.entityId;
            if (entId && isEntityActive?.(entId)) {
              scene.add(child);
            } else {
              disposeObject(child);
            }
          }
        }

        // Прикрепляем актуальный предмет к кости с учетом точки хвата
        if (itemObj) {
          if (itemObj.parent !== socketBone) {
            socketBone.add(itemObj);
          }

          // Компенсируем искажение предмета при изменении роста/масштаба самого существа
          socketBone.getWorldScale(this.tempScale);
          const sx = this.tempScale.x !== 0 ? 1 / this.tempScale.x : 1;
          const sy = this.tempScale.y !== 0 ? 1 / this.tempScale.y : 1;
          const sz = this.tempScale.z !== 0 ? 1 / this.tempScale.z : 1;
          itemObj.scale.set(sx, sy, sz);

          const grip = itemObj.userData.gripTransform as GripTransform | undefined;
          if (grip) {
            itemObj.position.copy(grip.position);
            itemObj.quaternion.copy(grip.quaternion);
          } else {
            itemObj.position.set(0, 0, 0);
            itemObj.rotation.set(0, 0, 0);
          }
        }
      } else {
        // Если ячейка пуста — полностью освобождаем сокет кости
        while (socketBone.children.length > 0) {
          const child = socketBone.children[0];
          socketBone.remove(child);
          const entId = child.userData.entityId;
          if (entId && isEntityActive?.(entId)) {
            scene.add(child);
          } else {
            disposeObject(child);
          }
        }
      }
    }
  }

  /**
   * Прикрепляет экипированную броню, плащи или рюкзаки к соответствующим частям тела (например, на спину Torso).
   */
  public syncTorsoEquip(
    animState: RigAnimatorState,
    equippedTorsoItemIds: string[],
    meshes: Map<string, THREE.Object3D>,
    scene: THREE.Scene,
    isEntityActive?: (id: string) => boolean
  ): void {
    const torsoBone = animState.rig.getObjectByName('Torso');
    if (!torsoBone) return;

    for (const itemId of equippedTorsoItemIds) {
      const itemObj = meshes.get(itemId);
      if (itemObj) {
        if (itemObj.parent !== torsoBone) {
          torsoBone.add(itemObj);
        }
        // Компенсируем искажение предмета при изменении роста/масштаба самого существа
        torsoBone.getWorldScale(this.tempScale);
        const sx = this.tempScale.x !== 0 ? 1 / this.tempScale.x : 1;
        const sy = this.tempScale.y !== 0 ? 1 / this.tempScale.y : 1;
        const sz = this.tempScale.z !== 0 ? 1 / this.tempScale.z : 1;
        itemObj.scale.set(sx, sy, sz);

        itemObj.position.set(0, 0, -0.22);
        itemObj.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0));
      }
    }
  }
}
