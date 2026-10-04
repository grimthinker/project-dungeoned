import { LOGIC_CONFIG } from '../../../ai/config';
import { GAMEPLAY_CONFIG } from '../../../config/gameplayConfig';
import { BALANCE_CONFIG } from '../../../config/balanceConfig';
import { Radians, normalizeAngle, angleDifference } from '../../../utils';
import { World } from '../../World';
import {
  CreatureDirectionMode,
  CreatureMovementMode,
  CreatureActionMode,
  ConsciousnessState,
} from '../../types';

export class VelocitySystem {
  public update(dt: number, world: World): void {
    const entities = world.getEntitiesWith(
      'transform',
      'velocity',
      'input',
      'health',
      'activeAttacks',
      'meta',
      'movementStats'
    );

    for (const [
      id,
      { transform, velocity, input, health, activeAttacks, meta, movementStats },
    ] of entities) {
      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      const localDt = dt * ts;

      if (!health.isAlive) {
        if (
          velocity.vx !== 0 ||
          velocity.vy !== 0 ||
          velocity.vz !== 0 ||
          velocity.currentSpeed !== 0 ||
          velocity.currentTurnSpeed !== 0
        ) {
          velocity.vx = 0;
          velocity.vy = 0;
          velocity.vz = 0;
          velocity.currentSpeed = 0;
          velocity.currentTurnSpeed = 0 as Radians;
        }
        meta.movementMode = 'immobile';
        meta.directionMode = 'immobile';
        meta.actionMode = 'idle';
        continue;
      }

      const consciousnessComp = world.getComponent(id, 'consciousness');
      const consciousness = consciousnessComp
        ? consciousnessComp.state
        : ConsciousnessState.CONSCIOUS;
      if (consciousness === ConsciousnessState.UNCONSCIOUS) {
        input.desiredMoveVector = null;
        input.moveForward = 0;
        input.moveStrafe = 0;
        input.isMovingForward = false;
        input.turnDirection = 0;
        input.turnRatio = 0;
        input.isRunning = false;
        input.wantsAttack = false;
        input.attackSlotIndex = undefined;
        input.desiredStance = 'prone';
        meta.actionMode = 'idle';
      }

      const interactionAction = world.getComponent(id, 'interactionAction');
      if (interactionAction) {
        if (
          interactionAction.type === 'pickup' &&
          interactionAction.phase === 'reach' &&
          interactionAction.targetItemPos
        ) {
          const dx = interactionAction.targetItemPos.x - transform.x;
          // Проецируем на плоскость пола для прицеливания при подборе
          const dz = interactionAction.targetItemPos.z - transform.z;
          if (Math.hypot(dx, dz) > 0.001) {
            input.targetLookAngle = Math.atan2(dz, dx) as Radians;
            input.turnDirection = 0;
            input.turnRatio = 0;
          }
        } else if (
          interactionAction.type === 'throw' &&
          (interactionAction.phase === 'throw_turn' || interactionAction.phase === 'throw_prep') &&
          interactionAction.targetItemPos
        ) {
          const dx = interactionAction.targetItemPos.x - transform.x;
          const dz = interactionAction.targetItemPos.z - transform.z;
          if (Math.hypot(dx, dz) > 0.001) {
            input.targetLookAngle = Math.atan2(dz, dx) as Radians;
            input.turnDirection = 0;
            input.turnRatio = 0;
          }
        }
      }

      // Обработка прыжка
      if (input.wantsJump) {
        input.wantsJump = false;
        const isGrounded = velocity.isGrounded ?? transform.y <= 0;
        // Прыжок категорически запрещен в воздухе (airborne) и при соскальзывании по склону (sliding)
        const canJumpStance = meta.stance !== 'airborne' && meta.stance !== 'sliding';

        if (isGrounded && canJumpStance) {
          const jumpImpulse = movementStats.jumpVelocity?.current ?? 5.0;
          velocity.vy = jumpImpulse;
          velocity.isGrounded = false;
          input.desiredStance = 'standing';
        }
      }

      // Расчет вектора движения
      let moveVecX = input.desiredMoveVector ? input.desiredMoveVector.x : 0;
      let moveVecZ = input.desiredMoveVector ? input.desiredMoveVector.z : 0;

      if (!input.desiredMoveVector) {
        let fwd = input.moveForward ?? 0;
        let strafe = input.moveStrafe ?? 0;
        if (input.isMovingForward && fwd === 0 && strafe === 0) {
          fwd = 1;
        }
        if (fwd !== 0 || strafe !== 0) {
          const len = Math.hypot(fwd, strafe);
          const cosA = Math.cos(transform.angle);
          const sinA = Math.sin(transform.angle);
          moveVecX = (fwd / len) * cosA - (strafe / len) * sinA;
          moveVecZ = (fwd / len) * sinA + (strafe / len) * cosA;
        }
      }

      // Во время прицеливания и замаха броска линейное движение блокируется
      if (
        interactionAction?.type === 'throw' &&
        (interactionAction.phase === 'throw_turn' || interactionAction.phase === 'throw_prep')
      ) {
        moveVecX = 0;
        moveVecZ = 0;
      }

      const inputMag = Math.hypot(moveVecX, moveVecZ);
      const hasMoveInput = inputMag > 0.001;
      if (hasMoveInput && inputMag > 1) {
        moveVecX /= inputMag;
        moveVecZ /= inputMag;
      }

      let targetBodyAngle = transform.angle;
      let shouldTurnBody = false;

      if (hasMoveInput) {
        // Поворот корпуса строго по направлению перемещения (при ходьбе/беге)
        targetBodyAngle = Math.atan2(moveVecZ, moveVecX) as Radians;
        shouldTurnBody = true;
      } else if (
        interactionAction?.type === 'throw' &&
        interactionAction.phase === 'throw_turn' &&
        interactionAction.targetItemPos
      ) {
        // Поворот корпуса к точке броска во время выполнения действия броска
        const dx = interactionAction.targetItemPos.x - transform.x;
        const dz = interactionAction.targetItemPos.z - transform.z;
        if (Math.hypot(dx, dz) > 0.001) {
          targetBodyAngle = Math.atan2(dz, dx) as Radians;
          shouldTurnBody = true;
        }
      } else if (input.desiredBodyAngle !== undefined) {
        // Явный поворот корпуса по команде из BT (BTActionRotateToPos, BTActionLookAt)
        targetBodyAngle = input.desiredBodyAngle;
        shouldTurnBody = true;
      }

      if (shouldTurnBody) {
        const diff = angleDifference(targetBodyAngle, transform.angle);
        if (Math.abs(diff) <= LOGIC_CONFIG.angleDiffTolerance) {
          transform.angle = targetBodyAngle;
          velocity.currentTurnSpeed = 0 as Radians;
        } else if (localDt > 0) {
          const turnRatio = Math.max(
            LOGIC_CONFIG.minRotationSpeed,
            Math.min(1, Math.abs(diff) / LOGIC_CONFIG.slowDownAngle)
          );
          const effectiveTurnSpeed = movementStats.maxTurnSpeed.current * turnRatio;
          const maxTurnStep = effectiveTurnSpeed * localDt;

          if (Math.abs(diff) <= maxTurnStep) {
            transform.angle = targetBodyAngle;
            velocity.currentTurnSpeed = (diff / localDt) as Radians;
          } else {
            const sign = Math.sign(diff) as -1 | 1;
            transform.angle = normalizeAngle(transform.angle + sign * maxTurnStep);
            velocity.currentTurnSpeed = (sign * effectiveTurnSpeed) as Radians;
          }
        } else {
          velocity.currentTurnSpeed = 0 as Radians;
        }
      } else {
        velocity.currentTurnSpeed = 0 as Radians;
      }

      transform.angle = normalizeAngle(transform.angle);

      // Синхронизируем 3D-кватернион с рысканием
      // Минус добавлен, так как ось Y в 3D направлена вверх, а в 2D - вниз
      const halfAngle = -transform.angle * 0.5;
      transform.rotation = {
        x: 0,
        y: Math.sin(halfAngle),
        z: 0,
        w: Math.cos(halfAngle),
      };

      // Direction Mode (считается относительно взгляда головы)
      let directionMode: CreatureDirectionMode = 'immobile';
      const prevDirectionMode = meta.directionMode;
      const forwardThreshold =
        prevDirectionMode === 'forward' ? Math.PI / 4 + 0.17 : Math.PI / 4 - 0.05;
      const backwardThreshold =
        prevDirectionMode === 'backward' ? (3 * Math.PI) / 4 - 0.17 : (3 * Math.PI) / 4;

      const headOrientation = world.getComponent(id, 'headOrientation');
      const lookAngle = headOrientation?.yaw ?? transform.angle;

      if (hasMoveInput) {
        const desiredMoveAngle = Math.atan2(moveVecZ, moveVecX);
        const angleDiff = Math.abs(angleDifference(desiredMoveAngle, lookAngle));

        if (angleDiff <= forwardThreshold) {
          directionMode = 'forward';
        } else if (angleDiff <= backwardThreshold) {
          directionMode = 'strafe';
        } else {
          directionMode = 'backward';
        }
      } else if (velocity.currentSpeed > 0.1) {
        const actualMoveAngle = Math.atan2(velocity.vz, velocity.vx);
        const angleDiff = Math.abs(angleDifference(actualMoveAngle, lookAngle));

        if (angleDiff <= forwardThreshold) {
          directionMode = 'forward';
        } else if (angleDiff <= backwardThreshold) {
          directionMode = 'strafe';
        } else {
          directionMode = 'backward';
        }
      } else {
        directionMode = 'immobile';
      }

      // Action Mode
      let actionMode: CreatureActionMode = 'idle';
      if (activeAttacks.attacks.length > 0) {
        actionMode = 'attacking';
      } else if (interactionAction?.type === 'pickup') {
        actionMode = 'pickup';
      } else if (interactionAction?.type === 'equip' || interactionAction?.type === 'unequip') {
        actionMode = 'equipping';
      } else if (interactionAction?.type === 'drop') {
        actionMode = 'drop';
      } else if (interactionAction?.type === 'throw') {
        actionMode = 'throw';
      } else if (world.getComponent(id, 'stanceTransition')) {
        actionMode = 'stance_changing';
      }

      // Movement Mode
      let movementMode: CreatureMovementMode = 'immobile';
      if (hasMoveInput || velocity.currentSpeed > 0.1) {
        if (meta.stance === 'prone' || meta.stance?.includes('prone')) {
          movementMode = 'walking';
        } else if (
          input.isRunning &&
          directionMode === 'forward' &&
          (meta.stance === 'standing' ||
            meta.stance === 'crouching' ||
            meta.stance === 'airborne' ||
            meta.stance === 'swim' ||
            meta.stance === 'stand_to_crouch' ||
            meta.stance === 'crouch_to_stand')
        ) {
          movementMode = 'sprinting';
        } else if (input.isSlowWalking) {
          movementMode = 'walking';
        } else if (hasMoveInput) {
          movementMode = 'jogging';
        } else {
          movementMode = 'immobile';
        }
      } else if (
        input.turnDirection !== 0 ||
        (shouldTurnBody && Math.abs(velocity.currentTurnSpeed) > 0.01)
      ) {
        movementMode = 'turning';
      } else {
        movementMode = 'immobile';
      }

      // В воздухе скорость перемещения зафиксирована и не зависит от нажатия WASD
      if (meta.stance === 'airborne') {
        if (velocity.airborneLockedVx !== undefined && velocity.airborneLockedVz !== undefined) {
          velocity.vx = velocity.airborneLockedVx;
          velocity.vz = velocity.airborneLockedVz;
        }
        velocity.currentSpeed = Math.hypot(velocity.vx, velocity.vz);
      } else {
        // Наземная интерполяция скорости (разгон / торможение)
        let targetVx = 0;
        let targetVz = 0;

        if (hasMoveInput) {
          const targetSpeed = movementStats.maxSpeed.current;
          targetVx = moveVecX * targetSpeed;
          targetVz = moveVecZ * targetSpeed;
        }

        const deltaVx = targetVx - velocity.vx;
        const deltaVz = targetVz - velocity.vz;
        const distToTargetVel = Math.hypot(deltaVx, deltaVz);

        if (distToTargetVel > 0.001) {
          const isDecelerating = velocity.vx * deltaVx + velocity.vz * deltaVz < 0;
          const timeConstant = isDecelerating
            ? GAMEPLAY_CONFIG.decelerationTime
            : GAMEPLAY_CONFIG.accelerationTime;

          const maxSpd = movementStats.maxSpeed.current > 0 ? movementStats.maxSpeed.current : 1;
          const changeRate = maxSpd / timeConstant;
          const step = changeRate * localDt;

          if (distToTargetVel <= step) {
            velocity.vx = targetVx;
            velocity.vz = targetVz;
          } else {
            velocity.vx += (deltaVx / distToTargetVel) * step;
            velocity.vz += (deltaVz / distToTargetVel) * step;
          }
        } else {
          velocity.vx = targetVx;
          velocity.vz = targetVz;
        }

        velocity.currentSpeed = Math.hypot(velocity.vx, velocity.vz);
        if (velocity.currentSpeed < 0.001) {
          velocity.vx = 0;
          velocity.vz = 0;
          velocity.currentSpeed = 0;
        }
      }
      meta.movementMode = movementMode;
      meta.directionMode = directionMode;
      meta.actionMode = actionMode;
    }
  }
}
