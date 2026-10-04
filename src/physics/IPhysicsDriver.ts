import { Vec3, Quat } from '../types';

export type PhysicsBodyHandle = number;
export type PhysicsColliderHandle = number;

export interface PhysicsDriverStats {
  stepCount: number;
  bodyCount: number;
  colliderCount: number;
}

export interface PhysicalRaycastResult {
  /** Точка на поверхности коллайдера в мировых координатах */
  point: Vec3;
  /** Вектор нормали к поверхности в точке удара */
  normal: Vec3;
  /** Дистанция вдоль луча от начала до точки пересечения */
  toi: number;
  /** ID сущности ECS, если луч попал в тело сущности */
  entityId?: string;
  /** Признак попадания в статический пол мира */
  isGround: boolean;
  /** Пораженный коллайдер (через числовой хэндл) */
  colliderHandle?: PhysicsColliderHandle;
}

export interface BodyCreationOptions {
  rotation?: Quat;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
}

export interface ColliderCreationOptions {
  mass?: number;
  offset?: Vec3;
  restitution?: number;
  friction?: number;
  isSensor?: boolean;
  useMaxCombineRule?: boolean;
}

export interface DynamicBodyState {
  translation: Vec3;
  rotation: Quat;
  linvel: Vec3;
  angvel: Vec3;
  isSleeping: boolean;
}

export interface IPhysicsDriver {
  /** Флаг готовности физического мира к симуляции */
  readonly isReady: boolean;

  /** Шаг фиксированного времени для интеграции (по умолчанию 1/60 с) */
  fixedTimestep: number;

  /** Выполняет один атомарный шаг физической симуляции мира */
  step(dt?: number): void;

  /** Устанавливает 3D-вектор гравитации в метрах на секунду в квадрате */
  setGravity(x: number, y: number, z: number): void;

  // --- СОЗДАНИЕ ТЕЛ ---
  createDynamicBody(pos: Vec3, entityId?: string, options?: BodyCreationOptions): PhysicsBodyHandle;
  createFixedBody(pos: Vec3, entityId?: string, options?: BodyCreationOptions): PhysicsBodyHandle;
  createKinematicPositionBody(
    pos: Vec3,
    entityId?: string,
    options?: BodyCreationOptions
  ): PhysicsBodyHandle;

  // --- СОЗДАНИЕ КОЛЛАЙДЕРОВ ---
  createBallCollider(
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle;
  createCylinderCollider(
    halfHeight: number,
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle;
  createConvexHullCollider(
    points: Float32Array,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle | null;
  createCapsuleCollider(
    halfHeight: number,
    radius: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle;
  createCuboidCollider(
    hx: number,
    hy: number,
    hz: number,
    parentHandle: PhysicsBodyHandle,
    options?: ColliderCreationOptions
  ): PhysicsColliderHandle;

  // --- ОБНОВЛЕНИЕ И УДАЛЕНИЕ ---
  updateCapsuleCollider(
    colliderHandle: PhysicsColliderHandle,
    halfHeight: number,
    radius: number,
    offsetY: number
  ): PhysicsColliderHandle;
  updateCuboidCollider(
    colliderHandle: PhysicsColliderHandle,
    hx: number,
    hy: number,
    hz: number,
    offsetY?: number
  ): PhysicsColliderHandle;
  removeCollider(colliderHandle: PhysicsColliderHandle, wakeUp?: boolean): void;
  removeRigidBody(bodyHandle: PhysicsBodyHandle): void;

  // --- УПРАВЛЕНИЕ СОСТОЯНИЕМ ТЕЛ (Трансформации и силы) ---
  setBodyTranslation(handle: PhysicsBodyHandle, pos: Vec3, wakeUp?: boolean): void;
  setBodyRotation(handle: PhysicsBodyHandle, rot: Quat, wakeUp?: boolean): void;
  setNextKinematicTranslation(handle: PhysicsBodyHandle, pos: Vec3): void;
  setNextKinematicRotation(handle: PhysicsBodyHandle, rot: Quat): void;

  setBodyLinearVelocity(handle: PhysicsBodyHandle, vel: Vec3, wakeUp?: boolean): void;
  setBodyAngularVelocity(handle: PhysicsBodyHandle, angvel: Vec3, wakeUp?: boolean): void;
  applyBodyImpulse(handle: PhysicsBodyHandle, impulse: Vec3, wakeUp?: boolean): void;
  setBodyDamping(handle: PhysicsBodyHandle, linear: number, angular: number): void;
  setBodyGravityScale(handle: PhysicsBodyHandle, scale: number, wakeUp?: boolean): void;

  isBodySleeping(handle: PhysicsBodyHandle): boolean;
  wakeUpBody(handle: PhysicsBodyHandle): void;
  getBodyState(handle: PhysicsBodyHandle): DynamicBodyState | null;

  // --- СПЕЦИФИЧЕСКИЕ МЕТОДЫ И ЗАПРОСЫ ---
  computeCharacterMovement(
    colliderHandle: PhysicsColliderHandle,
    desiredTranslation: Vec3,
    characterMass: number,
    isAirborne?: boolean
  ): { movement: Vec3; isGrounded: boolean; groundNormal?: Vec3; slopeAngleDeg?: number };
  checkCeilingClearance(
    pos: Vec3,
    radius: number,
    currentHeight: number,
    targetHeight: number,
    ignoreEntityId?: string
  ): boolean;

  createGround(
    size?: number,
    thickness?: number,
    y?: number
  ): { bodyHandle: PhysicsBodyHandle; colliderHandle: PhysicsColliderHandle };
  createOrUpdateTerrainChunk(
    chunkId: string,
    vertices: Float32Array,
    indices: Uint32Array,
    position: Vec3,
    entityId?: string
  ): void;
  removeTerrainChunk(chunkId: string): void;
  wakeUpDynamicBodiesInRadius(center: Vec3, radius: number): void;

  queryEntitiesInSphere(center: Vec3, radius: number): string[];
  queryEntitiesInBox(center: Vec3, halfExtents: Vec3, rotation?: Quat): string[];
  queryEntitiesInCylinder(
    center: Vec3,
    halfHeight: number,
    radius: number,
    rotation?: Quat
  ): string[];
  queryEntitiesInZoneShape(
    shapeType: 'sphere' | 'cylinder' | 'box',
    center: Vec3,
    dimensions: { radius: number; height: number; width: number; depth: number },
    rotation?: Quat
  ): string[];

  castRayMultiple(
    start: Vec3,
    direction: Vec3,
    maxToi: number,
    solid: boolean,
    ignoreEntityId?: string
  ): Array<{ entityId: string; toi: number }>;
  castRay(
    start: Vec3,
    direction: Vec3,
    maxToi?: number,
    solid?: boolean,
    filterExcludeEntityId?: string
  ): PhysicalRaycastResult | null;

  updateSceneQueries(): void;
  getEntityIdByBodyHandle(handle: PhysicsBodyHandle): string | undefined;

  /** Возвращает нативный мир ТОЛЬКО для дебаг-рендера (остальным системам недоступен) */
  getRawWorld(): any;
  getStats(): PhysicsDriverStats;
  destroy(): void;
}
