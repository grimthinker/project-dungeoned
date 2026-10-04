import type { IAIAgent } from './ports';
import { Vec3 } from '../types';
import { vec2_distance_to, Radians, angleDifference } from '../utils';
import { LOGIC_CONFIG } from './config';
import { NodeStatus, BTAction, PathKeys, BTSimpleAction } from './core';
import { NodeBBSchema } from './schema';

export class BTConditionValidTarget extends BTSimpleAction {
  public static readonly nodeName = 'Проверка валидности цели';
  public static readonly description = 'Проверяет, что цель валидна';
  public static readonly bbSchema: NodeBBSchema = {
    reads: { targetId: { type: 'entityId', description: 'Идентификатор цели' } },
    writes: {
      targetId: { type: 'entityId', description: 'Сброс цели при потере' },
      isEngaged: { type: 'boolean', description: 'Сброс состояния боя' },
    },
  };

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string | undefined>('targetId');

    if (targetId === undefined) return NodeStatus.FAILURE;

    if (!entity.world.isEntityAlive(targetId)) {
      bb.remove('targetId');
      bb.remove('isEngaged');
      return NodeStatus.FAILURE;
    }
    return NodeStatus.SUCCESS;
  }
  protected onAbort() {}
}

export class BTConditionEngaged extends BTSimpleAction {
  public static readonly nodeName = 'Проверка нахождения в бою';
  public static readonly description = 'Проверяет, что моб завязан в бою';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string>('targetId');
    if (targetId === undefined) return NodeStatus.FAILURE;

    const targetPos = entity.world.getEntityPos(targetId);
    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dist = vec2_distance_to(selfPos, targetPos);
    let isEngaged = bb.get<boolean>('isEngaged') || false;

    if (isEngaged) {
      if (dist > LOGIC_CONFIG.followUpDist) isEngaged = false;
    } else {
      if (dist <= LOGIC_CONFIG.followStopDist) isEngaged = true;
    }

    bb.set('isEngaged', isEngaged);
    return isEngaged ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
  protected onAbort() {}
}

type MovementGait = 'sprint' | 'jog' | 'walk';

export class BTActionPursue extends BTAction {
  public static readonly defaultParams = {
    stopDist: LOGIC_CONFIG.followStopDist,
    sprintMinDistance: undefined as number | undefined,
    walkDistance: undefined as number | undefined,
    hysteresis: 1.0,
    lookAtTarget: true,
  };
  private params: typeof BTActionPursue.defaultParams;
  private movementNode: BTActionFollowPathSmooth = new BTActionFollowPathSmooth('currentPath');
  private stopDistSq: number;
  private currentGait: MovementGait = 'jog';

  public static readonly nodeName = 'Преследовать цель';
  public static readonly description = 'Преследовать цель, если она есть и есть путь currentPath';
  public static readonly bbSchema: NodeBBSchema = {
    reads: {
      targetId: { type: 'entityId' },
      currentPath: { type: 'path' },
    },
  };

  constructor(params?: Partial<typeof BTActionPursue.defaultParams>) {
    super();
    this.params = { ...BTActionPursue.defaultParams, ...params };
    this.stopDistSq = this.params.stopDist ** 2;
  }

  protected onOpen(_entity: IAIAgent): void {
    this.currentGait = 'jog';
  }

  private updateGait(dist: number): MovementGait {
    const sprintMin = this.params.sprintMinDistance;
    const walkDist = this.params.walkDistance;
    const h = this.params.hysteresis ?? 1.0;

    if (sprintMin !== undefined && walkDist !== undefined) {
      if (this.currentGait === 'sprint') {
        if (dist < walkDist - h) {
          this.currentGait = 'walk';
        } else if (dist < sprintMin - h) {
          this.currentGait = 'jog';
        }
      } else if (this.currentGait === 'walk') {
        if (dist > sprintMin + h) {
          this.currentGait = 'sprint';
        } else if (dist > walkDist + h) {
          this.currentGait = 'jog';
        }
      } else {
        if (dist > sprintMin + h) {
          this.currentGait = 'sprint';
        } else if (dist < walkDist - h) {
          this.currentGait = 'walk';
        }
      }
      return this.currentGait;
    }

    if (walkDist !== undefined) {
      if (this.currentGait === 'walk') {
        if (dist > walkDist + h) this.currentGait = 'jog';
      } else {
        if (dist < walkDist - h) this.currentGait = 'walk';
      }
      return this.currentGait;
    }

    if (sprintMin !== undefined) {
      if (sprintMin === 0) return 'sprint';
      if (this.currentGait === 'sprint') {
        if (dist < sprintMin - h) this.currentGait = 'jog';
      } else {
        if (dist > sprintMin + h) this.currentGait = 'sprint';
      }
      return this.currentGait;
    }

    return 'jog';
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string>('targetId');
    if (targetId === undefined) return NodeStatus.FAILURE;

    const targetPos = entity.world.getEntityPos(targetId);
    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;
    const distSq = dx * dx + dz * dz;
    const dist = Math.hypot(dx, dz);

    const hasCustomGait =
      this.params.sprintMinDistance !== undefined || this.params.walkDistance !== undefined;

    let run = false;
    let slowWalk = false;

    if (hasCustomGait) {
      const gait = this.updateGait(dist);
      run = gait === 'sprint';
      slowWalk = gait === 'walk';
    }

    bb.set('gaitRun', run);
    bb.set('gaitWalk', slowWalk);

    if (distSq <= this.stopDistSq) {
      entity.clearMoveTarget();
      this.currentGait = 'jog';
      return NodeStatus.SUCCESS;
    }

    const path = bb.get<Vec3[]>('currentPath');
    if (path && path.length > 0) {
      this.movementNode.tick(entity);
    } else {
      if (dist > 0.001 && entity.isAlive) {
        entity.setMoveTarget(dx / dist, dz / dist, run, slowWalk);
      } else {
        entity.clearMoveTarget();
      }
    }

    if (this.params.lookAtTarget && entity.isAlive) {
      if (dist > 0.001) {
        const yaw = Math.atan2(dz, dx) as Radians;
        const myHeight = entity.getPhysicsHeight();
        const targetHeight = entity.world.getEntityHeight(targetId);
        const targetCenterY = targetPos.y + targetHeight * 0.5;
        const myHeadY = selfPos.y + myHeight * 0.75;
        const hdy = targetCenterY - myHeadY;
        const pitch = Math.atan2(hdy, dist) as Radians;
        entity.setLookTarget(yaw, pitch);
      }
    }

    return NodeStatus.RUNNING;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.blackboard.remove('currentPath');
    this.movementNode.abort(entity);
    entity.clearMoveTarget();
    if (this.params.lookAtTarget) {
      entity.clearLookTarget();
    }
    this.currentGait = 'jog';
  }
}

export class BTActionPatrol extends BTAction {
  private movementNode = new BTActionFollowPathSmooth('patrolRouteTmp');
  public static readonly nodeName = 'Патруль';
  public static readonly description =
    'Двигаться вдоль пути patrolPoints, если они есть, иначе возвращает FAILURE';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const points = bb.get<Vec3[]>('patrolPoints');

    if (!points || points.length === 0) return NodeStatus.FAILURE;

    let index = bb.get<number>('currentPatrolIndex') || 0;

    if (!bb.has('patrolRouteTmp')) {
      bb.set('patrolRouteTmp', [points[index]]);
    }

    const status = this.movementNode.tick(entity);

    if (status === NodeStatus.SUCCESS) {
      index = (index + 1) % points.length;
      bb.set('currentPatrolIndex', index);
      bb.remove('patrolRouteTmp');
      return NodeStatus.RUNNING;
    }

    return status;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.blackboard.remove('patrolRouteTmp');
    this.movementNode.abort(entity);
  }
}

export class BTActionAttack extends BTAction {
  private hasStarted: boolean = false;
  public static readonly nodeName = 'Атака';
  public static readonly description =
    'Совершает атаку указанным слотом (или первым свободным) и ожидает её завершения в движке';
  public static readonly defaultParams: { slotIndex?: number } = {
    slotIndex: undefined,
  };

  private params: typeof BTActionAttack.defaultParams;

  constructor(params?: Partial<typeof BTActionAttack.defaultParams>) {
    super();
    this.params = { ...BTActionAttack.defaultParams, ...params };
  }

  protected onOpen(entity: IAIAgent): void {
    if (entity.isAlive) {
      entity.clearMoveTarget();
      entity.intentAttack(this.params.slotIndex);
    }
    this.hasStarted = false;
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const isAttacking =
      this.params.slotIndex !== undefined
        ? entity.isSlotBusy(this.params.slotIndex)
        : entity.getAttackStatus() !== 'idle';

    if (isAttacking) {
      this.hasStarted = true;
      return NodeStatus.RUNNING;
    }

    if (entity.hasPendingAttackRequest()) {
      return NodeStatus.RUNNING;
    }

    if (this.hasStarted) {
      return NodeStatus.SUCCESS;
    }

    return NodeStatus.FAILURE;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.cancelAttack(this.params.slotIndex);
    this.hasStarted = false;
  }
}

export class BTCommandForgetTarget extends BTSimpleAction {
  public static readonly nodeName = 'Забыть цель';
  public static readonly description = 'Сбрасывает цель, состояние isEngaged и текущий путь';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    bb.remove('targetId');
    bb.remove('isEngaged');
    bb.remove('currentPath');
    entity.clearMoveTarget();
    entity.clearLookTarget();
    return NodeStatus.SUCCESS;
  }
}

export class BTCommandAcceptCandidate extends BTSimpleAction {
  public static readonly nodeName = 'Принять цель';
  public static readonly description = 'Принять цель, указанную в bestCandidateId, если она есть';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const candidate = bb.get<string | undefined>('bestCandidateId');

    if (candidate !== undefined) {
      bb.set('targetId', candidate);
      bb.remove('bestCandidateId');
      return NodeStatus.SUCCESS;
    }
    return NodeStatus.FAILURE;
  }
}

export class BTSucceedImmediately extends BTSimpleAction {
  public static readonly nodeName = 'Мгновенный успех';
  public static readonly description = 'Ничего не делает и сразу возвращает SUCCESS';

  protected onTick(ctx: IAIAgent): NodeStatus {
    return NodeStatus.SUCCESS;
  }
}

export class BTActionRotateHeadToPos extends BTAction {
  public static readonly nodeName = 'Повернуть голову';
  public static readonly description =
    'Поворачивает только голову к указанной точке. FAILURE, если цель вне анатомических лимитов шеи.';
  public static readonly defaultParams = { tolerance: 0.05, targetPosKey: 'targetPos' };

  private params: typeof BTActionRotateHeadToPos.defaultParams;

  constructor(params?: Partial<typeof BTActionRotateHeadToPos.defaultParams>) {
    super();
    this.params = { ...BTActionRotateHeadToPos.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string | undefined>('targetId');
    let targetPos: Vec3 | undefined;

    if (targetId !== undefined) {
      targetPos = entity.world.getEntityPos(targetId) ?? undefined;
    } else {
      targetPos = bb.get<Vec3>(this.params.targetPosKey);
    }

    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;
    const distXZ = Math.hypot(dx, dz);

    const headHeight = entity.getPhysicsHeight();
    const dy = targetPos.y - (selfPos.y + headHeight * 0.88);

    const targetYaw = Math.atan2(dz, dx) as Radians;
    const targetPitch = Math.atan2(dy, distXZ) as Radians;

    if (entity.isAlive) {
      entity.setLookTarget(targetYaw, targetPitch);
    }

    const limits = entity.getHeadLimits();
    if (limits) {
      const localYaw = angleDifference(targetYaw, entity.getAngle());
      if (localYaw < limits.minYaw - 0.1 || localYaw > limits.maxYaw + 0.1) {
        return NodeStatus.FAILURE;
      }
    }

    const headYaw = entity.getHeadYaw();
    if (Math.abs(angleDifference(targetYaw, headYaw)) <= this.params.tolerance) {
      return NodeStatus.SUCCESS;
    }

    return NodeStatus.RUNNING;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.clearLookTarget();
  }
}

export class BTActionLookAt extends BTAction {
  public static readonly nodeName = 'Смотреть на цель (комплексно)';
  public static readonly description =
    'Поворачивает голову к цели. Если цель уходит за спину - плавно доворачивает корпус.';

  private headAction = new BTActionRotateHeadToPos({ tolerance: 0.05, targetPosKey: 'targetPos' });
  private bodyAction = new BTActionRotateToPos({ tolerance: 0.1 });

  protected onTick(entity: IAIAgent): NodeStatus {
    const headStatus = this.headAction.tick(entity);
    if (headStatus === NodeStatus.FAILURE) {
      return this.bodyAction.tick(entity);
    }
    return headStatus;
  }

  protected stopAction(entity: IAIAgent): void {
    this.headAction.abort(entity);
    this.bodyAction.abort(entity);
  }
}

export class BTWait extends BTAction {
  public static readonly nodeName = 'Ожидание времени';
  public static readonly description = 'Ждёт заданное количество секунд и возвращает SUCCESS';
  public static readonly defaultParams = { duration: 1 };

  private startTime: number = 0;
  private params: typeof BTWait.defaultParams;

  constructor(params?: Partial<typeof BTWait.defaultParams>) {
    super();
    this.params = { ...BTWait.defaultParams, ...params };
  }

  protected onOpen(ctx: IAIAgent): void {
    this.startTime = ctx.blackboard.get<number>('localTime') ?? 0;
  }

  protected onTick(ctx: IAIAgent): NodeStatus {
    const currentTime = ctx.blackboard.get<number>('localTime') ?? 0;
    if (currentTime - this.startTime >= this.params.duration) {
      return NodeStatus.SUCCESS;
    }
    return NodeStatus.RUNNING;
  }

  protected stopAction(ctx: IAIAgent): void {}
}

export class BTActionRotateToPos extends BTAction {
  public static readonly nodeName = 'Повернуться к позиции';
  public static readonly description = 'Плавный поворот к указанной точке из блекборда';
  public static readonly defaultParams = { tolerance: LOGIC_CONFIG.angleDiffTolerance };

  private params: typeof BTActionRotateToPos.defaultParams;

  constructor(params?: Partial<typeof BTActionRotateToPos.defaultParams>) {
    super();
    this.params = { ...BTActionRotateToPos.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string | undefined>('targetId');
    let targetPos: Vec3 | undefined;

    if (targetId !== undefined) {
      targetPos = entity.world.getEntityPos(targetId) ?? undefined;
    } else {
      targetPos = bb.get<Vec3>('throwTargetPos') ?? bb.get<Vec3>('targetPos');
    }

    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;

    if (dx === 0 && dz === 0) return NodeStatus.SUCCESS;

    const dist = Math.hypot(dx, dz);
    if (targetId !== undefined && dist > LOGIC_CONFIG.followUpDist) {
      bb.set('isEngaged', false);
      this.stopAction(entity);
      return NodeStatus.FAILURE;
    }

    const targetAngle = Math.atan2(dz, dx) as Radians;
    const currentAngle = entity.getAngle();

    const diff = angleDifference(targetAngle, currentAngle);

    if (Math.abs(diff) <= this.params.tolerance) {
      this.stopAction(entity);
      return NodeStatus.SUCCESS;
    }

    if (entity.isAlive) {
      entity.setBodyAngleTarget(targetAngle);
    }

    return NodeStatus.RUNNING;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.clearBodyAngleTarget();
  }
}

export class BTActionStopTurn extends BTSimpleAction {
  public static readonly nodeName = 'Остановить поворот';
  public static readonly description = 'Останавливает вращение бота';

  protected onTick(entity: IAIAgent): NodeStatus {
    entity.clearBodyAngleTarget();
    entity.clearLookTarget();
    return NodeStatus.SUCCESS;
  }

  protected stopAction(entity: IAIAgent): void {}
}

export class BTActionFollowPathSmooth extends BTAction {
  public static readonly nodeName = 'Двигаться по пути (плавно)';
  public static readonly description =
    'Двигаться по пути currentPath с одновременным плавным поворотом';

  constructor(private pathKey: PathKeys = 'currentPath') {
    super();
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const path = bb.get<Vec3[]>(this.pathKey);

    if (!path || path.length === 0) {
      entity.clearMoveTarget();
      return NodeStatus.FAILURE;
    }

    const selfPos = entity.getPos();
    while (path.length > 0 && this.getDist(selfPos, path[0]) <= LOGIC_CONFIG.inPosDist) {
      path.shift();
    }

    if (path.length === 0) {
      entity.clearMoveTarget();
      bb.remove(this.pathKey);

      const navTarget = bb.get<Vec3>('navTargetPos');
      if (navTarget) {
        const distToNav = Math.hypot(navTarget.x - selfPos.x, navTarget.z - selfPos.z);
        if (distToNav <= LOGIC_CONFIG.inPosDist) {
          bb.remove('navTargetPos');
        }
      }

      return NodeStatus.SUCCESS;
    }

    const target = path[0];
    const dx = target.x - selfPos.x;
    const dz = target.z - selfPos.z;
    const dist = Math.hypot(dx, dz);

    const run = bb.get<boolean>('gaitRun') ?? false;
    const slowWalk = bb.get<boolean>('gaitWalk') ?? false;

    if (dist > 0.001 && entity.isAlive) {
      entity.setMoveTarget(dx / dist, dz / dist, run, slowWalk);
    } else {
      entity.clearMoveTarget();
    }

    return NodeStatus.RUNNING;
  }

  private getDist(p1: { x: number; z: number }, p2: { x: number; z: number }): number {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    return Math.hypot(dx, dz);
  }

  protected stopAction(entity: IAIAgent): void {
    entity.clearMoveTarget();
  }
}

export class BTAlwaysRunning extends BTAction {
  public static readonly nodeName = 'Постоянное выполнение';
  public static readonly description = 'Всегда возвращает RUNNING, удерживая сервисы активными';

  protected onTick(_ctx: IAIAgent): NodeStatus {
    return NodeStatus.RUNNING;
  }
  protected stopAction(_ctx: IAIAgent): void {}
}

export class BTActionDropItem extends BTSimpleAction {
  public static readonly nodeName = 'Сброс предмета (Интент)';
  public static readonly description =
    'Проверяет наличие requestedDropSlot в памяти и запускает процесс сброса';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const slotIndex = bb.get<number>('requestedDropSlot');

    if (slotIndex === undefined || slotIndex === null) {
      return NodeStatus.FAILURE;
    }

    if (!entity.isAlive) {
      bb.remove('requestedDropSlot');
      return NodeStatus.FAILURE;
    }

    if (entity.getCurrentInteraction() !== null) {
      return NodeStatus.FAILURE;
    }

    bb.remove('requestedDropSlot');
    entity.intentDropItem(slotIndex);
    return NodeStatus.SUCCESS;
  }
}

export class BTActionPickupItem extends BTSimpleAction {
  public static readonly nodeName = 'Подбор предмета (Интент)';
  public static readonly description =
    'Проверяет наличие requestedPickupId в памяти и запускает процесс подбора';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetItemId = bb.get<string>('requestedPickupId');

    if (!targetItemId) {
      return NodeStatus.FAILURE;
    }

    if (!entity.isAlive) {
      bb.remove('requestedPickupId');
      return NodeStatus.FAILURE;
    }

    if (entity.getCurrentInteraction() !== null) {
      return NodeStatus.FAILURE;
    }

    bb.remove('requestedPickupId');
    entity.intentPickupItem(targetItemId);
    return NodeStatus.SUCCESS;
  }
}

export class BTConditionStringState extends BTSimpleAction {
  public static readonly nodeName = 'Проверка состояния (строка)';
  public static readonly description = 'Проверяет строковое значение указанного ключа в памяти';
  public static readonly defaultParams = { stateKey: 'fetchState', expectedState: 'chasing_item' };

  private params: typeof BTConditionStringState.defaultParams;

  constructor(params?: Partial<typeof BTConditionStringState.defaultParams>) {
    super();
    this.params = { ...BTConditionStringState.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const currentState = bb.get<string>(this.params.stateKey) || 'idle';
    return currentState === this.params.expectedState ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export const BTConditionFetchState = BTConditionStringState;

export class BTActionMoveToPos extends BTAction {
  public static readonly nodeName = 'Двигаться к позиции';
  public static readonly description = 'Движется к координатам Vec3 из блекборда';
  public static readonly defaultParams = { posKey: 'playZoneCenter', stopDist: 2.0, sprint: false };

  private params: typeof BTActionMoveToPos.defaultParams;

  constructor(params?: Partial<typeof BTActionMoveToPos.defaultParams>) {
    super();
    this.params = { ...BTActionMoveToPos.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetPos = bb.get<Vec3>(this.params.posKey);
    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= this.params.stopDist) {
      entity.clearMoveTarget();
      return NodeStatus.SUCCESS;
    }

    if (entity.isAlive) {
      entity.setMoveTarget(dx / dist, dz / dist, this.params.sprint, false);
      entity.setLookTarget(Math.atan2(dz, dx) as Radians);
    }

    return NodeStatus.RUNNING;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.clearMoveTarget();
  }
}

export class BTActionSetTarget extends BTSimpleAction {
  public static readonly nodeName = 'Установить цель из памяти';
  public static readonly description = 'Копирует значение указанного ключа в targetId';
  public static readonly defaultParams = { sourceKey: 'fetchTargetId' };

  private params: typeof BTActionSetTarget.defaultParams;

  constructor(params?: Partial<typeof BTActionSetTarget.defaultParams>) {
    super();
    this.params = { ...BTActionSetTarget.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string>(this.params.sourceKey);
    if (!targetId || !entity.world.isEntityAlive(targetId)) {
      return NodeStatus.FAILURE;
    }
    if (bb.get('targetId') !== targetId) {
      bb.set('targetId', targetId);
      bb.remove('currentPath');
      bb.set('isEngaged', false);
    }
    if (this.params.sourceKey === 'fetchTargetId') {
      bb.set('isEngaged', false);
    }
    return NodeStatus.SUCCESS;
  }
}

export class BTActionPickup extends BTAction {
  public static readonly nodeName = 'Поднять предмет';
  public static readonly description =
    'Инициирует физический подбор предмета в свободный слот взаимодействия и ожидает завершения анимации';
  public static readonly defaultParams = {
    targetKey: 'targetId',
  };

  private params: typeof BTActionPickup.defaultParams;

  constructor(params?: Partial<typeof BTActionPickup.defaultParams>) {
    super();
    this.params = { ...BTActionPickup.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string>(this.params.targetKey);
    if (!targetId || !entity.world.isEntityAlive(targetId)) {
      return NodeStatus.FAILURE;
    }

    const ownerId = entity.world.getEntityOwnerId(targetId);
    if (ownerId && ownerId !== entity.id) {
      return NodeStatus.FAILURE;
    }

    const slots = entity.getInteractionSlots();
    const isAlreadyHeld = slots.some((s) => s.itemId === targetId);
    if (isAlreadyHeld) {
      return NodeStatus.SUCCESS;
    }

    const interaction = entity.getCurrentInteraction();
    if (interaction?.type === 'pickup') {
      return NodeStatus.RUNNING;
    }

    const targetPos = entity.world.getEntityPos(targetId);
    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;
    const distXZ = Math.hypot(dx, dz);

    const freeSlot = slots.find((s) => !s.isBroken && s.itemId === null);
    if (!freeSlot) return NodeStatus.FAILURE;

    const myRadius = entity.getPhysicsRadius();
    const myBaseHeight = entity.getPhysicsHeight();
    const targetRadius = entity.world.getEntityRadius(targetId);
    const distBetweenBorders = Math.max(0, distXZ - myRadius - targetRadius);

    // ВЕРТИКАЛЬНАЯ ПРОВЕРКА (Упрощенная через порты)
    const yMin = selfPos.y - myBaseHeight * 0.2;
    const yMax = selfPos.y + myBaseHeight * 1.2;
    const isWithinVerticalReach = targetPos.y >= yMin && targetPos.y <= yMax;

    if (distXZ > 0.001 && entity.isAlive) {
      const targetHeight = entity.world.getEntityHeight(targetId);
      const targetCenterY = targetPos.y + targetHeight * 0.5;
      const myHeadY = selfPos.y + myBaseHeight * 0.75;
      const dy = targetCenterY - myHeadY;
      entity.setLookTarget(Math.atan2(dz, dx) as Radians, Math.atan2(dy, distXZ) as Radians);
    }

    const interactDist = freeSlot.interactDist ?? 0.6;
    if (distBetweenBorders <= interactDist + 0.1 && isWithinVerticalReach) {
      entity.clearMoveTarget();
      entity.intentPickupItem(targetId);
      return NodeStatus.RUNNING;
    }

    return NodeStatus.FAILURE;
  }

  protected stopAction(entity: IAIAgent): void {
    entity.clearLookTarget();
  }
}

export class BTActionDrop extends BTAction {
  public static readonly nodeName = 'Сбросить предмет';
  public static readonly description =
    'Сбрасывает удерживаемый предмет под ноги и ожидает завершения анимации';
  public static readonly defaultParams = {
    slotIndex: undefined as number | undefined,
    itemKey: undefined as string | undefined,
  };

  private hasStarted: boolean = false;
  private params: typeof BTActionDrop.defaultParams;

  constructor(params?: Partial<typeof BTActionDrop.defaultParams>) {
    super();
    this.params = { ...BTActionDrop.defaultParams, ...params };
  }

  protected onOpen(_entity: IAIAgent): void {
    this.hasStarted = false;
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetItemId = this.params.itemKey ? bb.get<string>(this.params.itemKey) : undefined;

    const slots = entity.getInteractionSlots();
    const slotWithItem = slots.find((s) => {
      if (s.itemId === null) return false;
      if (this.params.slotIndex !== undefined && s.globalSlotIndex !== this.params.slotIndex) {
        return false;
      }
      if (targetItemId !== undefined && s.itemId !== targetItemId) {
        return false;
      }
      return true;
    });

    const interaction = entity.getCurrentInteraction();
    if (interaction?.type === 'drop') {
      this.hasStarted = true;
      return NodeStatus.RUNNING;
    }

    if (this.hasStarted) {
      this.hasStarted = false;
      return NodeStatus.SUCCESS;
    }

    if (!slotWithItem) {
      return NodeStatus.SUCCESS;
    }

    entity.clearMoveTarget();
    entity.intentDropItem(slotWithItem.globalSlotIndex);

    return NodeStatus.RUNNING;
  }

  protected stopAction(_entity: IAIAgent): void {
    this.hasStarted = false;
  }
}

export const BTActionFetchPickup = BTActionPickup;
export const BTActionMasterPickupStick = BTActionPickup;
export const BTActionFetchDeliver = BTActionDrop;
export const BTActionDogDropAtZone = BTActionDrop;

export class BTConditionMasterShouldThrow extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: пора кидать';
  public static readonly description =
    'Проверяет, должен ли хозяин кидать палки (слоты полны или нет палок на земле)';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    return bb.get('shouldThrow') ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTConditionMasterOutsidePlayZone extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: вне зоны игры';
  public static readonly description =
    'Проверяет, находится ли хозяин слишком далеко от центра зоны';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    return bb.get('isOutsidePlayZone') ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTConditionMasterReadyToThrow extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: готов к броску с собакой';
  public static readonly description =
    'Проверяет наличие палки, кулдаун 3с и присутствие свободной собаки рядом';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    return bb.get('isReadyToThrow') ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTConditionMasterCanThrowNow extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: готов бросить';
  public static readonly description = 'Проверяет кулдаун 3с и наличие свободной собаки рядом';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    return bb.get('canThrowNow') ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTActionCalculateRandomPositionInRange extends BTSimpleAction {
  public static readonly nodeName = 'Расчет случайной точки в радиусе';
  public static readonly description =
    'Выбирает случайную точку на заданном расстоянии от сущности с учетом рельефа';
  public static readonly defaultParams = {
    minDistance: 10.0,
    maxDistance: 22.0,
    targetPosKey: 'throwTargetPos',
    setLookAngle: true,
  };

  private params: typeof BTActionCalculateRandomPositionInRange.defaultParams;

  constructor(params?: Partial<typeof BTActionCalculateRandomPositionInRange.defaultParams>) {
    super();
    this.params = { ...BTActionCalculateRandomPositionInRange.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const selfPos = entity.getPos();

    const minR = this.params.minDistance;
    const maxR = this.params.maxDistance;
    const r = minR + Math.random() * (maxR - minR);
    const angle = Math.random() * Math.PI * 2;

    const tx = selfPos.x + Math.cos(angle) * r;
    const tz = selfPos.z + Math.sin(angle) * r;

    let ty = selfPos.y;
    const terrainHeight = entity.world.getTerrainHeight(tx, tz);
    if (terrainHeight !== null) {
      ty = terrainHeight;
    }

    const targetPos: Vec3 = { x: tx, y: ty, z: tz };
    bb.set(this.params.targetPosKey, targetPos);

    if (this.params.setLookAngle && entity.isAlive) {
      entity.setLookTarget(angle as Radians);
    }

    return NodeStatus.SUCCESS;
  }
}

export class BTActionThrow extends BTAction {
  public static readonly nodeName = 'Бросить предмет';
  public static readonly description =
    'Бросает предмет из слота взаимодействия в указанную 3D-точку из блекборда';
  public static readonly defaultParams = {
    targetPosKey: 'throwTargetPos',
    slotIndex: undefined as number | undefined,
    itemKey: undefined as string | undefined,
    cooldownKey: 'lastThrowTime',
  };

  private hasStarted = false;
  private params: typeof BTActionThrow.defaultParams;

  constructor(params?: Partial<typeof BTActionThrow.defaultParams>) {
    super();
    this.params = { ...BTActionThrow.defaultParams, ...params };
  }

  protected onOpen(_entity: IAIAgent): void {
    this.hasStarted = false;
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetPos = bb.get<Vec3>(this.params.targetPosKey);
    if (!targetPos) return NodeStatus.FAILURE;

    const interaction = entity.getCurrentInteraction();
    if (interaction?.type === 'throw') {
      this.hasStarted = true;
      return NodeStatus.RUNNING;
    }

    if (this.hasStarted) {
      this.hasStarted = false;
      bb.remove(this.params.targetPosKey);
      return NodeStatus.SUCCESS;
    }

    const targetItemId = this.params.itemKey ? bb.get<string>(this.params.itemKey) : undefined;
    const slots = entity.getInteractionSlots();
    const slotWithItem = slots.find((s) => {
      if (s.isBroken || !s.itemId) return false;
      if (this.params.slotIndex !== undefined && s.globalSlotIndex !== this.params.slotIndex) {
        return false;
      }
      if (targetItemId !== undefined && s.itemId !== targetItemId) {
        return false;
      }
      return true;
    });

    if (!slotWithItem || !slotWithItem.itemId) {
      return NodeStatus.FAILURE;
    }

    entity.intentThrowItem(slotWithItem.globalSlotIndex, slotWithItem.partId, targetPos);

    if (this.params.cooldownKey) {
      const localTime = bb.get<number>('localTime') || 0;
      bb.set(this.params.cooldownKey, localTime);
    }

    return NodeStatus.RUNNING;
  }

  protected stopAction(_entity: IAIAgent): void {
    this.hasStarted = false;
  }
}

export class BTConditionMasterCanPickupDeliveredStick extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: есть палка для подбора';
  public static readonly description = 'Проверяет свободные слоты и наличие доставленной палки';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const freeSlots = bb.get<number>('freeSlotCount') || 0;
    const nearestStickId = bb.get<string>('nearestDeliveredStickId');
    return freeSlots > 0 && !!nearestStickId ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export const BTActionMasterCalculateThrowTarget = BTActionCalculateRandomPositionInRange;
export const BTActionMasterThrowStick = BTActionThrow;

export class BTConditionMasterShouldFollowDog extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: собака слишком далеко';
  public static readonly description =
    'Проверяет удаленность собаки более 30м при наличии приоритетной цели';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const isAnyDogTooFar = bb.get<boolean>('isAnyDogTooFar');
    const priorityDogId = bb.get<string>('priorityDogId');
    return isAnyDogTooFar && !!priorityDogId ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTActionMasterLookAtDog extends BTSimpleAction {
  public static readonly nodeName = 'Хозяин: взгляд на собаку';
  public static readonly description = 'Поворачивается в сторону приоритетной собаки';

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const dogId = bb.get<string>('priorityDogId');
    if (!dogId) return NodeStatus.FAILURE;

    const dogPos = entity.world.getEntityPos(dogId);
    if (!dogPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dx = dogPos.x - selfPos.x;
    const dz = dogPos.z - selfPos.z;
    const distXZ = Math.hypot(dx, dz);

    if (distXZ > 0.001) {
      const myHeight = entity.getPhysicsHeight();
      const dogHeight = entity.world.getEntityHeight(dogId);
      const dy = dogPos.y + dogHeight * 0.7 - (selfPos.y + myHeight * 0.88);
      entity.setLookTarget(Math.atan2(dz, dx) as Radians, Math.atan2(dy, distXZ) as Radians);
    }
    return NodeStatus.SUCCESS;
  }
}

export class BTConditionDistance extends BTSimpleAction {
  public static readonly nodeName = 'Проверка дистанции до цели';
  public static readonly description = 'Проверяет, находится ли цель в пределах заданной дистанции';
  public static readonly defaultParams = { maxDistance: 2.0 };

  private params: typeof BTConditionDistance.defaultParams;

  constructor(params?: Partial<typeof BTConditionDistance.defaultParams>) {
    super();
    this.params = { ...BTConditionDistance.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const targetId = bb.get<string>('targetId');
    if (!targetId) return NodeStatus.FAILURE;

    const targetPos = entity.world.getEntityPos(targetId);
    if (!targetPos) return NodeStatus.FAILURE;

    const selfPos = entity.getPos();
    const dist = Math.hypot(targetPos.x - selfPos.x, targetPos.z - selfPos.z);

    return dist <= this.params.maxDistance ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTConditionInsideZone extends BTSimpleAction {
  public static readonly nodeName = 'Проверка нахождения в зоне';
  public static readonly description = 'Проверяет, находится ли агент внутри указанной зоны';
  public static readonly defaultParams = { zoneKey: 'targetZoneId' };

  private params: typeof BTConditionInsideZone.defaultParams;

  constructor(params?: Partial<typeof BTConditionInsideZone.defaultParams>) {
    super();
    this.params = { ...BTConditionInsideZone.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const zoneId = bb.get<string>(this.params.zoneKey);
    if (!zoneId) return NodeStatus.FAILURE;

    const inZone = entity.world.isEntityInZone(entity.id, zoneId);
    return inZone ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }
}

export class BTActionGetRandomPointInZone extends BTSimpleAction {
  public static readonly nodeName = 'Точка в зоне';
  public static readonly description =
    'Генерирует случайную точку внутри зоны и сохраняет в память';
  public static readonly defaultParams = {
    zoneKey: 'targetZoneId',
    targetPosKey: 'targetPos',
  };

  private params: typeof BTActionGetRandomPointInZone.defaultParams;

  constructor(params?: Partial<typeof BTActionGetRandomPointInZone.defaultParams>) {
    super();
    this.params = { ...BTActionGetRandomPointInZone.defaultParams, ...params };
  }

  protected onTick(entity: IAIAgent): NodeStatus {
    const bb = entity.blackboard;
    const zoneId = bb.get<string>(this.params.zoneKey);
    if (!zoneId) return NodeStatus.FAILURE;

    const point = entity.world.getRandomPointInZone(zoneId);
    if (!point) return NodeStatus.FAILURE;

    bb.set(this.params.targetPosKey, point);
    return NodeStatus.SUCCESS;
  }
}
