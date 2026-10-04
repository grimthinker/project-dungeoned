import { World } from '../World';
import {
  EntityId,
  HitZoneConfig,
  CollisionCategory,
  COLLISION_MASK_ALL,
  COLLISION_MASK_NONE,
} from '../types';
import { Vec3 } from '../../types';
import { calculateTotalEntityWeight } from '../utils/hierarchy';
import {
  IPhysicsDriver,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
} from '../../physics/IPhysicsDriver';
import { BALANCE_CONFIG } from '../../config/balanceConfig';
import { getTerrainHeightAt } from '../components/terrain';
import { angleDifference } from '../../utils';
import { buildObstacleColliders } from '../archetypes';

export class PhysicsSystem {
  public obstaclesEnabled: boolean = true;
  public driver: IPhysicsDriver | null = null;
  private dynamicBodyTimeScales: Map<EntityId, number> = new Map();

  constructor() {}
  public setObstaclesEnabled(enabled: boolean): void {
    this.obstaclesEnabled = enabled;
  }

  public createDynamicItemBody(
    world: World,
    itemId: EntityId,
    pos: Vec3
  ): PhysicsBodyHandle | undefined {
    if (!this.driver || !this.driver.isReady) return undefined;

    const physStats = world.getComponent(itemId, 'physicsStats');
    if (!physStats) return undefined;

    const radius = physStats.radius.current ?? 0.3;
    const weight = physStats.weight.current ?? 1;
    const isBall = physStats.shape === 'ball';

    const linDamping = physStats.linearDamping ?? (isBall ? 0.25 : 1);
    const angDamping = physStats.angularDamping ?? (isBall ? 2.0 : 1);

    const bodyHandle = this.driver.createDynamicBody(pos, itemId, {
      linearDamping: linDamping,
      angularDamping: angDamping,
    });

    let colliderHandle: PhysicsColliderHandle;
    if (isBall) {
      const restitution = physStats.restitution ?? 0.88;
      const friction = physStats.friction ?? 0.85;
      colliderHandle = this.driver.createBallCollider(radius, bodyHandle, {
        mass: weight,
        restitution,
        friction,
        useMaxCombineRule: true,
      });
    } else {
      const size = radius * 0.8;
      const hx = physStats.halfExtents?.x ?? size / 2;
      const hy = physStats.halfExtents?.y ?? size / 2;
      const hz = physStats.halfExtents?.z ?? size / 2;
      const restitution = physStats.restitution ?? 0.3;
      const friction = physStats.friction ?? 0.5;

      colliderHandle = this.driver.createCuboidCollider(hx, hy, hz, bodyHandle, {
        mass: weight,
        offset: physStats.colliderOffset,
        restitution,
        friction,
      });
    }

    const mask = physStats.isSolid ? COLLISION_MASK_ALL : COLLISION_MASK_NONE;

    world.addComponent(itemId, 'physicsBody', {
      bodyHandle,
      colliderHandle,
      bodyType: 'dynamic',
      isStatic: false,
      category: CollisionCategory.ITEM,
      mask,
    });

    return bodyHandle;
  }

  public syncTerrainPhysics(world: World): void {
    if (!this.driver || !this.driver.isReady) return;
    const terrainEntities = world.getEntitiesWith('terrain');

    for (const [id, { terrain }] of terrainEntities) {
      if (terrain.isPhysicsDirty) {
        if (!terrain.dirtyChunks) terrain.dirtyChunks = new Set<string>();

        const chunksToUpdate =
          terrain.dirtyChunks.size > 0 ? terrain.dirtyChunks : this.getAllChunkIds(terrain);

        const size = 32;
        const halfW = terrain.width / 2;
        const halfD = terrain.depth / 2;
        const globalRes = terrain.resolution;

        for (const chunkId of chunksToUpdate) {
          const [cx, cz] = chunkId.split('_').map(Number);
          const startX = cx * size;
          const startZ = cz * size;

          if (startX >= terrain.width || startZ >= terrain.depth) continue;

          const verts = new Float32Array((size + 1) * (size + 1) * 3);
          let vIdx = 0;
          for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
              verts[vIdx++] = x;
              verts[vIdx++] = terrain.heights[(startZ + z) * globalRes + (startX + x)] || 0;
              verts[vIdx++] = z;
            }
          }

          const indices = new Uint32Array(size * size * 6);
          let iPtr = 0;
          for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
              const a = z * (size + 1) + x;
              const b = a + 1;
              const c = (z + 1) * (size + 1) + x;
              const d = c + 1;
              indices[iPtr++] = a;
              indices[iPtr++] = c;
              indices[iPtr++] = b;
              indices[iPtr++] = b;
              indices[iPtr++] = c;
              indices[iPtr++] = d;
            }
          }

          const pos = { x: startX - halfW, y: 0, z: startZ - halfD };
          this.driver.createOrUpdateTerrainChunk(chunkId, verts, indices, pos, id);
        }
        terrain.isPhysicsDirty = false;
      }
    }
  }

  private getAllChunkIds(terrain: import('../components/terrain').TerrainComponent): string[] {
    const ids: string[] = [];
    const chunksX = Math.ceil(terrain.width / 32);
    const chunksZ = Math.ceil(terrain.depth / 32);
    for (let z = 0; z < chunksZ; z++) {
      for (let x = 0; x < chunksX; x++) {
        ids.push(`${x}_${z}`);
      }
    }
    return ids;
  }

  public syncDirtyTransforms(world: World): void {
    if (!this.driver || !this.driver.isReady) return;

    this.syncTerrainPhysics(world);

    let anyDirty = false;
    const entities = world.getEntitiesWith('transform', 'physicsBody');
    for (const [id, { transform, physicsBody }] of entities) {
      if (transform.isDirty) {
        transform.isDirty = false;
        anyDirty = true;

        if (physicsBody.bodyHandle !== undefined) {
          const pos = { x: transform.x, y: transform.y, z: transform.z };
          const rot = transform.rotation;

          if (physicsBody.bodyType === 'kinematicPositionBased') {
            this.driver.setBodyTranslation(physicsBody.bodyHandle, pos, true);
            this.driver.setNextKinematicTranslation(physicsBody.bodyHandle, pos);
            if (rot) {
              this.driver.setBodyRotation(physicsBody.bodyHandle, rot, true);
              this.driver.setNextKinematicRotation(physicsBody.bodyHandle, rot);
            }
            const vel = world.getComponent(id, 'velocity');
            if (vel) {
              vel.vx = 0;
              vel.vy = 0;
              vel.vz = 0;
            }
            const physStats = world.getComponent(id, 'physicsStats');
            const meta = world.getComponent(id, 'meta');
            if (physStats) {
              this.updateCreatureColliderStance(
                world,
                id,
                meta?.stance || 'standing',
                physStats.radius.current
              );
            }
          } else {
            this.driver.setBodyTranslation(physicsBody.bodyHandle, pos, true);
            if (rot) {
              this.driver.setBodyRotation(physicsBody.bodyHandle, rot, true);
            }
            if (physicsBody.bodyType === 'fixed') {
              this.updateObstacleCollider(world, id);
            }
            this.driver.setBodyLinearVelocity(physicsBody.bodyHandle, { x: 0, y: 0, z: 0 }, true);
            this.driver.setBodyAngularVelocity(physicsBody.bodyHandle, { x: 0, y: 0, z: 0 }, true);
            if (this.driver.isBodySleeping(physicsBody.bodyHandle)) {
              this.driver.wakeUpBody(physicsBody.bodyHandle);
            }
          }
        }
      }
    }

    if (anyDirty) {
      this.driver.updateSceneQueries();
    }
  }

  public updateCreatureColliderStance(
    world: World,
    id: EntityId,
    stance: string,
    radius: number
  ): void {
    if (!this.driver || !this.driver.isReady) return;
    const phys = world.getComponent(id, 'physicsBody');
    if (!phys || phys.colliderHandle === undefined) return;

    const physStats = world.getComponent(id, 'physicsStats');
    const baseHeight = physStats?.height.current ?? 1.8;

    let stanceMult =
      BALANCE_CONFIG.creature.stanceHeightMultipliers[
        stance as keyof typeof BALANCE_CONFIG.creature.stanceHeightMultipliers
      ] ?? 1.0;

    if (stance.includes('stand_to_crouch') || stance.includes('crouch_to_stand')) stanceMult = 0.82;
    else if (stance.includes('stand_to_prone') || stance.includes('prone_to_stand'))
      stanceMult = 0.62;
    else if (stance.includes('crouch_to_prone') || stance.includes('prone_to_crouch'))
      stanceMult = 0.45;

    const targetHeight = baseHeight * stanceMult;
    let capRadius = radius;

    if (stance === 'prone' || stance.includes('prone')) {
      capRadius = Math.min(radius, targetHeight / 2);
    }

    const halfHeight = Math.max(0.01, (targetHeight - 2 * capRadius) / 2);
    const offsetY = halfHeight + capRadius;

    if (
      phys.currentColliderStance === stance &&
      phys.lastAppliedRadius === capRadius &&
      phys.lastAppliedHeight === targetHeight
    ) {
      return;
    }

    phys.currentColliderStance = stance;
    phys.lastAppliedRadius = capRadius;
    phys.lastAppliedHeight = targetHeight;

    phys.colliderHandle = this.driver.updateCapsuleCollider(
      phys.colliderHandle,
      halfHeight,
      capRadius,
      offsetY
    );
  }

  public updateObstacleCollider(world: World, id: EntityId): void {
    if (!this.driver || !this.driver.isReady) return;
    const phys = world.getComponent(id, 'physicsBody');
    const physStats = world.getComponent(id, 'physicsStats');
    if (!phys || phys.bodyHandle === undefined || !physStats) return;

    const radius = physStats.radius.current;
    const height = physStats.height.current;
    const points = physStats.points;

    let curW = radius * 2;
    let curD = radius * 2;
    if (points && points.length > 0) {
      let minX = points[0].x,
        maxX = points[0].x;
      let minY = points[0].y,
        maxY = points[0].y;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      curW = Math.max(0.1, maxX - minX);
      curD = Math.max(0.1, maxY - minY);
    }

    if (
      phys.lastAppliedRadius === radius &&
      phys.lastAppliedHeight === height &&
      phys.lastAppliedWidth === curW &&
      phys.lastAppliedDepth === curD
    ) {
      return;
    }
    phys.lastAppliedRadius = radius;
    phys.lastAppliedHeight = height;
    phys.lastAppliedWidth = curW;
    phys.lastAppliedDepth = curD;

    if (phys.colliderHandles && phys.colliderHandles.length > 0) {
      for (const colHandle of phys.colliderHandles) {
        this.driver.removeCollider(colHandle, false);
      }
    } else if (phys.colliderHandle !== undefined) {
      this.driver.removeCollider(phys.colliderHandle, false);
    }

    const { primaryCollider, allColliders } = buildObstacleColliders(this.driver, phys.bodyHandle, {
      points,
      height,
      colliders: physStats.colliders,
    });
    phys.colliderHandle = primaryCollider;
    phys.colliderHandles = allColliders;
  }

  public update(dt: number, world: World): void {
    this.syncTerrainPhysics(world);

    // Обработка оторванных и выпавших предметов через интент
    const droppedIntents = world.getEntitiesWith('droppedItemIntent', 'transform');
    for (const [itemId, { droppedItemIntent, transform }] of droppedIntents) {
      world.removeComponent(itemId, 'droppedItemIntent');
      const pos = droppedItemIntent.position ?? { x: transform.x, y: transform.y, z: transform.z };
      this.createDynamicItemBody(world, itemId, pos);
    }

    const statEntities = world.getEntitiesWith('physicsBody', 'physicsStats');
    for (const [id, { physicsBody, physicsStats }] of statEntities) {
      physicsStats.totalWeight = calculateTotalEntityWeight(world, id);

      const health = world.getComponent(id, 'health');
      const isAlive = health ? health.isAlive : true;
      const tag = world.getComponent(id, 'tag');

      if (tag?.archetype !== 'zone' && tag?.archetype !== 'marker') {
        const expectedMask =
          physicsStats.isSolid && isAlive ? COLLISION_MASK_ALL : COLLISION_MASK_NONE;
        if (physicsBody.mask !== expectedMask) {
          physicsBody.mask = expectedMask;
        }
      }
    }

    const movingEntities = world.getEntitiesWith('transform', 'velocity');
    for (const [id, { transform, velocity }] of movingEntities) {
      const phys = world.getComponent(id, 'physicsBody');
      if (phys?.bodyHandle !== undefined && phys.bodyType === 'dynamic') continue;

      const health = world.getComponent(id, 'health');
      if (health && !health.isAlive) continue;

      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      const localDt = dt * ts;

      const selfDx = (velocity.vx ?? 0) * localDt;
      const selfDz = (velocity.vz ?? 0) * localDt;

      const extVx = velocity.externalVx ?? 0;
      const extVy = velocity.externalVy ?? 0;
      const extVz = velocity.externalVz ?? 0;
      const meta = world.getComponent(id, 'meta');

      const isSwimming = meta?.stance === 'swim';
      if (!isSwimming) {
        velocity.vy = (velocity.vy ?? 0) - 9.81 * localDt;
        velocity.vy = Math.max(-20.0, velocity.vy);
      }

      const desiredDx = selfDx + extVx * localDt;
      const desiredDy = (velocity.vy + extVy) * localDt;
      const desiredDz = selfDz + extVz * localDt;

      if (
        phys?.colliderHandle !== undefined &&
        phys.bodyType === 'kinematicPositionBased' &&
        this.driver?.isReady
      ) {
        const physStats = world.getComponent(id, 'physicsStats');
        const characterMass = physStats?.totalWeight ?? physStats?.weight.current ?? 75;

        const movementStats = world.getComponent(id, 'movementStats');
        const minSlideAngle =
          movementStats?.minSlopeSlideAngle ?? BALANCE_CONFIG.creature.minSlopeSlideAngle;

        const prevSlope = velocity.slopeAngleDeg ?? 0;
        const wasSliding = (velocity.isGrounded ?? true) && prevSlope > minSlideAngle;
        const isAirborne =
          (meta?.stance === 'airborne' || velocity.isGrounded === false) && !wasSliding;

        const { movement, isGrounded, groundNormal, slopeAngleDeg } =
          this.driver.computeCharacterMovement(
            phys.colliderHandle,
            { x: desiredDx, y: desiredDy, z: desiredDz },
            characterMass,
            isAirborne || isSwimming
          );

        transform.x += movement.x;
        transform.y += movement.y;
        transform.z += movement.z;

        velocity.actualSpeed = localDt > 0 ? Math.hypot(movement.x, movement.z) / localDt : 0;

        const currentSlope = slopeAngleDeg ?? 0;
        const isSlidingNow = currentSlope > minSlideAngle;

        let grounded = isGrounded;
        if (
          !isSwimming &&
          (isGrounded || (Math.abs(movement.y - desiredDy) > 0.0001 && desiredDy < 0))
        ) {
          grounded = true;
          if (!isSlidingNow) {
            velocity.vy = 0;
          }
        }

        const terrainEntities = world.getEntitiesWith('terrain');
        if (terrainEntities.length > 0) {
          const terrainComp = terrainEntities[0][1].terrain;
          const terrainFloorY = getTerrainHeightAt(terrainComp, transform.x, transform.z);

          if (terrainFloorY !== null && transform.y < terrainFloorY) {
            transform.y = terrainFloorY;
            if (!isSlidingNow) {
              velocity.vy = 0;
            }
            grounded = true;
          }
        }

        if (transform.y < -50) {
          transform.y = 0;
          velocity.vy = 0;
          grounded = true;
        }

        velocity.isGrounded = grounded;
        velocity.groundNormal = groundNormal;
        velocity.slopeAngleDeg = currentSlope;

        if (grounded && isSlidingNow && groundNormal) {
          const slideAccel =
            movementStats?.slopeSlideAcceleration ?? BALANCE_CONFIG.creature.slopeSlideAcceleration;

          const horizLen = Math.hypot(groundNormal.x, groundNormal.z);
          if (horizLen > 0.001) {
            const downX = groundNormal.x / horizLen;
            const downZ = groundNormal.z / horizLen;

            const slopeFactor = Math.min(
              1.0,
              (currentSlope - minSlideAngle) / Math.max(1, 90 - minSlideAngle)
            );
            const effectiveAccel = slideAccel * (0.8 + 0.6 * slopeFactor);

            velocity.externalVx = (velocity.externalVx ?? 0) + downX * effectiveAccel * localDt;
            velocity.externalVz = (velocity.externalVz ?? 0) + downZ * effectiveAccel * localDt;
          }
        }

        if (phys.bodyHandle !== undefined) {
          this.driver.setNextKinematicTranslation(phys.bodyHandle, {
            x: transform.x,
            y: transform.y,
            z: transform.z,
          });
          if (transform.rotation) {
            this.driver.setNextKinematicRotation(phys.bodyHandle, transform.rotation);
          }
        }
      } else {
        transform.x += desiredDx;
        transform.z += desiredDz;
        velocity.actualSpeed = localDt > 0 ? Math.hypot(desiredDx, desiredDz) / localDt : 0;
        velocity.isGrounded = transform.y <= 0;
      }

      const curExtVx = velocity.externalVx ?? 0;
      const curExtVy = velocity.externalVy ?? 0;
      const curExtVz = velocity.externalVz ?? 0;

      if (curExtVx !== 0 || curExtVy !== 0 || curExtVz !== 0) {
        const damping = 3.5;
        const factor = Math.max(0, 1 - damping * localDt);
        velocity.externalVx = curExtVx * factor;
        velocity.externalVy = curExtVy * factor;
        velocity.externalVz = curExtVz * factor;

        if (Math.abs(velocity.externalVx) < 0.01) velocity.externalVx = 0;
        if (Math.abs(velocity.externalVy) < 0.01) velocity.externalVy = 0;
        if (Math.abs(velocity.externalVz) < 0.01) velocity.externalVz = 0;
      }
    }

    const activeCreatures = world
      .getEntitiesWith('transform', 'physicsStats', 'health', 'physicsBody')
      .filter(
        ([, comp]) =>
          comp.health.isAlive &&
          comp.physicsBody.bodyType === 'kinematicPositionBased' &&
          comp.physicsStats.isSolid
      );

    for (let i = 0; i < activeCreatures.length; i++) {
      const [, compA] = activeCreatures[i];
      const rA = compA.physicsStats.radius.current ?? 0.4;
      const mA = compA.physicsStats.totalWeight ?? compA.physicsStats.weight.current ?? 75;

      for (let j = i + 1; j < activeCreatures.length; j++) {
        const [, compB] = activeCreatures[j];
        const rB = compB.physicsStats.radius.current ?? 0.4;
        const mB = compB.physicsStats.totalWeight ?? compB.physicsStats.weight.current ?? 75;

        const dx = compA.transform.x - compB.transform.x;
        const dz = compA.transform.z - compB.transform.z;
        const distSq = dx * dx + dz * dz;
        const minDist = rA + rB;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - (dist > 0.0001 ? dist : 0);
          const nx = dist > 0.0001 ? dx / dist : 1;
          const nz = dist > 0.0001 ? dz / dist : 0;

          const totalMass = Math.max(0.1, mA + mB);
          const ratioA = mB / totalMass;
          const ratioB = mA / totalMass;

          const pushFactor = 0.5;
          const pushX = nx * overlap * pushFactor;
          const pushZ = nz * overlap * pushFactor;

          compA.transform.x += pushX * ratioA;
          compA.transform.z += pushZ * ratioA;

          compB.transform.x -= pushX * ratioB;
          compB.transform.z -= pushZ * ratioB;

          if (compA.physicsBody.bodyHandle !== undefined && this.driver) {
            this.driver.setNextKinematicTranslation(compA.physicsBody.bodyHandle, {
              x: compA.transform.x,
              y: compA.transform.y,
              z: compA.transform.z,
            });
          }
          if (compB.physicsBody.bodyHandle !== undefined && this.driver) {
            this.driver.setNextKinematicTranslation(compB.physicsBody.bodyHandle, {
              x: compB.transform.x,
              y: compB.transform.y,
              z: compB.transform.z,
            });
          }
        }
      }
    }

    const dynamicBodies = world.getEntitiesWith('physicsBody');
    const currentDynamicIds = new Set<string>();

    for (const [id, { physicsBody }] of dynamicBodies) {
      if (physicsBody.bodyHandle === undefined || physicsBody.bodyType !== 'dynamic') continue;

      currentDynamicIds.add(id);
      const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
      const prevTs = this.dynamicBodyTimeScales.get(id) ?? 1.0;

      if (Math.abs(ts - prevTs) > 0.001 && this.driver) {
        const state = this.driver.getBodyState(physicsBody.bodyHandle);
        if (state) {
          const ratio = prevTs > 0.0001 ? ts / prevTs : ts;
          const linvel = state.linvel;
          const angvel = state.angvel;

          this.driver.setBodyLinearVelocity(
            physicsBody.bodyHandle,
            { x: linvel.x * ratio, y: linvel.y * ratio, z: linvel.z * ratio },
            true
          );
          this.driver.setBodyAngularVelocity(
            physicsBody.bodyHandle,
            { x: angvel.x * ratio, y: angvel.y * ratio, z: angvel.z * ratio },
            true
          );
          this.driver.setBodyGravityScale(physicsBody.bodyHandle, ts * ts, true);
        }
        this.dynamicBodyTimeScales.set(id, ts);
      }
    }

    for (const id of this.dynamicBodyTimeScales.keys()) {
      if (!currentDynamicIds.has(id)) {
        this.dynamicBodyTimeScales.delete(id);
      }
    }

    if (this.driver && this.driver.isReady) {
      this.driver.step(dt);
    }
  }

  public checkWeaponHits(attackerId: EntityId, zone: HitZoneConfig, world: World): EntityId[] {
    const hitEntities: EntityId[] = [];
    const attackerTransform = world.getComponent(attackerId, 'transform');
    if (!attackerTransform || !this.driver) return hitEntities;

    const heightOffset = 0.9;
    const pos = {
      x: attackerTransform.x,
      y: attackerTransform.y + heightOffset,
      z: attackerTransform.z,
    };
    const angle = attackerTransform.angle;

    const isTargetValid = (targetId: EntityId) => {
      if (targetId === attackerId) return false;
      const health = world.getComponent(targetId, 'health');
      if (!health || !health.isAlive) return false;

      const tag = world.getComponent(targetId, 'tag');
      const meta = world.getComponent(targetId, 'meta');
      if (tag?.archetype === 'obstacle' && meta?.destructible === false) {
        return false;
      }
      return true;
    };

    if (zone.hitZoneType === 'radius' || zone.hitZoneType === 'angle') {
      const checkRadius =
        zone.hitZoneType === 'radius' ? (zone.radius ?? 2.5) : (zone.length ?? 4.5);

      const candidates = this.driver.queryEntitiesInSphere(pos, checkRadius);

      for (const targetId of candidates) {
        if (!isTargetValid(targetId)) continue;

        const transform = world.getComponent(targetId, 'transform');
        if (!transform) continue;

        const targetY = transform.y + heightOffset;

        if (zone.hitZoneType === 'angle') {
          const maxAngle = (zone.angle ?? Math.PI / 6) / 2;
          const targetAngle = Math.atan2(transform.z - pos.z, transform.x - pos.x);
          const diff = Math.abs(angleDifference(targetAngle, angle));

          const physStats = world.getComponent(targetId, 'physicsStats');
          const targetRadius = physStats?.radius.current ?? 0.4;
          const dist = Math.hypot(transform.x - pos.x, transform.z - pos.z);
          const angularTolerance = dist > 0 ? Math.asin(Math.min(1, targetRadius / dist)) : 0;

          if (diff > maxAngle + angularTolerance) {
            continue;
          }
        }

        if (zone.pierceObstacles && zone.pierceCreatures && zone.pierceItems) {
          hitEntities.push(targetId);
        } else {
          const dx = transform.x - pos.x;
          const dy = targetY - pos.y;
          const dz = transform.z - pos.z;
          const dist = Math.hypot(dx, dy, dz);

          if (dist > 0.001) {
            const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
            const hitList = this.driver.castRayMultiple(pos, dir, dist, true, attackerId);

            let blocked = false;
            for (const hit of hitList) {
              if (hit.entityId === targetId) break;

              const tag = world.getComponent(hit.entityId, 'tag');
              const meta = world.getComponent(hit.entityId, 'meta');
              const arch = tag?.archetype ?? meta?.entityType;
              const phys = world.getComponent(hit.entityId, 'physicsBody');
              const health = world.getComponent(hit.entityId, 'health');

              if (health && !health.isAlive) continue;
              if (phys?.isTrigger) continue;

              let canPierce = false;
              if (arch === 'creature') canPierce = !!zone.pierceCreatures;
              else if (arch === 'item') canPierce = !!zone.pierceItems;
              else if (arch === 'obstacle') canPierce = !!zone.pierceObstacles;

              if (!canPierce) {
                blocked = true;
                break;
              }
            }

            if (!blocked) {
              hitEntities.push(targetId);
            }
          } else {
            hitEntities.push(targetId);
          }
        }
      }
      return hitEntities;
    }

    const hitSet = new Set<string>();

    const processRayHits = (hitList: Array<{ entityId: string; toi: number }>) => {
      for (const hit of hitList) {
        const targetId = hit.entityId;

        const tag = world.getComponent(targetId, 'tag');
        const meta = world.getComponent(targetId, 'meta');
        const arch = tag?.archetype ?? meta?.entityType;
        const phys = world.getComponent(targetId, 'physicsBody');
        const health = world.getComponent(targetId, 'health');

        const isDead = health && !health.isAlive;
        const isTrigger = phys?.isTrigger;

        if (isDead || isTrigger) continue;

        let canPierce = false;
        if (arch === 'creature') canPierce = !!zone.pierceCreatures;
        else if (arch === 'item') canPierce = !!zone.pierceItems;
        else if (arch === 'obstacle') canPierce = !!zone.pierceObstacles;

        if (isTargetValid(targetId)) {
          hitSet.add(targetId);
        }

        if (!canPierce) {
          break;
        }
      }
    };

    if (zone.hitZoneType === 'forward_line') {
      const length = zone.length ?? 6.0;
      const dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      const hitList = this.driver.castRayMultiple(pos, dir, length, true, attackerId);
      processRayHits(hitList);
    } else if (zone.hitZoneType === 'shrapnel') {
      const length = zone.length ?? 5.0;
      const maxAngle = (zone.angle ?? Math.PI / 3) / 2;
      const count = zone.rayCount ?? 5;

      for (let i = 0; i < count; i++) {
        const fraction = count > 1 ? i / (count - 1) - 0.5 : 0;
        const rayAngle = angle + fraction * (maxAngle * 2);
        const dir = { x: Math.cos(rayAngle), y: 0, z: Math.sin(rayAngle) };

        const hitList = this.driver.castRayMultiple(pos, dir, length, true, attackerId);
        processRayHits(hitList);
      }
    }

    return Array.from(hitSet);
  }
}
