import * as THREE from 'three';
import { TerrainData } from '../../types';
import { createTerrainMaterial } from './TerrainMaterial';
import { createTerrainSkirtMaterial } from './TerrainSkirtMaterial';
import { TerrainSkirtGeometryBuilder } from './TerrainSkirtGeometryBuilder';
import { TerrainChunk, CHUNK_SHADOW_MARGIN } from './TerrainChunk';
import { disposeObject } from '../renderUtils';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { OUTLINE_OCCLUDER_LAYER } from '../outlineMask';

export class TerrainSyncSystem {
  private chunks = new Map<string, TerrainChunk>();
  private globalSplatTexture: THREE.DataTexture | null = null;
  private rootGroup: THREE.Group | null = null;

  /** Прошлый фокус, для которого уже пересчитывались тени чанков */
  private lastShadowFocusX = Number.NaN;
  private lastShadowFocusZ = Number.NaN;
  private lastShadowBounds = -1;

  /**
   * Отбрасывает тени у чанков рельефа, которые заведомо вне теневой камеры.
   *
   * ЗАЧЕМ. При взгляде сверху в кадр попадают сотни чанков, и каждый из них —
   * отдельный draw call в проходе карты теней, хотя лежащие за пределами
   * охвата тени они всё равно не могут дать: ортографическая камера их не видит.
   * Отсечение по расстоянию ничего не меняет в картинке.
   *
   * Пересчёт идёт не каждый кадр, а по тем же порогам, что и сама карта теней
   * (движение фокуса либо интервал кадров), иначе на сотнях чанков получился бы
   * новый источник затрат на CPU.
   */
  public updateChunkShadowCasting(focusX: number, focusZ: number, bounds: number): void {
    if (!GRAPHICS_CONFIG.shadows.enabled) return;

    const moved =
      !Number.isFinite(this.lastShadowFocusX) ||
      Math.abs(focusX - this.lastShadowFocusX) > 1.0 ||
      Math.abs(focusZ - this.lastShadowFocusZ) > 1.0 ||
      bounds !== this.lastShadowBounds;

    if (!moved) return;

    this.lastShadowFocusX = focusX;
    this.lastShadowFocusZ = focusZ;
    this.lastShadowBounds = bounds;

    // Запас на половину диагонали чанка: иначе у края охвата тени чанк
    // «мигнул бы» туда-обратно при движении камеры
    const limit = bounds + CHUNK_SHADOW_MARGIN;
    const limitSq = limit * limit;

    for (const chunk of this.chunks.values()) {
      const dx = chunk.worldX - focusX;
      const dz = chunk.worldZ - focusZ;
      const shouldCast = dx * dx + dz * dz <= limitSq;
      if (chunk.mesh.castShadow !== shouldCast) {
        chunk.mesh.castShadow = shouldCast;
      }
    }
  }

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

    // Новый набор чанков: состояние отсечения сброшено, чтобы первый же вызов
    // updateChunkShadowCasting пересчитал castShadow для всех
    this.resetShadowCulling();

    // Создаем процедурную юбку горизонта
    const skirtGeo = TerrainSkirtGeometryBuilder.buildGeometry(terrainComp);
    const skirtMat = createTerrainSkirtMaterial();
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.receiveShadow = true;
    skirtMesh.userData.isTerrainSkirt = true;
    // Юбка горизонта тоже перекрывает контуры объектов у края карты
    skirtMesh.layers.enable(OUTLINE_OCCLUDER_LAYER);
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
    this.resetShadowCulling();

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

  /** Сброс состояния отсечения: следующий вызов обязан пересчитать всё заново */
  private resetShadowCulling(): void {
    this.lastShadowFocusX = Number.NaN;
    this.lastShadowFocusZ = Number.NaN;
    this.lastShadowBounds = -1;
  }

  public disposeTerrain(obj: THREE.Object3D): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.resetShadowCulling();

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
