import { GameplayAction, GameplayCondition } from '../gameplay/types';
import { Vec3 } from '../types';

export type QuestStatus = 'not_started' | 'active' | 'completed' | 'failed' | 'hidden';

export type ObjectiveType =
  'kill_entity' | 'talk_to_npc' | 'reach_zone' | 'collect_item' | 'set_flag';

export interface QuestObjective {
  id: string;
  type: ObjectiveType;
  title: string;
  description?: string;
  isOptional?: boolean;
  isHidden?: boolean; // Скрытая задача: не видна в HUD/журнале до обнаружения или выполнения

  targetEntityId?: string;
  targetTag?: string;
  targetZoneTag?: string;
  targetPos?: Vec3;

  currentCount?: number;
  requiredCount?: number;

  targetKey?: string;
  targetValue?: any;

  nextStageId?: string | null; // Целевой этап при выполнении этой конкретной задачи
}

export type StageCompletionMode = 'all' | 'any';

export interface QuestStage {
  id: string;
  title: string;
  description?: string;
  completionMode: StageCompletionMode;

  objectives: QuestObjective[];

  failIfDeadEntityIds?: string[];
  failConditions?: GameplayCondition[];

  onEnterActions?: GameplayAction[];
  onCompleteActions?: GameplayAction[];
  onFailActions?: GameplayAction[];

  nextStageId?: string | null;
  editorPosition?: { x: number; y: number };
}

export interface QuestGraph {
  id: string;
  title: string;
  description?: string;
  category?: 'main' | 'side' | 'misc';
  isRepeatable?: boolean;
  startStageId: string;
  stages: Record<string, QuestStage>;
}

export interface RuntimeQuestState {
  questId: string;
  status: QuestStatus;
  currentStageId: string;
  objectiveProgress: Record<string, { current: number; completed: boolean }>;
  isTracking: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface SerializedQuestManagerData {
  trackedQuestId: string | null;
  quests: Record<string, RuntimeQuestState>;
}
