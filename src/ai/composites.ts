import type { IAIAgent } from './ports';
import { BTComposite, NodeStatus, BTNode } from './core';

export class BTSequence extends BTComposite {
  private currentChildIndex: number = 0;
  public static readonly nodeName = 'Последовательность';
  public static readonly description =
    'Выполняет дочерние узлы по очереди слева направо до первой неудачи; возвращает SUCCESS, только если все дочерние узлы завершились успехом';

  constructor(children: BTNode[]) {
    super(children);
  }

  protected onOpen(ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    for (let i = this.currentChildIndex; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx);

      if (status === NodeStatus.RUNNING) {
        this.currentChildIndex = i;
        return NodeStatus.RUNNING;
      }

      if (status === NodeStatus.FAILURE) {
        return NodeStatus.FAILURE;
      }
    }
    return NodeStatus.SUCCESS;
  }

  protected onAbort(ctx: IAIAgent): void {
    const activeChild = this.children[this.currentChildIndex];
    if (activeChild && activeChild.isRunning()) {
      activeChild.abort(ctx);
    }
  }

  protected onClose(ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }
}

export class BTSelector extends BTComposite {
  private currentChildIndex: number = 0;
  public static readonly nodeName = 'Селектор';
  public static readonly description =
    'Перебирает дочерние узлы слева направо с запоминанием активного узла; возвращает FAILURE, если все узлы потерпели неудачу';

  constructor(children: BTNode[]) {
    super(children);
  }

  protected onOpen(ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    for (let i = this.currentChildIndex; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx);

      if (status === NodeStatus.RUNNING) {
        this.currentChildIndex = i;
        return NodeStatus.RUNNING;
      }
      if (status === NodeStatus.SUCCESS) {
        this.currentChildIndex = 0;
        return NodeStatus.SUCCESS;
      }
    }
    this.currentChildIndex = 0;
    return NodeStatus.FAILURE;
  }

  protected onAbort(ctx: IAIAgent): void {
    const activeChild = this.children[this.currentChildIndex];
    if (activeChild && activeChild.isRunning()) {
      activeChild.abort(ctx);
    }
    this.currentChildIndex = 0;
  }

  protected onClose(ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }
}

export class BTReactiveSelector extends BTComposite {
  private currentChildIndex: number = 0;
  public static readonly nodeName = 'Реактивный селектор';
  public static readonly description =
    'Каждый тик проверяет узлы с начала. Мгновенно прерывает текущий узел, если более приоритетный вернул SUCCESS/RUNNING.';

  constructor(children: BTNode[]) {
    super(children);
  }

  protected onOpen(_ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    for (let i = 0; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx);

      if (status === NodeStatus.RUNNING) {
        if (this.currentChildIndex !== i) {
          const prevChild = this.children[this.currentChildIndex];
          if (prevChild && prevChild.isRunning()) {
            prevChild.abort(ctx);
          }
          this.currentChildIndex = i;
        }
        return NodeStatus.RUNNING;
      }

      if (status === NodeStatus.SUCCESS) {
        if (this.currentChildIndex !== i) {
          const prevChild = this.children[this.currentChildIndex];
          if (prevChild && prevChild.isRunning()) {
            prevChild.abort(ctx);
          }
          this.currentChildIndex = 0;
        }
        return NodeStatus.SUCCESS;
      }
    }

    this.currentChildIndex = 0;
    return NodeStatus.FAILURE;
  }

  protected onAbort(ctx: IAIAgent): void {
    const activeChild = this.children[this.currentChildIndex];
    if (activeChild && activeChild.isRunning()) {
      activeChild.abort(ctx);
    }
    this.currentChildIndex = 0;
  }

  protected onClose(_ctx: IAIAgent): void {
    this.currentChildIndex = 0;
  }
}
