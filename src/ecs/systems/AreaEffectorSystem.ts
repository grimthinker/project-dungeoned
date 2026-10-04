import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { CollisionCategory, ModifierType } from '../types';
import { applyDamage, applyHeal } from '../utils/health';
import { addModifier, createStat } from '../stats/StatEvaluator';
import { applyZoneDamageToCreature, applyZoneJointDamageToCreature } from '../utils/anatomyDamage';
import { EFFECTOR_CONFIG } from '../../config/effectorConfig';

import { getZoneCenter, ZoneShapeComponent } from '../components/zone';

export class AreaEffectorSystem {
  private pulseTimer: number = 0;
  private readonly PULSE_INTERVAL: number = EFFECTOR_CONFIG.pulseInterval;

  public update(dt: number, world: World, physics: PhysicsSystem): void {
    if (!physics.driver || !physics.driver.isReady) return;

    this.pulseTimer += dt;
    const isPulseTick = this.pulseTimer >= this.PULSE_INTERVAL;
    if (isPulseTick) {
      this.pulseTimer = 0;
    }

    const effectors = world.getEntitiesWith('areaEffector', 'transform');

    for (const [zoneId, { areaEffector, transform: zoneTransform }] of effectors) {
      const attachment = world.getComponent(zoneId, 'attachment');
      const shape: ZoneShapeComponent = world.getComponent(zoneId, 'zoneShape') ?? {
        shapeType: 'cylinder',
        radius: areaEffector.radius,
        height: 2.5,
        width: areaEffector.radius * 2,
        depth: areaEffector.radius * 2,
      };

      const center = getZoneCenter(zoneTransform, shape);
      const hitEntityIds = physics.driver.queryEntitiesInZoneShape(
        shape.shapeType,
        center,
        shape,
        zoneTransform.rotation
      );

      for (const targetId of hitEntityIds) {
        if (targetId === zoneId) continue;
        if (areaEffector.ignoreParent && attachment && attachment.parentId === targetId) {
          continue;
        }

        const health = world.getComponent(targetId, 'health');
        if (!health || !health.isAlive) continue;

        const physicsBody = world.getComponent(targetId, 'physicsBody');
        if (!physicsBody) continue;
        if ((physicsBody.category & (CollisionCategory.CREATURE | CollisionCategory.ITEM)) === 0) {
          continue;
        }

        const targetTransform = world.getComponent(targetId, 'transform');
        if (!targetTransform) continue;

        const physicsStats = world.getComponent(targetId, 'physicsStats');
        const targetTs = world.getComponent(targetId, 'timeScale')?.multiplier.current ?? 1.0;
        const localDt = dt * targetTs;
        const deltaValue = areaEffector.valuePerSec * localDt;

        const dx = targetTransform.x - center.x;
        const dy = targetTransform.y - center.y;
        const dz = targetTransform.z - center.z;

        let normalizedDist = 0;
        if (shape.shapeType === 'sphere') {
          normalizedDist = Math.hypot(dx, dy, dz) / Math.max(0.01, shape.radius);
        } else if (shape.shapeType === 'cylinder') {
          normalizedDist = Math.hypot(dx, dz) / Math.max(0.01, shape.radius);
        } else {
          const hx = Math.max(0.01, shape.width / 2);
          const hz = Math.max(0.01, shape.depth / 2);
          normalizedDist = Math.max(Math.abs(dx) / hx, Math.abs(dz) / hz);
        }
        normalizedDist = Math.min(1.0, Math.max(0.0, normalizedDist));

        // Поле замедления/ускорения времени
        if (areaEffector.effect === 'time_dilation') {
          let targetTimeScale = world.getComponent(targetId, 'timeScale');
          if (!targetTimeScale) {
            world.addComponent(targetId, 'timeScale', { multiplier: createStat(1.0) });
            targetTimeScale = world.getComponent(targetId, 'timeScale');
          }
          if (targetTimeScale) {
            let timeMultiplier = areaEffector.valuePerSec;

            if (
              areaEffector.distanceAttenuation &&
              areaEffector.centerValue !== undefined &&
              areaEffector.boundaryValue !== undefined
            ) {
              timeMultiplier =
                areaEffector.centerValue +
                (areaEffector.boundaryValue - areaEffector.centerValue) * normalizedDist;
            }

            addModifier(targetTimeScale.multiplier, {
              id: `zone_td_${zoneId}`,
              type: ModifierType.PERCENT_MULT,
              value: Math.max(0, timeMultiplier),
              duration: 0.15,
            });
          }
          continue;
        }

        // 1. Урон
        if (areaEffector.effect === 'damage') {
          const tag = world.getComponent(targetId, 'tag');
          const hasAnatomy =
            world.getComponent(targetId, 'assemblyRoot') ||
            world.getComponent(targetId, 'socketDef') ||
            tag?.archetype === 'creature';

          if (hasAnatomy) {
            applyZoneDamageToCreature(world, targetId, deltaValue);
          } else {
            applyDamage(world, targetId, deltaValue, isPulseTick);
          }
        }
        // 1.1. Урон только по соединениям (суставам) существ
        else if (areaEffector.effect === 'joint_damage') {
          const tag = world.getComponent(targetId, 'tag');
          const hasAnatomy =
            world.getComponent(targetId, 'assemblyRoot') ||
            world.getComponent(targetId, 'socketDef') ||
            tag?.archetype === 'creature';

          if (hasAnatomy) {
            applyZoneJointDamageToCreature(world, targetId, deltaValue);
          }
        }
        // 2. Лечение
        else if (areaEffector.effect === 'heal') {
          applyHeal(world, targetId, deltaValue, isPulseTick);
        }
        // 3. Отталкивание (Repel) и Притягивание (Attract)
        else if (areaEffector.effect === 'repel' || areaEffector.effect === 'attract') {
          const distXZ = Math.hypot(dx, dz);
          if (areaEffector.effect === 'attract' && distXZ <= 0.2) continue;

          const ux = distXZ > 0.001 ? dx / distXZ : Math.random() - 0.5;
          const uy = dy !== 0 ? Math.sign(dy) * 0.2 : 0;
          const uz = distXZ > 0.001 ? dz / distXZ : Math.random() - 0.5;
          const len = Math.hypot(ux, uy, uz) || 1;

          let forceMagnitude = areaEffector.valuePerSec;
          if (
            areaEffector.distanceAttenuation &&
            areaEffector.centerValue !== undefined &&
            areaEffector.boundaryValue !== undefined
          ) {
            forceMagnitude =
              areaEffector.centerValue +
              (areaEffector.boundaryValue - areaEffector.centerValue) * normalizedDist;
          }

          const sign = areaEffector.effect === 'repel' ? 1 : -1;
          const weight = physicsStats?.totalWeight ?? physicsStats?.weight.current ?? 1;

          if (
            physicsBody.bodyHandle !== undefined &&
            physicsBody.bodyType === 'dynamic' &&
            physics.driver
          ) {
            if (physics.driver.isBodySleeping(physicsBody.bodyHandle)) {
              physics.driver.wakeUpBody(physicsBody.bodyHandle);
            }
            const impulseMag = forceMagnitude * dt;
            physics.driver.applyBodyImpulse(
              physicsBody.bodyHandle,
              {
                x: sign * (ux / len) * impulseMag,
                y: sign * (uy / len) * impulseMag,
                z: sign * (uz / len) * impulseMag,
              },
              true
            );
            continue;
          }

          const velocity = world.getComponent(targetId, 'velocity');
          if (!velocity) continue;

          const acceleration = forceMagnitude / Math.max(1, weight);
          velocity.externalVx = (velocity.externalVx ?? 0) + sign * (ux / len) * acceleration * dt;
          velocity.externalVy = (velocity.externalVy ?? 0) + sign * (uy / len) * acceleration * dt;
          velocity.externalVz = (velocity.externalVz ?? 0) + sign * (uz / len) * acceleration * dt;
        }
      }
    }
  }
}
