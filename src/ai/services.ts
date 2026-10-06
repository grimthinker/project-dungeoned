import { BTService, BTNode, NodeStatus } from './core';
import { LOGIC_CONFIG } from './config';
import { Vec3 } from '../types';
import type { IAIAgent } from './ports';
import { NodeBBSchema } from './schema';
import { normalizeAngle, angleDifference } from '../utils';

export class BTServiceFindNearestTarget extends BTService {
  public static readonly nodeName = 'Поиск ближайшей цели';
  public static readonly description =
    'Периодически сканирует окружающих сущностей, проверяет текущую цель на потерю видимости и записывает лучшего кандидата в blackboard';

  public static readonly defaultParams = {
    ...BTService.defaultParams,
  };

  protected override params: typeof BTServiceFindNearestTarget.defaultParams = {
    interval: LOGIC_CONFIG.findNewTargetInterval,
  };

  constructor(child: BTNode, params?: Partial<typeof BTServiceFindNearestTarget.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceFindNearestTarget.defaultParams, ...params };
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;

    const range = bb.get<number>('detectDist') ?? LOGIC_CONFIG.detectDist;
    const rangeSq = bb.get<number>('detectDistSq') ?? range * range;
    const loseDist = bb.get<number>('loseTargetDist') ?? LOGIC_CONFIG.loseTargetDist;
    const loseDistSq = bb.get<number>('loseTargetDistSq') ?? loseDist * loseDist;

    if (range <= 0) {
      bb.remove('targetId');
      bb.remove('bestCandidateId');
      return;
    }

    const currentTargetId = bb.get<string>('targetId');
    if (currentTargetId !== undefined && currentTargetId !== null) {
      const targetPos = entity.world.getEntityPos(currentTargetId);

      let shouldLose = false;
      if (!targetPos || !entity.world.isEntityAlive(currentTargetId)) {
        shouldLose = true;
      } else {
        const selfPos = entity.getPos();
        const dx = targetPos.x - selfPos.x;
        const dz = targetPos.z - selfPos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > loseDistSq) {
          shouldLose = true;
        }
      }

      if (shouldLose) {
        bb.remove('targetId');
      } else {
        return;
      }
    }

    const agents = entity.world.getAllAgents();

    let nearestId: string | null = null;
    let minDistSq = rangeSq;

    for (const e of agents) {
      if (entity.id === e.id) continue;
      if (!e.isAlive) continue;

      const selfPos = entity.getPos();
      const targetPos = e.getPos();

      const dx = targetPos.x - selfPos.x;
      if (dx > range || dx < -range) continue;

      const dz = targetPos.z - selfPos.z;
      if (dz > range || dz < -range) continue;

      const distSq = dx * dx + dz * dz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearestId = e.id;
      }
    }

    if (nearestId !== null) {
      bb.set('bestCandidateId', nearestId);
    }
  }
}

export class BTServicePathUpdater extends BTService {
  private isRequesting = false;
  private requestTimer = 999;
  private lastStartPos: Vec3 = { x: 0, y: 0, z: 0 };
  private lastTargetPos: Vec3 = { x: 0, y: 0, z: 0 };

  private readonly pushedDistanceSq: number;

  public static readonly nodeName = 'Обновление пути';
  public static readonly description =
    'Периодически пересчитывает путь до цели через навигационную сетку и сохраняет его в blackboard';

  public static readonly defaultParams = {
    ...BTService.defaultParams,
    interval: 0.1,
    targetPosKey: 'targetPos',
    useTargetId: true,
    ...LOGIC_CONFIG.pathUpdaterParams,
  };

  protected override params: typeof BTServicePathUpdater.defaultParams;

  constructor(child: BTNode, params?: Partial<typeof BTServicePathUpdater.defaultParams>) {
    super(child, params);
    this.params = { ...BTServicePathUpdater.defaultParams, ...params };
    this.pushedDistanceSq = this.params.pushedDistance ** 2;
  }

  protected override onTick(entity: IAIAgent): NodeStatus {
    this.requestTimer += entity.dt;
    return super.onTick(entity);
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;

    if (bb.get('isEngaged')) return;

    const targetId = this.params.useTargetId !== false ? bb.get<string>('targetId') : undefined;
    let targetPos: Vec3 | undefined;

    if (targetId !== undefined && targetId !== null) {
      targetPos = entity.world.getEntityPos(targetId) ?? undefined;
    } else {
      targetPos = bb.get<Vec3>(this.params.targetPosKey ?? 'targetPos');
    }

    if (targetPos) {
      const selfPos = entity.getPos();
      const dx = targetPos.x - selfPos.x;
      const dz = targetPos.z - selfPos.z;
      const distSq = dx * dx + dz * dz;

      const inPosDist = LOGIC_CONFIG.inPosDist;
      if (!targetId && distSq <= inPosDist * inPosDist) {
        bb.remove(this.params.targetPosKey ?? 'targetPos');
        bb.remove('currentPath');
        entity.clearMoveTarget();
        return;
      }

      this.updatePathingLogic(entity, selfPos, targetPos, distSq);
    }
  }

  private updatePathingLogic(entity: IAIAgent, selfPos: Vec3, targetPos: Vec3, distSq: number) {
    if (this.isRequesting) return;

    let shouldRequest = false;

    const currentPath = entity.blackboard.get<Vec3[]>('currentPath');
    if (!currentPath || currentPath.length === 0) {
      shouldRequest = true;
    }

    const pdx = selfPos.x - this.lastStartPos.x;
    const pdz = selfPos.z - this.lastStartPos.z;

    if (pdx * pdx + pdz * pdz > this.pushedDistanceSq) {
      shouldRequest = true;
    }

    const dist = Math.sqrt(distSq);
    const t = Math.min(dist / this.params.maxDistanceCalc, 1.0);
    const currentInterval =
      this.params.minIntervalDt + t * (this.params.maxIntervalDt - this.params.minIntervalDt);

    if (this.requestTimer >= currentInterval) {
      const currentThreshold =
        this.params.minTargetMoveThreshold +
        t * (this.params.maxTargetMoveThreshold - this.params.minTargetMoveThreshold);

      const tdx = targetPos.x - this.lastTargetPos.x;
      const tdz = targetPos.z - this.lastTargetPos.z;

      if (tdx * tdx + tdz * tdz > currentThreshold * currentThreshold) {
        shouldRequest = true;
      }
    }

    if (shouldRequest) {
      this.isRequesting = true;
      this.requestTimer = 0;
      this.lastStartPos = { x: selfPos.x, y: selfPos.y, z: selfPos.z };
      this.lastTargetPos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
      const pathPromise = entity.world.getPath(selfPos, targetPos, entity.getPhysicsRadius());
      this.handlePathPromise(entity, pathPromise);
    }
  }

  private handlePathPromise(entity: IAIAgent, promise: Promise<Vec3[]>) {
    promise
      .then((newPath) => {
        this.isRequesting = false;
        const targetPosKey = this.params.targetPosKey ?? 'targetPos';
        const bb = entity.blackboard;
        if (newPath && bb && (bb.has('targetId') || bb.has(targetPosKey))) {
          bb.set('currentPath', newPath);
        }
      })
      .catch(() => {
        this.isRequesting = false;
      });
  }
}

export class BTServiceBodyTurnOnLookLimit extends BTService {
  public static readonly nodeName = 'Поворот тела по лимиту шеи';
  public static readonly description =
    'Если существо стоит на месте и угол взгляда упирается в анатомический предел шеи, плавно поворачивает корпус вслед за взглядом';

  public static readonly defaultParams = { interval: 0 };
  protected override params = { interval: 0 };

  private isControllingBody = false;

  constructor(child: BTNode, params?: Partial<typeof BTServiceBodyTurnOnLookLimit.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceBodyTurnOnLookLimit.defaultParams, ...params };
  }

  protected override onAbort(entity: IAIAgent): void {
    if (this.isControllingBody) {
      entity.clearBodyAngleTarget();
      this.isControllingBody = false;
    }
    super.onAbort(entity);
  }

  protected override onClose(entity: IAIAgent): void {
    if (this.isControllingBody) {
      entity.clearBodyAngleTarget();
      this.isControllingBody = false;
    }
    super.onClose(entity);
  }

  protected tickService(entity: IAIAgent): void {
    if (!entity.isAlive) return;

    // В будущем агенты смогут предоставлять метод isMoving(), пока заглушка
    // подразумевает, что если цель задана - агент движется (логика MovementSystem берет верх).

    const limits = entity.getHeadLimits();
    if (!limits) return;

    // Проверяем отклонение угла взгляда
    const headYaw = entity.getHeadYaw();
    const bodyAngle = entity.getAngle();
    const angleDiff = angleDifference(headYaw, bodyAngle);

    const startThresholdMax = limits.maxYaw * limits.turnBodyFollowRatio;
    const startThresholdMin = limits.minYaw * limits.turnBodyFollowRatio;
    const stopThresholdMax = limits.maxYaw * limits.turnBodyStopRatio;
    const stopThresholdMin = limits.minYaw * limits.turnBodyStopRatio;

    if (this.isControllingBody) {
      if (angleDiff > stopThresholdMax || angleDiff < stopThresholdMin) {
        entity.setBodyAngleTarget(headYaw);
      } else {
        entity.clearBodyAngleTarget();
        this.isControllingBody = false;
      }
    } else {
      if (angleDiff > startThresholdMax || angleDiff < startThresholdMin) {
        entity.setBodyAngleTarget(headYaw);
        this.isControllingBody = true;
      }
    }
  }
}

export class BTServiceSyncStats extends BTService {
  public static readonly nodeName = 'Синхронизация параметров';
  public static readonly description =
    'Регулярно переносит актуальные боевые и поведенческие характеристики в blackboard существа';
  public static readonly bbSchema: NodeBBSchema = {
    writes: {
      health: { type: 'number', isSystem: true, description: 'Текущее здоровье' },
      maxHealth: { type: 'number', isSystem: true, description: 'Макс. здоровье' },
      pos: { type: 'point', isSystem: true, description: 'Координаты' },
      detectDist: { type: 'number', description: 'Радиус обнаружения' },
      loseTargetDist: { type: 'number', description: 'Дистанция потери цели' },
      followStopDist: { type: 'number', description: 'Остановка до цели' },
      followUpDist: { type: 'number', description: 'Старт преследования' },
      visionFovAngle: { type: 'number', description: 'Угол обзора' },
      visionClarity: { type: 'number', description: 'Четкость зрения' },
      visionMaxDist: { type: 'number', description: 'Дальность зрения' },
      hearingSensitivity: { type: 'number', description: 'Слух' },
      hearingMaxDist: { type: 'number', description: 'Дальность слуха' },
    },
  };

  public static readonly defaultParams = {
    ...BTService.defaultParams,
  };

  protected override params: typeof BTServiceSyncStats.defaultParams;

  constructor(child: BTNode, params?: Partial<typeof BTServiceSyncStats.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceSyncStats.defaultParams, ...params };
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;
    const behaviorStats = entity.getBehaviorStats();
    const sense = entity.getSenseStats();

    let detectDist = behaviorStats?.detectDist ?? LOGIC_CONFIG.detectDist;
    let loseTargetDist = behaviorStats?.loseTargetDist ?? LOGIC_CONFIG.loseTargetDist;

    if (sense) {
      bb.set('visionFovAngle', sense.visionFovAngle);
      bb.set('visionClarity', sense.visionClarity);
      bb.set('visionMaxDist', sense.visionMaxDist);
      bb.set('visionMaxDistSq', sense.visionMaxDist * sense.visionMaxDist);

      bb.set('hearingSensitivity', sense.hearingSensitivity);
      bb.set('hearingMaxDist', sense.hearingMaxDist);
      bb.set('hearingMaxDistSq', sense.hearingMaxDist * sense.hearingMaxDist);

      const effectiveSenseDist = Math.max(sense.visionMaxDist, sense.hearingMaxDist);
      detectDist = effectiveSenseDist;
      loseTargetDist = effectiveSenseDist > 0 ? effectiveSenseDist * 1.5 : 0;
    }

    bb.set('detectDist', detectDist);
    bb.set('detectDistSq', detectDist * detectDist);
    bb.set('loseTargetDist', loseTargetDist);
    bb.set('loseTargetDistSq', loseTargetDist * loseTargetDist);

    bb.set('health', entity.getHp());
    bb.set('maxHealth', entity.getMaxHp());

    const selfPos = entity.getPos();
    bb.set('pos', { x: selfPos.x, y: selfPos.y, z: selfPos.z });

    const stopDist = behaviorStats?.followStopDist ?? 2.0;

    bb.set('followStopDist', stopDist);
    bb.set('followUpDist', stopDist + 10);
  }
}

export class BTServiceInputListener extends BTService {
  public static readonly nodeName = 'Слушатель ввода';
  public static readonly description = 'Слушает глобальный ввод и пишет нажатые клавиши в память';

  public static readonly defaultParams = { interval: 0 };
  protected override params: typeof BTServiceInputListener.defaultParams = { interval: 0 };

  constructor(child: BTNode, params?: Partial<typeof BTServiceInputListener.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceInputListener.defaultParams, ...params };
  }

  protected override onOpen(entity: IAIAgent): void {
    super.onOpen(entity);
    this.tickService(entity);
  }

  protected override onAbort(entity: IAIAgent): void {
    entity.blackboard.remove('pressedKeys');
    super.onAbort(entity);
  }

  protected override onClose(entity: IAIAgent): void {
    entity.blackboard.remove('pressedKeys');
    super.onClose(entity);
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;
    const keys = entity.world.getPressedKeys();
    if (keys.length > 0) {
      bb.set('pressedKeys', keys);
    } else {
      bb.remove('pressedKeys');
    }
  }
}

export class BTServiceInputController extends BTService {
  public static readonly nodeName = 'Контроллер ввода';
  public static readonly description =
    'Читает нажатые клавиши из памяти и управляет агентом через актуаторы';

  public static readonly defaultParams = { interval: 0 };
  protected override params: typeof BTServiceInputController.defaultParams = { interval: 0 };

  constructor(child: BTNode, params?: Partial<typeof BTServiceInputController.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceInputController.defaultParams, ...params };
  }

  protected override onAbort(entity: IAIAgent): void {
    entity.clearMoveTarget();
    entity.clearLookTarget();
    entity.clearBodyAngleTarget();
    entity.cancelAttack();
    const input = (entity as any).worldEcs?.getComponent((entity as any).id, 'input');
    if (input) input.wantsJump = false;
    super.onAbort(entity);
  }

  protected override onClose(entity: IAIAgent): void {
    entity.clearMoveTarget();
    entity.clearLookTarget();
    entity.clearBodyAngleTarget();
    entity.cancelAttack();
    const input = (entity as any).worldEcs?.getComponent((entity as any).id, 'input');
    if (input) input.wantsJump = false;
    super.onClose(entity);
  }

  protected tickService(entity: IAIAgent): void {
    if (!entity.isAlive) return;

    const bb = entity.blackboard;
    const keys = bb.get<string[]>('pressedKeys') || [];

    const keysSet = new Set(keys);

    if (keysSet.has(' ')) {
      entity.intentJump();
    }

    if (keysSet.has('v')) {
      entity.setStance('prone');
    } else if (keysSet.has('c')) {
      entity.setStance('crouching');
    } else {
      entity.setStance('standing');
    }

    if (keysSet.has('f')) {
      entity.intentAttack(undefined, 'right_hand');
    } else if (keysSet.has('g')) {
      entity.intentAttack(undefined, 'left_hand');
    } else {
      entity.cancelAttack();
    }

    const isRunning = keysSet.has('shift');
    const isSlowWalking = keysSet.has('x');
    bb.set('gaitRun', isRunning);
    bb.set('gaitWalk', isSlowWalking);
  }
}

export class BTServiceEnforceWalkMode extends BTService {
  public static readonly nodeName = 'Принудительный шаг';
  public static readonly description =
    'Всегда держит режим ходьбы (ожидается настройка в контроллере)';
  public static readonly defaultParams = { interval: 0 };
  protected override params = { interval: 0 };

  constructor(child: BTNode, params?: Partial<typeof BTServiceEnforceWalkMode.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceEnforceWalkMode.defaultParams, ...params };
  }

  protected tickService(entity: IAIAgent): void {
    entity.blackboard.set('gaitRun', false);
    entity.blackboard.set('gaitWalk', true);
  }
}

export class BTServiceFetchMasterWatcher extends BTService {
  public static readonly nodeName = 'Наблюдение хозяина за апортом';
  public static readonly description =
    'Отслеживает палки в руках, принесенные палки на земле, собак и границы зоны игры';

  public static readonly bbSchema: NodeBBSchema = {
    reads: {
      dogIds: { type: 'any', description: 'Список ID привязанных собак' },
      playZoneCenter: { type: 'point', description: 'Центр зоны игры' },
      playZoneRadius: { type: 'number', description: 'Радиус зоны игры' },
      dogFollowDistance: { type: 'number', description: 'Дистанция старта следования за собакой' },
      detectDist: { type: 'number', description: 'Радиус восприятия' },
    },
    writes: {
      playZoneCenter: { type: 'point', description: 'Центр зоны игры' },
      isOutsidePlayZone: { type: 'boolean', description: 'Хозяин за пределами зоны игры' },
      heldStickCount: { type: 'number', description: 'Количество удерживаемых палок' },
      freeSlotCount: { type: 'number', description: 'Количество свободных слотов' },
      nearestDeliveredStickId: { type: 'entityId', description: 'Ближайшая доставленная палка' },
      shouldThrow: { type: 'boolean', description: 'Пора бросать палку' },
      hasReadyDogNearby: { type: 'boolean', description: 'Рядом есть свободная собака' },
      isAnyDogTooFar: { type: 'boolean', description: 'Собака убежала далеко' },
      priorityDogId: { type: 'entityId', description: 'Приоритетная собака' },
      isReadyToThrow: { type: 'boolean', description: 'Готовность к броску' },
      canThrowNow: { type: 'boolean', description: 'Возможность бросить прямо сейчас' },
    },
  };

  public static readonly defaultParams = {
    ...BTService.defaultParams,
    interval: 0.1,
    throwCooldown: 3.0,
    dogFollowDistance: 20.0,
  };

  protected override params: typeof BTServiceFetchMasterWatcher.defaultParams;

  constructor(child: BTNode, params?: Partial<typeof BTServiceFetchMasterWatcher.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceFetchMasterWatcher.defaultParams, ...params };
  }

  protected override onOpen(entity: IAIAgent): void {
    super.onOpen(entity);
    this.tickService(entity);
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;
    const selfPos = entity.getPos();

    let playZoneCenter = bb.get<Vec3>('playZoneCenter');
    if (!playZoneCenter) {
      playZoneCenter = { ...selfPos };
      bb.set('playZoneCenter', playZoneCenter);
    }

    const distToCenter = Math.hypot(selfPos.x - playZoneCenter.x, selfPos.z - playZoneCenter.z);
    bb.set('isOutsidePlayZone', distToCenter > 15.0);

    const slots = entity.getInteractionSlots();
    const allSticks = entity.world.findFetchSticks(entity.id);

    const heldSticks = allSticks.filter((s) => s.state === 'held_by_master');
    const freeSlots = slots.filter((s) => !s.isBroken && s.itemId === null);

    bb.set('heldStickCount', heldSticks.length);
    bb.set('freeSlotCount', freeSlots.length);

    const detectDist = bb.get<number>('detectDist') || LOGIC_CONFIG.detectDist;
    const deliveredSticks = allSticks.filter((s) => s.state === 'delivered' && !s.ownerId);

    let nearestDeliveredId: string | null = null;
    let minStickDist = detectDist;

    for (const stick of deliveredSticks) {
      const d = Math.hypot(stick.pos.x - selfPos.x, stick.pos.z - selfPos.z);
      if (d <= minStickDist) {
        minStickDist = d;
        nearestDeliveredId = stick.id;
      }
    }

    if (nearestDeliveredId) {
      bb.set('nearestDeliveredStickId', nearestDeliveredId);
    } else {
      bb.remove('nearestDeliveredStickId');
    }

    const shouldThrow = heldSticks.length > 0 && (freeSlots.length === 0 || !nearestDeliveredId);
    bb.set('shouldThrow', shouldThrow);

    const dogIds = bb.get<string[]>('dogIds') || [];
    let hasReadyDogNearby = false;
    let isAnyDogTooFar = false;
    let priorityDogId: string | null = null;
    let maxDistFromCenter = -1;

    const followDistanceThreshold =
      bb.get<number>('dogFollowDistance') ?? this.params.dogFollowDistance;

    for (const dId of dogIds) {
      const dog = entity.world.getAgent(dId);
      if (!dog || !dog.isAlive) continue;

      const dPos = dog.getPos();
      const distToMaster = Math.hypot(dPos.x - selfPos.x, dPos.z - selfPos.z);
      const distFromCenter = Math.hypot(dPos.x - playZoneCenter.x, dPos.z - playZoneCenter.z);

      const dogHasItem = dog.getInteractionSlots().some((s) => s.itemId !== null);

      if (distToMaster <= 6.0 && !dogHasItem) {
        hasReadyDogNearby = true;
      }

      if (distToMaster > followDistanceThreshold) {
        isAnyDogTooFar = true;
      }

      const dogHoldsStick = allSticks.some((s) => s.state === 'held_by_dog' && s.ownerId === dId);

      if (dogHoldsStick) {
        priorityDogId = dId;
      } else if (!priorityDogId && distFromCenter > maxDistFromCenter) {
        maxDistFromCenter = distFromCenter;
        priorityDogId = dId;
      }
    }

    bb.set('hasReadyDogNearby', hasReadyDogNearby);
    bb.set('isAnyDogTooFar', isAnyDogTooFar);
    if (priorityDogId) {
      bb.set('priorityDogId', priorityDogId);
    } else {
      bb.remove('priorityDogId');
    }

    const localTime = bb.get<number>('localTime') || 0;
    const lastThrowTime = bb.get<number>('lastThrowTime') || -999;
    const canThrowCooldown = localTime - lastThrowTime >= this.params.throwCooldown;

    const isOutsidePlayZone = bb.get<boolean>('isOutsidePlayZone');
    const isReadyToThrow = shouldThrow && canThrowCooldown && hasReadyDogNearby;
    bb.set('isReadyToThrow', isReadyToThrow);

    const canThrowNow = isReadyToThrow && !isOutsidePlayZone;
    bb.set('canThrowNow', canThrowNow);
  }
}

export class BTServiceFetchWatcher extends BTService {
  public static readonly nodeName = 'Наблюдение собаки за апортом';
  public static readonly description =
    'Следит за брошенными палками хозяина с учетом дальности обнаружения и гистерезиса';

  public static readonly bbSchema: NodeBBSchema = {
    reads: {
      masterEntityId: { type: 'entityId', description: 'ID хозяина' },
      detectDist: { type: 'number', description: 'Радиус обнаружения' },
      playZoneCenter: { type: 'point', description: 'Центр зоны игры' },
    },
    writes: {
      masterEntityId: { type: 'entityId', description: 'ID хозяина' },
      fetchTargetId: { type: 'entityId', description: 'Целевая палка' },
      fetchState: { type: 'string', description: 'Состояние апорта' },
      dogZoneWaitPos: { type: 'point', description: 'Точка ожидания в зоне игры' },
    },
  };

  public static readonly defaultParams = {
    ...BTService.defaultParams,
    interval: 0.1,
    unreachableTimeout: 15.0,
    hysteresisDistance: 3.0,
    retargetCooldown: 0.6,
  };

  private chaseTimer: number = 0;
  private retargetTimer: number = 0;
  private unreachableSticks: Map<string, number> = new Map();

  protected override params: typeof BTServiceFetchWatcher.defaultParams;

  constructor(child: BTNode, params?: Partial<typeof BTServiceFetchWatcher.defaultParams>) {
    super(child, params);
    this.params = { ...BTServiceFetchWatcher.defaultParams, ...params };
  }

  protected override onOpen(entity: IAIAgent): void {
    super.onOpen(entity);
    this.chaseTimer = 0;
    this.retargetTimer = 0;
    this.unreachableSticks.clear();
    entity.blackboard.remove('dogZoneWaitPos');
    this.tickService(entity);
  }

  protected tickService(entity: IAIAgent): void {
    const bb = entity.blackboard;
    const selfPos = entity.getPos();
    const localTime = bb.get<number>('localTime') || 0;

    this.retargetTimer -= this.params.interval;

    for (const [stickId, expiry] of this.unreachableSticks.entries()) {
      if (localTime >= expiry) {
        this.unreachableSticks.delete(stickId);
      }
    }

    let masterId = bb.get<string>('masterEntityId');
    if (!masterId) {
      const masters = entity.world.getAgentsByBehavior('MasterFetchTree');
      if (masters.length > 0 && masters[0].isAlive) {
        masterId = masters[0].id;
        bb.set('masterEntityId', masterId);
      }
    }

    const detectDist = bb.get<number>('detectDist') || LOGIC_CONFIG.detectDist;

    let isMasterSpotted = false;
    if (masterId) {
      const masterPos = entity.world.getEntityPos(masterId);
      if (masterPos && entity.world.isEntityAlive(masterId)) {
        const distToMaster = Math.hypot(masterPos.x - selfPos.x, masterPos.z - selfPos.z);
        if (distToMaster <= detectDist) {
          isMasterSpotted = true;
        }
      }
    }

    const allSticks = masterId ? entity.world.findFetchSticks(masterId) : [];
    const hasStickInMouth = allSticks.some(
      (s) => s.state === 'held_by_dog' && s.ownerId === entity.id
    );

    if (hasStickInMouth) {
      this.chaseTimer = 0;
      bb.remove('fetchTargetId');
      bb.remove('dogZoneWaitPos');
      if (isMasterSpotted) {
        bb.set('fetchState', 'returning_to_master');
      } else {
        bb.set('fetchState', 'delivering_to_zone');
      }
      return;
    }

    const validCandidates: { id: string; dist: number }[] = [];

    for (const stick of allSticks) {
      if (stick.state !== 'thrown') continue;
      if (stick.ownerId) continue;
      if (this.unreachableSticks.has(stick.id)) continue;

      const d = Math.hypot(stick.pos.x - selfPos.x, stick.pos.z - selfPos.z);
      if (d <= detectDist) {
        validCandidates.push({ id: stick.id, dist: d });
      }
    }

    validCandidates.sort((a, b) => a.dist - b.dist);

    let currentTargetId = bb.get<string | null>('fetchTargetId');
    if (currentTargetId) {
      const targetPos = entity.world.getEntityPos(currentTargetId);
      const targetStick = allSticks.find((s) => s.id === currentTargetId);
      const isCurrentStillValid =
        targetPos &&
        targetStick?.state === 'thrown' &&
        !targetStick.ownerId &&
        !this.unreachableSticks.has(currentTargetId);

      if (!isCurrentStillValid) {
        currentTargetId = null;
        this.chaseTimer = 0;
      } else {
        const curDist = Math.hypot(targetPos!.x - selfPos.x, targetPos!.z - selfPos.z);
        if (curDist > detectDist) {
          currentTargetId = null;
          this.chaseTimer = 0;
        } else if (validCandidates.length > 0 && validCandidates[0].id !== currentTargetId) {
          if (
            this.retargetTimer <= 0 &&
            validCandidates[0].dist < curDist - this.params.hysteresisDistance
          ) {
            currentTargetId = validCandidates[0].id;
            this.retargetTimer = this.params.retargetCooldown;
            this.chaseTimer = 0;
          }
        }
      }
    }

    if (!currentTargetId && validCandidates.length > 0) {
      currentTargetId = validCandidates[0].id;
      this.retargetTimer = this.params.retargetCooldown;
      this.chaseTimer = 0;
    }

    if (currentTargetId) {
      this.chaseTimer += this.params.interval;
      if (this.chaseTimer > this.params.unreachableTimeout) {
        this.unreachableSticks.set(currentTargetId, localTime + 25.0);
        currentTargetId = null;
        this.chaseTimer = 0;
      }
    }

    if (currentTargetId) {
      bb.remove('dogZoneWaitPos');
      bb.set('fetchTargetId', currentTargetId);
      bb.set('fetchState', 'chasing_item');
    } else {
      bb.remove('fetchTargetId');
      if (isMasterSpotted) {
        bb.remove('dogZoneWaitPos');
        bb.set('fetchState', 'following_master');
      } else {
        bb.set('fetchState', 'returning_to_zone');

        if (!bb.has('dogZoneWaitPos')) {
          let playCenter = bb.get<Vec3>('playZoneCenter');
          if (!playCenter) {
            playCenter = { ...selfPos };
          }
          const angle = Math.random() * Math.PI * 2;
          const r = 3.0 + Math.random() * 5.0;
          const wx = playCenter.x + Math.cos(angle) * r;
          const wz = playCenter.z + Math.sin(angle) * r;

          let wy = playCenter.y;
          const h = entity.world.getTerrainHeight(wx, wz);
          if (h !== null) wy = h;

          bb.set('dogZoneWaitPos', { x: wx, y: wy, z: wz });
        }
      }
    }
  }
}
