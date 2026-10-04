import { Point, Vec3 } from '../types';
import { BehaviorTreeId, MobTypeId } from './config';
import type { IAIAgent } from './ports';

export enum NodeStatus {
  IDLE = 'IDLE',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  RUNNING = 'RUNNING',
}

export const ALL_NODE_CATEGORIES = [
  'composite',
  'decorator',
  'service',
  'action',
  'simple_action',
  'condition',
] as const;

export type NodeCategory = (typeof ALL_NODE_CATEGORIES)[number];

export interface BTNodeDTO {
  id?: string;
  name: string;
  category: NodeCategory;
  status?: NodeStatus;
  description?: string;
  parameters?: Record<string, any>;
  timeToNextTick?: number;
  lastResultTime?: number;
  children: BTNodeDTO[];
}

export type AttackStatus = 'idle' | 'attacking' | 'cooldown';

import { NodeBBSchema } from './schema';

export abstract class BTNode {
  public readonly id: string = Math.random().toString(36).substring(2, 9);
  public static readonly nodeName: string;
  public static readonly description: string;
  public static readonly category: NodeCategory;
  public static readonly defaultParams?: Record<string, any>;
  public static readonly bbSchema?: NodeBBSchema;

  public get name(): string {
    return (this.constructor as typeof BTNode).nodeName;
  }
  public get description(): string {
    return (this.constructor as typeof BTNode).description;
  }
  public get category(): NodeCategory {
    return (this.constructor as typeof BTNode).category;
  }

  public lastStatus: NodeStatus = NodeStatus.IDLE;
  public lastResultTime: number = 0;
  protected isOpen: boolean = false;

  protected onOpen(ctx: IAIAgent): void {}
  protected abstract onTick(ctx: IAIAgent): NodeStatus;
  protected onClose(ctx: IAIAgent): void {}
  protected onAbort(ctx: IAIAgent): void {}

  public tick(ctx: IAIAgent): NodeStatus {
    if (!this.isOpen) {
      this.onOpen(ctx);
      this.isOpen = true;
    }

    const status = this.onTick(ctx);
    this.lastStatus = status;

    if (status === NodeStatus.SUCCESS || status === NodeStatus.FAILURE) {
      this.lastResultTime = Date.now();
    }

    if (status !== NodeStatus.RUNNING) {
      this.isOpen = false;
      this.onClose(ctx);
    }

    return status;
  }

  public abort(ctx: IAIAgent): void {
    if (this.isOpen) {
      this.onAbort(ctx);
      this.isOpen = false;
      this.lastStatus = NodeStatus.FAILURE;
    }
  }

  public isRunning(): boolean {
    return this.lastStatus === NodeStatus.RUNNING;
  }
}

export abstract class BTSimpleAction extends BTNode {
  public static readonly category: NodeCategory = 'simple_action';
}

export abstract class BTAction extends BTNode {
  public static readonly category: NodeCategory = 'action';

  protected onAbort(ctx: IAIAgent): void {
    this.stopAction(ctx);
  }

  protected onClose(ctx: IAIAgent): void {
    this.stopAction(ctx);
  }

  protected abstract stopAction(ctx: IAIAgent): void;
}

export abstract class BTDecorator extends BTNode {
  public static readonly category: NodeCategory = 'decorator';

  constructor(public child: BTNode) {
    super();
  }

  public override abort(ctx: IAIAgent): void {
    if (this.child.isRunning()) {
      this.child.abort(ctx);
    }
    super.abort(ctx);
  }
}

export abstract class BTComposite extends BTNode {
  public static readonly category: NodeCategory = 'composite';

  constructor(public children: BTNode[]) {
    super();
  }

  public override abort(ctx: IAIAgent): void {
    for (const child of this.children) {
      if (child.isRunning()) {
        child.abort(ctx);
      }
    }
    super.abort(ctx);
  }
}

export abstract class BTService extends BTDecorator {
  public static readonly category: NodeCategory = 'service';
  public static readonly defaultParams: { interval: number } = { interval: 1.0 };

  protected params: typeof BTService.defaultParams;
  private timeSinceLastTick: number = 0;

  constructor(child: BTNode, params?: Partial<typeof BTService.defaultParams>) {
    super(child);
    this.params = { ...BTService.defaultParams, ...params };
  }

  protected override onTick(ctx: IAIAgent): NodeStatus {
    this.timeSinceLastTick += ctx.dt;
    if (this.timeSinceLastTick >= this.params.interval) {
      this.tickService(ctx);
      if (this.params.interval > 0) {
        this.timeSinceLastTick = this.timeSinceLastTick % this.params.interval;
      } else {
        this.timeSinceLastTick = 0;
      }
    }
    return this.child.tick(ctx);
  }

  public get timeRemains() {
    return this.params.interval - this.timeSinceLastTick;
  }

  protected abstract tickService(ctx: IAIAgent): void;
}

export enum AIEventType {
  DAMAGED,
  TARGET_SPOTTED,
  TARGET_LOST,
  SET_TARGET,
  SET_PATROL_POINTS,
  APPLY_EFFECT,
  WEAPON_CHANGED,
}

export type AIEvent = {
  type: AIEventType;
  payload: any;
};

export class Blackboard {
  private data: Record<string, unknown> = {};

  public getData(): Record<string, unknown> {
    return this.data;
  }

  public set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  public get<T = any>(key: string): T {
    return this.data[key] as T;
  }

  public has(key: string): boolean {
    return this.data[key] !== undefined;
  }

  public remove(key: string): void {
    delete this.data[key];
  }
}

export type PathKeys = 'currentPath' | 'patrolPoints' | 'patrolRouteTmp';

type SquaredStats = {
  [K in keyof BehaviorStatsConfig as `${K}Sq`]: number;
};

export interface BBData extends BehaviorStatsConfig, SquaredStats {
  localTime: number;
  pressedKeys?: string[];
  targetId: string;
  bestCandidateId: string | undefined;
  isEngaged: boolean;
  currentPath: Vec3[];
  patrolPoints: Vec3[];
  currentPatrolIndex: number;
  patrolRouteTmp: Vec3[];
  health: number;
  maxHealth: number;
  pos: Vec3;
  visionFovAngle?: number;
  visionClarity?: number;
  visionMaxDist?: number;
  visionMaxDistSq?: number;
  hearingSensitivity?: number;
  hearingMaxDist?: number;
  hearingMaxDistSq?: number;
}

export interface BehaviorStatsConfig {
  detectDist: number;
  loseTargetDist: number;
  inPosDist: number;
  followStopDist: number;
  followUpDist: number;
}

export enum MOB_RELATIONS {
  DANGER = 'danger',
  PREY = 'prey',
  FRIEND = 'friend',
}

export type RelationGroup = string;

export type MobRelations = {
  [k in MOB_RELATIONS]?: (MobTypeId | RelationGroup)[];
};

export interface BehaviorConfig {
  stats_conf: BehaviorStatsConfig;
  bt_id: BehaviorTreeId;
  relations: MobRelations;
  relations_group?: string;
}

export interface BTLogicComponent {
  root_node: BTNode;
  blackboard: Blackboard;
  event_queue: AIEvent[];
  relations: MobRelations;
  relations_group?: string | undefined;
  behaviorId?: string;
}
