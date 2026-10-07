import { World } from '../World';
import { EntityId, ModifierType, ConsciousnessState } from '../types';
import { Radians } from '../../utils';
import { removeModifier, addModifier } from '../stats/StatEvaluator';
import { getAnatomyParts } from '../utils/hierarchy';
import { evaluateConsciousness, getPartStatus, PartStatus } from '../utils/anatomyStatus';
import { BEHAVIOR_TREES } from '../../ai/trees_library';
import { EventBus } from '../../core/EventBus';

export class DeathService {
  /**
   * Централизованный перевод сущности в мертвое состояние.
   * Деактивирует мозг частей тела, останавливает движение, отменяет действия,
   * снимает модификаторы и переводит модель в анимационную позу смерти.
   */
  public static kill(world: World, id: EntityId): void {
    const health = world.getComponent(id, 'health');
    if (health) {
      health.isAlive = false;
      health.current = 0;
    }

    // 1. Деактивация мозга у всех частей тела анатомического графа
    const parts = getAnatomyParts(world, id);
    for (const partId of parts) {
      const brain = world.getComponent(partId, 'bodyBrain');
      if (brain) {
        brain.isActive = false;
      }
    }

    // 2. Сброс ввода и намерений
    const input = world.getComponent(id, 'input');
    if (input) {
      input.desiredMoveVector = null;
      input.moveForward = 0;
      input.moveStrafe = 0;
      input.targetLookAngle = undefined;
      input.isMovingForward = false;
      input.turnDirection = 0;
      input.turnRatio = 0;
      input.isRunning = false;
      input.isCrouching = false;
      input.isSlowWalking = false;
      input.wantsAttack = false;
      input.wantsJump = false;
      input.attackSlotIndex = undefined;
      input.attackSlotKind = undefined;
      input.desiredStance = 'prone';
    }

    // 3. Обнуление скоростей и импульсов
    const velocity = world.getComponent(id, 'velocity');
    if (velocity) {
      velocity.vx = 0;
      velocity.vy = 0;
      velocity.vz = 0;
      velocity.currentSpeed = 0;
      velocity.currentTurnSpeed = 0 as Radians;
      velocity.externalVx = 0;
      velocity.externalVy = 0;
      velocity.externalVz = 0;
    }

    // 4. Очистка переходных и незавершенных действий
    world.removeComponent(id, 'stanceTransition');
    world.removeComponent(id, 'interactionAction');
    world.removeComponent(id, 'pickupIntent');
    world.removeComponent(id, 'dropItemIntent');
    world.removeComponent(id, 'throwItemIntent');

    const activeAttacks = world.getComponent(id, 'activeAttacks');
    if (activeAttacks) {
      activeAttacks.attacks = [];
    }

    // 5. Очистка модификаторов передвижения
    const movementStats = world.getComponent(id, 'movementStats');
    if (movementStats) {
      removeModifier(movementStats.maxSpeed, 'stance_speed');
      removeModifier(movementStats.maxSpeed, 'state_run_speed');
      removeModifier(movementStats.maxSpeed, 'state_crouch_speed');
      removeModifier(movementStats.maxSpeed, 'attack_slow_move');
      removeModifier(movementStats.maxSpeed, 'pickup_slow_move');
      removeModifier(movementStats.maxSpeed, 'locomotion_speed');

      removeModifier(movementStats.maxTurnSpeed, 'stance_turn');
      removeModifier(movementStats.maxTurnSpeed, 'state_run_turn');
      removeModifier(movementStats.maxTurnSpeed, 'state_crouch_turn');
      removeModifier(movementStats.maxTurnSpeed, 'attack_slow_turn');
      removeModifier(movementStats.maxTurnSpeed, 'pickup_slow_turn');
      removeModifier(movementStats.maxTurnSpeed, 'locomotion_turn');
    }

    // 6. Очистка и установка модификаторов скрытности
    const stealthStats = world.getComponent(id, 'stealthStats');
    if (stealthStats) {
      removeModifier(stealthStats.stealthPower, 'stance_stealth');
      removeModifier(stealthStats.stealthPower, 'mode_sprint_stealth');
      removeModifier(stealthStats.stealthPower, 'mode_walk_stealth');
      removeModifier(stealthStats.stealthPower, 'mode_turning_stealth');
      removeModifier(stealthStats.stealthPower, 'mode_immobile_stealth');
      addModifier(stealthStats.stealthPower, {
        id: 'state_dead_stealth',
        type: ModifierType.PERCENT_MULT,
        value: 0,
      });
    }

    // 7. Мета-режимы и перевод в лежачую позу трупа
    const meta = world.getComponent(id, 'meta');
    if (meta) {
      meta.stance = 'prone';
      meta.movementMode = 'immobile';
      meta.directionMode = 'immobile';
      meta.actionMode = 'idle';
    }

    const headOrientation = world.getComponent(id, 'headOrientation');
    if (headOrientation) {
      headOrientation.yawVelocity = 0;
      headOrientation.pitchVelocity = 0;
    }

    // 8. Отключение твердых коллизий у разрушенных препятствий
    const tag = world.getComponent(id, 'tag');
    if (tag?.archetype === 'obstacle') {
      const phys = world.getComponent(id, 'physicsBody');
      if (phys) {
        phys.mask = 0;
      }
      const physStats = world.getComponent(id, 'physicsStats');
      if (physStats) {
        physStats.isSolid = false;
      }
    }

    // 9. Оповещение системы о гибели игрока
    const aiStats = world.getComponent(id, 'aiStats');
    if (aiStats?.behavior.current === 'PlayerTree') {
      EventBus.emit('game:playerDied');
    }

    // 10. Оповещение подсистем мира и квестов о гибели сущности
    const entTag = world.getComponent(id, 'tag');
    const entMeta = world.getComponent(id, 'meta');
    EventBus.emit('entity:died', {
      entityId: id,
      archetype: entTag?.archetype,
      name: entMeta?.name || id,
    });
  }

  /**
   * Проверяет жизненные показатели существа через оценку сознания
   * и выполняет переход в состояние смерти, комы или сброс поврежденного интеллекта.
   */
  public static checkCreatureDeath(world: World, rootEntityId: EntityId): void {
    const state = evaluateConsciousness(world, rootEntityId);

    if (state === ConsciousnessState.DEAD) {
      DeathService.kill(world, rootEntityId);
      return;
    }

    const parts = getAnatomyParts(world, rootEntityId);

    // Стирание дерева поведения (Brain Wipe) при полном разрушении мозга (ФП <= -max)
    for (const partId of parts) {
      const brainComp = world.getComponent(partId, 'bodyBrain');
      if (brainComp) {
        const brainStatus = getPartStatus(world, partId);
        if (brainStatus === PartStatus.DESTROYED) {
          const logicBrain = world.getComponent(partId, 'brain');
          if (logicBrain) {
            logicBrain.root_node = BEHAVIOR_TREES['IdleTree']();
            const bb = logicBrain.blackboard;
            if (bb) {
              const localTime = bb.get('localTime');
              const data = bb.getData();
              for (const key of Object.keys(data)) {
                bb.remove(key as any);
              }
              if (localTime !== undefined) {
                bb.set('localTime', localTime);
              }
            }
          }
          const aiStats = world.getComponent(rootEntityId, 'aiStats');
          if (aiStats) {
            aiStats.behavior.current = 'IdleTree';
          }
        }
      }
    }

    // Потеря сознания (UNCONSCIOUS)
    if (state === ConsciousnessState.UNCONSCIOUS) {
      for (const partId of parts) {
        const logicBrain = world.getComponent(partId, 'brain');
        if (logicBrain) {
          const bb = logicBrain.blackboard;
          if (bb) {
            const localTime = bb.get('localTime');
            const data = bb.getData();
            for (const key of Object.keys(data)) {
              bb.remove(key as any);
            }
            if (localTime !== undefined) {
              bb.set('localTime', localTime);
            }
          }
        }
      }

      const input = world.getComponent(rootEntityId, 'input');
      if (input) {
        input.desiredMoveVector = null;
        input.moveForward = 0;
        input.moveStrafe = 0;
        input.isMovingForward = false;
        input.turnDirection = 0;
        input.turnRatio = 0;
        input.isRunning = false;
        input.wantsAttack = false;
        input.attackSlotIndex = undefined;
        input.attackSlotKind = undefined;
      }

      const activeAttacks = world.getComponent(rootEntityId, 'activeAttacks');
      if (activeAttacks) {
        activeAttacks.attacks = [];
      }

      const meta = world.getComponent(rootEntityId, 'meta');
      if (meta) {
        meta.actionMode = 'idle';
      }
    }
  }
}
