import * as THREE from 'three';
import { TerrainComponent } from '../../ecs/components/terrain';
import { GrassGeometryBuilder } from './GrassGeometryBuilder';
import { createGrassMaterial } from './GrassMaterial';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';
import { TrampleStamp, TrampleTextureManager } from './TrampleTextureManager';
import { GrassChunk } from './GrassChunk';

export type FoliageVariant =
  | 'grass3'
  | 'grass4'
  | 'grass5'
  | 'wheat'
  | 'reeds'
  | 'dryGrass'
  | 'flowerRed'
  | 'flowerBlue'
  | 'flowerWhite'
  | 'flowerYellow';

export class GrassSyncSystem {
  private scene: THREE.Scene;
  private renderer?: THREE.WebGLRenderer;
  private trampleManager: TrampleTextureManager;
  private grassMaterial: THREE.MeshStandardMaterial;

  private geometries: Record<FoliageVariant, THREE.BufferGeometry>;
  private chunks: Map<string, GrassChunk> = new Map();

  public densityFactor: number = GRASS_CONFIG.defaultDensityFactor;
  public fadeStartDistance: number = GRASS_CONFIG.fade.fadeStartDistance;
  public fadeEndDistance: number = GRASS_CONFIG.fade.fadeEndDistance;
  private readonly RENDER_RADIUS: number = GRASS_CONFIG.fade.renderRadius;

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.trampleManager = new TrampleTextureManager(256);

    this.geometries = {
      grass3: GrassGeometryBuilder.createClusterGeometry({
        bladeCount: 3,
        height: GRASS_CONFIG.heights.blade3,
      }),
      grass4: GrassGeometryBuilder.createClusterGeometry({
        bladeCount: 4,
        height: GRASS_CONFIG.heights.blade4,
      }),
      grass5: GrassGeometryBuilder.createClusterGeometry({
        bladeCount: 5,
        height: GRASS_CONFIG.heights.blade5,
      }),
      wheat: GrassGeometryBuilder.createWheatGeometry(),
      reeds: GrassGeometryBuilder.createReedsGeometry(),
      dryGrass: GrassGeometryBuilder.createDryGrassGeometry(),
      flowerRed: GrassGeometryBuilder.createFlowerGeometry('poppy'),
      flowerBlue: GrassGeometryBuilder.createFlowerGeometry('cornflower'),
      flowerWhite: GrassGeometryBuilder.createFlowerGeometry('daisy'),
      flowerYellow: GrassGeometryBuilder.createFlowerGeometry('dandelion'),
    };

    this.grassMaterial = createGrassMaterial();
  }

  public update(
    dt: number,
    trampleStamps: TrampleStamp[],
    terrainComp?: TerrainComponent,
    camX: number = 0,
    camZ: number = 0
  ): void {
    if (!terrainComp || !terrainComp.foliageData) {
      this.clear();
      return;
    }

    const shader = this.grassMaterial.userData.shader;
    if (shader) {
      if (shader.uniforms.uTime) shader.uniforms.uTime.value += dt;
      if (shader.uniforms.uCameraPos) shader.uniforms.uCameraPos.value.set(camX, 0, camZ);
      if (shader.uniforms.uFadeStart) shader.uniforms.uFadeStart.value = this.fadeStartDistance;
      if (shader.uniforms.uFadeEnd) shader.uniforms.uFadeEnd.value = this.fadeEndDistance;
    }

    if (this.renderer) {
      this.trampleManager.update(this.renderer, dt, trampleStamps, camX, camZ);

      if (shader) {
        if (shader.uniforms.uTrampleMap)
          shader.uniforms.uTrampleMap.value = this.trampleManager.getTexture();
        if (shader.uniforms.uTrampleCenter)
          shader.uniforms.uTrampleCenter.value.copy(this.trampleManager.center);
        if (shader.uniforms.uTrampleSize)
          shader.uniforms.uTrampleSize.value = this.trampleManager.mapSize;
      }
    }

    // Стримминг чанков травы на базе RENDER_RADIUS
    const size = TERRAIN_CONFIG.chunkSize;
    const halfW = terrainComp.width / 2;
    const halfD = terrainComp.depth / 2;

    const minCX = Math.floor((camX - this.RENDER_RADIUS + halfW) / size);
    const maxCX = Math.floor((camX + this.RENDER_RADIUS + halfW) / size);
    const minCZ = Math.floor((camZ - this.RENDER_RADIUS + halfD) / size);
    const maxCZ = Math.floor((camZ + this.RENDER_RADIUS + halfD) / size);

    const activeIds = new Set<string>();

    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        // Проверка, что чанк физически пересекается с радиусом обзора (круг, а не квадрат)
        const chunkCenterX = cx * size + size / 2 - halfW;
        const chunkCenterZ = cz * size + size / 2 - halfD;
        if (Math.hypot(chunkCenterX - camX, chunkCenterZ - camZ) > this.RENDER_RADIUS + size) {
          continue;
        }

        const chunkId = `${cx}_${cz}`;
        activeIds.add(chunkId);

        const mustRebuild =
          terrainComp.dirtyChunks.has(chunkId) ||
          terrainComp.isFoliageDirty ||
          terrainComp.isGeometryDirty;

        let chunk = this.chunks.get(chunkId);
        if (!chunk) {
          chunk = new GrassChunk(chunkId, cx, cz, this.scene, this.grassMaterial, this.geometries);
          chunk.build(terrainComp, this.densityFactor);
          this.chunks.set(chunkId, chunk);
        } else if (mustRebuild) {
          chunk.build(terrainComp, this.densityFactor);
        }
      }
    }

    if (terrainComp.isFoliageDirty) {
      terrainComp.isFoliageDirty = false;
    }

    // Удаление чанков, вышедших из зоны видимости (Distance Culling)
    for (const [id, chunk] of this.chunks.entries()) {
      if (!activeIds.has(id)) {
        chunk.dispose();
        this.chunks.delete(id);
      }
    }
  }

  public clear(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.trampleManager.clear(this.renderer);
  }

  public destroy(): void {
    this.clear();
    for (const geo of Object.values(this.geometries)) {
      geo.dispose();
    }
    this.grassMaterial.dispose();
    this.trampleManager.destroy();
  }
}
