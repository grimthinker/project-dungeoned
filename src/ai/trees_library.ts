import {
  BTActionAttack,
  BTCommandForgetTarget,
  BTActionPatrol,
  BTActionFollow,
  BTConditionValidTarget,
  BTCommandAcceptCandidate,
  BTConditionEngaged,
  BTWait,
  BTActionRotateToPos,
  BTAlwaysRunning,
  BTActionDropItem,
  BTActionPickupItem,
  BTConditionStringState,
  BTActionSetTarget,
  BTActionPickup,
  BTActionDrop,
  BTActionThrow,
  BTConditionDistance,
  BTActionMoveToPos,
  BTConditionMasterShouldThrow,
  BTConditionMasterReadyToThrow,
  BTConditionMasterOutsidePlayZone,
  BTConditionMasterCanThrowNow,
  BTActionCalculateRandomPositionInRange,
  BTConditionMasterCanPickupDeliveredStick,
  BTConditionMasterShouldFollowDog,
  BTActionMasterLookAtDog,
  BTActionFollowPathSmooth,
  BTConditionHasFollowTarget,
} from './actions';
import { BTSelector, BTReactiveSelector, BTSequence } from './composites';
import { BTNode, BTService } from './core';
import {
  BTServiceFindNearestTarget,
  BTServicePathUpdater,
  BTServiceSyncStats,
  BTServiceInputListener,
  BTServiceInputController,
  BTServiceBodyTurnOnLookLimit,
  BTServiceFetchWatcher,
  BTServiceEnforceWalkMode,
  BTServiceFetchMasterWatcher,
} from './services';
import { t } from '../locales';

export const BEHAVIOR_TREES: Record<string, () => BTNode> = {
  PlayerTree: () => PlayerTree(),
  AttackerTree: () => AttackerTree(),
  FollowerTree: () => FollowerTree(),
  DogFetchTree: () => DogFetchTree(),
  MasterFetchTree: () => MasterFetchTree(),
  CombatTree: () => CombatTree(),
  IdleTree: () => new BTWait({ duration: 1 }),
};

export const BEHAVIOR_TREE_NAMES: Record<string, string> = {
  get PlayerTree() {
    return t('trees.PlayerTree');
  },
  get AttackerTree() {
    return t('trees.AttackerTree');
  },
  get FollowerTree() {
    return t('trees.FollowerTree');
  },
  get DogFetchTree() {
    return t('trees.DogFetchTree');
  },
  get MasterFetchTree() {
    return t('trees.MasterFetchTree');
  },
  get CombatTree() {
    return t('trees.CombatTree');
  },
  get IdleTree() {
    return t('trees.IdleTree');
  },
};

export function PlayerTree(): BTNode {
  return new BTServiceInputListener(
    new BTServiceInputController(
      new BTServiceBodyTurnOnLookLimit(
        new BTServicePathUpdater(
          new BTReactiveSelector([
            new BTSequence([
              new BTConditionHasFollowTarget(),
              new BTActionFollow({
                targetKey: 'followTargetId',
                stopDist: 2.2,
                resumeDist: 3.2,
                lookAtTarget: false,
              }),
            ]),
            new BTActionDropItem(),
            new BTActionPickupItem(),
            new BTActionFollowPathSmooth('currentPath'),
            new BTAlwaysRunning(),
          ]),
          { targetPosKey: 'navTargetPos', useTargetId: false, interval: 0.1 }
        )
      )
    )
  );
}

export function CombatTree(): BTNode {
  return new BTServicePathUpdater(
    new BTSelector([
      new BTSequence([
        new BTConditionEngaged(),
        new BTActionRotateToPos(), // <- Разворачиваемся перед атакой
        new BTActionAttack(),
      ]),

      new BTActionFollow(),
    ])
  );
}

export function AttackerTree(): BTNode {
  return new BTServiceSyncStats(
    new BTServiceFindNearestTarget(
      new BTSelector([
        new BTSequence([
          new BTSelector([new BTConditionValidTarget(), new BTCommandAcceptCandidate()]),

          CombatTree(),
        ]),

        new BTSequence([new BTActionPatrol(), new BTWait({ duration: 1 })]),
      ]),
      { interval: 1.2 }
    ),
    { interval: 0.5 }
  );
}

export function FollowerTree(): BTNode {
  return new BTServiceSyncStats(
    new BTServiceFindNearestTarget(
      new BTSelector([
        new BTSequence([
          new BTSelector([new BTConditionValidTarget(), new BTCommandAcceptCandidate()]),
          new BTServicePathUpdater(
            new BTSelector([
              new BTSequence([new BTConditionEngaged(), new BTActionRotateToPos()]),
              new BTActionFollow(),
            ])
          ),
        ]),
        new BTWait({ duration: 1 }),
      ]),
      { interval: 1.2 }
    ),
    { interval: 0.5 }
  );
}

export function DogFetchTree(): BTNode {
  return new BTServiceSyncStats(
    new BTServiceFetchWatcher(
      new BTReactiveSelector([
        // ВЕТКА 1: Доставка палки хозяину (бег трусцой издалека -> шаг рядом с хозяином, без спринта)
        new BTSequence([
          new BTConditionStringState({
            stateKey: 'fetchState',
            expectedState: 'returning_to_master',
          }),
          new BTActionSetTarget({ sourceKey: 'masterEntityId' }),
          new BTServicePathUpdater(
            new BTSequence([
              new BTActionFollow({
                stopDist: 2.2,
                walkDistance: 5.0,
                sprintMinDistance: undefined,
                hysteresis: 1.0,
              }),
              new BTConditionDistance({ maxDistance: 2.8 }),
              new BTActionRotateToPos(),
              new BTActionDrop(),
            ])
          ),
        ]),

        // ВЕТКА 2: Доставка палки в центр игровой зоны (хозяин потерян, палка в зубах)
        new BTSequence([
          new BTConditionStringState({
            stateKey: 'fetchState',
            expectedState: 'delivering_to_zone',
          }),
          new BTSequence([
            new BTActionMoveToPos({ posKey: 'playZoneCenter', stopDist: 4.0, sprint: false }),
            new BTActionDrop(),
          ]),
        ]),

        // ВЕТКА 3: Погоня за брошенной палкой (спринт с селектором дистанции)
        new BTSequence([
          new BTConditionStringState({ stateKey: 'fetchState', expectedState: 'chasing_item' }),
          new BTActionSetTarget({ sourceKey: 'fetchTargetId' }),
          new BTServicePathUpdater(
            new BTReactiveSelector([
              new BTSequence([
                new BTConditionDistance({ maxDistance: 1.0 }),
                new BTActionPickup({ targetKey: 'targetId' }),
              ]),
              new BTActionFollow({ stopDist: 0.6, sprintMinDistance: 0 }),
            ])
          ),
          new BTCommandForgetTarget(),
        ]),

        // ВЕТКА 4: Следование за хозяином без палки (шаг рядом с хозяином)
        new BTSequence([
          new BTConditionStringState({ stateKey: 'fetchState', expectedState: 'following_master' }),
          new BTActionSetTarget({ sourceKey: 'masterEntityId' }),
          new BTServicePathUpdater(
            new BTSelector([
              new BTSequence([new BTConditionEngaged(), new BTActionRotateToPos()]),
              new BTActionFollow({
                stopDist: 2.5,
                walkDistance: 5.5,
                sprintMinDistance: 12.0,
                hysteresis: 1.0,
              }),
            ])
          ),
        ]),

        // ВЕТКА 5: Возврат без палки в зону игры (хозяин потерян, рассредоточение вокруг центра)
        new BTSequence([
          new BTConditionStringState({
            stateKey: 'fetchState',
            expectedState: 'returning_to_zone',
          }),
          new BTActionMoveToPos({ posKey: 'dogZoneWaitPos', stopDist: 1.0, sprint: false }),
        ]),

        new BTWait({ duration: 0.5 }),
      ]),
      { interval: 0.1 }
    ),
    { interval: 0.5 }
  );
}

export function MasterFetchTree(): BTNode {
  return new BTServiceSyncStats(
    new BTServiceEnforceWalkMode(
      new BTServiceBodyTurnOnLookLimit(
        new BTServiceFetchMasterWatcher(
          new BTReactiveSelector([
            // ВЕТКА 1: Подбор принесенных палок (с выбором: взять если близко, иначе идти за ней)
            new BTSequence([
              new BTConditionMasterCanPickupDeliveredStick(),
              new BTActionSetTarget({ sourceKey: 'nearestDeliveredStickId' }),
              new BTServicePathUpdater(
                new BTReactiveSelector([
                  new BTSequence([
                    new BTConditionDistance({ maxDistance: 1.2 }),
                    new BTActionPickup({ targetKey: 'targetId' }),
                  ]),
                  new BTActionFollow({
                    targetKey: 'targetId',
                    stopDist: 0.6,
                    forceGait: 'walk',
                  }),
                ])
              ),
              new BTCommandForgetTarget(),
            ]),

            // ВЕТКА 2: Бросок палок
            new BTSequence([
              new BTConditionMasterReadyToThrow(),
              new BTSelector([
                // 2.1: Собака рядом, но мы вне зоны — возвращаемся в центр шагом
                new BTSequence([
                  new BTConditionMasterOutsidePlayZone(),
                  new BTActionMoveToPos({
                    posKey: 'playZoneCenter',
                    stopDist: 3.0,
                    sprint: false,
                    walk: true,
                  }),
                ]),
                // 2.2: Мы в зоне игры и собака рядом — бросаем палку
                new BTSequence([
                  new BTActionCalculateRandomPositionInRange({
                    minDistance: 10.0,
                    maxDistance: 22.0,
                    targetPosKey: 'throwTargetPos',
                  }),
                  new BTActionThrow({
                    targetPosKey: 'throwTargetPos',
                    cooldownKey: 'lastThrowTime',
                  }),
                ]),
              ]),
            ]),

            // ВЕТКА 3: Следование за убежавшей собакой
            new BTSequence([
              new BTConditionMasterShouldFollowDog(),
              new BTActionSetTarget({ sourceKey: 'priorityDogId' }),
              new BTServicePathUpdater(
                new BTActionFollow({
                  stopDist: 5.0,
                  forceGait: 'walk',
                })
              ),
            ]),

            // ВЕТКА 4: Ожидание / Поворот к собакам в зоне
            new BTSequence([new BTActionMasterLookAtDog(), new BTWait({ duration: 0.5 })]),
          ]),
          { interval: 0.1 }
        )
      )
    ),
    { interval: 0.5 }
  );
}
