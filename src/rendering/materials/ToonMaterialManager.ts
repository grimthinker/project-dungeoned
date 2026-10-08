import * as THREE from 'three';

export class ToonMaterialManager {
  private static instance: ToonMaterialManager;
  private gradientMap: THREE.CanvasTexture;
  private toonCache = new Map<THREE.Material, THREE.MeshToonMaterial>();

  private constructor() {
    this.gradientMap = this.createGradientMap();
  }

  public static getInstance(): ToonMaterialManager {
    if (!ToonMaterialManager.instance) {
      ToonMaterialManager.instance = new ToonMaterialManager();
    }
    return ToonMaterialManager.instance;
  }

  /**
   * Создает 3-ступенчатую текстуру квантования света:
   * 0..33% — плотная тень, 34..66% — полутень, 67..100% — освещенная грань.
   *
   * Первая ступень намеренно тусклая (50, а не 100): она применяется и к
   * граням, повёрнутым ОТ солнца (NdotL < 0), потому что координата градиента
   * зажимается в 0. С яркой первой ступенью затенённые стороны получали ~39%
   * солнечного света, и на них становился виден шум карты теней: квантование
   * превращало его колебания в ~3-кратный скачок яркости, то есть в полосы.
   * С тусклой ступенью затенённые стороны уходят на рассеянный свет (HemisphereLight),
   * и полосы теряют контраст.
   */
  private createGradientMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;

    const toneSteps = [50, 165, 255];
    toneSteps.forEach((val, i) => {
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      ctx.fillRect(i, 0, 1, 1);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    return texture;
  }

  public getOrCreateToonMaterial(original: THREE.Material): THREE.Material {
    if (original instanceof THREE.MeshToonMaterial) {
      return original;
    }
    if (this.toonCache.has(original)) {
      return this.toonCache.get(original)!;
    }

    const origAny = original as any;
    const toonMat = new THREE.MeshToonMaterial({
      color: origAny.color ? origAny.color.clone() : new THREE.Color(0xffffff),
      map: origAny.map || null,
      normalMap: origAny.normalMap || null,
      gradientMap: this.gradientMap,
      transparent: origAny.transparent ?? false,
      opacity: origAny.opacity ?? 1.0,
      alphaTest: origAny.alphaTest ?? 0,
      side: origAny.side ?? THREE.FrontSide,
      vertexColors: origAny.vertexColors ?? false,
      wireframe: origAny.wireframe ?? false,
    });

    if (origAny.flatShading) {
      (toonMat as any).flatShading = true;
    }

    toonMat.userData.isSharedMaterial = true;
    this.toonCache.set(original, toonMat);
    return toonMat;
  }

  public applyToon(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isSkyDome &&
        !child.userData.isTerrainMesh &&
        !child.userData.isTerrainSkirt &&
        !child.userData.isGrassMesh &&
        !child.userData.isWaterMesh
      ) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        const orig = child.userData.originalMaterial;
        if (Array.isArray(orig)) {
          child.material = orig.map((m) => this.getOrCreateToonMaterial(m));
        } else {
          child.material = this.getOrCreateToonMaterial(orig);
        }
      }
    });
  }

  public restoreOriginal(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
        delete child.userData.originalMaterial;
      }
    });
  }

  public clear(): void {
    for (const toonMat of this.toonCache.values()) {
      toonMat.dispose();
    }
    this.toonCache.clear();
    this.gradientMap.dispose();
  }
}
