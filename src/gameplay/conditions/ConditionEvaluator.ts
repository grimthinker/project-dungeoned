import {
  GameplayCondition,
  GameplayConditionType,
  ActionExecutionContext,
  ConditionHandler,
} from '../types';
import { ActionDispatcher } from '../actions/ActionDispatcher';
import { StoryFlagsManager } from '../../dialogue/StoryFlagsManager';
import { getAggregatedInteractionSlots } from '../../ecs/utils/hierarchy';

export class ConditionEvaluator {
  private static handlers: Map<GameplayConditionType, ConditionHandler> = new Map();

  public static register(type: GameplayConditionType, handler: ConditionHandler): void {
    ConditionEvaluator.handlers.set(type, handler);
  }

  public static evaluate(condition: GameplayCondition, context: ActionExecutionContext): boolean {
    const handler = ConditionEvaluator.handlers.get(condition.type);
    if (handler) {
      return handler(condition, context);
    }
    console.warn(`[ConditionEvaluator] Неизвестный тип условия: "${condition.type}"`);
    return true;
  }

  public static evaluateAll(
    conditions: GameplayCondition[] | undefined,
    context: ActionExecutionContext
  ): boolean {
    if (!conditions || conditions.length === 0) return true;
    for (const cond of conditions) {
      if (!ConditionEvaluator.evaluate(cond, context)) {
        return false;
      }
    }
    return true;
  }
}

// 1. Проверка наличия флага истории
ConditionEvaluator.register('flag_has', (cond) => {
  return StoryFlagsManager.hasFlag(cond.key) && Boolean(StoryFlagsManager.getFlag(cond.key));
});

// 2. Проверка отсутствия флага истории
ConditionEvaluator.register('flag_not', (cond) => {
  return !StoryFlagsManager.hasFlag(cond.key) || !StoryFlagsManager.getFlag(cond.key);
});

// 3. Проверка точного значения флага
ConditionEvaluator.register('flag_equals', (cond) => {
  return StoryFlagsManager.getFlag(cond.key) === cond.value;
});

// 4. Проверка наличия предмета в слотах
ConditionEvaluator.register('has_item', (cond, ctx) => {
  const targetId = ActionDispatcher.resolveTargetEntityId(cond.target || 'player', ctx);
  if (!targetId) return false;

  const slots = getAggregatedInteractionSlots(ctx.world, targetId);
  return slots.some((s) => s.slot.itemId === cond.key || s.slot.name === cond.key);
});

// 5. Проверка статуса жизни сущности
ConditionEvaluator.register('is_alive', (cond, ctx) => {
  const targetId = ActionDispatcher.resolveTargetEntityId(cond.key, ctx);
  if (!targetId) return false;

  const health = ctx.world.getComponent(targetId, 'health');
  return health?.isAlive ?? false;
});

// 6. Проверка текущей стойки тела (стоя/присед/лежа)
ConditionEvaluator.register('stance_is', (cond, ctx) => {
  const targetId = ActionDispatcher.resolveTargetEntityId(cond.target || 'activator', ctx);
  if (!targetId) return false;

  const meta = ctx.world.getComponent(targetId, 'meta');
  return meta?.stance === cond.value;
});

// 7. Проверка исключения стойки (например: срабатывает, если НЕ в приседе)
ConditionEvaluator.register('stance_not', (cond, ctx) => {
  const targetId = ActionDispatcher.resolveTargetEntityId(cond.target || 'activator', ctx);
  if (!targetId) return false;

  const meta = ctx.world.getComponent(targetId, 'meta');
  return meta?.stance !== cond.value;
});

// 8. Проверка статуса квеста (not_started, active, completed, failed)
ConditionEvaluator.register('quest_status', (cond, ctx) => {
  if (!ctx.app) return false;
  const state = ctx.app.simulation.questManager.getQuestState(cond.key);
  const currentStatus = state?.status || 'not_started';
  return currentStatus === cond.value;
});

// 9. Проверка текущей стадии квеста
ConditionEvaluator.register('quest_stage', (cond, ctx) => {
  if (!ctx.app) return false;
  const state = ctx.app.simulation.questManager.getQuestState(cond.key);
  if (!state || state.status !== 'active') return false;
  return state.currentStageId === cond.value;
});
