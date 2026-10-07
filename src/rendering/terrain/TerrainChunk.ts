import * as THREE from 'three';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';
import { OUTLINE_OCCLUDER_LAYER } from '../outlineMask';

export class TerrainChunk {
  public mesh: THREE.Mesh;
  public geometry: THREE.PlaneGeometry;

  constructor(
    public readonly id: string,
    public readonly cx: number,
    public readonly cz: number,
    material: THREE.Material,
    globalWidth: number,
    globalDepth: number
  ) {
    const size = TERRAIN_CONFIG.chunkSize;
    this.geometry = new THREE.PlaneGeometry(size, size, size, size);
    this.geometry.rotateX(-Math.PI / 2);

    const posX = cx * size + size / 2 - globalWidth / 2;
    const posZ = cz * size + size / 2 - globalDepth / 2;

    // Расчет UV строго из глобальных мировых координат вершин
    // Устраняет инверсию V в Three.js PlaneGeometry и полностью убирает швы вдоль оси X
    const posAttr = this.geometry.attributes.position;
    const uvs = this.geometry.attributes.uv;

    for (let i = 0; i < uvs.count; i++) {
      const lx = posAttr.getX(i);
      const lz = posAttr.getZ(i);
      const wx = posX + lx;
      const wz = posZ + lz;

      const globalU = (wx + globalWidth / 2) / globalWidth;
      const globalV = 1.0 - (wz + globalDepth / 2) / globalDepth;

      uvs.setXY(i, globalU, globalV);
    }
    uvs.needsUpdate = true;

    this.mesh = new THREE.Mesh(this.geometry, material);

    // Сдвигаем меш в правильное мировое положение (центр чанка)
    this.mesh.position.set(posX, 0, posZ);

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.isTerrainMesh = true;
    this.mesh.userData.chunkId = id;

    // Рельеф перекрывает контуры в пост-процессе обводок, но сам контур не получает
    this.mesh.layers.enable(OUTLINE_OCCLUDER_LAYER);
  }

  public syncGeometry(heights: Float32Array, globalRes: number, globalWidth: number): void {
    const pos = this.geometry.attributes.position;
    const norm = this.geometry.attributes.normal;
    const size = TERRAIN_CONFIG.chunkSize;
    const startX = this.cx * size;
    const startZ = this.cz * size;
    const step = Math.max(0.1, globalWidth / (globalRes - 1));

    for (let z = 0; z <= size; z++) {
      for (let x = 0; x <= size; x++) {
        const localIdx = z * (size + 1) + x;
        const gx = startX + x;
        const gz = startZ + z;
        const globalIdx = gz * globalRes + gx;

        pos.setY(localIdx, heights[globalIdx] || 0);

        // Глобальный расчет нормалей для устранения швов освещения между чанками
        const hL = gx > 0 ? heights[gz * globalRes + (gx - 1)] : heights[globalIdx];
        const hR = gx < globalRes - 1 ? heights[gz * globalRes + (gx + 1)] : heights[globalIdx];
        const hD = gz > 0 ? heights[(gz - 1) * globalRes + gx] : heights[globalIdx];
        const hU = gz < globalRes - 1 ? heights[(gz + 1) * globalRes + gx] : heights[globalIdx];

        const dx = (hR - hL) / (2 * step);
        const dz = (hU - hD) / (2 * step);
        const len = Math.hypot(-dx, 1.0, -dz) || 1.0;

        norm.setXYZ(localIdx, -dx / len, 1.0 / len, -dz / len);
      }
    }

    pos.needsUpdate = true;
    norm.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
  }
}
