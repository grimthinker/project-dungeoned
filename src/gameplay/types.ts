import { World } from '../ecs/World';
import { GameApp } from '../GameApp';
import { Vec3 } from '../types';

export type GameplayTargetSelector =
  'player' | 'activator' | 'source' | 'self' | 'speaker' | string;

export type GameplayConditionType =
  | 'flag_has'
  | 'flag_not'
  | 'flag_equals'
  | 'has_item'
  | 'is_alive'
  | 'stance_is'
  | 'stance_not'
  | 'quest_status'
  | 'quest_stage';

export interface GameplayCondition {
  type: GameplayConditionType;
  key: string;
  value?: any;
  target?: GameplayTargetSelector;
}

export type GameplayActionType =
  | 'set_flag'
  | 'change_ai'
  | 'teleport'
  | 'deal_damage'
  | 'spawn_entity'
  | 'give_item'
  | 'end_dialogue'
  | 'start_quest'
  | 'set_quest_stage'
  | 'complete_quest'
  | 'fail_quest';

export interface GameplayAction {
  type: GameplayActionType;
  payload?: any;
}

export interface ActionExecutionContext {
  world: World;
  app?: GameApp | null;
  sourceEntityId?: string;
  activatorEntityId?: string;
  targetEntityId?: string;
  payload?: any;
}

export interface ActionHandler {
  (action: GameplayAction, context: ActionExecutionContext): void;
}

export interface ConditionHandler {
  (condition: GameplayCondition, context: ActionExecutionContext): boolean;
}
