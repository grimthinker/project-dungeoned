import { Camera } from '../Camera';
import { Point, Vec3 } from '../types';
import { IModelPreview } from './IModelPreview';
import { TerrainBrushState, PropBrushState } from '../types';
import { FPSStats } from '../core/FPSMonitor';
import { EnvironmentData } from '../utils';

export interface EntityOverlayDTO {
  id: string;
  name: string;
  worldPos: Vec3;
  radius: number;
  hp?: number;
  maxHp?: number;
  isObstacle: boolean;
  alpha: number;
  showName: boolean;
}

export interface ItemTooltipDTO {
  name: string;
  worldPos: Vec3;
  radius: number;
}

export interface AIDebugDTO {
  entityPos: Vec3;
  detectRadius?: number;
  loseRadius?: number;
  targetPos?: Vec3;
  targetEntity?: {
    name: string;
    pos: Vec3;
  };
}

export interface EditorRenderData {
  selectedId: string | null;
  selectedIds: Set<string>;
  isSelectedOwned?: boolean;
  hoveredId: string | null;
  marqueeBox?: { start: Point; current: Point } | null;
  showAIDebug?: boolean;
  gizmoTool?: 'select' | 'translate' | 'rotate';
  terrainBrush?: TerrainBrushState;
  propBrush?: PropBrushState;
  cursorWorldPos?: Vec3 | null;
  throwTrajectory?: { points: Vec3[] } | null;
}

export interface RenderContext {
  camera: Camera;
  gameMode: string;
  editorData: EditorRenderData;
  showUIOverlays: boolean;
  uiOverlays?: EntityOverlayDTO[];
  hoveredItemTooltip?: ItemTooltipDTO | null;
  aiDebugData?: AIDebugDTO | null;
  environment?: EnvironmentData;
  showFPSMonitor?: boolean;
  fpsStats?: FPSStats;
  /** Включена ли cel-shading обводка (пост-процесс маски кандидатов) */
  celShading?: boolean;
  /** Включены ли контурные линии (cel-обводка + обводка выделения) */
  outlineLines?: boolean;
}

export interface IRenderer {
  init?(): void;
  resize(width: number, height: number): void;
  render(context: RenderContext): void;
  destroy?(): void;
  getCanvas(): HTMLCanvasElement;
  screenToWorld(clientX: number, clientY: number, camera: Camera): Vec3;
  getScreenRay?(clientX: number, clientY: number): { origin: Vec3; direction: Vec3 };
  pickEntity?(clientX: number, clientY: number): string | null;
  projectToScreen?(pos: Vec3): Vec3 | null;

  /** Фабрика для создания изолированного окна предпросмотра 3D-моделей (без ECS сцены) */
  createModelPreview?(): IModelPreview;
}
