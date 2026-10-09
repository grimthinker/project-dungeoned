import { BTNodeDTO } from '../ai/core';
import { GameMode } from '../config/gameConfig';
import { TreeBBSchema } from '../ai/schema';
import { ActiveDialogueDTO } from '../dialogue/types';
import { ActiveReadingDTO } from '../components/gameHud/hudPorts';

export interface EventMap {
  'engine:state-changed': {
    mode: GameMode;
    isPaused: boolean;
    timeScale: number;
    showUIOverlays: boolean;
    showAIDebug: boolean;
    celShading: boolean;
    outlineLines: boolean;
    showFPSMonitor: boolean;
  };
  'selection:changed': {
    selectedEntityId: string | null;
    selectedEntityIds: string[];
  };
  'world:updated': void;
  'inventory:updated': void;
  'bt:updated': {
    btData: BTNodeDTO | null;
    btBlackboard: Record<string, unknown> | null;
    btSchema: TreeBBSchema | null;
  };
  'game:playerDied': void;
  'inspector:navigate': {
    rootEntityId: string;
    path: Array<{ id: string; label: string }>;
    targetSection?: string;
  };
  'gizmo:dragging-changed': { isDragging: boolean };
  'gizmo:drag-update': {
    id: string;
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
  };
  'input:cancelTargeting': void;
  'zone:entered': { zoneId: string; entityId: string };
  'zone:exited': { zoneId: string; entityId: string };
  'item:picked_up': { pickerId: string; itemId: string };
  'entity:died': { entityId: string; killerId?: string; archetype?: string; name?: string };
  'story:flag-changed': { key: string; value: any };
  'dialogue:state-changed': ActiveDialogueDTO;
  'dialogue:closed': void;
  'dialogue:registry-updated': void;
  'dialogue:open-editor': { dialogueId?: string };
  'reading:state-changed': ActiveReadingDTO;
  'reading:closed': void;
  'quest:started': { questId: string };
  'quest:stage-changed': { questId: string; fromStageId: string; toStageId: string };
  'quest:objective-updated': {
    questId: string;
    stageId: string;
    objectiveId: string;
    current: number;
    max: number;
  };
  'quest:completed': { questId: string };
  'quest:failed': { questId: string; reason?: string };
  'quest:tracking-changed': { questId: string; isTracking: boolean };
  'quest:registry-updated': void;
  'quest:open-editor': { questId?: string };
  'log:entry': {
    text: string;
    type: 'quest' | 'dialogue' | 'combat' | 'system';
    timestamp: number;
  };
}

type EventCallback<T> = (data: T) => void;

export class GameEventBus {
  private listeners = new Map<keyof EventMap, Set<EventCallback<any>>>();

  public on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  public off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.listeners.get(event)?.delete(callback);
  }

  public emit<K extends keyof EventMap>(
    ...args: EventMap[K] extends void ? [K] : [K, EventMap[K]]
  ): void {
    const [event, data] = args;
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const EventBus = new GameEventBus();
