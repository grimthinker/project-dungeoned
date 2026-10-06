import { EntityConfig } from '../ecs/types';
import {
  createTreeConfig,
  createRockConfig,
  createSignpostConfig,
  createHouseConfig,
  createFenceConfig,
  createBridgeConfig,
  createToiletConfig,
  createStumpConfig,
  createLogPileConfig,
  createBarrelConfig,
  createCratePropConfig,
  createLampPostConfig,
  createWellConfig,
  createDockConfig,
  createBoatConfig,
  createWoodenBoxConfig,
  createLargeBridgeConfig,
  createDoghouseConfig,
  createInvisibleWallConfig,
} from '../ecs/archetypes/ObstacleArchetype';
import { t } from '../locales';

export interface PropRegistryItem {
  id: string;
  name: string;
  icon: string;
  create: () => EntityConfig;
}

// Ленивая инициализация списка, чтобы t() отработал корректно после загрузки
let registry: PropRegistryItem[] | null = null;

export const getPropRegistry = (): PropRegistryItem[] => {
  if (registry) return registry;

  registry = [
    {
      id: 'tree_1',
      name: t('palette.tree'),
      icon: '🌳',
      create: () => createTreeConfig('proc://prop/tree', t('palette.tree'), 0.3, 3.0, 4.0, 0.6),
    },
    {
      id: 'tree_2',
      name: t('palette.tree2'),
      icon: '🌳',
      create: () => createTreeConfig('proc://prop/tree_2', t('palette.tree2'), 0.4, 3.2, 4.2, 1.2),
    },
    {
      id: 'tree_3',
      name: t('palette.tree3'),
      icon: '🌲',
      create: () => createTreeConfig('proc://prop/tree_3', t('palette.tree3'), 0.22, 4.0, 4.8, 0.8),
    },
    {
      id: 'tree_spruce',
      name: t('palette.spruce'),
      icon: '🌲',
      create: () =>
        createTreeConfig('proc://prop/tree_spruce', t('palette.spruce'), 0.26, 1.0, 4.2, 1.85),
    },
    {
      id: 'tree_pine',
      name: t('palette.pine'),
      icon: '🌲',
      create: () =>
        createTreeConfig('proc://prop/tree_pine', t('palette.pine'), 0.24, 4.5, 5.2, 1.4),
    },

    { id: 'rock_1', name: t('palette.rock1'), icon: '🪨', create: () => createRockConfig(1, 1.0) },
    { id: 'rock_2', name: t('palette.rock2'), icon: '🪨', create: () => createRockConfig(2, 1.0) },
    { id: 'rock_3', name: t('palette.rock3'), icon: '🪨', create: () => createRockConfig(3, 1.0) },
    { id: 'rock_4', name: t('palette.rock4'), icon: '🪨', create: () => createRockConfig(4, 1.0) },
    { id: 'rock_5', name: t('palette.rock5'), icon: '🪨', create: () => createRockConfig(5, 1.0) },

    { id: 'well', name: 'Колодец', icon: '🪣', create: () => createWellConfig() },
    { id: 'dock', name: t('palette.dock'), icon: '⚓', create: () => createDockConfig() },
    { id: 'boat', name: t('palette.boat'), icon: '🛶', create: () => createBoatConfig() },
    {
      id: 'wooden_box',
      name: t('palette.woodenBox'),
      icon: '📦',
      create: () => createWoodenBoxConfig(),
    },
    {
      id: 'large_bridge',
      name: t('palette.largeBridge'),
      icon: '🌉',
      create: () => createLargeBridgeConfig(),
    },
    {
      id: 'doghouse',
      name: t('palette.doghouse'),
      icon: '🏠',
      create: () => createDoghouseConfig(),
    },
    {
      id: 'invisible_wall',
      name: t('palette.invisibleWall'),
      icon: '🧱',
      create: () => createInvisibleWallConfig(),
    },
    { id: 'house', name: t('palette.house'), icon: '🏠', create: () => createHouseConfig() },
    { id: 'bridge', name: t('palette.bridge'), icon: '🌉', create: () => createBridgeConfig() },
    { id: 'toilet', name: t('palette.toilet'), icon: '🚪', create: () => createToiletConfig() },
    { id: 'fence', name: t('palette.fence'), icon: '🪵', create: () => createFenceConfig(2.4) },
    {
      id: 'signpost',
      name: t('palette.signpost'),
      icon: '🪧',
      create: () => createSignpostConfig(),
    },
    {
      id: 'log_pile_1',
      name: t('palette.logPile1'),
      icon: '🪵',
      create: () => createLogPileConfig(1),
    },
    { id: 'stump', name: t('palette.stump'), icon: '🪓', create: () => createStumpConfig() },
    { id: 'barrel', name: t('palette.barrel'), icon: '🛢️', create: () => createBarrelConfig() },
    {
      id: 'crate',
      name: t('palette.woodenCrate'),
      icon: '📦',
      create: () => createCratePropConfig(),
    },
    {
      id: 'lamp_post',
      name: t('palette.lampPost'),
      icon: '🏮',
      create: () => createLampPostConfig(),
    },
  ];

  return registry;
};
