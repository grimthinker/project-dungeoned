import * as THREE from 'three';
import { FoliageVariant } from './GrassSyncSystem';
import {
  TerrainComponent,
  getTerrainHeightAt,
  getTerrainNormalAt,
} from '../../ecs/components/terrain';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';

function fastHash(x: number, y: number, seed: number): number {
  // Классический GLSL псевдослучайный генератор (не подвержен переполнению разрядности JS)
  const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 137.719) * 43758.5453123;
  return h - Math.floor(h);
}

export class GrassChunk {
  public meshes = new Map<FoliageVariant, THREE.InstancedMesh>();
  private dummy = new THREE.Object3D();

  constructor(
    public readonly id: string,
    public readonly cx: number,
    public readonly cz: number,
    private scene: THREE.Scene,
    private material: THREE.Material,
    private geometries: Record<FoliageVariant, THREE.BufferGeometry>
  ) {}

  public build(terrain: TerrainComponent, densityFactor: number): void {
    this.dispose();

    const size = TERRAIN_CONFIG.chunkSize;
    const halfW = terrain.width / 2;
    const halfD = terrain.depth / 2;

    // Мировые координаты границ чанка
    const startX = this.cx * size - halfW;
    const startZ = this.cz * size - halfD;
    const endX = startX + size;
    const endZ = startZ + size;
    const cellSize = 0.4;

    const safeDensity = Math.max(0, Math.min(1, densityFactor));

    const instances: Record<FoliageVariant, THREE.Matrix4[]> = {
      grass3: [],
      grass4: [],
      grass5: [],
      wheat: [],
      reeds: [],
      dryGrass: [],
      flowerRed: [],
      flowerBlue: [],
      flowerWhite: [],
      flowerYellow: [],
    };

    const splatRes = terrain.splatResolution || 512;

    for (let wx = startX; wx < endX; wx += cellSize) {
      for (let wz = startZ; wz < endZ; wz += cellSize) {
        // Ограничение по глобальным границам карты
        if (wx < -halfW || wx > halfW || wz < -halfD || wz > halfD) continue;

        const u = (wx + halfW) / terrain.width;
        const v = (wz + halfD) / terrain.depth;
        const px = Math.min(splatRes - 1, Math.max(0, Math.floor(u * splatRes)));
        const pz = Math.min(splatRes - 1, Math.max(0, Math.floor(v * splatRes)));
        const fIdx = (pz * splatRes + px) * 5;

        const dGrass = terrain.foliageData[fIdx + 0];
        const dWheat = terrain.foliageData[fIdx + 1];
        const dReeds = terrain.foliageData[fIdx + 2];
        const dDryGrass = terrain.foliageData[fIdx + 3];
        const dFlowers = terrain.foliageData[fIdx + 4];

        const totalDensity = dGrass + dWheat + dReeds + dDryGrass + dFlowers;
        if (totalDensity < GRASS_CONFIG.densityThreshold) continue;

        const gridX = Math.round(wx / cellSize);
        const gridZ = Math.round(wz / cellSize);

        // Вероятностная фильтрация плотности: равномерно оценивает каждую ячейку без обрыва по осям
        const hProb = fastHash(gridX, gridZ, 1) * 255;
        if (hProb > Math.min(255, totalDensity * safeDensity)) continue;

        const terrainY = getTerrainHeightAt(terrain, wx, wz);
        if (terrainY === null) continue;

        const terrainNorm = getTerrainNormalAt(terrain, wx, wz);
        if (terrainNorm.y < 0.75) continue; // На отвесных склонах не растет

        const choiceRoll = fastHash(gridX, gridZ, 2) * totalDensity;
        let variant: FoliageVariant = 'grass3';

        if (choiceRoll < dWheat) variant = 'wheat';
        else if (choiceRoll < dWheat + dReeds) variant = 'reeds';
        else if (choiceRoll < dWheat + dReeds + dDryGrass) variant = 'dryGrass';
        else if (choiceRoll < dWheat + dReeds + dDryGrass + dFlowers) {
          const flowerRoll = fastHash(gridX, gridZ, 10);
          if (flowerRoll < 0.25) variant = 'flowerRed';
          else if (flowerRoll < 0.5) variant = 'flowerBlue';
          else if (flowerRoll < 0.75) variant = 'flowerWhite';
          else variant = 'flowerYellow';
        } else {
          const grassRoll = fastHash(gridX, gridZ, 11);
          if (grassRoll < 0.55) variant = 'grass3';
          else if (grassRoll < 0.85) variant = 'grass4';
          else variant = 'grass5';
        }

        const jitterX = (fastHash(gridX, gridZ, 3) - 0.5) * cellSize * 0.85;
        const jitterZ = (fastHash(gridX, gridZ, 4) - 0.5) * cellSize * 0.85;
        const finalX = wx + jitterX;
        const finalZ = wz + jitterZ;

        const rotX = (fastHash(gridX, gridZ, 5) - 0.5) * 0.1;
        const rotY = fastHash(gridX, gridZ, 6) * Math.PI * 2;
        const rotZ = (fastHash(gridX, gridZ, 7) - 0.5) * 0.1;

        let baseScale = 0.75 + fastHash(gridX, gridZ, 8) * 0.5;
        if (variant === 'wheat' || variant === 'reeds') baseScale *= 1.25;

        this.dummy.position.set(finalX, terrainY, finalZ);
        this.dummy.rotation.set(rotX, rotY, rotZ);
        this.dummy.scale.set(
          baseScale,
          baseScale * (0.85 + fastHash(gridX, gridZ, 9) * 0.3),
          baseScale
        );
        this.dummy.updateMatrix();

        instances[variant].push(this.dummy.matrix.clone());
      }
    }

    // Создание инстанс-мешей для чанка
    for (const vKey of Object.keys(instances)) {
      const variant = vKey as FoliageVariant;
      const count = instances[variant].length;
      if (count > 0) {
        const mesh = new THREE.InstancedMesh(this.geometries[variant], this.material, count);
        mesh.userData.isGrassMesh = true;
        mesh.userData.isSharedAsset = true;
        mesh.receiveShadow = true;
        for (let i = 0; i < count; i++) {
          mesh.setMatrixAt(i, instances[variant][i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.meshes.set(variant, mesh);
      }
    }
  }

  public dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
  }
}
