import { Point, Vec3, Quat, Radians } from '../../types';
import { StatValue } from './stats';
import { PhysicsBodyHandle, PhysicsColliderHandle } from '../../physics/IPhysicsDriver';

export type PhysicsBodyType = 'dynamic' | 'fixed' | 'kinematicPositionBased';

export interface TransformComponent {
  x: number;
  y: number;
  z: number;
  rotation: Quat;
  /** Вспомогательное поле рыскания (Yaw) для обратной совместимости систем */
  angle: Radians;
  /** Флаг ручного изменения (например, из редактора) для безопасной синхронизации с физическим движком */
  isDirty?: boolean;
}

export type ColliderShapeType = 'cuboid' | 'ball' | 'cylinder' | 'capsule' | 'convexHull';

export interface ColliderPartDesc {
  shape: ColliderShapeType;
  halfExtents?: Vec3;
  radius?: number;
  halfHeight?: number;
  offset?: Vec3;
  points?: number[]; // [x, y, z, x, y, z...] для convexHull
}

export interface PhysicsBodyComponent {
  /** Числовой дескриптор твердого тела в физическом движке */
  bodyHandle?: PhysicsBodyHandle;
  /** Числовой дескриптор основного коллайдера */
  colliderHandle?: PhysicsColliderHandle;
  /** Список дескрипторов всех составных коллайдеров */
  colliderHandles?: PhysicsColliderHandle[];
  /** Тип физического поведения в 3D */
  bodyType?: PhysicsBodyType;

  isStatic: boolean;
  category: number;
  mask: number;
  isTrigger?: boolean;
  currentColliderStance?: string;
  lastAppliedRadius?: number;
  lastAppliedHeight?: number;
  lastAppliedWidth?: number;
  lastAppliedDepth?: number;
}

export const STANDARD_RADII = [8, 16, 24, 32] as const;
export type StandardRadius = (typeof STANDARD_RADII)[number];

export function isValidStandardRadius(radius: number): radius is StandardRadius {
  return (STANDARD_RADII as readonly number[]).includes(radius);
}

export interface PhysicsConfig {
  radius: number;
  weight: number;
  totalWeight?: number;
  size?: number;
  height?: number;
  isSolid?: boolean;
  shape?: 'cuboid' | 'ball' | 'cylinder';
  restitution?: number;
  friction?: number;
  points?: Point[];
  linearDamping?: number;
  angularDamping?: number;
  halfExtents?: Vec3;
  colliderOffset?: Vec3;
  colliders?: ColliderPartDesc[];
}

export interface PhysicsStatsComponent {
  radius: StatValue<number>;
  weight: StatValue<number>;
  height: StatValue<number>;
  totalWeight?: number;
  size?: number;
  isSolid: boolean;
  shape?: 'cuboid' | 'ball' | 'cylinder';
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
  points?: Point[];
  halfExtents?: Vec3;
  colliderOffset?: Vec3;
  colliders?: ColliderPartDesc[];
}
