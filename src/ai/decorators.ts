import type { IAIAgent } from './ports';
import { vec2_distance_to } from '../utils';
import { BTDecorator, BTNode, NodeStatus } from './core';

export abstract class BTCondition extends BTDecorator {
  public static readonly nodeName = 'Условие';
  public static readonly description =
    'Если условие не выполняется, возвращает FAILURE, иначе передает управление дочернему узлу';

  private condition: (ctx: IAIAgent) => boolean;

  constructor(condition: (ctx: IAIAgent) => boolean, child: BTNode) {
    super(child);
    this.condition = condition;
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    if (!this.condition(ctx)) {
      if (this.child.isRunning()) {
        this.child.abort(ctx);
      }
      return NodeStatus.FAILURE;
    } else return this.child.tick(ctx);
  }
}

export class BTInverter extends BTDecorator {
  public static readonly nodeName = 'Инвертор';
  public static readonly description =
    'Инвертирует статус выполнения дочернего узла: SUCCESS меняет на FAILURE, FAILURE на SUCCESS';

  constructor(child: BTNode) {
    super(child);
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const status = this.child.tick(ctx);

    if (status === NodeStatus.SUCCESS) {
      return NodeStatus.FAILURE;
    }
    if (status === NodeStatus.FAILURE) {
      return NodeStatus.SUCCESS;
    }
    return status;
  }
}

export class BTRetry extends BTDecorator {
  public static readonly nodeName = 'Повторитель при неудаче';
  public static readonly description =
    'Повторяет выполнение дочернего узла при неудаче до тех пор, пока он не вернет SUCCESS';

  constructor(child: BTNode) {
    super(child);
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const status = this.child.tick(ctx);

    if (status === NodeStatus.FAILURE) {
      return NodeStatus.RUNNING;
    }

    return status;
  }
}

export class BTCooldown extends BTDecorator {
  public static readonly nodeName = 'Перезарядка';
  public static readonly description =
    'Блокирует повторное выполнение дочернего узла на заданное время (cooldownMs)';
  public static readonly defaultParams = { cooldownMs: 1000 };

  private params: typeof BTCooldown.defaultParams;
  private lastExecutionTime: number = -Infinity;

  constructor(child: BTNode, params?: Partial<typeof BTCooldown.defaultParams>) {
    super(child);
    this.params = { ...BTCooldown.defaultParams, ...params };
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const currentTime = (ctx.blackboard.get<number>('localTime') ?? 0) * 1000;

    if (currentTime - this.lastExecutionTime < this.params.cooldownMs) {
      return NodeStatus.FAILURE;
    }

    const status = this.child.tick(ctx);

    if (status === NodeStatus.SUCCESS || status === NodeStatus.FAILURE) {
      this.lastExecutionTime = currentTime;
    }

    return status;
  }
}

export class BTRepeater extends BTDecorator {
  public static readonly nodeName = 'Повторитель';
  public static readonly description =
    'Бесконечно повторяет выполнение дочернего узла, игнорируя его завершение';

  constructor(child: BTNode) {
    super(child);
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const status = this.child.tick(ctx);

    if (status === NodeStatus.SUCCESS || status === NodeStatus.FAILURE) {
      return NodeStatus.RUNNING;
    }

    return status;
  }
}

export class BTDecoratorCheckEngaged extends BTDecorator {
  public static readonly nodeName = 'Проверка боя';
  public static readonly description =
    'Проверяет, находится ли цель на расстоянии ближе или равном engageDist единицам, иначе прерывает дочерний узел';
  public static readonly defaultParams = { engageDist: 5.0 };

  private params: typeof BTDecoratorCheckEngaged.defaultParams;

  constructor(child: BTNode, params?: Partial<typeof BTDecoratorCheckEngaged.defaultParams>) {
    super(child);
    this.params = { ...BTDecoratorCheckEngaged.defaultParams, ...params };
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const bb = ctx.blackboard;
    const targetId = bb.get<string>('targetId');

    if (targetId === undefined) return NodeStatus.FAILURE;

    const target = ctx.world.getAgent(targetId);

    if (!target) return NodeStatus.FAILURE;

    const dist = vec2_distance_to(ctx.getPos(), target.getPos());
    const isEngaged = dist <= this.params.engageDist;

    if (!isEngaged) {
      if (this.child.isRunning()) {
        this.child.abort(ctx);
      }
      return NodeStatus.FAILURE;
    }

    return this.child.tick(ctx);
  }
}

export class BTDecoratorIsTargetAlive extends BTDecorator {
  public static readonly nodeName = 'Цель жива';
  public static readonly description =
    'Проверяет наличие и статус жизни цели, прерывая выполнение при ее гибели';

  constructor(child: BTNode) {
    super(child);
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const targetId = ctx.blackboard.get<string>('targetId');
    if (targetId === undefined) {
      if (this.child.isRunning()) this.child.abort(ctx);
      return NodeStatus.FAILURE;
    }

    const target = ctx.world.getAgent(targetId);
    if (!target || !target.isAlive) {
      if (this.child.isRunning()) {
        this.child.abort(ctx);
      }
      return NodeStatus.FAILURE;
    }

    return this.child.tick(ctx);
  }
}
