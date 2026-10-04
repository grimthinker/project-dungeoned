import * as THREE from 'three';
import { TerrainData } from '../../types';
import { createTerrainMaterial } from './TerrainMaterial';
import { createTerrainSkirtMaterial } from './TerrainSkirtMaterial';
import { TerrainSkirtGeometryBuilder } from './TerrainSkirtGeometryBuilder';
import { TerrainChunk } from './TerrainChunk';
import { disposeObject } from '../renderUtils';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';

export class TerrainSyncSystem {
  private chunks = new Map<string, TerrainChunk>();
  private globalSplatTexture: THREE.DataTexture | null = null;
  private rootGroup: THREE.Group | null = null;

  public createTerrainMesh(id: string, terrainComp: TerrainData): THREE.Group {
    this.rootGroup = new THREE.Group();
    this.rootGroup.userData.entityId = id;

    // Инициализация глобальной Splat-текстуры
    const splatRes = terrainComp.splatResolution || 512;
    this.globalSplatTexture = new THREE.DataTexture(
      terrainComp.splatData,
      splatRes,
      splatRes,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.globalSplatTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.globalSplatTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.globalSplatTexture.magFilter = THREE.LinearFilter;
    this.globalSplatTexture.minFilter = THREE.LinearFilter;
    this.globalSplatTexture.generateMipmaps = false;
    this.globalSplatTexture.needsUpdate = true;

    // Единый материал для всех чанков
    const terrainMat = createTerrainMaterial(this.globalSplatTexture, terrainComp.textureTiling);

    // Генерация сетки чанков
    const chunksX = Math.ceil(terrainComp.width / TERRAIN_CONFIG.chunkSize);
    const chunksZ = Math.ceil(terrainComp.depth / TERRAIN_CONFIG.chunkSize);

    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const chunkId = `${cx}_${cz}`;
        const chunk = new TerrainChunk(
          chunkId,
          cx,
          cz,
          terrainMat,
          terrainComp.width,
          terrainComp.depth
        );
        chunk.syncGeometry(terrainComp.heights, terrainComp.resolution, terrainComp.width);

        this.chunks.set(chunkId, chunk);
        this.rootGroup.add(chunk.mesh);
      }
    }

    // Создаем процедурную юбку горизонта
    const skirtGeo = TerrainSkirtGeometryBuilder.buildGeometry(terrainComp);
    const skirtMat = createTerrainSkirtMaterial();
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.receiveShadow = true;
    skirtMesh.userData.isTerrainSkirt = true;
    this.rootGroup.add(skirtMesh);

    terrainComp.isGeometryDirty = false;
    terrainComp.isSplatDirty = false;

    return this.rootGroup;
  }

  public clear(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();

    if (this.globalSplatTexture) {
      this.globalSplatTexture.dispose();
      this.globalSplatTexture = null;
    }
    this.rootGroup = null;
  }

  public syncTerrain(obj: THREE.Object3D, terrainComp: TerrainData): void {
    if (terrainComp.isGeometryDirty) {
      if (!terrainComp.dirtyChunks) terrainComp.dirtyChunks = new Set<string>();

      // Если список затронутых чанков пуст (Undo/Redo или загрузка мира) — обновляем все чанки
      const chunksToUpdate =
        terrainComp.dirtyChunks.size > 0 ? terrainComp.dirtyChunks : this.chunks.keys();

      for (const chunkId of chunksToUpdate) {
        const chunk = this.chunks.get(chunkId);
        if (chunk) {
          chunk.syncGeometry(terrainComp.heights, terrainComp.resolution, terrainComp.width);
        }
      }

      const skirtMesh = obj.children.find((c) => c.userData.isTerrainSkirt) as THREE.Mesh;
      if (skirtMesh && skirtMesh.geometry) {
        TerrainSkirtGeometryBuilder.updateEdgeHeights(skirtMesh.geometry, terrainComp);
      }

      terrainComp.isGeometryDirty = false;
    }

    if (terrainComp.isSplatDirty && this.globalSplatTexture) {
      this.globalSplatTexture.needsUpdate = true;
      terrainComp.isSplatDirty = false;
    }
  }

  public disposeTerrain(obj: THREE.Object3D): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();

    if (this.globalSplatTexture) {
      this.globalSplatTexture.dispose();
      this.globalSplatTexture = null;
    }

    const skirtMesh = obj.children.find((c) => c.userData.isTerrainSkirt) as THREE.Mesh;
    if (skirtMesh) {
      skirtMesh.geometry?.dispose();
      if (Array.isArray(skirtMesh.material)) {
        skirtMesh.material.forEach((m) => m.dispose());
      } else if (skirtMesh.material) {
        skirtMesh.material.dispose();
      }
    }

    disposeObject(obj);
  }
}
