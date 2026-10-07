import { GameplayCondition, GameplayAction } from '../../gameplay/types';

export type TriggerRuleEvent = 'zone_entered' | 'zone_exited' | 'item_picked_up';

export interface TriggerRule {
  id: string;
  name: string;
  event: TriggerRuleEvent;
  conditions: GameplayCondition[];
  actions: GameplayAction[];
  triggerOnce?: boolean;
  hasTriggered?: boolean;
}

export interface TriggerRuleComponent {
  rules: TriggerRule[];
}
