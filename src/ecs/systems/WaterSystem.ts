import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { getTerrainHeightAt } from '../components/terrain';

export class WaterSystem {
  public update(dt: number, world: World, _physics?: PhysicsSystem): void {
    const waterEntities = world.getEntitiesWith('water', 'transform');
    if (waterEntities.length === 0) {
      // Если на сцене нет воды, сбрасываем стойку swim у всех живых существ
      const swimmers = world.getEntitiesWith('meta');
      for (const [, { meta }] of swimmers) {
        if (meta.stance === 'swim') {
          meta.stance = meta.previousGroundedStance ?? 'standing';
          meta.previousGroundedStance = undefined;
        }
      }
      return;
    }

    const terrainEntities = world.getEntitiesWith('terrain');
    const terrainComp = terrainEntities.length > 0 ? terrainEntities[0][1].terrain : undefined;

    // =========================================================
    // 1. СУЩЕСТВА: АВТОМАТИЧЕСКАЯ ПЛАВУЧЕСТЬ И СТОЙКИ
    // =========================================================
    const creatures = world.getEntitiesWith('transform', 'meta', 'health');

    for (const [entityId, { transform, meta, health }] of creatures) {
      if (!health.isAlive) continue;

      let containingWater: {
        waterSurfaceY: number;
        waterBottomY: number;
        maxDepth: number;
        flowSpeed: number;
        flowDirection: { x: number; z: number };
        waterType: string;
      } | null = null;

      for (const [, { water, transform: waterTransform }] of waterEntities) {
        const halfW = water.width / 2;
        const halfD = water.depth / 2;
        const dx = Math.abs(transform.x - waterTransform.x);
        const dz = Math.abs(transform.z - waterTransform.z);

        if (dx <= halfW && dz <= halfD) {
          const waterSurfaceY = waterTransform.y;
          const maxDepth = water.maxDepth ?? (water.waterType === 'river' ? 2.5 : 4.0);
          const waterBottomY = waterSurfaceY - maxDepth;

          if (transform.y <= waterSurfaceY + 0.2 && transform.y >= waterBottomY - 1.0) {
            containingWater = {
              waterSurfaceY,
              waterBottomY,
              maxDepth,
              flowSpeed: water.flowSpeed ?? 0.0,
              flowDirection: water.flowDirection ?? { x: 0, z: 0 },
              waterType: water.waterType,
            };
            break;
          }
        }
      }

      if (containingWater) {
        const { waterSurfaceY, waterBottomY, flowSpeed, flowDirection, waterType } =
          containingWater;

        let terrainY: number | null = null;
        if (terrainComp) {
          terrainY = getTerrainHeightAt(terrainComp, transform.x, transform.z);
        }
        const actualBottomY = terrainY !== null ? Math.max(terrainY, waterBottomY) : waterBottomY;

        const waterDepth = Math.max(0, waterSurfaceY - actualBottomY);
        const immersion = Math.max(0, waterSurfaceY - transform.y);

        const input = world.getComponent(entityId, 'input');
        const velocity = world.getComponent(entityId, 'velocity');
        const physStats = world.getComponent(entityId, 'physicsStats');

        const isAlreadySwimming = meta.stance === 'swim';

        // АВТОМАТИЧЕСКИЙ РАСЧЕТ ГЛУБИНЫ ПОГРУЖЕНИЯ ПО ГАБАРИТАМ СУЩЕСТВА
        const creatureHeight = physStats?.height?.current ?? 1.8;
        const targetSubmergedDepth = creatureHeight * 0.6; // 60% высоты тела под водой
        const targetFloatY = waterSurfaceY - targetSubmergedDepth;

        // Пороги входа и удержания (гистерезис)
        const canEnterSwim = waterDepth >= 0.95 && immersion >= 0.65;
        const canStayInSwim = isAlreadySwimming && waterDepth >= 0.75 && immersion >= 0.15;
        const shouldSwim = canEnterSwim || canStayInSwim;

        if (shouldSwim) {
          if (!isAlreadySwimming) {
            meta.previousGroundedStance =
              meta.stance === 'crouching' || meta.stance === 'prone' ? meta.stance : 'standing';
            meta.stance = 'swim';
          }

          // Амортизированное удержание на водной линии с учетом индивидуального роста
          if (velocity) {
            const deltaY = targetFloatY - transform.y;
            const springForce = deltaY * 3.5;
            velocity.vy = Math.max(-2.5, Math.min(1.8, springForce));
          }

          // Снос существа течением реки
          if (waterType === 'river' && flowSpeed > 0 && velocity) {
            const flowFactor = 2.0 * dt;
            velocity.externalVx =
              (velocity.externalVx ?? 0) + flowDirection.x * flowSpeed * flowFactor;
            velocity.externalVz =
              (velocity.externalVz ?? 0) + flowDirection.z * flowSpeed * flowFactor;
          }
        } else {
          // Мелководье (брод)
          if (isAlreadySwimming) {
            meta.stance = meta.previousGroundedStance ?? 'standing';
            meta.previousGroundedStance = undefined;
            if (velocity) {
              velocity.vy = 0;
            }
          }

          if (meta.stance === 'prone') {
            meta.stance = 'crouching';
          }
          if (input && input.desiredStance === 'prone') {
            input.desiredStance = 'crouching';
          }
        }
      } else {
        // Существо вышло на берег
        if (meta.stance === 'swim') {
          meta.stance = meta.previousGroundedStance ?? 'standing';
          meta.previousGroundedStance = undefined;
        }
      }
    }

    // =========================================================
    // 2. ДИНАМИЧЕСКИЕ ПРЕДМЕТЫ: АРХИМЕД И ДРЕЙФ
    // =========================================================
    const dynamicEntities = world.getEntitiesWith('transform', 'physicsBody', 'physicsStats');

    for (const [id, { transform, physicsBody, physicsStats }] of dynamicEntities) {
      if (
        physicsBody.bodyHandle === undefined ||
        physicsBody.bodyType !== 'dynamic' ||
        !_physics?.driver
      )
        continue;

      const bodyHandle = physicsBody.bodyHandle;
      const driver = _physics.driver;

      let inWaterData: {
        waterSurfaceY: number;
        waterBottomY: number;
        density: number;
        viscosity: number;
        flowSpeed: number;
        flowDirection: { x: number; z: number };
        waterType: string;
      } | null = null;

      for (const [, { water, transform: waterTransform }] of waterEntities) {
        const halfW = water.width / 2;
        const halfD = water.depth / 2;
        const dx = Math.abs(transform.x - waterTransform.x);
        const dz = Math.abs(transform.z - waterTransform.z);

        if (dx <= halfW && dz <= halfD) {
          const waterSurfaceY = waterTransform.y;
          const maxDepth = water.maxDepth ?? 4.0;
          const waterBottomY = waterSurfaceY - maxDepth;

          if (transform.y <= waterSurfaceY + 0.1 && transform.y >= waterBottomY - 1.0) {
            inWaterData = {
              waterSurfaceY,
              waterBottomY,
              density: water.density ?? 1000,
              viscosity: water.viscosity ?? 1.5,
              flowSpeed: water.flowSpeed ?? 0.0,
              flowDirection: water.flowDirection ?? { x: 0, z: 0 },
              waterType: water.waterType,
            };
            break;
          }
        }
      }

      if (inWaterData) {
        const { waterSurfaceY, density, viscosity, flowSpeed, flowDirection, waterType } =
          inWaterData;
        const r = physicsStats.radius.current ?? 0.3;
        const isBall = physicsStats.shape === 'ball';

        let volume = 0.01;
        if (isBall) {
          volume = (4 / 3) * Math.PI * Math.pow(r, 3);
        } else if (physicsStats.halfExtents) {
          volume =
            8 *
            physicsStats.halfExtents.x *
            physicsStats.halfExtents.y *
            physicsStats.halfExtents.z;
        } else {
          volume = Math.pow(r * 2, 3) * 0.75;
        }

        const mass = physicsStats.weight.current ?? 1;
        const displacedWaterMass = volume * density;

        const submergedDepth = Math.max(0, waterSurfaceY - transform.y);
        const submergedRatio = Math.min(1.0, submergedDepth / Math.max(0.08, r * 1.5));

        const buoyancyForce = displacedWaterMass * 9.81 * submergedRatio;
        driver.applyBodyImpulse(bodyHandle, { x: 0, y: buoyancyForce * dt, z: 0 }, true);

        const waterDamping = Math.max(1.8, viscosity);
        driver.setBodyDamping(bodyHandle, waterDamping, waterDamping);

        if (waterType === 'river' && flowSpeed > 0 && submergedRatio > 0.05) {
          const flowImpulse = mass * flowSpeed * 2.2 * submergedRatio * dt;
          driver.applyBodyImpulse(
            bodyHandle,
            {
              x: flowDirection.x * flowImpulse,
              y: 0,
              z: flowDirection.z * flowImpulse,
            },
            true
          );
        }

        if (driver.isBodySleeping(bodyHandle)) {
          driver.wakeUpBody(bodyHandle);
        }
      } else {
        const defaultLinDamping =
          physicsStats.linearDamping ?? (physicsStats.shape === 'ball' ? 0.25 : 1);
        const defaultAngDamping =
          physicsStats.angularDamping ?? (physicsStats.shape === 'ball' ? 2.0 : 1);
        driver.setBodyDamping(bodyHandle, defaultLinDamping, defaultAngDamping);
      }
    }
  }
}
