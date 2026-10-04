import { Point, Vec3 } from './types';

export type Radians = number;
export type Degrees = number;

export function deg2Rad(deg: number): Radians {
  return ((deg * Math.PI) / 180) as Radians;
}

export function rad2Deg(rad: Radians | number): Degrees {
  return ((rad * 180) / Math.PI) as Degrees;
}

/** Нормализует угол в радианах к диапазону [-PI, PI] */
export function normalizeAngle(rad: number): Radians {
  return Math.atan2(Math.sin(rad), Math.cos(rad)) as Radians;
}

/** Вычисляет кратчайшую разницу между углами в радианах в диапазоне [-PI, PI] */
export function angleDifference(target: number, current: number): Radians {
  return normalizeAngle(target - current);
}

/** Вычисляет расстояние на горизонтальной плоскости пола XZ между двумя 3D-точками */
export function distanceXZ(start: { x: number; z: number }, end: { x: number; z: number }): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return Math.hypot(dx, dz);
}

/** Сохраняем имя для обратной совместимости, фиксируя расчет строго на плоскости XZ */
export function vec2_distance_to(
  start: { x: number; z: number },
  end: { x: number; z: number }
): number {
  return distanceXZ(start, end);
}

/** Вычисляет полное 3D евклидово расстояние в пространстве */
export function distance3D(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number }
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  return Math.hypot(dx, dy, dz);
}

export function nowInSeconds(): number {
  return Date.now() / 1000;
}

export function createRectanglePoints(width: number, height: number): Point[] {
  const hw = width / 2;
  const hh = height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

export function isConvexPolygon(points: Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;

  let sign = 0;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;

    const crossProduct = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(crossProduct) > 1e-7) {
      const currentSign = crossProduct > 0 ? 1 : -1;
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false;
      }
    }
  }
  return sign !== 0;
}

export function calculateBoundingRadius(points: Point[]): number {
  let maxSq = 0;
  for (const p of points) {
    const distSq = p.x * p.x + p.y * p.y;
    if (distSq > maxSq) maxSq = distSq;
  }
  return Math.sqrt(maxSq);
}

export interface EnvironmentData {
  timeOfDay: number;
  dayDuration: number;
  azimuth: number;
  axialTilt: number;
  fogDensity: number;
  ambientIntensity?: number;
  sunIntensityMultiplier?: number;
  hemiSkyColor?: string;
  hemiGroundColor?: string;
}

/**
 * Вычисляет баллистический вектор скорости для броска в цель.
 * Использует аналитическую формулу угла минимальной энергии.
 * Если требуемая скорость превышает физический предел силы, предмет кидается изо всех сил, но не долетает.
 */
export function calculateThrowVelocity(
  start: Vec3,
  target: Vec3,
  strength: number,
  mass: number
): Vec3 {
  const g = 9.81;
  const Vcap = 25.0; // Максимальная физиологическая скорость руки (м/с)
  const karm = 2.0; // Коэффициент сопротивления массы

  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dz = target.z - start.z;

  const d = Math.max(0.001, Math.hypot(dx, dz));
  const h = dy;

  // Ограничение скорости на основе силы слота и веса предмета
  const Vmax = Vcap * Math.sqrt(strength / (strength + karm * mass));

  // Оптимальный угол броска для минимальных усилий (настильная/навесная дуга)
  const theta = Math.atan((h + Math.sqrt(d * d + h * h)) / d);
  const Vreq = Math.sqrt(g * (h + Math.sqrt(d * d + h * h)));

  // Если цель слишком далеко, кидаем с максимальной доступной скоростью
  const V0 = Math.min(Vreq, Vmax);

  const Vh = V0 * Math.cos(theta);
  const Vy = V0 * Math.sin(theta);

  const dirX = dx / d;
  const dirZ = dz / d;

  return {
    x: dirX * Vh,
    y: Vy,
    z: dirZ * Vh,
  };
}
