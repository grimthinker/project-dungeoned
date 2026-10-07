import * as THREE from 'three';

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!child.userData.isSharedAsset) {
        child.geometry?.dispose();
      }
      if (!child.userData.isSharedAsset && !child.userData.isSharedMaterial) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    }
  });
}
