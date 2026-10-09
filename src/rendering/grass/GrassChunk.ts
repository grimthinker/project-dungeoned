import * as THREE from 'three';
import { GRASS_VARIANTS, FoliageVariant } from './GrassVariants';
import {
  TerrainComponent,
  getTerrainHeightAt,
  getTerrainNormalAt,
} from '../../ecs/components/terrain';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';
import {
  OUTLINE_OCCLUDER_LAYER,
  registerOutlineOccluderMesh,
  unregisterOutlineOccluderMesh,
} from '../outlineMask';

type InstanceBuckets = Record<FoliageVariant, THREE.Matrix4[]>;

/** Соль вариации LOD: отдельная от соли прореживания (1) и выбора варианта (2) */
const LOD_HASH_SEED = 12;

function fastHash(x: number, y: number, seed: number): number {
  // Классический GLSL псевдослучайный генератор (не подвержен переполнению разрядности JS)
  const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 137.719) * 43758.5453123;
  return h - Math.floor(h);
}

/**
 * Плавная доля перехода к упрощенной геометрии по дистанции до камеры:
 * 0 — полная геометрия и полная плотность, 1 — только упрощенная и разреженная.
 */
function lodBlendFactor(distance: number): number {
  const { blendStartDistance: start, blendEndDistance: end } = GRASS_CONFIG.lod;
  const t = Math.min(1, Math.max(0, (distance - start) / Math.max(0.001, end - start)));
  return t * t * (3 - 2 * t);
}

function createBuckets(): InstanceBuckets {
  return {
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
}

export class GrassChunk {
  /** Инстансы в полной геометрии (ближняя зона) */
  public meshes = new Map<FoliageVariant, THREE.InstancedMesh>();
  /** Инстансы в упрощенной геометрии (дальняя зона) */
  public lowMeshes = new Map<FoliageVariant, THREE.InstancedMesh>();
  private dummy = new THREE.Object3D();
  /** Позиция камеры, под которой чанк был собран (для отслеживания устаревания LOD) */
  private buildCamX = 0;
  private buildCamZ = 0;
  /** true — чанк целиком вне полосы перехода LOD, его картинка от камеры не зависит */
  private cameraIndependent = true;

  constructor(
    public readonly id: string,
    public readonly cx: number,
    public readonly cz: number,
    private scene: THREE.Scene,
    private material: THREE.Material,
    private geometries: Record<FoliageVariant, THREE.BufferGeometry>,
    private lowGeometries: Record<FoliageVariant, THREE.BufferGeometry>,
    private occluderMaterial: THREE.Material
  ) {}

  /**
   * Регистрирует меш как окклюдер контуров: на время прохода окклюдеров его
   * материал подменяется на дешёвый depth-вариант (общий вершинный код сохраняется,
   * но освещение и запись цвета в маску не нужны).
   */
  private registerAsOccluder(mesh: THREE.Mesh): void {
    mesh.layers.enable(OUTLINE_OCCLUDER_LAYER);
    registerOutlineOccluderMesh(mesh, this.material, this.occluderMaterial);
  }

  /**
   * Нужно ли пересобирать чанк. Пересборка требуется только когда чанк пересекает
   * полосу перехода LOD (вход/выход из неё) или камера заметно сдвинулась внутри
   * неё — иначе картинка «застыла» бы и деградация отставала от камеры.
   */
  public needsRebuild(camX: number, camZ: number, cameraIndependent: boolean): boolean {
    if (this.cameraIndependent !== cameraIndependent) return true;
    if (cameraIndependent) return false;
    return (
      Math.hypot(camX - this.buildCamX, camZ - this.buildCamZ) >= GRASS_CONFIG.lod.rebuildDistance
    );
  }

  /**
   * Пересобирает чанк травы.
   *
   * LOD и плотность считаются ПО ИНСТАНСУ по дистанции до `camX/camZ` (для
   * чанков вне полосы перехода туда подставляется заведомо дальняя точка, см.
   * `GrassSyncSystem.resolveLodCamera`), поэтому соседние чанки не отличаются
   * друг от друга и швов по границам чанков не возникает.
   */
  public build(
    terrain: TerrainComponent,
    densityFactor: number,
    camX: number,
    camZ: number,
    cameraIndependent: boolean
  ): void {
    this.dispose();
    this.buildCamX = camX;
    this.buildCamZ = camZ;
    this.cameraIndependent = cameraIndependent;

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

    const instances = createBuckets();
    const lowInstances = createBuckets();

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

        // Плавная деградация геометрии по дистанции (доля LOD)
        const lodT = lodBlendFactor(Math.hypot(wx - camX, wz - camZ));

        /**
         * БАЗОВАЯ плотность — порог по splatmap, без участия камеры.
         *
         * Дистанционное разрежение отсюда убрано намеренно: раньше порог
         * домножался на densityMultiplier и сравнивался бинарно, из-за чего
         * инстанс либо жил, либо мгновенно исчезал (видимо как «щелчок»).
         * Теперь плавная часть считается в вершинном шейдере, где порог
         * сравнивается с псевдослучайным числом через smoothstep, и травинка
         * сжимается до нуля постепенно.
         *
         * Базовый порог остаётся здесь потому, что он отражает СОСТАВ
         * территории (растимость из splatmap) и не зависит от камеры: значит
         * чанк с неизменной базой можно перестать пересобирать из-за плотности.
         */
        const hProb = fastHash(gridX, gridZ, 1) * 255;
        if (hProb > Math.min(255, totalDensity * safeDensity)) continue;

        const terrainY = getTerrainHeightAt(terrain, wx, wz);
        if (terrainY === null) continue;

        const terrainNorm = getTerrainNormalAt(terrain, wx, wz);
        if (terrainNorm.y < 0.75) continue; // На отвесных склонах не растет

        const jitterX = (fastHash(gridX, gridZ, 3) - 0.5) * cellSize * 0.85;
        const jitterZ = (fastHash(gridX, gridZ, 4) - 0.5) * cellSize * 0.85;
        const finalX = wx + jitterX;
        const finalZ = wz + jitterZ;

        const rotX = (fastHash(gridX, gridZ, 5) - 0.5) * 0.1;
        const rotY = fastHash(gridX, gridZ, 6) * Math.PI * 2;
        const rotZ = (fastHash(gridX, gridZ, 7) - 0.5) * 0.1;

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

        // Stochastic LOD: у каждого инстанса свой собственный порог перехода,
        // поэтому в полосе перехода полная и упрощенная геометрия перемешаны
        // на уровне отдельных травинок, а не разделены по чанкам
        const buckets = fastHash(gridX, gridZ, LOD_HASH_SEED) < lodT ? lowInstances : instances;
        buckets[variant].push(this.dummy.matrix.clone());
      }
    }

    this.createMeshes(instances, this.geometries, this.meshes);
    this.createMeshes(lowInstances, this.lowGeometries, this.lowMeshes);
  }

  /** Создает инстанс-меши для одного набора геометрий (полной или упрощенной) */
  private createMeshes(
    buckets: InstanceBuckets,
    geometries: Record<FoliageVariant, THREE.BufferGeometry>,
    target: Map<FoliageVariant, THREE.InstancedMesh>
  ): void {
    for (const variant of GRASS_VARIANTS) {
      const matrices = buckets[variant];
      const count = matrices.length;
      if (count === 0) continue;

      const mesh = new THREE.InstancedMesh(geometries[variant], this.material, count);
      mesh.userData.isGrassMesh = true;
      mesh.userData.isSharedAsset = true;
      mesh.receiveShadow = true;
      // Окклюдер контуров: трава перед объектом должна скрывать его контур
      this.registerAsOccluder(mesh);
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, matrices[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      target.set(variant, mesh);
    }
  }

  public dispose(): void {
    this.disposeMeshes(this.meshes);
    this.disposeMeshes(this.lowMeshes);
  }

  private disposeMeshes(meshes: Map<FoliageVariant, THREE.InstancedMesh>): void {
    for (const mesh of meshes.values()) {
      this.scene.remove(mesh);
      unregisterOutlineOccluderMesh(mesh);
      mesh.dispose();
    }
    meshes.clear();
  }
}
