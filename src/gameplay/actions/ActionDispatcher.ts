import {
  GameplayAction,
  GameplayActionType,
  ActionExecutionContext,
  ActionHandler,
  GameplayTargetSelector,
} from '../types';
import { StoryFlagsManager } from '../../dialogue/StoryFlagsManager';
import { applyZoneDamageToCreature } from '../../ecs/utils/anatomyDamage';
import { applyDamage } from '../../ecs/utils/health';
import { tryAddItemToInventory } from '../../ecs/utils/inventory';
import { Vec3 } from '../../types';

export class ActionDispatcher {
  private static handlers: Map<GameplayActionType, ActionHandler> = new Map();

  public static register(type: GameplayActionType, handler: ActionHandler): void {
    ActionDispatcher.handlers.set(type, handler);
  }

  public static execute(action: GameplayAction, context: ActionExecutionContext): void {
    const handler = ActionDispatcher.handlers.get(action.type);
    if (handler) {
      handler(action, context);
    } else {
      console.warn(`[ActionDispatcher] Неизвестный тип действия: "${action.type}"`);
    }
  }

  public static executeAll(
    actions: GameplayAction[] | undefined,
    context: ActionExecutionContext
  ): void {
    if (!actions || actions.length === 0) return;
    for (const act of actions) {
      ActionDispatcher.execute(act, context);
    }
  }

  public static resolveTargetEntityId(
    selector: GameplayTargetSelector | undefined,
    context: ActionExecutionContext
  ): string | null {
    if (!selector) return context.targetEntityId ?? context.activatorEntityId ?? null;

    if (selector === 'player') {
      return context.app?.getPlayerEntityId() ?? null;
    }
    if (selector === 'activator') {
      return context.activatorEntityId ?? null;
    }
    if (selector === 'source' || selector === 'self' || selector === 'speaker') {
      return context.sourceEntityId ?? null;
    }

    return selector;
  }
}

// 1. Установка сюжетного флага
ActionDispatcher.register('set_flag', (action) => {
  const p = action.payload;
  if (p?.key) {
    StoryFlagsManager.setFlag(p.key, p.value !== undefined ? p.value : true);
  }
});

// 2. Смена дерева поведения ИИ
ActionDispatcher.register('change_ai', (action, ctx) => {
  const p = action.payload;
  if (!p?.behavior) return;
  const targetId = ActionDispatcher.resolveTargetEntityId(p.target || p.entity, ctx);
  if (targetId && ctx.app) {
    ctx.app.mutations.updateEntityAIBehavior(targetId, p.behavior);
    ctx.app.updateBTData(true);
  }
});

// 3. Телепортация сущности
ActionDispatcher.register('teleport', (action, ctx) => {
  const p = action.payload;
  const targetId = ActionDispatcher.resolveTargetEntityId(p?.target, ctx);
  if (!targetId || !p?.pos) return;

  const pos: Vec3 = p.pos;
  if (ctx.app) {
    ctx.app.mutations.updateEntityTransform(targetId, { x: pos.x, y: pos.y, z: pos.z });
    ctx.app.syncPhysicsStructures();
  }
});

// 4. Нанесение прямого урона
ActionDispatcher.register('deal_damage', (action, ctx) => {
  const p = action.payload;
  const targetId = ActionDispatcher.resolveTargetEntityId(p?.target, ctx);
  if (!targetId) return;

  const amount = Number(p?.amount) || 10;
  const tag = ctx.world.getComponent(targetId, 'tag');
  const hasAnatomy =
    ctx.world.getComponent(targetId, 'assemblyRoot') ||
    ctx.world.getComponent(targetId, 'socketDef') ||
    tag?.archetype === 'creature';

  if (hasAnatomy) {
    applyZoneDamageToCreature(ctx.world, targetId, amount);
  } else {
    applyDamage(ctx.world, targetId, amount, true);
  }
});

// 5. Спавн сущности / группы
ActionDispatcher.register('spawn_entity', (action, ctx) => {
  const p = action.payload;
  if (!p || !ctx.app) return;

  let spawnPos: Vec3 = { x: 0, y: 0, z: 0 };
  if (p.pos) {
    spawnPos = p.pos;
  } else if (ctx.sourceEntityId) {
    const srcTrans = ctx.world.getComponent(ctx.sourceEntityId, 'transform');
    if (srcTrans) {
      spawnPos = {
        x: srcTrans.x + (p.offset?.x ?? 0),
        y: srcTrans.y + (p.offset?.y ?? 0),
        z: srcTrans.z + (p.offset?.z ?? 0),
      };
    }
  }

  if (p.config) {
    ctx.app.spawnEntity(p.config, spawnPos);
  }
});

// 6. Выдача предмета в инвентарь или руки
ActionDispatcher.register('give_item', (action, ctx) => {
  const p = action.payload;
  const targetId = ActionDispatcher.resolveTargetEntityId(p?.target, ctx);
  if (!targetId || !p?.itemConfig || !ctx.app) return;

  const itemId = ctx.app.spawnEntity(p.itemConfig);
  tryAddItemToInventory(ctx.world, targetId, itemId);
});

// 7. Завершение диалога
ActionDispatcher.register('end_dialogue', (_, ctx) => {
  if (ctx.app) {
    ctx.app.simulation.dialogueSystem.closeDialogue(ctx.world);
  }
});
