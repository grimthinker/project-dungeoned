import RAPIER from '@dimforge/rapier3d-compat';
import {
  IPhysicsDriver,
  PhysicsDriverStats,
  PhysicalRaycastResult,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
  BodyCreationOptions,
  ColliderCreationOptions,
  DynamicBodyState,
} from './IPhysicsDriver';
import { Vec3, Quat } from '../types';

export class RapierPhysicsDriver implements IPhysicsDriver {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;
  private stepCount: number = 0;
  public fixedTimestep: number = 1 / 60;
  private isBroadPhaseDirty: boolean = true;

  // Изолированные реестры WASM-объектов
  private bodies = new Map<PhysicsBodyHandle, RAPIER.RigidBody>();
  private colliders = new Map<PhysicsColliderHandle, RAPIER.Collider>();
  private bodyHandleToEntityMap = new Map<PhysicsBodyHandle, string>();
  private entityToBodyMap = new Map<string, PhysicsBodyHandle>();

  private groundBodyHandle: PhysicsBodyHandle | null = null;
  private groundColliderHandle: PhysicsColliderHandle | null = null;

  private terrainChunks = new Map<
    string,
    { bodyHandle: PhysicsBodyHandle; colliderHandle: PhysicsColliderHandle }
  >();
  private characterController: RAPIER.KinematicCharacterController | null = null;

  constructor() {
    const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
    this.world = new RAPIER.World(gravity);
    this.world.integrationParameters.dt = this.fixedTimestep;
    this.eventQueue = new RAPIER.EventQueue(true);

    const offset = 0.02;
    this.characterController = this.world.createCharacterController(offset);
    this.characterController.enableAutostep(0.15, 0.25, false);
    this.characterController.enableSnapToGround(0.35);
    this.characterController.setMaxSlopeClimbAngle((40 * Math.PI) / 180);
    this.characterController.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    this.characterController.setApplyImpulsesToDynamicBodies(true);
    this.characterController.setSlideEnabled(true);

    console.log(
      '[RapierPhysicsDriver] Физический мир Rapier3D создан (гравитация: 0, -9.81, 0, KCC активирован)'
    );
  }

  public get isReady(): boolean {
    return this.world !== null;
  }

  public step(dt?: number): void {
    if (!this.world) return;
    if (dt !== undefined && dt > 0) {
      this.world.integrationParameters.dt = dt;
    }
    this.world.step(this.eventQueue || undefined);
    this.stepCount++;
    this.isBroadPhaseDirty = false;
  }

  public setGravity(x: number, y: number, z: number): void {
    if (!this.world) return;
    this.world.gravity = new RAPIER.Vector3(x, y, z);
  }

  // --- ВНУТРЕННИЕ ПОМОЩНИКИ ДЛЯ РАБОТЫ С ОПЦИЯМИ ---

  private applyBodyOptions(desc: RAPIER.RigidBodyDesc, options?: BodyCreationOptions) {
    if (!options) return;
    if (options.rotation) desc.setRotation(options.rotation);
    if (options.linearDamping !== undefined) desc.setLinearDamping(options.linearDamping);
    if (options.angularDamping !== undefined) desc.setAngularDamping(options.angularDamping);
    if (options.gravityScale !== undefined) desc.setGravityScale(options.gravityScale);
  }

  private applyColliderOptions(desc: RAPIER.ColliderDesc, options?: ColliderCreationOptions) {
    if (!options) return;
    if (options.mass !== undefined) desc.setMass(options.mass);
    if (options.offset) desc.setTranslation(options.offset.x, options.offset.y, options.offset.z);
    if (options.restitution !== undefined) desc.setRestitution(options.restitution);
    if (options.friction !== undefined) desc.setFriction(options.friction);
    if (options.isSensor) desc.setSensor(true);
    if (options.useMaxCombineRule) {
      desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
      desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
    }
  }

  private registerBody(desc: RAPIER.RigidBodyDesc, entityId?: string): PhysicsBodyHandle {
    if (!this.world) throw new Error('[RapierPhysicsDriver] World not initialized');
    const body = this.world.createRigidBody(desc);
    this.bodies.set(body.handle, body);
    if (entityId) {
      this.bodyHandleToEntityMap.set(body.handle, entityId);
      this.entityToBodyMap.set(entityId, body.handle);
      (body as any).userData = { entityId };
    }
    this.isBroadPhaseDirty = true;
    return body.handle;
  }

  private registerCollider(
    desc: RAPIER.ColliderDesc,
    parentHandle: PhysicsBodyHandle
  ): PhysicsColliderHandle {
    if (!this.world) throw new Error('[RapierPhysicsDriver] World not initialized');
    const parentBody = this.bodies.get(parentHandle);
    if (!parentBody) throw new Error('[RapierPhysicsDriver] Parent body not found');
    const collider = this.world.createCollider(desc, parentBody);
    this.colliders.set(collider.handle, collider);
    this.isBroadPhaseDirty = true;
    return collider.handle;
  }

  // --- СОЗДАНИЕ ТЕЛ ---

  public createDynamicBody(
    pos: Vec3,
    entityId?: string,
    options?: BodyCreationOptions
  ): PhysicsBodyHandle {
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z);
    this.applyBodyOptions(desc, options);
    return this.registerBody(desc, entityId);
  }

  public createFixedBody(
    pos: Vec3,
    entityId?: string,
    options?: BodyCreationOptions
  ): PhysicsBodyHandle {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    this.applyBodyOptions(desc, options);
    return this.registerBody(desc, entityId);
  }

  public createKinematicPositionBody(
    pos: Vec3,
    entityId?: string,
    options?: BodyCreationOptions
  ): PhysicsBodyHandle {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z);
    this.applyBodyOptions(desc, options);
    return this.registerBody(desc, entityId);
  }

  // --- СОЗДАНИЕ КОЛЛАЙДЕРОВ ---

  public createBallCollider(
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle {
    const desc = RAPIER.ColliderDesc.ball(Math.max(0.01, radius));
    this.applyColliderOptions(desc, options);
    return this.registerCollider(desc, parentHandle);
  }

  public createCylinderCollider(
    halfHeight: number,
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle {
    const desc = RAPIER.ColliderDesc.cylinder(Math.max(0.01, halfHeight), Math.max(0.01, radius));
    this.applyColliderOptions(desc, options);
    return this.registerCollider(desc, parentHandle);
  }

  public createConvexHullCollider(
    points: Float32Array,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle | null {
    const desc = RAPIER.ColliderDesc.convexHull(points);
    if (!desc) return null;
    this.applyColliderOptions(desc, options);
    return this.registerCollider(desc, parentHandle);
  }

  public createCapsuleCollider(
    halfHeight: number,
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle {
    const desc = RAPIER.ColliderDesc.capsule(Math.max(0.01, halfHeight), Math.max(0.01, radius));
    this.applyColliderOptions(desc, options);
    return this.registerCollider(desc, parentHandle);
  }

  public createCuboidCollider(
    hx: number,
    hy: number,
    hz: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle {
    const desc = RAPIER.ColliderDesc.cuboid(
      Math.max(0.01, hx),
      Math.max(0.01, hy),
      Math.max(0.01, hz)
    );
    this.applyColliderOptions(desc, options);
    return this.registerCollider(desc, parentHandle);
  }

  // --- ОБНОВЛЕНИЕ И УДАЛЕНИЕ ---

  public updateCapsuleCollider(
    colliderHandle: PhysicsColliderHandle,
    halfHeight: number,
    radius: number,
    offsetY: number
  ): PhysicsColliderHandle {
    if (!this.world) return colliderHandle;
    const collider = this.colliders.get(colliderHandle);
    if (!collider) return colliderHandle;
    const parentBody = collider.parent();
    if (!parentBody) return colliderHandle;

    const isSensor = collider.isSensor();
    const friction = collider.friction();
    const restitution = collider.restitution();
    const collisionGroups = collider.collisionGroups();
    const solverGroups = collider.solverGroups();

    this.world.removeCollider(collider, false);
    this.colliders.delete(colliderHandle);

    const desc = RAPIER.ColliderDesc.capsule(Math.max(0.01, halfHeight), Math.max(0.01, radius));
    desc.setTranslation(0.0, offsetY, 0.0);
    desc.setSensor(isSensor);
    desc.setFriction(friction);
    desc.setRestitution(restitution);
    desc.setCollisionGroups(collisionGroups);
    desc.setSolverGroups(solverGroups);

    const newCollider = this.world.createCollider(desc, parentBody);
    this.colliders.set(newCollider.handle, newCollider);
    this.isBroadPhaseDirty = true;
    return newCollider.handle;
  }

  public updateCuboidCollider(
    colliderHandle: PhysicsColliderHandle,
    hx: number,
    hy: number,
    hz: number,
    offsetY?: number
  ): PhysicsColliderHandle {
    if (!this.world) return colliderHandle;
    const collider = this.colliders.get(colliderHandle);
    if (!collider) return colliderHandle;
    const parentBody = collider.parent();
    if (!parentBody) return colliderHandle;

    const isSensor = collider.isSensor();
    const friction = collider.friction();
    const restitution = collider.restitution();
    const collisionGroups = collider.collisionGroups();
    const solverGroups = collider.solverGroups();

    this.world.removeCollider(collider, false);
    this.colliders.delete(colliderHandle);

    const desc = RAPIER.ColliderDesc.cuboid(
      Math.max(0.01, hx),
      Math.max(0.01, hy),
      Math.max(0.01, hz)
    );
    if (offsetY !== undefined) desc.setTranslation(0.0, offsetY, 0.0);
    desc.setSensor(isSensor);
    desc.setFriction(friction);
    desc.setRestitution(restitution);
    desc.setCollisionGroups(collisionGroups);
    desc.setSolverGroups(solverGroups);

    const newCollider = this.world.createCollider(desc, parentBody);
    this.colliders.set(newCollider.handle, newCollider);
    this.isBroadPhaseDirty = true;
    return newCollider.handle;
  }

  public removeCollider(colliderHandle: PhysicsColliderHandle, wakeUp: boolean = true): void {
    if (!this.world) return;
    const collider = this.colliders.get(colliderHandle);
    if (collider) {
      this.world.removeCollider(collider, wakeUp);
      this.colliders.delete(colliderHandle);
      this.isBroadPhaseDirty = true;
    }
  }

  public removeRigidBody(bodyHandle: PhysicsBodyHandle): void {
    if (!this.world) return;
    const body = this.bodies.get(bodyHandle);
    if (body) {
      const entityId = this.bodyHandleToEntityMap.get(bodyHandle);
      if (entityId) {
        this.entityToBodyMap.delete(entityId);
      }
      this.bodyHandleToEntityMap.delete(bodyHandle);

      // Очистка привязанных коллайдеров из кэша
      for (let i = 0; i < body.numColliders(); i++) {
        const col = body.collider(i);
        if (col) this.colliders.delete(col.handle);
      }

      this.world.removeRigidBody(body);
      this.bodies.delete(bodyHandle);
      this.isBroadPhaseDirty = true;
    }
  }

  // --- УПРАВЛЕНИЕ СОСТОЯНИЕМ ТЕЛ ---

  public setBodyTranslation(handle: PhysicsBodyHandle, pos: Vec3, wakeUp: boolean = true): void {
    this.bodies.get(handle)?.setTranslation(pos, wakeUp);
  }
  public setBodyRotation(handle: PhysicsBodyHandle, rot: Quat, wakeUp: boolean = true): void {
    this.bodies.get(handle)?.setRotation(rot, wakeUp);
  }
  public setNextKinematicTranslation(handle: PhysicsBodyHandle, pos: Vec3): void {
    this.bodies.get(handle)?.setNextKinematicTranslation(pos);
  }
  public setNextKinematicRotation(handle: PhysicsBodyHandle, rot: Quat): void {
    this.bodies.get(handle)?.setNextKinematicRotation(rot);
  }
  public setBodyLinearVelocity(handle: PhysicsBodyHandle, vel: Vec3, wakeUp: boolean = true): void {
    this.bodies.get(handle)?.setLinvel(vel, wakeUp);
  }
  public setBodyAngularVelocity(
    handle: PhysicsBodyHandle,
    angvel: Vec3,
    wakeUp: boolean = true
  ): void {
    this.bodies.get(handle)?.setAngvel(angvel, wakeUp);
  }
  public applyBodyImpulse(handle: PhysicsBodyHandle, impulse: Vec3, wakeUp: boolean = true): void {
    this.bodies.get(handle)?.applyImpulse(impulse, wakeUp);
  }
  public setBodyDamping(handle: PhysicsBodyHandle, linear: number, angular: number): void {
    const body = this.bodies.get(handle);
    if (body) {
      body.setLinearDamping(linear);
      body.setAngularDamping(angular);
    }
  }
  public setBodyGravityScale(
    handle: PhysicsBodyHandle,
    scale: number,
    wakeUp: boolean = true
  ): void {
    this.bodies.get(handle)?.setGravityScale(scale, wakeUp);
  }
  public isBodySleeping(handle: PhysicsBodyHandle): boolean {
    return this.bodies.get(handle)?.isSleeping() ?? false;
  }
  public wakeUpBody(handle: PhysicsBodyHandle): void {
    this.bodies.get(handle)?.wakeUp();
  }

  public getBodyState(handle: PhysicsBodyHandle): DynamicBodyState | null {
    const body = this.bodies.get(handle);
    if (!body) return null;
    return {
      translation: body.translation(),
      rotation: body.rotation(),
      linvel: body.linvel(),
      angvel: body.angvel(),
      isSleeping: body.isSleeping(),
    };
  }

  // --- СПЕЦИФИЧЕСКИЕ МЕТОДЫ ---

  public computeCharacterMovement(
    colliderHandle: PhysicsColliderHandle,
    desiredTranslation: Vec3,
    characterMass: number,
    isAirborne?: boolean
  ): { movement: Vec3; isGrounded: boolean; groundNormal?: Vec3; slopeAngleDeg?: number } {
    const collider = this.colliders.get(colliderHandle);
    if (!this.world || !this.characterController || !collider) {
      return {
        movement: desiredTranslation,
        isGrounded: true,
        groundNormal: { x: 0, y: 1, z: 0 },
        slopeAngleDeg: 0,
      };
    }

    this.characterController.setCharacterMass(characterMass);
    if (isAirborne) {
      this.characterController.enableSnapToGround(0.0);
    } else {
      this.characterController.enableSnapToGround(0.35);
    }

    const filterFlags =
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
    this.characterController.computeColliderMovement(collider, desiredTranslation, filterFlags);

    let groundNormal: Vec3 = { x: 0, y: 1, z: 0 };
    let maxNormalY = 0;

    const numCollisions = this.characterController.numComputedCollisions();
    for (let i = 0; i < numCollisions; i++) {
      const collision = this.characterController.computedCollision(i);
      const parentBody = collision?.collider?.parent();
      if (parentBody && parentBody.isDynamic() && parentBody.isSleeping()) {
        parentBody.wakeUp();
      }
      if (collision && collision.normal1 && collision.normal1.y > maxNormalY) {
        maxNormalY = collision.normal1.y;
        groundNormal = { x: collision.normal1.x, y: collision.normal1.y, z: collision.normal1.z };
      }
    }

    const computed = this.characterController.computedMovement();
    const isGrounded = this.characterController.computedGrounded();

    if (isGrounded && maxNormalY === 0) {
      const colPos = collider.translation();
      const downRay = this.world.castRayAndGetNormal(
        new RAPIER.Ray(colPos, new RAPIER.Vector3(0, -1, 0)),
        1.5,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
      );
      if (downRay && downRay.normal) {
        groundNormal = { x: downRay.normal.x, y: downRay.normal.y, z: downRay.normal.z };
      }
    }

    const nLen = Math.hypot(groundNormal.x, groundNormal.y, groundNormal.z);
    if (nLen > 0.0001) {
      groundNormal.x /= nLen;
      groundNormal.y /= nLen;
      groundNormal.z /= nLen;
    }

    const slopeAngleDeg = Math.acos(Math.min(1, Math.max(0, groundNormal.y))) * (180 / Math.PI);

    return {
      movement: { x: computed.x, y: computed.y, z: computed.z },
      isGrounded,
      groundNormal,
      slopeAngleDeg,
    };
  }

  public wakeUpDynamicBodiesInRadius(center: Vec3, radius: number): void {
    if (!this.world) return;
    const ids = this.queryEntitiesInSphere(center, radius);
    for (const id of ids) {
      const bodyHandle = this.entityToBodyMap.get(id);
      if (bodyHandle !== undefined) {
        const body = this.bodies.get(bodyHandle);
        if (body && body.isDynamic() && body.isSleeping()) {
          body.wakeUp();
        }
      }
    }
  }

  public checkCeilingClearance(
    pos: Vec3,
    radius: number,
    currentHeight: number,
    targetHeight: number,
    ignoreEntityId?: string
  ): boolean {
    if (!this.world) return false;

    const halfHeight = Math.max(0.01, (targetHeight - 2 * radius) / 2);
    const capsuleCenterY = pos.y + halfHeight + radius;

    const shapePos = new RAPIER.Vector3(pos.x, capsuleCenterY, pos.z);
    const shapeRot = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    const shape = new RAPIER.Capsule(halfHeight, radius);

    let isBlocked = false;

    this.world.intersectionsWithShape(shapePos, shapeRot, shape, (collider: RAPIER.Collider) => {
      const parent = collider.parent();
      if (parent) {
        const entityId = this.getEntityIdByBodyHandle(parent.handle);
        if (entityId && entityId === ignoreEntityId) return true;
        if (collider.isSensor()) return true;
        if (parent.isFixed() || parent.isDynamic()) {
          isBlocked = true;
          return false;
        }
      }
      return true;
    });

    return isBlocked;
  }

  public createGround(
    size: number = 100,
    thickness: number = 1.0,
    y: number = 0.0
  ): { bodyHandle: PhysicsBodyHandle; colliderHandle: PhysicsColliderHandle } {
    if (this.groundBodyHandle !== null) {
      this.removeRigidBody(this.groundBodyHandle);
      this.groundBodyHandle = null;
      this.groundColliderHandle = null;
    }

    const bodyHandle = this.createFixedBody({ x: 0.0, y: y - thickness / 2, z: 0.0 });
    const colliderHandle = this.createCuboidCollider(size / 2, thickness / 2, size / 2, bodyHandle);

    this.groundBodyHandle = bodyHandle;
    this.groundColliderHandle = colliderHandle;
    return { bodyHandle, colliderHandle };
  }

  public createOrUpdateTerrainChunk(
    chunkId: string,
    vertices: Float32Array,
    indices: Uint32Array,
    position: Vec3,
    entityId?: string
  ): void {
    if (!this.world) return;

    let existing = this.terrainChunks.get(chunkId);
    if (existing) {
      this.removeRigidBody(existing.bodyHandle);
    }

    const bodyHandle = this.createFixedBody(position, entityId);
    const body = this.bodies.get(bodyHandle);
    if (!body) return;

    try {
      const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      colDesc.setRestitution(0.0);
      colDesc.setFriction(0.8);

      const collider = this.world.createCollider(colDesc, body);
      this.colliders.set(collider.handle, collider);
      this.terrainChunks.set(chunkId, { bodyHandle, colliderHandle: collider.handle });
      this.isBroadPhaseDirty = true;
    } catch (err) {
      console.error(`[RapierPhysicsDriver] Ошибка создания физики чанка ${chunkId}:`, err);
      this.removeRigidBody(bodyHandle);
    }
  }

  public removeTerrainChunk(chunkId: string): void {
    const existing = this.terrainChunks.get(chunkId);
    if (existing) {
      this.removeRigidBody(existing.bodyHandle);
      this.terrainChunks.delete(chunkId);
      this.isBroadPhaseDirty = true;
    }
  }

  // --- ЗАПРОСЫ ---

  public queryEntitiesInSphere(center: Vec3, radius: number): string[] {
    if (!this.world) return [];
    if (this.isBroadPhaseDirty) this.updateSceneQueries();

    const hitIds = new Set<string>();
    const shapePos = new RAPIER.Vector3(center.x, center.y, center.z);
    const shapeRot = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    const shape = new RAPIER.Ball(Math.max(0.01, radius));

    this.world.intersectionsWithShape(
      shapePos,
      shapeRot,
      shape,
      (collider: RAPIER.Collider) => {
        const parent = collider.parent();
        if (parent) {
          const entityId = this.getEntityIdByBodyHandle(parent.handle);
          if (entityId) hitIds.add(entityId);
        }
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    );
    return Array.from(hitIds);
  }

  public queryEntitiesInZoneShape(
    shapeType: 'sphere' | 'cylinder' | 'box',
    center: Vec3,
    dimensions: { radius: number; height: number; width: number; depth: number },
    rotation?: Quat
  ): string[] {
    if (shapeType === 'box') {
      return this.queryEntitiesInBox(
        center,
        { x: dimensions.width / 2, y: dimensions.height / 2, z: dimensions.depth / 2 },
        rotation
      );
    }
    if (shapeType === 'cylinder') {
      return this.queryEntitiesInCylinder(
        center,
        dimensions.height / 2,
        dimensions.radius,
        rotation
      );
    }
    return this.queryEntitiesInSphere(center, dimensions.radius);
  }

  public queryEntitiesInBox(center: Vec3, halfExtents: Vec3, rotation?: Quat): string[] {
    if (!this.world) return [];
    if (this.isBroadPhaseDirty) this.updateSceneQueries();

    const hitIds = new Set<string>();
    const shapePos = new RAPIER.Vector3(center.x, center.y, center.z);
    const shapeRot = rotation ?? { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    const shape = new RAPIER.Cuboid(
      Math.max(0.01, halfExtents.x),
      Math.max(0.01, halfExtents.y),
      Math.max(0.01, halfExtents.z)
    );

    this.world.intersectionsWithShape(
      shapePos,
      shapeRot,
      shape,
      (collider: RAPIER.Collider) => {
        const parent = collider.parent();
        if (parent) {
          const entityId = this.getEntityIdByBodyHandle(parent.handle);
          if (entityId) hitIds.add(entityId);
        }
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    );
    return Array.from(hitIds);
  }

  public queryEntitiesInCylinder(
    center: Vec3,
    halfHeight: number,
    radius: number,
    rotation?: Quat
  ): string[] {
    if (!this.world) return [];
    if (this.isBroadPhaseDirty) this.updateSceneQueries();

    const hitIds = new Set<string>();
    const shapePos = new RAPIER.Vector3(center.x, center.y, center.z);
    const shapeRot = rotation ?? { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    const shape = new RAPIER.Cylinder(Math.max(0.01, halfHeight), Math.max(0.01, radius));

    this.world.intersectionsWithShape(
      shapePos,
      shapeRot,
      shape,
      (collider: RAPIER.Collider) => {
        const parent = collider.parent();
        if (parent) {
          const entityId = this.getEntityIdByBodyHandle(parent.handle);
          if (entityId) hitIds.add(entityId);
        }
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    );
    return Array.from(hitIds);
  }

  public castRayMultiple(
    start: Vec3,
    direction: Vec3,
    maxToi: number,
    solid: boolean,
    ignoreEntityId?: string
  ): Array<{ entityId: string; toi: number }> {
    if (!this.world) return [];
    if (this.isBroadPhaseDirty) this.updateSceneQueries();

    const hits: Array<{ entityId: string; toi: number }> = [];
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(start.x, start.y, start.z),
      new RAPIER.Vector3(direction.x, direction.y, direction.z)
    );

    this.world.intersectionsWithRay(
      ray,
      maxToi,
      solid,
      (intersect: RAPIER.RayColliderIntersection) => {
        const collider = intersect.collider;
        const parent = collider.parent();
        if (parent) {
          const entityId = this.getEntityIdByBodyHandle(parent.handle);
          if (entityId && entityId !== ignoreEntityId) {
            hits.push({ entityId, toi: intersect.timeOfImpact });
          }
        }
        return true;
      }
    );

    hits.sort((a, b) => a.toi - b.toi);
    const uniqueHits: Array<{ entityId: string; toi: number }> = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (!seen.has(hit.entityId)) {
        seen.add(hit.entityId);
        uniqueHits.push(hit);
      }
    }
    return uniqueHits;
  }

  public castRay(
    start: Vec3,
    direction: Vec3,
    maxToi: number = 1000,
    solid: boolean = true,
    filterExcludeEntityId?: string
  ): PhysicalRaycastResult | null {
    if (!this.world) return null;
    if (this.isBroadPhaseDirty) this.updateSceneQueries();

    const len = Math.hypot(direction.x, direction.y, direction.z);
    if (len === 0) return null;
    const dirX = direction.x / len;
    const dirY = direction.y / len;
    const dirZ = direction.z / len;

    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(start.x, start.y, start.z),
      new RAPIER.Vector3(dirX, dirY, dirZ)
    );

    const excludeBodyHandle = filterExcludeEntityId
      ? this.entityToBodyMap.get(filterExcludeEntityId)
      : undefined;
    const excludeBody =
      excludeBodyHandle !== undefined ? this.bodies.get(excludeBodyHandle) : undefined;

    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      solid,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      excludeBody
    );

    if (hit) {
      const toi = hit.timeOfImpact;
      const hitPoint: Vec3 = {
        x: start.x + dirX * toi,
        y: start.y + dirY * toi,
        z: start.z + dirZ * toi,
      };
      const normal: Vec3 = { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z };

      const parentBody = hit.collider.parent();
      const isGround =
        (this.groundColliderHandle !== null && hit.collider.handle === this.groundColliderHandle) ||
        (this.groundBodyHandle !== null &&
          parentBody !== null &&
          parentBody.handle === this.groundBodyHandle);

      const entityId = parentBody ? this.getEntityIdByBodyHandle(parentBody.handle) : undefined;

      return {
        point: hitPoint,
        normal,
        toi,
        entityId,
        isGround: Boolean(isGround),
        colliderHandle: hit.collider.handle,
      };
    }

    if (Math.abs(dirY) > 1e-5) {
      const t = -start.y / dirY;
      if (t > 0 && t <= maxToi) {
        return {
          point: { x: start.x + dirX * t, y: 0, z: start.z + dirZ * t },
          normal: { x: 0, y: 1, z: 0 },
          toi: t,
          isGround: true,
        };
      }
    }
    return null;
  }

  public updateSceneQueries(): void {
    if (!this.world) return;
    this.world.propagateModifiedBodyPositionsToColliders();
    const prevTimestep = this.world.timestep;
    try {
      this.world.timestep = 0;
      this.world.step();
    } finally {
      this.world.timestep = prevTimestep;
    }
    this.isBroadPhaseDirty = false;
  }

  public getEntityIdByBodyHandle(handle: PhysicsBodyHandle): string | undefined {
    return this.bodyHandleToEntityMap.get(handle);
  }

  public getRawWorld(): RAPIER.World | null {
    return this.world;
  }

  public getStats(): PhysicsDriverStats {
    if (!this.world) return { stepCount: 0, bodyCount: 0, colliderCount: 0 };
    return {
      stepCount: this.stepCount,
      bodyCount: this.world.bodies.len(),
      colliderCount: this.world.colliders.len(),
    };
  }

  public destroy(): void {
    this.bodyHandleToEntityMap.clear();
    this.entityToBodyMap.clear();
    this.bodies.clear();
    this.colliders.clear();
    this.groundBodyHandle = null;
    this.groundColliderHandle = null;
    this.terrainChunks.clear();

    if (this.characterController) {
      this.characterController.free();
      this.characterController = null;
    }
    if (this.eventQueue) {
      this.eventQueue.free();
      this.eventQueue = null;
    }
    if (this.world) {
      this.world.free();
      this.world = null;
    }
  }
}
