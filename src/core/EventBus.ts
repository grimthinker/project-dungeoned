import { BTNodeDTO } from '../ai/core';
import { GameMode } from '../config/gameConfig';
import { TreeBBSchema } from '../ai/schema';
import { ActiveDialogueDTO } from '../dialogue/types';

export interface EventMap {
  'engine:state-changed': {
    mode: GameMode;
    isPaused: boolean;
    timeScale: number;
    showUIOverlays: boolean;
    showAIDebug: boolean;
    celShading: boolean;
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
  'dialogue:state-changed': ActiveDialogueDTO;
  'dialogue:closed': void;
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
