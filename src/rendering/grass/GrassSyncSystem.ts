import * as THREE from 'three';
import { TerrainComponent } from '../../ecs/components/terrain';
import { GrassGeometryBuilder } from './GrassGeometryBuilder';
import {
  createGrassMaterial,
  createGrassOccluderMaterial,
  createGrassUniforms,
  GrassMaterialUniforms,
} from './GrassMaterial';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';
import { TrampleStamp, TrampleTextureManager } from './TrampleTextureManager';
import { GrassChunk } from './GrassChunk';
import { GRASS_VARIANTS, FoliageVariant } from './GrassVariants';

export class GrassSyncSystem {
  private scene: THREE.Scene;
  private renderer?: THREE.WebGLRenderer;
  private trampleManager: TrampleTextureManager;
  private grassUniforms: GrassMaterialUniforms;
  private grassMaterial: THREE.MeshStandardMaterial;
  /** Дешёвый depth-вариант травы для прохода окклюдеров контуров */
  private grassOccluderMaterial: THREE.MeshBasicMaterial;

  private geometries: Record<FoliageVariant, THREE.BufferGeometry>;
  private lowGeometries: Record<FoliageVariant, THREE.BufferGeometry>;
  private chunks: Map<string, GrassChunk> = new Map();
  /**
   * Пересборки чанков, отложенные по бюджету кадра (сборка чанка — это несколько
   * мс CPU, а на небольшой карте в полосе перехода LOD лежит почти вся видимая
   * трава). Размазываются по кадрам: визуально незаметно, потому что у соседних
   * инстансов одинаковый вид, а кадровое время не проседает.
   */
  private pendingRebuilds: {
    chunk: GrassChunk;
    terrain: TerrainComponent;
    lodCamX: number;
    lodCamZ: number;
    cameraIndependent: boolean;
    priority: number;
  }[] = [];

  public densityFactor: number = GRASS_CONFIG.defaultDensityFactor;
  public fadeStartDistance: number = GRASS_CONFIG.fade.fadeStartDistance;
  public fadeEndDistance: number = GRASS_CONFIG.fade.fadeEndDistance;
  private readonly RENDER_RADIUS: number = GRASS_CONFIG.fade.renderRadius;
  private lastScanCamX = 0;
  private lastScanCamZ = 0;
  private hasScanned = false;

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

    // Упрощенная геометрия дальнего LOD: своя для каждого вида растительности,
    // с теми же высотой и палитрой, поэтому подмена не читается на экране
    this.lowGeometries = {} as Record<FoliageVariant, THREE.BufferGeometry>;
    for (const variant of GRASS_VARIANTS) {
      this.lowGeometries[variant] = GrassGeometryBuilder.createLowDetailGeometry(variant);
    }

    // Оба материала травы (основной и depth-окклюдер) работают на одном наборе
    // uniform-ов, поэтому ветер/приминание/затухание обновляются один раз в кадр
    this.grassUniforms = createGrassUniforms();
    this.grassMaterial = createGrassMaterial(this.grassUniforms);
    this.grassOccluderMaterial = createGrassOccluderMaterial(this.grassUniforms);
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

    const uniforms = this.grassUniforms;
    uniforms.uTime.value += dt;
    uniforms.uCameraPos.value.set(camX, 0, camZ);
    uniforms.uFadeStart.value = this.fadeStartDistance;
    uniforms.uFadeEnd.value = this.fadeEndDistance;

    if (this.renderer) {
      this.trampleManager.update(this.renderer, dt, trampleStamps, camX, camZ);

      uniforms.uTrampleMap.value = this.trampleManager.getTexture();
      uniforms.uTrampleCenter.value.copy(this.trampleManager.center);
      uniforms.uTrampleSize.value = this.trampleManager.mapSize;
    }

    // Стримминг чанков травы на базе RENDER_RADIUS
    // Троттлинг: перескани чанков выполняется только при смещении камеры дальше
    // rescanDistance или при изменении рельефа/флоры (остальные случаи idle-дешевые)
    const camMoved =
      !this.hasScanned ||
      Math.hypot(camX - this.lastScanCamX, camZ - this.lastScanCamZ) >=
        GRASS_CONFIG.lod.rescanDistance;
    const mustRescan =
      camMoved ||
      this.chunks.size === 0 ||
      Boolean(terrainComp.isFoliageDirty) ||
      Boolean(terrainComp.isGeometryDirty);

    if (mustRescan) {
      this.rescanChunks(terrainComp, camX, camZ);
    }

    // Отложенные пересборки тратят бюджет кадра и выполняются даже без перескана
    // (иначе очередь не доберётся, пока камера стоит на месте)
    this.flushPendingRebuilds(terrainComp);
  }

  /**
   * Полный перебор чанков травы в радиусе RENDER_RADIUS: создание новых,
   * пересборка измененных рельефом и постановка в очередь тех, у которых устарел
   * LOD. Вызывается только при заметном смещении камеры или правке рельефа/флоры.
   */
  private rescanChunks(terrainComp: TerrainComponent, camX: number, camZ: number): void {
    this.lastScanCamX = camX;
    this.lastScanCamZ = camZ;
    this.hasScanned = true;

    const size = TERRAIN_CONFIG.chunkSize;
    const halfW = terrainComp.width / 2;
    const halfD = terrainComp.depth / 2;

    const minCX = Math.floor((camX - this.RENDER_RADIUS + halfW) / size);
    const maxCX = Math.floor((camX + this.RENDER_RADIUS + halfW) / size);
    const minCZ = Math.floor((camZ - this.RENDER_RADIUS + halfD) / size);
    const maxCZ = Math.floor((camZ + this.RENDER_RADIUS + halfD) / size);

    const activeIds = new Set<string>();
    const { blendStartDistance, blendEndDistance } = GRASS_CONFIG.lod;
    const bandCenter = (blendStartDistance + blendEndDistance) * 0.5;
    // Новый перескани полностью переопределяет очередь: он только что обошел
    // все активные чанки, поэтому ничего не теряется
    this.pendingRebuilds = [];

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
          Boolean(terrainComp.dirtyChunks?.has(chunkId)) ||
          Boolean(terrainComp.isFoliageDirty) ||
          Boolean(terrainComp.isGeometryDirty);

        // LOD и плотность считаются по дистанции до точки отсчета lodCam, а не по
        // центру чанка: так переход к упрощенной геометрии идет по кольцу, а не
        // по границам чанков (32 м), и швов не видно
        const distToChunk = Math.hypot(chunkCenterX - camX, chunkCenterZ - camZ);
        const { lodCamX, lodCamZ, cameraIndependent } = GrassSyncSystem.resolveLodCamera(
          chunkCenterX,
          chunkCenterZ,
          camX,
          camZ,
          size,
          distToChunk
        );

        let chunk = this.chunks.get(chunkId);
        if (!chunk) {
          chunk = new GrassChunk(
            chunkId,
            cx,
            cz,
            this.scene,
            this.grassMaterial,
            this.geometries,
            this.lowGeometries,
            this.grassOccluderMaterial
          );
          chunk.build(terrainComp, this.densityFactor, lodCamX, lodCamZ, cameraIndependent);
          this.chunks.set(chunkId, chunk);
        } else if (mustRebuild) {
          // Правка рельефа/флоры видна сразу — такие пересборки не откладываем
          chunk.build(terrainComp, this.densityFactor, lodCamX, lodCamZ, cameraIndependent);
        } else if (chunk.needsRebuild(camX, camZ, cameraIndependent)) {
          this.pendingRebuilds.push({
            chunk,
            terrain: terrainComp,
            lodCamX,
            lodCamZ,
            cameraIndependent,
            // Сначала пересобираем чанки, ближайшие к середине полосы перехода:
            // там разница между полной и упрощенной геометрией заметнее всего
            priority: Math.abs(distToChunk - bandCenter),
          });
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

  /**
   * Выполняет отложенные пересборки в пределах бюджета на кадр. Чанки, успевшие
   * выйти из зоны видимости или сменить террейн, из очереди выбрасываются:
   * пересборка уже удаленного чанка вернула бы его меши в сцену.
   */
  private flushPendingRebuilds(terrainComp: TerrainComponent): void {
    if (this.pendingRebuilds.length === 0) return;

    this.pendingRebuilds = this.pendingRebuilds.filter(
      (job) => job.terrain === terrainComp && this.chunks.get(job.chunk.id) === job.chunk
    );
    // Ближние к середине полосы перехода чанки обновляем первыми
    this.pendingRebuilds.sort((a, b) => a.priority - b.priority);

    let budget = GRASS_CONFIG.lod.rebuildBudgetPerFrame;
    while (this.pendingRebuilds.length > 0 && budget > 0) {
      const job = this.pendingRebuilds.shift()!;
      job.chunk.build(
        terrainComp,
        this.densityFactor,
        job.lodCamX,
        job.lodCamZ,
        job.cameraIndependent
      );
      budget--;
    }
  }

  /**
   * Точка отсчета, относительно которой чанк считает LOD и плотность инстансов.
   *
   * Для чанков, целиком лежащих по одну сторону полосы перехода LOD, подставляется
   * заведомо удаленная точка: их картинка от реальной камеры не зависит, поэтому
   * такой чанк не пересобирается при движении камеры (иначе пришлось бы пересобирать
   * все ~20 чанков вокруг игрока). Это самая частая оптимизация по времени CPU:
   * пересобираются только 3-4 чанка, реально пересекающие кольцо перехода.
   */
  private static resolveLodCamera(
    centerX: number,
    centerZ: number,
    camX: number,
    camZ: number,
    size: number,
    distToChunk: number
  ): { lodCamX: number; lodCamZ: number; cameraIndependent: boolean } {
    const halfDiag = size * Math.SQRT1_2;
    const { blendStartDistance: start, blendEndDistance: end } = GRASS_CONFIG.lod;

    if (distToChunk + halfDiag <= start) {
      // Весь чанк ближе начала полосы: все инстансы гарантированно полные
      return {
        lodCamX: centerX - (start + halfDiag + 1),
        lodCamZ: centerZ,
        cameraIndependent: true,
      };
    }

    if (distToChunk - halfDiag >= end) {
      // Весь чанк за концом полосы: все инстансы гарантированно упрощенные
      const dx = camX - centerX;
      const dz = camZ - centerZ;
      const len = Math.hypot(dx, dz) || 1;
      const offset = end + halfDiag + 1;
      return {
        lodCamX: centerX - (dx / len) * offset,
        lodCamZ: centerZ - (dz / len) * offset,
        cameraIndependent: true,
      };
    }

    // Чанк пересекает полосу перехода: считаем LOD по реальной камере
    return { lodCamX: camX, lodCamZ: camZ, cameraIndependent: false };
  }

  public clear(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.pendingRebuilds = [];
    this.hasScanned = false;
    this.trampleManager.clear(this.renderer);
  }

  public destroy(): void {
    this.clear();
    for (const geo of Object.values(this.geometries)) {
      geo.dispose();
    }
    for (const geo of Object.values(this.lowGeometries)) {
      geo.dispose();
    }
    this.grassMaterial.dispose();
    this.grassOccluderMaterial.dispose();
    this.trampleManager.destroy();
  }
}
