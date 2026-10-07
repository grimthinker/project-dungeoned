import { Point, Vec3, Radians } from '../../types';
import { ActiveDialogueDTO } from '../../dialogue/types';

export type { ActiveDialogueDTO };

export interface PlayerPartFpInfo {
  name: string;
  percent: number;
}

export interface PlayerStatusDTO {
  name: string;
  isHumanoid: boolean;
  bars: Array<{
    id: string;
    icon: string;
    title: string;
    label: string;
    color: string;
    current: number;
    max: number;
  }>;
  partColors: Record<string, string>;
  partFp: Record<string, PlayerPartFpInfo>;
}

export interface SlotItemDTO {
  id: string;
  name: string;
  type: string;
  icon?: string;
}

export interface SlotInfoDTO {
  globalSlotIndex: number;
  partId: string;
  name: string;
  isBroken: boolean;
  slotKind?: string;
  item: SlotItemDTO | null;
}

export interface EquipAreaItemDTO {
  id: string;
  name: string;
  type: string;
  icon?: string;
  size: number;
  weight: number;
}

export interface EquipAreaDTO {
  areaId: string;
  containerId: string;
  name: string;
  type: string;
  space: number;
  items: EquipAreaItemDTO[];
}

export interface PlayerEquipmentDTO {
  slots: SlotInfoDTO[];
  equipAreas: EquipAreaDTO[];
}

export interface WaterBodyData {
  width: number;
  depth: number;
  x: number;
  z: number;
  surfaceY: number;
  angle: number;
}

export interface ObstacleMapData {
  id: string;
  subType?: string;
  modelId?: string;
  name?: string;
  x: number;
  z: number;
  angle: number;
  radius: number;
  width: number;
  depth: number;
  points?: Point[];
}

export interface MapZoneData {
  id: string;
  x: number;
  z: number;
  radius: number;
  role: string;
}

export interface MapCreatureData {
  id: string;
  x: number;
  z: number;
  isAlive: boolean;
  isAttacker: boolean;
  isDog: boolean;
}

export interface MapQuestMarkerDTO {
  x: number;
  z: number;
  title: string;
  questId: string;
  entityId?: string;
}

export interface MapSnapshotDTO {
  terrain?: {
    width: number;
    depth: number;
    resolution: number;
    geometryVersion: number;
    heights: Float32Array;
    splatData: Uint8Array;
    splatResolution: number;
  };
  waters: WaterBodyData[];
  obstacles: ObstacleMapData[];
  zones: MapZoneData[];
  creatures: MapCreatureData[];
  playerPos?: { x: number; z: number; angle: number };
  questMarkers?: MapQuestMarkerDTO[];
}

export interface QuestObjectiveDTO {
  id: string;
  title: string;
  current: number;
  required: number;
  isCompleted: boolean;
  isOptional: boolean;
  isHidden: boolean;
}

export interface QuestItemDTO {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  isTracking: boolean;
  currentStageTitle: string;
  currentStageDescription: string;
  objectives: QuestObjectiveDTO[];
}

export interface LogEntryDTO {
  text: string;
  type: 'quest' | 'dialogue' | 'combat' | 'system';
  timestamp: number;
}

export interface ActiveReadingDTO {
  entityId: string;
  title: string;
  text?: string;
  pages?: string[];
  currentPage: number;
  totalPages: number;
}

export interface TargetPanelDTO {
  name: string;
  isCreature: boolean;
  isItem: boolean;
  hasDialogue?: boolean;
  isReadable?: boolean;
}

export interface InspectStatusDTO {
  currentHp: number;
  maxHp: number;
  isHumanoid: boolean;
  partColors: Record<string, string>;
  partFp: Record<string, PlayerPartFpInfo>;
}

export interface InspectEquipmentDTO {
  slotsData: Array<{
    id: string;
    name: string;
    isBroken: boolean;
    item: SlotItemDTO | null;
  }>;
  areasData: Array<{
    areaId: string;
    containerId: string;
    name: string;
    type: string;
    itemIdsCount: number;
    item: SlotItemDTO | null;
  }>;
}

export interface TargetModelDataDTO {
  animator?: { rigType: string; currentAnimation?: string; playbackSpeed?: number };
  visualModelId?: string;
  rigType?: string;
  assemblyPartIds?: string[];
  parts?: Array<{ modelId: string; rigNodeName: string }>;
  physicsRadius: number;
  physicsHeight: number;
  isCreature: boolean;
  transform?: {
    x: number;
    y: number;
    z: number;
    angle: Radians;
    rotation?: { x: number; y: number; z: number; w: number };
  };
  playerTransform?: { x: number; y: number; z: number };
  headOrientation?: { relativePitch?: number; relativeYaw?: number };
  socketItems: Array<{ socketName: string; itemId: string; modelId?: string; itemType?: string }>;
}

export interface IHudDataProvider {
  getPlayerStatus(playerId: string | null): PlayerStatusDTO | null;
  getPlayerEquipment(playerId: string | null): PlayerEquipmentDTO | null;
  getMapSnapshot(playerId: string | null): MapSnapshotDTO;
  getTargetPanelInfo(targetId: string): TargetPanelDTO | null;
  getInspectStatus(targetId: string): InspectStatusDTO;
  getInspectEquipment(targetId: string): InspectEquipmentDTO;
  getInspectParameters(targetId: string): Array<{ label: string; value: string }>;
  getTargetModelData(targetId: string, playerId: string | null): TargetModelDataDTO | null;

  dropItem(playerId: string, globalSlotIndex: number): void;
  throwItem(playerId: string, globalSlotIndex: number): void;
  pickupItem(playerId: string, targetItemId: string): void;
  selectTarget(targetId: string | null): void;

  startDialogue(targetId: string): boolean;
  chooseDialogueOption(choiceId: string): void;
  closeDialogue(): void;
  getActiveDialogue(): ActiveDialogueDTO | null;

  startReading(targetId: string): boolean;
  setReadingPage(page: number): void;
  closeReading(): void;
  getActiveReading(): ActiveReadingDTO | null;

  getQuests(): QuestItemDTO[];
  getTrackedQuestId(): string | null;
  trackQuest(questId: string, isTracking: boolean): void;
  getLogEntries(): LogEntryDTO[];
}
