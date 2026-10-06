import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  IRenderer,
  RenderContext,
  EntityOverlayDTO,
  ItemTooltipDTO,
  AIDebugDTO,
} from './IRenderer';
import { Camera } from '../Camera';
import { EnvironmentManager } from './environment/EnvironmentManager';
import { Point, Vec3 } from '../types';
import { EventBus } from '../core/EventBus';
import { GlobalInput } from '../input/GlobalInput';
import { EDITOR_CONFIG } from '../config/editorConfig';
import { AI_DEBUG_CONFIG } from '../config/aiDebugConfig';
import { IModelPreview } from './IModelPreview';
import { ThreeModelPreview } from './ThreeModelPreview';
import { TERRAIN_CONFIG } from '../config/terrainConfig';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig';

const DASH_THROW_TRAJECTORY = [5, 5];
const DASH_EMPTY: number[] = [];

const DEFAULT_ENV_FALLBACK = {
  timeOfDay: 12.0,
  dayDuration: 600,
  azimuth: 0,
  axialTilt: 0.41,
  fogDensity: 0.0012,
  ambientIntensity: 0.65,
  sunIntensityMultiplier: 1.0,
  hemiSkyColor: '#c8dcff',
  hemiGroundColor: '#5c4a38',
};

export class ThreeRenderer implements IRenderer {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private uiCanvas: HTMLCanvasElement;
  private uiCtx: CanvasRenderingContext2D;
  private fpsCanvas: HTMLCanvasElement;
  private fpsCtx: CanvasRenderingContext2D;

  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public transformControl: TransformControls;
  public environmentManager: EnvironmentManager;
  private isDraggingGizmo = false;
  private brushCursor: THREE.Mesh;
  private circleCursorGeo: THREE.BufferGeometry;
  private squareCursorGeo: THREE.BufferGeometry;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersectionPoint = new THREE.Vector3();
  private mouseNDC = new THREE.Vector2();
  private _pickableObjects: THREE.Object3D[] = [];
  private depthRenderTarget: THREE.WebGLRenderTarget | null = null;

  // --- Временные векторы для оптимизации (Scratch vectors) ---
  private _tempV1 = new THREE.Vector3();
  private _tempV2 = new THREE.Vector3();
  private _tempV3 = new THREE.Vector3();
  private _tempV4 = new THREE.Vector3();
  private _camPos = new THREE.Vector3();
  private _camDir = new THREE.Vector3();

  constructor(container: HTMLDivElement) {
    this.container = container;

    // Глобальная настройка атмосферного тумана с отсечкой ближнего плана и ограничением максимальной дымки
    THREE.ShaderChunk.fog_fragment = `
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogDist = max(0.0, vFogDepth - ${TERRAIN_CONFIG.skirt.fogStartDistance.toFixed(1)});
        float ramp = 1.0 - exp(-fogDist * 0.006);
        float maxCap = clamp(fogDensity * 120.0, 0.08, 0.65);
        float fogFactor = ramp * maxCap;
      #else
        float fogDist = max(0.0, vFogDepth - fogNear);
        float fogFactor = clamp((fogDist / max(1.0, fogFar - fogNear)) * ${TERRAIN_CONFIG.skirt.maxFogCap.toFixed(2)}, 0.0, ${TERRAIN_CONFIG.skirt.maxFogCap.toFixed(2)});
      #endif
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    #endif
    `;

    // Создаем WebGL рендерер с включенными тенями PCFShadowMap
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';

    // Применение выбранного метода фильтрации при масштабировании (Render Scale)
    const filterMode = GRAPHICS_CONFIG.resolution.upscaleFilter;
    if (filterMode === 'pixelated') {
      this.canvas.style.imageRendering = 'pixelated';
    } else if (filterMode === 'crisp') {
      this.canvas.style.imageRendering = 'crisp-edges';
    } else {
      this.canvas.style.imageRendering = 'auto';
    }

    this.container.appendChild(this.canvas);

    // Создаем неинтерактивный 2D-холст для UI (имена, healthbar'ы) поверх WebGL
    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.style.display = 'block';
    this.uiCanvas.style.width = '100%';
    this.uiCanvas.style.height = '100%';
    this.uiCanvas.style.position = 'absolute';
    this.uiCanvas.style.top = '0';
    this.uiCanvas.style.left = '0';
    this.uiCanvas.style.pointerEvents = 'none'; // Мышь прокликивает на WebGL
    this.container.appendChild(this.uiCanvas);
    this.uiCtx = this.uiCanvas.getContext('2d')!;

    // Холст мониторинга FPS: компактная перетаскиваемая панель размером 160x72
    this.fpsCanvas = document.createElement('canvas');
    this.fpsCanvas.style.display = 'none';
    this.fpsCanvas.style.width = '160px';
    this.fpsCanvas.style.height = '72px';
    this.fpsCanvas.style.position = 'absolute';
    this.fpsCanvas.style.zIndex = '99999';
    this.fpsCanvas.style.cursor = 'grab';
    this.fpsCanvas.style.userSelect = 'none';
    this.fpsCanvas.style.pointerEvents = 'auto';
    this.fpsCanvas.title = 'Перетащите для перемещения панели';
    this.container.appendChild(this.fpsCanvas);
    this.fpsCtx = this.fpsCanvas.getContext('2d')!;

    this.initFpsDragListeners();

    // Инициализируем сцену
    this.scene = new THREE.Scene();

    // Настраиваем камеру из конфигурационного файла
    const camCfg = GRAPHICS_CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(camCfg.fov, 1, camCfg.near, camCfg.far);

    // Менеджер окружения (скайбокс, солнце, луна, звезды, тени и туман)
    this.environmentManager = new EnvironmentManager(this.scene);

    // Манипулятор TransformControls
    this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.transformControl.getHelper());

    this.transformControl.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean(event.value);
      this.isDraggingGizmo = isDragging;
      EventBus.emit('gizmo:dragging-changed', { isDragging });
    });

    this.transformControl.addEventListener('change', () => {
      if (this.isDraggingGizmo && this.transformControl.object) {
        const id = this.transformControl.object.userData.entityId;
        if (id) {
          EventBus.emit('gizmo:drag-update', {
            id,
            position: this.transformControl.object.position.clone(),
            quaternion: this.transformControl.object.quaternion.clone(),
          });
        }
      }
    });

    // 1. Геометрия круглого курсора (кольцо)
    this.circleCursorGeo = new THREE.RingGeometry(0.92, 1.0, 48);
    this.circleCursorGeo.rotateX(-Math.PI / 2);

    // 2. Геометрия квадратного курсора (полая квадратная рамка на плоскости XZ)
    const squareShape = new THREE.Shape();
    squareShape.moveTo(-1, -1);
    squareShape.lineTo(1, -1);
    squareShape.lineTo(1, 1);
    squareShape.lineTo(-1, 1);
    squareShape.closePath();

    const squareHole = new THREE.Path();
    const inEdge = 0.92;
    squareHole.moveTo(-inEdge, -inEdge);
    squareHole.lineTo(inEdge, -inEdge);
    squareHole.lineTo(inEdge, inEdge);
    squareHole.lineTo(-inEdge, inEdge);
    squareHole.closePath();
    squareShape.holes.push(squareHole);

    this.squareCursorGeo = new THREE.ShapeGeometry(squareShape);
    this.squareCursorGeo.rotateX(-Math.PI / 2);

    this.brushCursor = new THREE.Mesh(
      this.circleCursorGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf39c12,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    this.brushCursor.visible = false;
    this.scene.add(this.brushCursor);
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public screenToWorld(clientX: number, clientY: number, _camera: Camera): Vec3 {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);

    if (hit) {
      return { x: hit.x, y: 0, z: hit.z };
    }
    return { x: 0, y: 0, z: 0 };
  }

  public applySettings(): void {
    const camCfg = GRAPHICS_CONFIG.camera;
    if (this.camera.fov !== camCfg.fov) {
      this.camera.fov = camCfg.fov;
      this.camera.updateProjectionMatrix();
    }

    const filterMode = GRAPHICS_CONFIG.resolution.upscaleFilter;
    if (filterMode === 'pixelated') {
      this.canvas.style.imageRendering = 'pixelated';
    } else if (filterMode === 'crisp') {
      this.canvas.style.imageRendering = 'crisp-edges';
    } else {
      this.canvas.style.imageRendering = 'auto';
    }

    // Принудительный ресайз для применения нового Render Scale
    this.resize(this.container.clientWidth, this.container.clientHeight);
    this.environmentManager.applySettings();
  }

  public getScreenRay(clientX: number, clientY: number): { origin: Vec3; direction: Vec3 } {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;

    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    };
  }

  public projectToScreen(pos: Vec3): Vec3 | null {
    const vector = this._tempV1.set(pos.x, pos.y, pos.z);
    vector.project(this.camera);

    // Если объект за спиной камеры
    if (vector.z > 1.0) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-(vector.y * 0.5) + 0.5) * rect.height,
      z: vector.z,
    };
  }

  public createModelPreview(): IModelPreview {
    return new ThreeModelPreview();
  }

  public pickEntity(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    // Исключаем купол неба, террейн, траву, сетку и служебные объекты ДО вызова трассировки на CPU
    this._pickableObjects.length = 0;
    for (let i = 0; i < this.scene.children.length; i++) {
      const child = this.scene.children[i];
      if (
        child.userData.isSkyDome ||
        child.userData.isTerrainSkirt ||
        child.userData.isGrassMesh ||
        child.userData.entityId === 'environment' ||
        child instanceof THREE.GridHelper ||
        child === this.brushCursor ||
        child === this.transformControl.getHelper()
      ) {
        continue;
      }
      // Если это группа террейна с дочерним тяжелым мешем или юбкой (проверка без замыканий)
      if (child.children && child.children.length > 0) {
        let isTerrainGroup = false;
        for (let j = 0; j < child.children.length; j++) {
          const cData = child.children[j].userData;
          if (cData.isTerrainMesh || cData.isTerrainSkirt) {
            isTerrainGroup = true;
            break;
          }
        }
        if (isTerrainGroup) continue;
      }
      this._pickableObjects.push(child);
    }

    const intersects = this.raycaster.intersectObjects(this._pickableObjects, true);

    for (const hit of intersects) {
      if (hit.object.userData.isSelectionOutline || hit.object.userData.isTerrainSkirt) {
        continue;
      }
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (curr.userData && (curr.userData.partId || curr.userData.entityId)) {
          return curr.userData.partId || curr.userData.entityId;
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  // Состояние позиции и перетаскивания панели FPS
  private fpsPos: { x: number; y: number } = { x: -1, y: -1 };
  private isDraggingFps: boolean = false;
  private fpsDragStart = { mouseX: 0, mouseY: 0, startX: 0, startY: 0 };
  private onFpsMouseMoveHandler?: (e: MouseEvent) => void;
  private onFpsMouseUpHandler?: () => void;

  private initFpsDragListeners(): void {
    try {
      const saved = localStorage.getItem('engine_fps_monitor_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          this.fpsPos = { x: parsed.x, y: parsed.y };
        }
      }
    } catch {}

    this.fpsCanvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.isDraggingFps = true;
      this.fpsCanvas.style.cursor = 'grabbing';
      this.fpsDragStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: this.fpsPos.x,
        startY: this.fpsPos.y,
      };
    });

    this.onFpsMouseMoveHandler = (e: MouseEvent) => {
      if (!this.isDraggingFps) return;
      e.preventDefault();
      const dx = e.clientX - this.fpsDragStart.mouseX;
      const dy = e.clientY - this.fpsDragStart.mouseY;

      const maxW = Math.max(0, this.container.clientWidth - 160);
      const maxH = Math.max(0, this.container.clientHeight - 72);

      const newX = Math.max(0, Math.min(maxW, this.fpsDragStart.startX + dx));
      const newY = Math.max(0, Math.min(maxH, this.fpsDragStart.startY + dy));

      this.fpsPos.x = newX;
      this.fpsPos.y = newY;
      this.fpsCanvas.style.left = `${newX}px`;
      this.fpsCanvas.style.top = `${newY}px`;
    };

    this.onFpsMouseUpHandler = () => {
      if (this.isDraggingFps) {
        this.isDraggingFps = false;
        this.fpsCanvas.style.cursor = 'grab';
        try {
          localStorage.setItem('engine_fps_monitor_pos', JSON.stringify(this.fpsPos));
        } catch {}
      }
    };

    window.addEventListener('mousemove', this.onFpsMouseMoveHandler);
    window.addEventListener('mouseup', this.onFpsMouseUpHandler);
  }

  public resize(width: number, height: number): void {
    // Расчет эффективного разрешения рендера (Render Scale & HiDPI)
    const resCfg = GRAPHICS_CONFIG.resolution;
    const baseRatio = resCfg.useDevicePixelRatio
      ? Math.min(window.devicePixelRatio || 1.0, resCfg.maxPixelRatio)
      : 1.0;
    const effectivePixelRatio = baseRatio * resCfg.scale;

    this.renderer.setPixelRatio(effectivePixelRatio);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // 2D UI холст строго равен размерам контейнера в CSS-пикселях (1:1 с мышью и текстом)
    this.uiCanvas.width = width;
    this.uiCanvas.height = height;

    // Холст FPS имеет фиксированный размер 160x72 с поддержкой HiDPI
    const dpr = Math.min(window.devicePixelRatio || 1.0, 2.0);
    this.fpsCanvas.width = Math.round(160 * dpr);
    this.fpsCanvas.height = Math.round(72 * dpr);

    // Удержание панели FPS в пределах видимой области экрана при изменении окна
    const maxW = Math.max(0, width - 160);
    const maxH = Math.max(0, height - 72);

    if (this.fpsPos.x < 0) {
      this.fpsPos.x = Math.max(0, width - 160 - 12);
      this.fpsPos.y = 12;
    } else {
      this.fpsPos.x = Math.max(0, Math.min(maxW, this.fpsPos.x));
      this.fpsPos.y = Math.max(0, Math.min(maxH, this.fpsPos.y));
    }

    this.fpsCanvas.style.left = `${this.fpsPos.x}px`;
    this.fpsCanvas.style.top = `${this.fpsPos.y}px`;
  }
  public destroy(): void {
    if (this.onFpsMouseMoveHandler) {
      window.removeEventListener('mousemove', this.onFpsMouseMoveHandler);
    }
    if (this.onFpsMouseUpHandler) {
      window.removeEventListener('mouseup', this.onFpsMouseUpHandler);
    }

    if (this.circleCursorGeo) this.circleCursorGeo.dispose();
    if (this.squareCursorGeo) this.squareCursorGeo.dispose();

    if (this.depthRenderTarget) {
      this.depthRenderTarget.dispose();
      if (this.depthRenderTarget.depthTexture) {
        this.depthRenderTarget.depthTexture.dispose();
      }
      this.depthRenderTarget = null;
    }
    if (this.environmentManager) {
      this.environmentManager.destroy();
    }
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    }
    this.renderer.dispose();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.uiCanvas && this.uiCanvas.parentNode) {
      this.uiCanvas.parentNode.removeChild(this.uiCanvas);
    }
    if (this.fpsCanvas && this.fpsCanvas.parentNode) {
      this.fpsCanvas.parentNode.removeChild(this.fpsCanvas);
    }
    if (this.transformControl) {
      this.transformControl.dispose();
    }
  }

  public render(context: RenderContext): void {
    const internalW = this.canvas.width;
    const internalH = this.canvas.height;
    const scale = context.camera.scale;

    // Точка фокуса берется напрямую из 3D-камеры в мировых координатах
    const centerX = context.camera.targetX;
    const centerY = context.camera.targetY;
    const centerZ = context.camera.targetZ;

    // Сферические координаты орбиты в метрах
    const dist = Math.max(4, 18 / scale);
    const camY = centerY + dist * Math.sin(context.camera.pitch);
    const groundDist = dist * Math.cos(context.camera.pitch);

    const camX = centerX + groundDist * Math.sin(context.camera.yaw);
    const camZ = centerZ + groundDist * Math.cos(context.camera.yaw);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(centerX, centerY, centerZ);

    // ВАЖНО: Принудительное обновление матриц камеры для корректной работы Frustum Culling
    this.camera.updateMatrixWorld();

    // Синхронизация манипулятора
    if (
      context.gameMode === 'editor' &&
      context.editorData.selectedId &&
      context.editorData.gizmoTool &&
      context.editorData.gizmoTool !== 'select'
    ) {
      let mesh: THREE.Object3D | undefined;
      for (let i = 0; i < this.scene.children.length; i++) {
        if (this.scene.children[i].userData.entityId === context.editorData.selectedId) {
          mesh = this.scene.children[i];
          break;
        }
      }
      const isOwned = Boolean(context.editorData.isSelectedOwned);

      if (mesh && !isOwned) {
        if (this.transformControl.object !== mesh) {
          this.transformControl.attach(mesh);
        }
        if (this.transformControl.getMode() !== context.editorData.gizmoTool) {
          this.transformControl.setMode(context.editorData.gizmoTool);
        }

        // Синхронизируем положение гизмо с актуальной матрицей меша
        mesh.updateMatrixWorld();

        // Привязка к сетке через Shift
        if (GlobalInput.keys.has('shift')) {
          this.transformControl.setTranslationSnap(EDITOR_CONFIG.gridSnapSize);
          this.transformControl.setRotationSnap(EDITOR_CONFIG.angleSnapStep);
        } else {
          this.transformControl.setTranslationSnap(null);
          this.transformControl.setRotationSnap(null);
        }
      } else {
        this.transformControl.detach();
      }
    } else {
      this.transformControl.detach();
    }

    // Отрисовка 3D-курсора кистей (Ландшафт и Флора)
    const tBrush = context.editorData.terrainBrush;
    const pBrush = context.editorData.propBrush;
    const cursorWorldPos = context.editorData.cursorWorldPos;

    if (cursorWorldPos && (tBrush?.active || pBrush?.active)) {
      this.brushCursor.visible = true;
      this.brushCursor.position.set(cursorWorldPos.x, cursorWorldPos.y + 0.1, cursorWorldPos.z);

      const isProp = Boolean(pBrush?.active);
      const activeBrush = isProp ? pBrush! : tBrush!;
      const r = activeBrush.radius;
      this.brushCursor.scale.set(r, r, r);

      // Переключение геометрии: Круг / Квадрат
      const isSquare = activeBrush.shape === 'square';
      const targetGeo = isSquare ? this.squareCursorGeo : this.circleCursorGeo;
      if (this.brushCursor.geometry !== targetGeo) {
        this.brushCursor.geometry = targetGeo;
      }

      // Поворот квадрата на заданный угол вокруг вертикальной оси Y
      const rotAngleRad = isSquare ? (-(activeBrush.rotation || 0) * Math.PI) / 180 : 0;
      this.brushCursor.rotation.set(0, rotAngleRad, 0);

      // Определение цвета курсора
      let brushColorHex = 0xf39c12;
      if (isProp) {
        if (pBrush!.mode === 'erase') {
          brushColorHex = 0xe74c3c; // Красный (Ластик объектов)
        } else {
          brushColorHex = 0x9b59b6; // Фиолетовый (Посадка объектов)
        }
      } else {
        const bTool = tBrush!.tool;
        if (bTool === 'paint')
          brushColorHex = 0x3498db; // Текстура грунта (синий)
        else if (bTool === 'foliage')
          brushColorHex = 0x2ecc71; // Посадка травы (зеленый)
        else if (bTool === 'clear_foliage') brushColorHex = 0xe74c3c; // Очистка травы (красный)
      }

      (this.brushCursor.material as THREE.MeshBasicMaterial).color.setHex(brushColorHex);
    } else {
      this.brushCursor.visible = false;
    }

    // Синхронизация небесного купола, положения светил, теней и тумана
    const env = context.environment ?? DEFAULT_ENV_FALLBACK;

    const visibleRadius = dist * GRAPHICS_CONFIG.shadows.frustumMargin;

    this.environmentManager.setVisibility(context.gameMode !== 'menu');
    this.scene.background = context.gameMode === 'menu' ? new THREE.Color('#111111') : null;
    this.environmentManager.update(
      this.scene,
      this.camera,
      { x: centerX, y: centerY, z: centerZ },
      env,
      visibleRadius
    );

    // --- 1. ПРЕДВАРИТЕЛЬНЫЙ ПРОХОД ГЛУБИНЫ ДЛЯ ВОДЫ (SHORELINE FOAM & DEPTH EXTINCTION) ---
    const waterMeshes: THREE.Object3D[] = [];
    for (let i = 0; i < this.scene.children.length; i++) {
      const child = this.scene.children[i];
      if (child.userData.isWater || child.userData.isWaterMesh) {
        if (child.visible) {
          waterMeshes.push(child);
        }
      }
    }

    // Проверка видимости воды в пирамиде камеры (Frustum Culling)
    let hasVisibleWater = false;
    if (waterMeshes.length > 0) {
      const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      );
      const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreenMatrix);

      for (let i = 0; i < waterMeshes.length; i++) {
        const box = new THREE.Box3().setFromObject(waterMeshes[i]);
        if (frustum.intersectsBox(box)) {
          hasVisibleWater = true;
          break;
        }
      }
    }

    // Оптимизация: проход глубины запускается ТОЛЬКО если вода реально видна на экране
    if (hasVisibleWater) {
      // Половинное разрешение для прохода глубины (сокращает нагрузку на GPU на 75%)
      const depthW = Math.max(1, Math.floor(internalW * 0.5));
      const depthH = Math.max(1, Math.floor(internalH * 0.5));

      if (!this.depthRenderTarget) {
        this.depthRenderTarget = new THREE.WebGLRenderTarget(depthW, depthH, {
          depthTexture: new THREE.DepthTexture(depthW, depthH),
          depthBuffer: true,
          format: THREE.RGBAFormat,
        });
      } else if (
        this.depthRenderTarget.width !== depthW ||
        this.depthRenderTarget.height !== depthH
      ) {
        this.depthRenderTarget.setSize(depthW, depthH);
      }

      // Скрываем воду перед проходом глубины
      for (let i = 0; i < waterMeshes.length; i++) {
        waterMeshes[i].visible = false;
      }

      // Исключаем траву, юбку горизонта (горы вдали не могут быть под водой), манипулятор и курсор
      const hiddenMeshes: THREE.Object3D[] = [];
      this.scene.traverse((child) => {
        if ((child.userData.isGrassMesh || child.userData.isTerrainSkirt) && child.visible) {
          hiddenMeshes.push(child);
          child.visible = false;
        }
      });

      const prevGizmoVis = this.transformControl.getHelper().visible;
      const prevBrushVis = this.brushCursor.visible;
      this.transformControl.getHelper().visible = false;
      this.brushCursor.visible = false;

      // Рендерим только рельеф, камни и персонажей в буфер глубины
      this.renderer.setRenderTarget(this.depthRenderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      // Восстанавливаем видимость объектов
      this.transformControl.getHelper().visible = prevGizmoVis;
      this.brushCursor.visible = prevBrushVis;
      for (let i = 0; i < hiddenMeshes.length; i++) {
        hiddenMeshes[i].visible = true;
      }
      for (let i = 0; i < waterMeshes.length; i++) {
        waterMeshes[i].visible = true;
      }

      // Передаем текстуру глубины сцены в материалы воды
      const depthTex = this.depthRenderTarget.depthTexture;
      for (let i = 0; i < waterMeshes.length; i++) {
        waterMeshes[i].traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            child.material &&
            (child.material as any).uniforms?.tDepth
          ) {
            const u = (child.material as any).uniforms;
            u.tDepth.value = depthTex;
            u.uCameraNear.value = this.camera.near;
            u.uCameraFar.value = this.camera.far;
            u.uResolution.value.set(internalW, internalH);
          }
        });
      }
    }

    // --- 2. ФИНАЛЬНЫЙ РЕНДЕР СЦЕНЫ С ВОДОЙ И ТЕНЯМИ НА ЭКРАН ---
    this.renderer.render(this.scene, this.camera);

    // --- Отрисовка 2D UI поверх 3D сцены (полная гарантированная очистка всего холста) ---
    this.uiCtx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);

    if (context.showUIOverlays && context.uiOverlays) {
      this.renderUIOverlays(context.uiOverlays);
    }
    if (context.hoveredItemTooltip) {
      this.renderItemTooltip(context.hoveredItemTooltip);
    }
    if (context.editorData.marqueeBox) {
      this.renderScreenMarqueeBox(context.editorData.marqueeBox);
    }
    if (context.editorData.showAIDebug && context.gameMode !== 'game' && context.aiDebugData) {
      this.renderAIDebug(context.aiDebugData);
    }
    if (context.editorData.throwTrajectory) {
      this.renderThrowTrajectory(context.editorData.throwTrajectory);
    }

    const shouldShowFPS =
      context.gameMode === 'game'
        ? Boolean(GRAPHICS_CONFIG.showGameFPSMonitor)
        : Boolean(context.showFPSMonitor && context.gameMode !== 'menu');

    if (shouldShowFPS && context.fpsStats) {
      this.renderFPSMonitor(context.fpsStats, context.gameMode);
    } else {
      this.fpsCtx.clearRect(0, 0, this.fpsCanvas.width, this.fpsCanvas.height);
    }
  }

  private renderFPSMonitor(stats: import('../core/FPSMonitor').FPSStats, _gameMode: string): void {
    if (this.fpsCanvas.style.display !== 'block') {
      this.fpsCanvas.style.display = 'block';
    }

    const boxW = 160;
    const boxH = 72;
    const dpr = Math.min(window.devicePixelRatio || 1.0, 2.0);

    const ctx = this.fpsCtx;
    ctx.clearRect(0, 0, this.fpsCanvas.width, this.fpsCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Фон контейнера
    ctx.fillStyle = 'rgba(8, 20, 14, 0.9)';
    ctx.fillRect(0, 0, boxW, boxH);

    // Рамка контейнера
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, boxW, boxH);

    // 2. Блок текстовых метрик
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Текущий FPS
    ctx.fillStyle = '#00ff66';
    ctx.fillText(`FPS: ${stats.current}`, 8, 6);

    // AVG и MIN FPS
    ctx.font = '10px monospace';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(`AVG: ${stats.avg.toFixed(1)}`, 74, 6);

    ctx.fillStyle = stats.min < 30 ? '#f87171' : '#6ee7b7';
    ctx.fillText(`MIN: ${stats.min.toFixed(1)}`, 74, 18);

    // 3. Область графика
    const graphX = 6;
    const graphY = 30;
    const graphW = boxW - 12;
    const graphH = boxH - 35;

    // Сетка графика
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridRows = 3;
    for (let i = 1; i <= gridRows; i++) {
      const gy = graphY + (graphH * i) / (gridRows + 1);
      ctx.moveTo(graphX, gy);
      ctx.lineTo(graphX + graphW, gy);
    }
    const gridCols = 5;
    for (let j = 1; j <= gridCols; j++) {
      const gx = graphX + (graphW * j) / (gridCols + 1);
      ctx.moveTo(gx, graphY);
      ctx.lineTo(gx, graphY + graphH);
    }
    ctx.stroke();

    // 4. Отрисовка кривой и полупрозрачной заливки
    const history = stats.history;
    if (history.length >= 2) {
      let maxVal = 60;
      for (let i = 0; i < history.length; i++) {
        if (history[i] > maxVal) maxVal = history[i];
      }
      maxVal = Math.ceil(maxVal * 1.12);

      const stepX = graphW / (history.length - 1);

      // Заливка под графиком градиентом
      ctx.beginPath();
      ctx.moveTo(graphX, graphY + graphH);

      for (let i = 0; i < history.length; i++) {
        const val = Math.min(maxVal, Math.max(0, history[i]));
        const ratio = val / maxVal;
        const px = graphX + i * stepX;
        const py = graphY + graphH - ratio * graphH;
        ctx.lineTo(px, py);
      }

      ctx.lineTo(graphX + graphW, graphY + graphH);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, graphY, 0, graphY + graphH);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Линия графика
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const val = Math.min(maxVal, Math.max(0, history[i]));
        const ratio = val / maxVal;
        const px = graphX + i * stepX;
        const py = graphY + graphH - ratio * graphH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderThrowTrajectory(trajectory: { points: Vec3[] }): void {
    const pts = trajectory.points;
    if (pts.length < 2) return;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      this.drawProjectedLine(
        p1.x,
        p1.y,
        p1.z,
        p2.x,
        p2.y,
        p2.z,
        'rgba(231, 76, 60, 0.8)',
        DASH_THROW_TRAJECTORY,
        2
      );
    }

    const last = pts[pts.length - 1];
    this.drawProjectedCircle(last.x, last.y, last.z, 0.4, '#e74c3c', DASH_EMPTY, 'Прицел', 0, 16);
  }

  private renderScreenMarqueeBox(box: { start: Point; current: Point }): void {
    const rect = this.canvas.getBoundingClientRect();
    const startX = box.start.x - rect.left;
    const startY = box.start.y - rect.top;
    const currentX = box.current.x - rect.left;
    const currentY = box.current.y - rect.top;

    const minX = Math.min(startX, currentX);
    const minY = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    this.uiCtx.save();
    this.uiCtx.fillStyle = 'rgba(52, 152, 219, 0.15)';
    this.uiCtx.strokeStyle = 'rgba(52, 152, 219, 0.85)';
    this.uiCtx.lineWidth = 1.5;
    this.uiCtx.setLineDash([5, 3]);
    this.uiCtx.fillRect(minX, minY, width, height);
    this.uiCtx.strokeRect(minX, minY, width, height);
    this.uiCtx.restore();
  }

  private renderUIOverlays(overlays: EntityOverlayDTO[]): void {
    const w = this.uiCanvas.width;
    const h = this.uiCanvas.height;

    for (const item of overlays) {
      const pos3D = this._tempV1.set(item.worldPos.x, item.worldPos.y + 0.3, item.worldPos.z);
      pos3D.project(this.camera);

      if (pos3D.z > 1) continue;

      const screenX = (pos3D.x * 0.5 + 0.5) * w;
      const screenY = (-(pos3D.y * 0.5) + 0.5) * h;

      this.uiCtx.save();
      this.uiCtx.globalAlpha = item.alpha;
      this.uiCtx.translate(screenX, screenY);

      if (item.isObstacle && item.hp !== undefined && item.maxHp !== undefined) {
        const barW = Math.max(30, item.radius * 30);
        const barH = 5;
        const hpRatio = Math.max(0, Math.min(1, item.maxHp > 0 ? item.hp / item.maxHp : 0));

        this.uiCtx.fillStyle = 'rgba(0,0,0,0.6)';
        this.uiCtx.fillRect(-barW / 2, -10, barW, barH);
        this.uiCtx.fillStyle = '#2ecc71';
        this.uiCtx.fillRect(-barW / 2, -10, barW * hpRatio, barH);
      }

      if (item.showName) {
        this.uiCtx.fillStyle = '#ffffff';
        this.uiCtx.font = '11px sans-serif';
        this.uiCtx.textAlign = 'center';
        this.uiCtx.textBaseline = 'bottom';
        this.uiCtx.fillText(item.name, 0, item.isObstacle && item.hp !== undefined ? -14 : -4);
      }

      this.uiCtx.restore();
    }
  }

  private renderItemTooltip(tooltip: ItemTooltipDTO): void {
    const meshHeight = Math.max(0.3, tooltip.radius * 1.5);
    const pos3D = this._tempV1.set(
      tooltip.worldPos.x,
      tooltip.worldPos.y + meshHeight + 0.2,
      tooltip.worldPos.z
    );
    pos3D.project(this.camera);

    if (pos3D.z > 1) return;

    const w = this.uiCanvas.width;
    const h = this.uiCanvas.height;
    const screenX = (pos3D.x * 0.5 + 0.5) * w;
    const screenY = (-(pos3D.y * 0.5) + 0.5) * h;

    this.uiCtx.save();
    this.uiCtx.translate(screenX, screenY);
    this.uiCtx.fillStyle = '#f1c40f';
    this.uiCtx.font = 'bold 12px sans-serif';
    this.uiCtx.textAlign = 'center';
    this.uiCtx.textBaseline = 'bottom';
    this.uiCtx.shadowColor = '#000';
    this.uiCtx.shadowBlur = 4;
    this.uiCtx.shadowOffsetX = 1;
    this.uiCtx.shadowOffsetY = 1;
    this.uiCtx.fillText(tooltip.name, 0, 0);
    this.uiCtx.restore();
  }

  private renderAIDebug(debug: AIDebugDTO): void {
    const { x: posX, y: posY, z: posZ } = debug.entityPos;
    const w = this.uiCanvas.width;
    const h = this.uiCanvas.height;

    // 1. Отрисовка радиуса поиска цели
    if (debug.detectRadius !== undefined && debug.detectRadius > 0) {
      this.drawProjectedCircle(
        posX,
        posY,
        posZ,
        debug.detectRadius,
        AI_DEBUG_CONFIG.colors.detectRadius,
        AI_DEBUG_CONFIG.dashArrays.radii,
        `Detect: ${debug.detectRadius.toFixed(1)}m`,
        0
      );
    }

    // 2. Отрисовка радиуса потери цели
    if (debug.loseRadius !== undefined && debug.loseRadius > 0) {
      this.drawProjectedCircle(
        posX,
        posY,
        posZ,
        debug.loseRadius,
        AI_DEBUG_CONFIG.colors.loseRadius,
        AI_DEBUG_CONFIG.dashArrays.radii,
        `Lose: ${debug.loseRadius.toFixed(1)}m`,
        Math.PI / 4
      );
    }

    const selfYOffset = posY + 0.8;

    // 3. Линия к targetPos
    if (debug.targetPos) {
      const { x: tX, y: tY, z: tZ } = debug.targetPos;
      this.drawProjectedLine(
        posX,
        selfYOffset,
        posZ,
        tX,
        tY,
        tZ,
        AI_DEBUG_CONFIG.colors.pathLine,
        AI_DEBUG_CONFIG.dashArrays.path,
        2
      );

      const proj = this._tempV1.set(tX, tY, tZ).project(this.camera);
      if (proj.z <= 1.0) {
        const sx = (proj.x * 0.5 + 0.5) * w;
        const sy = (-(proj.y * 0.5) + 0.5) * h;

        this.uiCtx.save();
        this.uiCtx.strokeStyle = AI_DEBUG_CONFIG.colors.pathLine;
        this.uiCtx.fillStyle = AI_DEBUG_CONFIG.colors.pathLine;
        this.uiCtx.lineWidth = 2;
        this.uiCtx.beginPath();
        this.uiCtx.arc(sx, sy, 4, 0, Math.PI * 2);
        this.uiCtx.fill();
        this.uiCtx.stroke();
        this.uiCtx.restore();

        this.renderBadge('target_pos', sx, sy - 12, AI_DEBUG_CONFIG.colors.pathLine, '#ffffff');
      }
    }

    // 4. Линия к targetEntity
    if (debug.targetEntity) {
      const { x: tX, y: tY, z: tZ } = debug.targetEntity.pos;
      this.drawProjectedLine(
        posX,
        selfYOffset,
        posZ,
        tX,
        tY + 0.8,
        tZ,
        AI_DEBUG_CONFIG.colors.targetLine,
        AI_DEBUG_CONFIG.dashArrays.targetLine,
        2
      );

      const proj = this._tempV1.set(tX, tY + 0.8, tZ).project(this.camera);
      if (proj.z <= 1.0) {
        const sx = (proj.x * 0.5 + 0.5) * w;
        const sy = (-(proj.y * 0.5) + 0.5) * h;

        this.renderBadge(
          `Target: ${debug.targetEntity.name}`,
          sx,
          sy - 16,
          AI_DEBUG_CONFIG.colors.targetLine,
          '#ff8a80'
        );
      }
    }
  }

  private drawProjectedCircle(
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    strokeColor: string,
    dashArray: number[],
    label?: string,
    labelAngle: number = 0,
    segments: number = 64
  ): void {
    if (radius <= 0) return;

    const w = this.uiCanvas.width;
    const h = this.uiCanvas.height;

    this.uiCtx.save();
    this.uiCtx.strokeStyle = strokeColor;
    this.uiCtx.lineWidth = 1.5;
    this.uiCtx.setLineDash(dashArray);

    let pathStarted = false;

    this.uiCtx.beginPath();

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      this._tempV1
        .set(centerX + Math.cos(angle) * radius, centerY + 0.03, centerZ + Math.sin(angle) * radius)
        .project(this.camera);

      if (this._tempV1.z > 1.0) {
        pathStarted = false;
        continue;
      }

      const screenX = (this._tempV1.x * 0.5 + 0.5) * w;
      const screenY = (-(this._tempV1.y * 0.5) + 0.5) * h;

      if (!pathStarted) {
        this.uiCtx.moveTo(screenX, screenY);
        pathStarted = true;
      } else {
        this.uiCtx.lineTo(screenX, screenY);
      }
    }

    this.uiCtx.stroke();
    this.uiCtx.restore();

    if (label) {
      this._tempV1
        .set(
          centerX + Math.cos(labelAngle) * radius,
          centerY + 0.03,
          centerZ + Math.sin(labelAngle) * radius
        )
        .project(this.camera);
      if (this._tempV1.z <= 1.0) {
        const screenX = (this._tempV1.x * 0.5 + 0.5) * w;
        const screenY = (-(this._tempV1.y * 0.5) + 0.5) * h;
        this.renderBadge(label, screenX, screenY - 10, strokeColor);
      }
    }
  }

  private drawProjectedLine(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    strokeColor: string,
    dashArray: number[],
    lineWidth: number = 2
  ): void {
    const w = this.uiCanvas.width;
    const h = this.uiCanvas.height;

    const v1 = this._tempV1.set(fromX, fromY, fromZ).project(this.camera);
    const v2 = this._tempV2.set(toX, toY, toZ).project(this.camera);

    if (v1.z > 1.0 && v2.z > 1.0) return;

    const pFrom = this._tempV3.set(fromX, fromY, fromZ);
    const pTo = this._tempV4.set(toX, toY, toZ);

    if (v1.z > 1.0 || v2.z > 1.0) {
      this.camera.getWorldPosition(this._camPos);
      this.camera.getWorldDirection(this._camDir);

      // Вектора для вычисления дот-продукта (без изменения исходных pFrom/pTo)
      const dist1 = this._tempV1.copy(pFrom).sub(this._camPos).dot(this._camDir);
      const dist2 = this._tempV2.copy(pTo).sub(this._camPos).dot(this._camDir);
      const nearPlane = 0.2;

      if (dist1 < nearPlane && dist2 < nearPlane) return;

      if (dist1 < nearPlane) {
        const t = (nearPlane - dist1) / (dist2 - dist1);
        pFrom.lerp(pTo, t);
      } else if (dist2 < nearPlane) {
        const t = (nearPlane - dist2) / (dist1 - dist2);
        pTo.lerp(pFrom, t);
      }

      const s1 = pFrom.project(this.camera);
      const s2 = pTo.project(this.camera);
      if (s1.z > 1.0 || s2.z > 1.0) return;

      this.uiCtx.save();
      this.uiCtx.strokeStyle = strokeColor;
      this.uiCtx.lineWidth = lineWidth;
      this.uiCtx.setLineDash(dashArray);
      this.uiCtx.beginPath();
      this.uiCtx.moveTo((s1.x * 0.5 + 0.5) * w, (-(s1.y * 0.5) + 0.5) * h);
      this.uiCtx.lineTo((s2.x * 0.5 + 0.5) * w, (-(s2.y * 0.5) + 0.5) * h);
      this.uiCtx.stroke();
      this.uiCtx.restore();
      return;
    }

    this.uiCtx.save();
    this.uiCtx.strokeStyle = strokeColor;
    this.uiCtx.lineWidth = lineWidth;
    this.uiCtx.setLineDash(dashArray);
    this.uiCtx.beginPath();
    this.uiCtx.moveTo((v1.x * 0.5 + 0.5) * w, (-(v1.y * 0.5) + 0.5) * h);
    this.uiCtx.lineTo((v2.x * 0.5 + 0.5) * w, (-(v2.y * 0.5) + 0.5) * h);
    this.uiCtx.stroke();
    this.uiCtx.restore();
  }

  private renderBadge(
    text: string,
    screenX: number,
    screenY: number,
    borderColor: string,
    textColor: string = AI_DEBUG_CONFIG.colors.badgeText
  ): void {
    this.uiCtx.save();
    this.uiCtx.font = 'bold 10px sans-serif';
    const textWidth = this.uiCtx.measureText(text).width;
    const paddingX = 6;
    const boxW = textWidth + paddingX * 2;
    const boxH = 16;
    const boxX = screenX - boxW / 2;
    const boxY = screenY - boxH / 2;

    this.uiCtx.fillStyle = AI_DEBUG_CONFIG.colors.badgeBg;
    this.uiCtx.fillRect(boxX, boxY, boxW, boxH);

    this.uiCtx.strokeStyle = borderColor;
    this.uiCtx.lineWidth = 1;
    this.uiCtx.setLineDash(DASH_EMPTY);
    this.uiCtx.strokeRect(boxX, boxY, boxW, boxH);

    this.uiCtx.fillStyle = textColor;
    this.uiCtx.textAlign = 'center';
    this.uiCtx.textBaseline = 'middle';
    this.uiCtx.fillText(text, screenX, screenY);
    this.uiCtx.restore();
  }
}
