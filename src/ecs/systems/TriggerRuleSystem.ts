import { World } from '../World';
import { GameApp } from '../../GameApp';
import { EventBus } from '../../core/EventBus';
import { ConditionEvaluator } from '../../gameplay/conditions/ConditionEvaluator';
import { ActionDispatcher } from '../../gameplay/actions/ActionDispatcher';
import { ActionExecutionContext } from '../../gameplay/types';

export class TriggerRuleSystem {
  private unsubs: Array<() => void> = [];

  constructor(private app: GameApp) {
    this.initListeners();
  }

  private initListeners(): void {
    // 1. Вход в зону / наступление на ловушку
    this.unsubs.push(
      EventBus.on('zone:entered', ({ zoneId, entityId }) => {
        this.processTrigger(zoneId, entityId, 'zone_entered');
      })
    );

    // 2. Выход из зоны
    this.unsubs.push(
      EventBus.on('zone:exited', ({ zoneId, entityId }) => {
        this.processTrigger(zoneId, entityId, 'zone_exited');
      })
    );

    // 3. Подбор предмета
    this.unsubs.push(
      EventBus.on('item:picked_up', ({ pickerId, itemId }) => {
        this.processTrigger(itemId, pickerId, 'item_picked_up');
      })
    );
  }

  private processTrigger(
    sourceEntityId: string,
    activatorEntityId: string,
    event: 'zone_entered' | 'zone_exited' | 'item_picked_up'
  ): void {
    const world = this.app.world;
    const ruleComp = world.getComponent(sourceEntityId, 'triggerRule');
    if (!ruleComp || !ruleComp.rules) return;

    const context: ActionExecutionContext = {
      world,
      app: this.app,
      sourceEntityId,
      activatorEntityId,
    };

    for (const rule of ruleComp.rules) {
      if (rule.event !== event) continue;
      if (rule.triggerOnce && rule.hasTriggered) continue;

      if (ConditionEvaluator.evaluateAll(rule.conditions, context)) {
        ActionDispatcher.executeAll(rule.actions, context);
        rule.hasTriggered = true;
      }
    }
  }

  public destroy(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
  }
}
