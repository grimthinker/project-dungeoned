import { World } from '../World';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { AISystem } from '../systems/AISystem';
import {
  EntityId,
  EntityConfig,
  CollisionCategory,
  COLLISION_MASK_ALL,
  COLLISION_MASK_NONE,
  RENDER_Z_INDEX,
  RenderableComponent,
} from '../types';
import { Point, Vec3 } from '../../types';
import {
  Radians,
  isConvexPolygon,
  calculateBoundingRadius,
  createRectanglePoints,
} from '../../utils';
import { createStat } from '../stats/StatEvaluator';
import { fastClone } from '../utils/clone';
import { PhysicsBodyHandle, PhysicsColliderHandle } from '../../physics/IPhysicsDriver';

import { buildObstacleColliders } from '../utils/obstacleColliders';
export { buildObstacleColliders };

export function createWellConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const radius = 1.15;
  const height = 2.6;

  return {
    tag: { archetype: 'obstacle', subType: 'building' },
    meta: { name: 'Колодец', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/well' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius,
      height,
      weight: 2500,
      isSolid: true,
      points: createRectanglePoints(radius * 2, radius * 2),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: 0.5,
          radius: 1.1,
          offset: { x: 0, y: 0.5, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 800,
      hp: 800,
      destructible: true,
    },
  };
}

export function createDockConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 2.0;
  const depth = 4.0;
  const height = 1.5;
  return {
    tag: { archetype: 'obstacle', subType: 'dock' },
    meta: { name: 'Причал', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/dock' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 1500,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: { maxHp: 1000, hp: 1000, destructible: true },
  };
}

export function createBoatConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 1.4;
  const depth = 3.5;
  const height = 0.5;
  return {
    tag: { archetype: 'obstacle', subType: 'boat' },
    meta: { name: 'Лодка', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/boat' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 300,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: { maxHp: 500, hp: 500, destructible: true },
  };
}

export function createWoodenBoxConfig(
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const width = 1.0;
  const depth = 1.0;
  const height = 1.0;
  return {
    tag: { archetype: 'obstacle', subType: 'crate' },
    meta: { name: 'Деревянная коробка', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/wooden_box' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 50,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: { maxHp: 100, hp: 100, destructible: true },
  };
}

export function createLargeBridgeConfig(
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const width = 3.0;
  const depth = 12.0;
  const height = 1.0;
  return {
    tag: { archetype: 'obstacle', subType: 'building' },
    meta: { name: 'Большой мост', entityType: 'obstacle', destructible: false },
    visualModel: { modelId: 'proc://prop/large_bridge' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 15000,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: { maxHp: 5000, hp: 5000, destructible: false },
  };
}

export function createDoghouseConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 1.2;
  const depth = 1.5;
  const height = 1.0;
  return {
    tag: { archetype: 'obstacle', subType: 'building' },
    meta: { name: 'Собачья будка', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/doghouse' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 150,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: { maxHp: 300, hp: 300, destructible: true },
  };
}

export function createInvisibleWallConfig(
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const width = 4.0;
  const depth = 0.5;
  const height = 3.0;
  return {
    tag: { archetype: 'obstacle', subType: 'invisible_wall' },
    meta: { name: 'Невидимая стена', entityType: 'obstacle', destructible: false },
    visualModel: { modelId: 'proc://prop/invisible_wall' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 100000,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'cuboid',
          halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 999999,
      hp: 999999,
      destructible: false,
    },
  };
}

export function createHouseConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 5.0;
  const depth = 5.4;
  const height = 5.5;

  return {
    tag: { archetype: 'obstacle', subType: 'house' },
    meta: { name: 'Дом', entityType: 'obstacle', destructible: false },
    visualModel: { modelId: 'proc://prop/house' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: 2.7,
      height,
      weight: 50000,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'cuboid',
          halfExtents: { x: 2.4, y: 1.5, z: 2.6 },
          offset: { x: 0, y: 1.5, z: 0 },
        },
        {
          shape: 'convexHull',
          points: [
            -2.4, 3.0, 2.6, 2.4, 3.0, 2.6, 0.0, 5.2, 2.6, -2.4, 3.0, -2.6, 2.4, 3.0, -2.6, 0.0, 5.2,
            -2.6,
          ],
        },
      ],
    },
    health: {
      maxHp: 5000,
      hp: 5000,
      destructible: false,
    },
  };
}

export function createTreeConfig(
  modelId: string = 'proc://prop/tree',
  name: string = 'Дерево',
  trunkRadius: number = 0.3,
  trunkHeight: number = 3.0,
  totalHeight: number = 4.0,
  crownRadius: number = 0.6,
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  return {
    tag: { archetype: 'obstacle', subType: 'tree' },
    meta: { name, entityType: 'obstacle', destructible: false },
    visualModel: { modelId },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: crownRadius,
      height: totalHeight,
      weight: 5000,
      isSolid: true,
      points: createRectanglePoints(trunkRadius * 2, trunkRadius * 2),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: trunkHeight / 2,
          radius: trunkRadius,
          offset: { x: 0, y: trunkHeight / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 1000,
      hp: 1000,
      destructible: false,
    },
  };
}

export function createSignpostConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const height = 2.1;
  const radius = 0.14;

  return {
    tag: { archetype: 'obstacle', subType: 'signpost' },
    meta: { name: 'Указатель дорог (3 стрелки)', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/signpost' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: 0.4,
      height,
      weight: 70,
      isSolid: true,
      points: createRectanglePoints(0.8, 0.8),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: height / 2,
          radius,
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 80,
      hp: 80,
      destructible: true,
    },
    readable: {
      title: 'Указатель дорог',
      text: '← Северный тракт (Столица)\n→ Старая сторожевая башня\n↑ Заповедный лес и охотничьи угодья',
    },
    interactable: {
      options: [
        { id: 'read', verb: 'read', label: 'Читать', icon: '📖' },
        { id: 'inspect', verb: 'inspect', label: 'Осмотреть', icon: '🔍' },
      ],
      defaultVerb: 'read',
      interactDistance: 3.0,
    },
  };
}

export function createSignpostSingleConfig(
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const height = 1.6;
  const radius = 0.14;

  return {
    tag: { archetype: 'obstacle', subType: 'signpost' },
    meta: { name: 'Указатель дорог (1 стрелка)', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/signpost_single' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: 0.4,
      height,
      weight: 50,
      isSolid: true,
      points: createRectanglePoints(0.8, 0.8),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: height / 2,
          radius,
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 60,
      hp: 60,
      destructible: true,
    },
    readable: {
      title: 'Предупреждающий знак',
      text: 'ВНИМАНИЕ ПУТНИКАМ!\nВпереди опасные топи и логово волков.\nДержите оружие наготове.',
    },
    interactable: {
      options: [
        { id: 'read', verb: 'read', label: 'Читать', icon: '📖' },
        { id: 'inspect', verb: 'inspect', label: 'Осмотреть', icon: '🔍' },
      ],
      defaultVerb: 'read',
      interactDistance: 3.0,
    },
  };
}

export function createLogPileConfig(
  variant: 1 | 2 = 1,
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const isV1 = variant === 1;
  const width = isV1 ? 1.7 : 1.5;
  const depth = isV1 ? 1.6 : 1.5;
  const height = isV1 ? 0.95 : 0.75;
  const weight = isV1 ? 800 : 550;

  return {
    tag: { archetype: 'obstacle', subType: 'wood' },
    meta: {
      name: isV1 ? 'Стопка бревен (Большая)' : 'Стопка бревен (Малая)',
      entityType: 'obstacle',
      destructible: true,
    },
    visualModel: { modelId: isV1 ? 'proc://prop/log_pile_1' : 'proc://prop/log_pile_2' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'cuboid',
          halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 350,
      hp: 350,
      destructible: true,
    },
  };
}

export function createStumpConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const height = 0.85;
  const radius = 0.45;

  return {
    tag: { archetype: 'obstacle', subType: 'wood' },
    meta: { name: 'Пень с топором', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/stump' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius,
      height,
      weight: 300,
      isSolid: true,
      points: createRectanglePoints(radius * 2, radius * 2),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: 0.75 / 2,
          radius,
          offset: { x: 0, y: 0.75 / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 400,
      hp: 400,
      destructible: true,
    },
  };
}

export function createToiletConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 1.2;
  const depth = 1.2;
  const height = 2.3;

  return {
    tag: { archetype: 'obstacle', subType: 'building' },
    meta: { name: 'Сельский туалет', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/toilet' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: 0.65,
      height,
      weight: 350,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'cuboid',
          halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 250,
      hp: 250,
      destructible: true,
    },
  };
}

export function createBarrelConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const height = 1.1;
  const radius = 0.5;

  return {
    tag: { archetype: 'obstacle', subType: 'barrel' },
    meta: { name: 'Бочка', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/barrel' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius,
      height,
      weight: 60,
      isSolid: true,
      points: createRectanglePoints(radius * 2, radius * 2),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: height / 2,
          radius,
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 120,
      hp: 120,
      destructible: true,
    },
  };
}

export function createBridgeConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const width = 2.4;
  const depth = 6.0;
  const height = 1.2;

  const hullPts: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const z = -depth / 2 + t * depth;
    const y = Math.sin(t * Math.PI) * 0.85;
    hullPts.push(-width / 2, y, z);
    hullPts.push(width / 2, y, z);
    hullPts.push(-width / 2, y - 0.2, z);
    hullPts.push(width / 2, y - 0.2, z);
  }

  return {
    tag: { archetype: 'obstacle', subType: 'building' },
    meta: { name: 'Деревянный мост', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/bridge' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 4500,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'convexHull',
          points: hullPts,
        },
      ],
    },
    health: {
      maxHp: 1500,
      hp: 1500,
      destructible: true,
    },
  };
}

export function createCratePropConfig(
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const width = 1.1;
  const depth = 0.85;
  const height = 0.6;

  return {
    tag: { archetype: 'obstacle', subType: 'crate' },
    meta: { name: 'Деревянный ящик', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/crate' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: Math.max(width, depth) / 2,
      height,
      weight: 35,
      isSolid: true,
      points: createRectanglePoints(width, depth),
      colliders: [
        {
          shape: 'cuboid',
          halfExtents: { x: width / 2, y: height / 2, z: depth / 2 },
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 90,
      hp: 90,
      destructible: true,
    },
  };
}

export function createLampPostConfig(position?: Vec3, angle: Radians = 0 as Radians): EntityConfig {
  const height = 3.0;
  const radius = 0.14;

  return {
    tag: { archetype: 'obstacle', subType: 'lamp_post' },
    meta: { name: 'Столб с фонарем', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/lamp_post' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: 0.4,
      height,
      weight: 120,
      isSolid: true,
      points: createRectanglePoints(radius * 2, radius * 2),
      colliders: [
        {
          shape: 'cylinder',
          halfHeight: height / 2,
          radius,
          offset: { x: 0, y: height / 2, z: 0 },
        },
      ],
    },
    health: {
      maxHp: 120,
      hp: 120,
      destructible: true,
    },
  };
}

export function createFenceConfig(
  length: number = 2.4,
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const depth = 0.25;
  const height = 1.15;

  return {
    tag: { archetype: 'obstacle', subType: 'fence' },
    meta: { name: 'Забор', entityType: 'obstacle', destructible: true },
    visualModel: { modelId: 'proc://prop/fence' },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius: length / 2,
      height,
      weight: 80,
      isSolid: true,
      points: createRectanglePoints(length, depth),
    },
    health: {
      maxHp: 80,
      hp: 80,
      destructible: true,
    },
  };
}

const ROCK_PRESETS: Record<
  number,
  { width: number; depth: number; height: number; radius: number; weight: number }
> = {
  1: { width: 2.0, depth: 1.4, height: 1.25, radius: 1.1, weight: 2500 },
  2: { width: 2.2, depth: 1.7, height: 0.75, radius: 1.2, weight: 2200 },
  3: { width: 2.3, depth: 2.1, height: 1.5, radius: 1.2, weight: 3200 },
  4: { width: 2.2, depth: 2.0, height: 1.6, radius: 1.2, weight: 3000 },
  5: { width: 2.1, depth: 1.7, height: 1.45, radius: 1.1, weight: 2800 },
};

export function createRockConfig(
  variant: 1 | 2 | 3 | 4 | 5 = 1,
  scale: number = 1.0,
  position?: Vec3,
  angle: Radians = 0 as Radians
): EntityConfig {
  const p = ROCK_PRESETS[variant] || ROCK_PRESETS[1];
  const width = p.width * scale;
  const depth = p.depth * scale;
  const height = p.height * scale;
  const radius = p.radius * scale;
  const weight = Math.round(p.weight * Math.pow(scale, 3));

  return {
    tag: { archetype: 'obstacle', subType: 'rock' },
    meta: { name: `Камень ${variant}`, entityType: 'obstacle', destructible: false },
    visualModel: { modelId: `proc://prop/rock_${variant}` },
    transform: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
      rotation: { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) },
      angle,
    },
    physics: {
      radius,
      height,
      weight,
      isSolid: true,
      points: createRectanglePoints(width, depth),
    },
    health: {
      maxHp: 2000,
      hp: 2000,
      destructible: false,
    },
  };
}

export function assembleObstacle(
  world: World,
  physics: PhysicsSystem,
  _aiSystem: AISystem,
  id: EntityId,
  config: EntityConfig,
  position?: Vec3
): void {
  const defaultRadius = config.physics?.radius ?? 1.0;
  const points =
    config.physics?.points ?? createRectanglePoints(defaultRadius * 2, defaultRadius * 2);

  // Валидация выпуклости полигона
  if (!isConvexPolygon(points)) {
    console.warn(
      `[assembleObstacle] Полигон для сущности ${id} не является выпуклым. Препятствие не создано.`
    );
    world.removeEntity(id);
    return;
  }

  const name = config.meta?.name || 'Препятствие';
  const destructible = config.meta?.destructible ?? false;
  const maxHp = config.health?.maxHp ?? 100;
  const hp = config.health?.hp ?? maxHp;
  const angle = (config.transform?.angle ?? 0) as Radians;
  const isSolid = config.physics?.isSolid ?? true;
  const boundingRadius = calculateBoundingRadius(points);

  // 1. Тег архетипа
  world.addComponent(id, 'tag', { archetype: 'obstacle', subType: config.tag?.subType });

  // 2. Мета-информация
  world.addComponent(id, 'meta', {
    name,
    entityType: 'obstacle',
    destructible,
  });

  // 3. Физические характеристики
  world.addComponent(id, 'physicsStats', {
    radius: createStat(boundingRadius),
    height: createStat(config.physics?.height ?? 1.5),
    weight: createStat(config.physics?.weight ?? 1000),
    isSolid,
    points: fastClone(points),
    colliders: config.physics?.colliders ? fastClone(config.physics.colliders) : undefined,
  });

  // 4. Здоровье (обязательный компонент)
  world.addComponent(id, 'health', {
    current: hp,
    max: createStat(maxHp),
    isAlive: hp > 0,
    destructible,
    hitFlashTimer: 0,
    healFlashTimer: 0,
    healthBarTimer: 0,
  });

  // 5. Трансформация в 3D
  const posX = position?.x ?? config.transform?.x ?? 0;
  const posY = position?.y ?? config.transform?.y ?? 0;
  const posZ = position?.z ?? config.transform?.z ?? 0;
  const rotation = config.transform?.rotation
    ? { ...config.transform.rotation }
    : { x: 0, y: Math.sin(angle * 0.5), z: 0, w: Math.cos(angle * 0.5) };

  world.addComponent(id, 'transform', {
    x: posX,
    y: posY,
    z: posZ,
    rotation,
    angle,
  });

  // 6. Физическое тело (Rapier3D) с поддержкой составных и индивидуальных коллайдеров
  const category = CollisionCategory.OBSTACLE;
  const mask = isSolid && hp > 0 ? COLLISION_MASK_ALL : COLLISION_MASK_NONE;

  let bodyHandle: PhysicsBodyHandle | undefined;
  let colliderHandle: PhysicsColliderHandle | undefined;
  let colliderHandles: PhysicsColliderHandle[] | undefined;

  if (physics.driver && physics.driver.isReady) {
    const pos3D = { x: posX, y: posY, z: posZ };
    bodyHandle = physics.driver.createFixedBody(pos3D, id, { rotation });

    const built = buildObstacleColliders(physics.driver, bodyHandle, {
      points,
      height: config.physics?.height ?? 1.5,
      colliders: config.physics?.colliders,
    });
    colliderHandle = built.primaryCollider;
    colliderHandles = built.allColliders;
  }

  world.addComponent(id, 'physicsBody', {
    bodyHandle,
    colliderHandle,
    colliderHandles,
    bodyType: 'fixed',
    isStatic: true,
    category,
    mask,
  });

  // 7. Компонент видимости и визуальная модель
  if (config.visualModel) {
    world.addComponent(id, 'visualModel', fastClone(config.visualModel));
  }

  world.addComponent(id, 'renderable', {
    zIndex: RENDER_Z_INDEX.OBSTACLES,
    isVisible: true,
    syncWithTransform: true,
  });

  if (config.readable) {
    world.addComponent(id, 'readable', fastClone(config.readable));
  }

  if (config.interactable) {
    world.addComponent(id, 'interactable', fastClone(config.interactable));
  }

  if (config.dialogueTarget) {
    world.addComponent(id, 'dialogueTarget', fastClone(config.dialogueTarget));
  }
}
