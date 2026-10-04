import { World } from '../World';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { AISystem } from '../systems/AISystem';
import {
  EntityId,
  EntityConfig,
  CollisionCategory,
  COLLISION_MASK_ALL,
  RENDER_Z_INDEX,
} from '../types';
import { Vec3 } from '../../types';
import { WaterComponent, WaterConfig } from '../components/water';
import { createStat } from '../stats/StatEvaluator';
import { createRectanglePoints } from '../../utils';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { PhysicsBodyHandle, PhysicsColliderHandle } from '../../physics/IPhysicsDriver';

export function createWaterConfig(
  waterType: 'lake' | 'river' = 'lake',
  width: number = 20,
  depth: number = 20,
  name?: string,
  options?: Partial<WaterConfig>
): EntityConfig {
  const isRiver = waterType === 'river';
  const defaultName = name || (isRiver ? 'Река' : 'Озеро');
  const maxDepth = options?.maxDepth ?? (isRiver ? 2.5 : 4.0);

  const waterComp: WaterComponent = {
    width,
    depth,
    maxDepth,
    waterType,
    color: options?.color ?? (isRiver ? '#1abc9c' : '#3498db'),
    deepColor: options?.deepColor ?? (isRiver ? '#0e6251' : '#0b3954'),
    opacity: options?.opacity ?? 0.88,
    shallowOpacity: options?.shallowOpacity ?? 0.25,
    clarity: options?.clarity ?? (isRiver ? 2.0 : 3.0),
    waveSpeed: options?.waveSpeed ?? (isRiver ? 2.5 : 1.2),
    rippleSpeed: options?.rippleSpeed ?? 1.0,
    rippleDamping: options?.rippleDamping ?? GRAPHICS_CONFIG.water.ripples.damping,
    waveHeight: options?.waveHeight ?? (isRiver ? 0.08 : 0.12),
    flowDirection: options?.flowDirection ?? (isRiver ? { x: 0, z: 1 } : { x: 0, z: 0 }),
    flowSpeed: options?.flowSpeed ?? (isRiver ? 2.0 : 0.0),
    density: options?.density ?? 1000,
    viscosity: options?.viscosity ?? 1.5,
  };

  return {
    tag: { archetype: 'water', subType: waterType },
    meta: {
      name: defaultName,
      entityType: 'water',
      destructible: false,
    },
    water: waterComp,
    physics: {
      radius: Math.max(width, depth) / 2,
      height: maxDepth,
      weight: 100000,
      isSolid: false,
      points: createRectanglePoints(width, depth),
    },
    renderable: {
      zIndex: RENDER_Z_INDEX.ZONES + 1,
      isVisible: true,
      syncWithTransform: true,
    },
  };
}

export function assembleWater(
  world: World,
  physics: PhysicsSystem,
  _aiSystem: AISystem,
  id: EntityId,
  config: EntityConfig,
  position?: Vec3
): void {
  const isRiver = config.water?.waterType === 'river';
  const defaultMaxDepth = isRiver ? 2.5 : 4.0;

  const waterComp: WaterComponent = config.water
    ? ({
        ...config.water,
        maxDepth: config.water.maxDepth ?? defaultMaxDepth,
        deepColor: config.water.deepColor ?? (isRiver ? '#0e6251' : '#0b3954'),
        shallowOpacity: config.water.shallowOpacity ?? 0.25,
        clarity: config.water.clarity ?? (isRiver ? 2.0 : 3.0),
        rippleSpeed: config.water.rippleSpeed ?? 1.0,
        rippleDamping: config.water.rippleDamping ?? GRAPHICS_CONFIG.water.ripples.damping,
      } as WaterComponent)
    : {
        width: 20,
        depth: 20,
        maxDepth: 4.0,
        waterType: 'lake',
        color: '#3498db',
        deepColor: '#0b3954',
        opacity: 0.88,
        shallowOpacity: 0.25,
        clarity: 3.0,
        waveSpeed: 1.2,
        rippleSpeed: 1.0,
        rippleDamping: GRAPHICS_CONFIG.water.ripples.damping,
        waveHeight: 0.12,
        flowDirection: { x: 0, z: 0 },
        flowSpeed: 0.0,
        density: 1000,
        viscosity: 1.5,
      };

  const width = waterComp.width;
  const depth = waterComp.depth;
  const maxDepth = waterComp.maxDepth;
  const radius = Math.max(width, depth) / 2;

  // 1. Тег архетипа
  world.addComponent(id, 'tag', { archetype: 'water', subType: waterComp.waterType });

  // 2. Мета-информация
  world.addComponent(id, 'meta', {
    name: config.meta?.name || (waterComp.waterType === 'river' ? 'Река' : 'Озеро'),
    entityType: 'water',
    destructible: false,
  });

  // 3. Компонент воды
  world.addComponent(id, 'water', waterComp);

  // 4. Физические характеристики сенсорного объема
  world.addComponent(id, 'physicsStats', {
    radius: createStat(radius),
    height: createStat(maxDepth),
    weight: createStat(100000),
    isSolid: false,
    points: createRectanglePoints(width, depth),
  });

  // 5. Трансформация в 3D
  const posX = position?.x ?? config.transform?.x ?? 0;
  const posY = position?.y ?? config.transform?.y ?? 0;
  const posZ = position?.z ?? config.transform?.z ?? 0;

  world.addComponent(id, 'transform', {
    x: posX,
    y: posY,
    z: posZ,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    angle: 0,
  });

  // 6. Физическое тело-сенсор в Rapier3D (Trigger Volume)
  const category = CollisionCategory.TRIGGER_ZONE;
  const mask = CollisionCategory.CREATURE | CollisionCategory.ITEM;

  let bodyHandle: PhysicsBodyHandle | undefined = undefined;
  let colliderHandle: PhysicsColliderHandle | undefined = undefined;

  if (physics.driver && physics.driver.isReady) {
    const pos3D = { x: posX, y: posY, z: posZ };
    bodyHandle = physics.driver.createFixedBody(pos3D, id);
    const hx = width / 2;
    const hz = depth / 2;
    const hy = maxDepth / 2;
    colliderHandle = physics.driver.createCuboidCollider(hx, hy, hz, bodyHandle, {
      mass: 0,
      offset: { x: 0, y: -hy, z: 0 },
      isSensor: true,
    });
  }

  world.addComponent(id, 'physicsBody', {
    bodyHandle,
    colliderHandle,
    bodyType: 'fixed',
    isStatic: true,
    category,
    mask,
    isTrigger: true,
  });

  // 7. Компонент видимости
  world.addComponent(id, 'renderable', {
    zIndex: RENDER_Z_INDEX.ZONES + 1,
    isVisible: true,
    syncWithTransform: true,
  });
}
