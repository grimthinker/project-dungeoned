import { World } from '../World';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { AISystem } from '../systems/AISystem';
import {
  EntityId,
  EntityConfig,
  CollisionCategory,
  COLLISION_MASK_ALL,
  RENDER_Z_INDEX,
  RenderableComponent,
  ZoneEffectType,
} from '../types';
import { Point, Vec3 } from '../../types';
import { Radians } from '../../utils';
import { createStat } from '../stats/StatEvaluator';
import { t } from '../../locales';

export function getDefaultZoneName(effect: ZoneEffectType, valuePerSec?: number): string {
  switch (effect) {
    case 'damage':
      return t('zones.defaultNameDamage');
    case 'joint_damage':
      return t('zones.defaultNameJointDamage');
    case 'heal':
      return t('zones.defaultNameHeal');
    case 'repel':
      return t('zones.defaultNameRepel');
    case 'attract':
      return t('zones.defaultNameAttract');
    case 'time_dilation':
      return valuePerSec !== undefined && valuePerSec > 1.0
        ? t('zones.defaultNameTimeFast')
        : t('zones.defaultNameTimeSlow');
  }
}

export function getZoneVisuals(
  effect: ZoneEffectType,
  valuePerSec?: number
): {
  fillColor: string;
  strokeColor: string;
  icon: string;
} {
  switch (effect) {
    case 'damage':
      return { fillColor: 'rgba(231, 76, 60, 0.2)', strokeColor: '#e74c3c', icon: '☠️' };
    case 'joint_damage':
      return { fillColor: 'rgba(230, 126, 34, 0.25)', strokeColor: '#e67e22', icon: '⛓️‍💥' };
    case 'heal':
      return { fillColor: 'rgba(46, 204, 113, 0.2)', strokeColor: '#2ecc71', icon: '❤️' };
    case 'repel':
      return { fillColor: 'rgba(243, 156, 18, 0.2)', strokeColor: '#f39c12', icon: '💨' };
    case 'attract':
      return { fillColor: 'rgba(155, 89, 182, 0.2)', strokeColor: '#9b59b6', icon: '🌀' };
    case 'time_dilation': {
      const isSpeedUp = valuePerSec !== undefined && valuePerSec > 1.0;
      return {
        fillColor: isSpeedUp ? 'rgba(26, 188, 156, 0.2)' : 'rgba(52, 152, 219, 0.2)',
        strokeColor: isSpeedUp ? '#1abc9c' : '#3498db',
        icon: isSpeedUp ? '⚡' : '⏳',
      };
    }
  }
}

import { ZoneShapeComponent, GameplayZoneComponent, GameplayZoneRole } from '../components/zone';

export function createEffectorZoneConfig(
  effect: ZoneEffectType,
  radius: number = 2.5,
  valuePerSec: number = 15,
  name?: string,
  ignoreParent: boolean = true,
  destroyOnParentDeath: boolean = false,
  destroyOnParentRemoval: boolean = true,
  distanceAttenuation: boolean = false,
  centerValue: number = 150,
  boundaryValue: number = 30
): EntityConfig {
  return {
    tag: { archetype: 'zone', subType: effect },
    meta: {
      name: name || getDefaultZoneName(effect, valuePerSec),
      entityType: 'zone',
    },
    zoneShape: {
      shapeType: 'cylinder',
      radius,
      height: 2.5,
      width: radius * 2,
      depth: radius * 2,
    },
    areaEffector: {
      effect,
      radius,
      valuePerSec,
      ignoreParent,
      destroyOnParentDeath,
      destroyOnParentRemoval,
      distanceAttenuation,
      centerValue,
      boundaryValue,
    },
    physics: {
      radius,
      weight: 1,
      isSolid: false,
    },
  };
}

export function createGameplayZoneConfig(
  role: GameplayZoneRole,
  name: string,
  zoneTag?: string,
  shapeType: 'sphere' | 'cylinder' | 'box' = 'cylinder',
  dimensions: { radius?: number; height?: number; width?: number; depth?: number } = {}
): EntityConfig {
  const radius = dimensions.radius ?? 4.0;
  const height = dimensions.height ?? 3.0;
  const width = dimensions.width ?? 6.0;
  const depth = dimensions.depth ?? 6.0;

  return {
    tag: { archetype: 'zone', subType: role },
    meta: {
      name,
      entityType: 'zone',
    },
    zoneShape: {
      shapeType,
      radius,
      height,
      width,
      depth,
    },
    gameplayZone: {
      role,
      zoneTag,
      occupantIds: [],
    },
    physics: {
      radius,
      weight: 1,
      isSolid: false,
    },
  };
}

export function createTrapZoneConfig(damage: number = 45, radius: number = 1.2): EntityConfig {
  return {
    tag: { archetype: 'zone', subType: 'trap' },
    meta: {
      name: 'Наземная ловушка',
      entityType: 'zone',
    },
    zoneShape: {
      shapeType: 'cylinder',
      radius,
      height: 0.5,
      width: radius * 2,
      depth: radius * 2,
    },
    gameplayZone: {
      role: 'generic',
      zoneTag: 'ground_trap',
      occupantIds: [],
    },
    triggerRule: {
      rules: [
        {
          id: 'trap_rule_damage',
          name: 'Срабатывание ловушки стоя',
          event: 'zone_entered',
          conditions: [
            { type: 'stance_not', key: 'stance', value: 'crouching' },
            { type: 'stance_not', key: 'stance', value: 'prone' },
          ],
          actions: [{ type: 'deal_damage', payload: { target: 'activator', amount: damage } }],
          triggerOnce: true,
        },
      ],
    },
    physics: {
      radius,
      weight: 1,
      isSolid: false,
    },
  };
}

export function createTriggerSpawnerConfig(radius: number = 3.0): EntityConfig {
  return {
    tag: { archetype: 'zone', subType: 'spawner' },
    meta: {
      name: 'Триггер спавна врагов',
      entityType: 'zone',
    },
    zoneShape: {
      shapeType: 'cylinder',
      radius,
      height: 2.0,
      width: radius * 2,
      depth: radius * 2,
    },
    gameplayZone: {
      role: 'generic',
      zoneTag: 'ambush_spawner',
      occupantIds: [],
    },
    triggerRule: {
      rules: [
        {
          id: 'spawner_rule',
          name: 'Спавн засады при входе бота или игрока',
          event: 'zone_entered',
          conditions: [{ type: 'is_alive', key: 'activator' }],
          actions: [
            {
              type: 'set_flag',
              payload: { key: 'ambush_triggered', value: true },
            },
            {
              type: 'deal_damage',
              payload: { target: 'activator', amount: 10 },
            },
          ],
          triggerOnce: true,
        },
      ],
    },
    physics: {
      radius,
      weight: 1,
      isSolid: false,
    },
  };
}

export function assembleZone(
  world: World,
  _physics: PhysicsSystem,
  _aiSystem: AISystem,
  id: EntityId,
  config: EntityConfig,
  position?: Vec3
): void {
  const effector = config.areaEffector ??
    (config as any).zoneTrigger ?? {
      effect: 'damage',
      radius: 2.5,
      valuePerSec: 15,
      ignoreParent: true,
    };

  const effect = effector.effect;
  const radius = effector.radius;
  const name = config.meta?.name ?? getDefaultZoneName(effect);

  // 1. Тег
  world.addComponent(id, 'tag', { archetype: 'zone', subType: effect });

  // 2. Мета
  world.addComponent(id, 'meta', {
    name,
    entityType: 'zone',
  });

  // 3. Компонент эффектора
  if (config.areaEffector) {
    world.addComponent(id, 'areaEffector', effector);
  }

  // 3.1. Логическая зона
  if (config.gameplayZone) {
    world.addComponent(id, 'gameplayZone', {
      role: config.gameplayZone.role ?? 'generic',
      zoneTag: config.gameplayZone.zoneTag,
      occupantIds: [],
    });
  }

  // 3.2. Форма зоны
  const shape: ZoneShapeComponent = config.zoneShape ?? {
    shapeType: 'cylinder',
    radius,
    height: 2.5,
    width: radius * 2,
    depth: radius * 2,
  };
  world.addComponent(id, 'zoneShape', shape);

  // 4. Компонент привязки (если передан)
  if (config.attachment) {
    world.addComponent(id, 'attachment', config.attachment);
  }

  // 5. Физические характеристики
  world.addComponent(id, 'physicsStats', {
    radius: createStat(radius),
    height: createStat(2.0),
    weight: createStat(1),
    isSolid: false,
  });
  // 6. Трансформация и тело-сенсор в 3D
  const posX = position?.x ?? 0;
  const posY = position?.y ?? 0;
  const posZ = position?.z ?? 0;
  world.addComponent(id, 'transform', {
    x: posX,
    y: posY,
    z: posZ,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    angle: 0 as Radians,
  });

  const category = CollisionCategory.TRIGGER_ZONE;
  const mask = CollisionCategory.CREATURE | CollisionCategory.ITEM;
  world.addComponent(id, 'physicsBody', { isStatic: false, category, mask, isTrigger: true });

  // 7. Компонент видимости
  world.addComponent(id, 'renderable', {
    zIndex: RENDER_Z_INDEX.ZONES,
    isVisible: true,
    syncWithTransform: true,
  });
}
