import {
  IPhysicsDriver,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
} from '../../physics/IPhysicsDriver';
import { ColliderPartDesc } from '../components/physics';
import { Point } from '../../types';

export function scaleObstacleColliders(
  colliders: ColliderPartDesc[] | undefined,
  ratioX: number,
  ratioY: number,
  ratioZ: number = ratioX
): void {
  if (!colliders || colliders.length === 0) return;

  for (const part of colliders) {
    if (part.shape === 'cylinder') {
      const rScale = (ratioX + ratioZ) / 2;
      if (part.radius !== undefined) part.radius *= rScale;
      if (part.halfHeight !== undefined) part.halfHeight *= ratioY;
      if (part.offset) {
        part.offset.x *= ratioX;
        part.offset.y *= ratioY;
        part.offset.z *= ratioZ;
      }
    } else if (part.shape === 'cuboid') {
      if (part.halfExtents) {
        part.halfExtents.x *= ratioX;
        part.halfExtents.y *= ratioY;
        part.halfExtents.z *= ratioZ;
      }
      if (part.offset) {
        part.offset.x *= ratioX;
        part.offset.y *= ratioY;
        part.offset.z *= ratioZ;
      }
    } else if (part.shape === 'ball') {
      const rScale = (ratioX + ratioY + ratioZ) / 3;
      if (part.radius !== undefined) part.radius *= rScale;
      if (part.offset) {
        part.offset.x *= ratioX;
        part.offset.y *= ratioY;
        part.offset.z *= ratioZ;
      }
    } else if (part.shape === 'capsule') {
      const rScale = (ratioX + ratioZ) / 2;
      if (part.radius !== undefined) part.radius *= rScale;
      if (part.halfHeight !== undefined) part.halfHeight *= ratioY;
      if (part.offset) {
        part.offset.x *= ratioX;
        part.offset.y *= ratioY;
        part.offset.z *= ratioZ;
      }
    } else if (part.shape === 'convexHull' && part.points) {
      const pts = part.points;
      for (let i = 0; i < pts.length; i += 3) {
        pts[i] *= ratioX;
        pts[i + 1] *= ratioY;
        pts[i + 2] *= ratioZ;
      }
      if (part.offset) {
        part.offset.x *= ratioX;
        part.offset.y *= ratioY;
        part.offset.z *= ratioZ;
      }
    }
  }
}

export function buildObstacleColliders(
  driver: IPhysicsDriver,
  bodyHandle: PhysicsBodyHandle,
  configOrStats: {
    points?: Point[];
    height?: number | { current: number; base?: number };
    colliders?: ColliderPartDesc[];
  }
): { primaryCollider?: PhysicsColliderHandle; allColliders: PhysicsColliderHandle[] } {
  const colliders: PhysicsColliderHandle[] = [];

  if (configOrStats.colliders && configOrStats.colliders.length > 0) {
    for (const part of configOrStats.colliders) {
      if (part.shape === 'cylinder') {
        const h = part.halfHeight ?? 1.0;
        const r = part.radius ?? 0.3;
        const col = driver.createCylinderCollider(h, r, bodyHandle, {
          mass: 0,
          offset: part.offset,
        });
        if (col !== undefined && col !== null) colliders.push(col);
      } else if (part.shape === 'cuboid') {
        const hx = part.halfExtents?.x ?? 0.5;
        const hy = part.halfExtents?.y ?? 0.5;
        const hz = part.halfExtents?.z ?? 0.5;
        const col = driver.createCuboidCollider(hx, hy, hz, bodyHandle, {
          mass: 0,
          offset: part.offset,
        });
        if (col !== undefined && col !== null) colliders.push(col);
      } else if (part.shape === 'ball') {
        const r = part.radius ?? 0.5;
        const col = driver.createBallCollider(r, bodyHandle, { mass: 0, offset: part.offset });
        if (col !== undefined && col !== null) colliders.push(col);
      } else if (part.shape === 'convexHull' && part.points) {
        const fArray =
          part.points instanceof Float32Array ? part.points : new Float32Array(part.points);
        const col = driver.createConvexHullCollider(fArray, bodyHandle, {
          mass: 0,
          offset: part.offset,
        });
        if (col !== undefined && col !== null) colliders.push(col);
      }
    }
  } else {
    const points = configOrStats.points ?? [
      { x: -2, y: -0.5 },
      { x: 2, y: -0.5 },
      { x: 2, y: 0.5 },
      { x: -2, y: 0.5 },
    ];
    let minX = points[0]?.x ?? -2,
      maxX = points[0]?.x ?? 2;
    let minY = points[0]?.y ?? -0.5,
      maxY = points[0]?.y ?? 0.5;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const width = Math.max(0.2, maxX - minX);
    const depth = Math.max(0.2, maxY - minY);
    const rawHeight =
      typeof configOrStats.height === 'object'
        ? configOrStats.height.current
        : configOrStats.height;
    const height = rawHeight ?? 1.5;

    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;

    const col = driver.createCuboidCollider(hx, hy, hz, bodyHandle, {
      mass: 0,
      offset: { x: 0, y: hy, z: 0 },
    });
    if (col !== undefined && col !== null) colliders.push(col);
  }

  return { primaryCollider: colliders[0], allColliders: colliders };
}
