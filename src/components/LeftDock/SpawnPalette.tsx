import React, { useState, useEffect } from 'react';
import { EntityConfig } from '../../ecs/types';
import { BodyStructureType } from '../../ecs/templates';
import {
  createEffectorZoneConfig,
  createGameplayZoneConfig,
  createTrapZoneConfig,
  createTriggerSpawnerConfig,
} from '../../ecs/archetypes/ZoneArchetype';
import {
  createHouseConfig,
  createFenceConfig,
  createRockConfig,
  createTreeConfig,
  createSignpostConfig,
  createSignpostSingleConfig,
  createLogPileConfig,
  createStumpConfig,
  createToiletConfig,
  createBarrelConfig,
  createCratePropConfig,
  createBridgeConfig,
  createLampPostConfig,
  createWellConfig,
  createDoghouseConfig,
  createLargeBridgeConfig,
  createBoatConfig,
  createDockConfig,
  createWoodenBoxConfig,
  createInvisibleWallConfig,
} from '../../ecs/archetypes/ObstacleArchetype';
import { createWaterConfig } from '../../ecs/archetypes/WaterArchetype';
import { createRectanglePoints, deg2Rad } from '../../utils';
import { t } from '../../locales';

interface SpawnPaletteProps {
  onSelectPreset: (config: EntityConfig) => void;
  onSelectModular: (behavior: string, name: string, structureType?: BodyStructureType) => void;
  onSelectPrefab?: (prefabId: string, name: string) => void;
  onOpenWizard: () => void;
}

interface PaletteItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  createConfig?: () => EntityConfig;
  onClick?: () => void;
}

export interface PaletteGroup {
  id: string;
  title: string;
  items?: PaletteItem[];
  subgroups?: PaletteGroup[];
}

const STORAGE_KEY = 'spawn_palette_collapsed_groups_v3';
const PALETTE_ACCENT_COLORS = ['#3498db', '#2ecc71', '#e67e22'];

export const SpawnPalette: React.FC<SpawnPaletteProps> = ({
  onSelectPreset,
  onSelectModular,
  onSelectPrefab,
  onOpenWizard,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const categories: PaletteGroup[] = [
    {
      id: 'groups',
      title: t('palette.categoryGroups'),
      items: [
        {
          id: 'group_fetch',
          name: t('palette.fetchGroup'),
          description: t('palette.fetchGroupDesc'),
          icon: '🐕',
          onClick: () => {
            if (onSelectPrefab) {
              onSelectPrefab('fetch_group', t('palette.fetchGroup'));
            }
          },
        },
      ],
    },
    {
      id: 'creatures',
      title: t('palette.categoryCreatures'),
      items: [
        {
          id: 'creature_player',
          name: t('palette.player'),
          description: t('palette.playerDesc'),
          icon: '🎮',
          onClick: () => onSelectModular('PlayerTree', t('palette.player'), 'humanoid'),
        },
        {
          id: 'creature_master',
          name: t('trees.MasterFetchTree'),
          description: 'Гуманоид, играющий в апорт с собаками',
          icon: '🚶',
          onClick: () => onSelectModular('MasterFetchTree', 'Хозяин', 'humanoid'),
        },
        {
          id: 'creature_attacker',
          name: t('palette.attacker'),
          description: t('palette.attackerDesc'),
          icon: '⚔️',
          onClick: () => onSelectModular('AttackerTree', t('palette.attacker'), 'humanoid'),
        },
        {
          id: 'creature_quadruped',
          name: t('palette.quadrupedBot'),
          description: t('palette.quadrupedDesc'),
          icon: '🐕',
          onClick: () => onSelectModular('AttackerTree', t('palette.quadrupedBot'), 'quadruped'),
        },
        {
          id: 'creature_arachnid',
          name: t('palette.arachnidBot'),
          description: t('palette.arachnidDesc'),
          icon: '🕷️',
          onClick: () => onSelectModular('AttackerTree', t('palette.arachnidBot'), 'arachnid'),
        },
        {
          id: 'creature_idle',
          name: t('palette.idleBot'),
          description: t('palette.idleBotDesc'),
          icon: '👤',
          onClick: () => onSelectModular('IdleTree', t('palette.idleBot'), 'humanoid'),
        },
      ],
    },
    {
      id: 'items',
      title: t('palette.categoryItems'),
      subgroups: [
        {
          id: 'weapons',
          title: t('palette.categoryWeapons'),
          items: [
            {
              id: 'weapon_stick',
              name: 'Мячик для апорта',
              description: 'Упругий спортивный мячик для собак',
              icon: '🎾',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'weapon' },
                meta: { name: 'Мячик для апорта', entityType: 'item' },
                visualModel: { modelId: 'proc://prop/ball' },
                item: {
                  name: 'Мячик для апорта',
                  type: 'weapon',
                  maxStack: 1,
                  size: 4,
                  equipTypes: [],
                  equippable: false,
                  equipTimeMultiplier: 1.0,
                },
                physics: {
                  radius: 0.15,
                  weight: 0.5,
                  isSolid: true,
                  shape: 'ball',
                  restitution: 0.88,
                  friction: 0.85,
                  linearDamping: 0.25,
                  angularDamping: 2.0,
                },
                weaponStats: { baseDamage: 5, prepTime: 0.2, recoveryTime: 0.3 },
                weaponZone: { hitZoneType: 'forward_line', length: 1.5 },
              }),
            },
            {
              id: 'weapon_sword',
              name: 'Меч',
              description: 'Оружие ближнего боя',
              icon: '🗡️',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'weapon' },
                meta: { name: 'Меч', entityType: 'item' },
                visualModel: { modelId: 'proc://prop/sword' },
                item: {
                  name: 'Меч',
                  type: 'weapon',
                  maxStack: 1,
                  size: 10,
                  equipTypes: [],
                  equippable: false,
                  equipTimeMultiplier: 1.0,
                },
                physics: {
                  radius: 0.4,
                  weight: 2,
                  isSolid: true,
                  halfExtents: { x: 0.15, y: 0.64, z: 0.02 },
                  colliderOffset: { x: 0, y: 0.36, z: 0 },
                  restitution: 0.78,
                  linearDamping: 1,
                },
                weaponStats: { baseDamage: 25, prepTime: 0.2, recoveryTime: 0.3 },
                weaponZone: { hitZoneType: 'angle', radius: 2.5, angle: deg2Rad(90) },
              }),
            },
            {
              id: 'weapon_shotgun',
              name: t('palette.shotgun'),
              description: t('palette.shotgunDesc'),
              icon: '💥',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'weapon' },
                item: {
                  name: t('palette.shotgun'),
                  type: 'weapon',
                  maxStack: 1,
                  size: 10,
                  equipTypes: [],
                  equippable: false,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.4, weight: 1, isSolid: true },
                weaponStats: { baseDamage: 15, prepTime: 0.4, recoveryTime: 0.5 },
                weaponZone: {
                  hitZoneType: 'shrapnel',
                  length: 4.0,
                  angle: deg2Rad(60),
                  rayCount: 5,
                },
              }),
            },
            {
              id: 'weapon_aura',
              name: t('palette.auraWeapon'),
              description: t('palette.auraWeaponDesc'),
              icon: '✨',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'weapon' },
                item: {
                  name: t('palette.auraWeapon'),
                  type: 'weapon',
                  maxStack: 1,
                  size: 10,
                  equipTypes: [],
                  equippable: false,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.4, weight: 1, isSolid: true },
                weaponStats: { baseDamage: 30, prepTime: 0.3, recoveryTime: 0.4 },
                weaponZone: { hitZoneType: 'radius', radius: 2.0 },
              }),
            },
          ],
        },
        {
          id: 'equipment',
          title: t('palette.categoryEquipment'),
          items: [
            {
              id: 'armor_belt',
              name: t('palette.tacticalBelt'),
              description: t('palette.tacticalBeltDesc'),
              icon: '🥋',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'armor' },
                item: {
                  name: t('palette.tacticalBelt'),
                  type: 'armor',
                  maxStack: 1,
                  size: 5,
                  equipTypes: ['waist'],
                  equippable: true,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.4, weight: 1.5, isSolid: true },
                armorStats: { defense: 5, flatReduction: 0 },
                equip: {
                  equipmentAreas: [
                    {
                      id: 'belt_sheath',
                      name: 'belt_sheath',
                      type: 'sheath',
                      space: 15,
                      itemIds: [],
                    },
                    {
                      id: 'belt_slot_1',
                      name: 'belt_slot_1',
                      type: 'belt_slot',
                      space: 10,
                      itemIds: [],
                    },
                    {
                      id: 'belt_pouch_1',
                      name: 'belt_pouch_1',
                      type: 'pouch',
                      space: 8,
                      itemIds: [],
                    },
                  ],
                },
              }),
            },
            {
              id: 'armor_vest',
              name: t('palette.vest'),
              description: t('palette.vestDesc'),
              icon: '🦺',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'armor' },
                item: {
                  name: t('palette.vest'),
                  type: 'armor',
                  maxStack: 1,
                  size: 20,
                  equipTypes: ['torso'],
                  equippable: true,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.4, weight: 12, isSolid: true },
                armorStats: { defense: 20, flatReduction: 3 },
                inventory: { size: { width: 3, height: 2 } },
                equip: {
                  equipmentAreas: [
                    {
                      id: 'vest_holster',
                      name: 'vest_holster',
                      type: 'holster',
                      space: 10,
                      itemIds: [],
                    },
                    {
                      id: 'vest_pouch',
                      name: 'vest_pouch',
                      type: 'pouch',
                      space: 10,
                      itemIds: [],
                    },
                  ],
                },
              }),
            },
            {
              id: 'armor_chest',
              name: t('palette.chestplate'),
              description: t('palette.chestplateDesc'),
              icon: '🛡️',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'armor' },
                item: {
                  name: t('palette.chestplate'),
                  type: 'armor',
                  maxStack: 1,
                  size: 20,
                  equipTypes: ['torso'],
                  equippable: true,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.4, weight: 20, isSolid: true },
                armorStats: { defense: 25, flatReduction: 5 },
              }),
            },
            {
              id: 'armor_helmet',
              name: t('palette.helmet'),
              description: t('palette.helmetDesc'),
              icon: '⛑️',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'armor' },
                item: {
                  name: t('palette.helmet'),
                  type: 'armor',
                  maxStack: 1,
                  size: 10,
                  equipTypes: ['head'],
                  equippable: true,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.3, weight: 10, isSolid: true },
                armorStats: { defense: 15, flatReduction: 2 },
              }),
            },
            {
              id: 'bag_backpack',
              name: t('palette.backpack'),
              description: t('palette.backpackDesc'),
              icon: '🎒',
              createConfig: () => ({
                tag: { archetype: 'item', subType: 'bag' },
                meta: { name: t('palette.backpack'), entityType: 'item' },
                visualModel: { modelId: 'proc://prop/backpack' },
                item: {
                  name: t('palette.backpack'),
                  type: 'bag',
                  maxStack: 1,
                  size: 10,
                  equipTypes: ['torso', 'sling'],
                  equippable: true,
                  equipTimeMultiplier: 1.0,
                },
                physics: { radius: 0.35, height: 0.5, weight: 1.5, isSolid: true },
                inventory: { size: { width: 6, height: 4 } },
              }),
            },
          ],
        },
      ],
    },
    {
      id: 'obstacles',
      title: t('palette.categoryObstacles'),
      subgroups: [
        {
          id: 'trees',
          title: t('palette.subgroupTrees'),
          items: [
            {
              id: 'obstacle_tree',
              name: t('palette.tree'),
              description: t('palette.treeDesc'),
              icon: '🌳',
              createConfig: () =>
                createTreeConfig('proc://prop/tree', t('palette.tree'), 0.3, 3.0, 4.0, 0.6),
            },
            {
              id: 'obstacle_tree_2',
              name: t('palette.tree2'),
              description: t('palette.tree2Desc'),
              icon: '🌳',
              createConfig: () =>
                createTreeConfig('proc://prop/tree_2', t('palette.tree2'), 0.4, 3.2, 4.2, 1.2),
            },
            {
              id: 'obstacle_tree_3',
              name: t('palette.tree3'),
              description: t('palette.tree3Desc'),
              icon: '🌲',
              createConfig: () =>
                createTreeConfig('proc://prop/tree_3', t('palette.tree3'), 0.22, 4.0, 4.8, 0.8),
            },
            {
              id: 'obstacle_spruce',
              name: t('palette.spruce'),
              description: t('palette.spruceDesc'),
              icon: '🌲',
              createConfig: () =>
                createTreeConfig(
                  'proc://prop/tree_spruce',
                  t('palette.spruce'),
                  0.26,
                  1.0,
                  4.2,
                  1.85
                ),
            },
            {
              id: 'obstacle_pine',
              name: t('palette.pine'),
              description: t('palette.pineDesc'),
              icon: '🌲',
              createConfig: () =>
                createTreeConfig('proc://prop/tree_pine', t('palette.pine'), 0.24, 4.5, 5.2, 1.4),
            },
          ],
        },
        {
          id: 'rocks',
          title: t('palette.subgroupRocks'),
          items: [
            {
              id: 'obstacle_rock_1',
              name: t('palette.rock1'),
              description: t('palette.rockDesc'),
              icon: '🪨',
              createConfig: () => createRockConfig(1, 1.0),
            },
            {
              id: 'obstacle_rock_2',
              name: t('palette.rock2'),
              description: t('palette.rockDesc'),
              icon: '🪨',
              createConfig: () => createRockConfig(2, 1.0),
            },
            {
              id: 'obstacle_rock_3',
              name: t('palette.rock3'),
              description: t('palette.rockDesc'),
              icon: '🪨',
              createConfig: () => createRockConfig(3, 1.0),
            },
            {
              id: 'obstacle_rock_4',
              name: t('palette.rock4'),
              description: t('palette.rockDesc'),
              icon: '🪨',
              createConfig: () => createRockConfig(4, 1.0),
            },
            {
              id: 'obstacle_rock_5',
              name: t('palette.rock5'),
              description: t('palette.rockDesc'),
              icon: '🪨',
              createConfig: () => createRockConfig(5, 1.0),
            },
          ],
        },
        {
          id: 'buildings',
          title: t('palette.subgroupBuildings'),
          items: [
            {
              id: 'obstacle_well',
              name: 'Колодец',
              description: 'Каменный колодец с деревянным воротом и навесом',
              icon: '🪣',
              createConfig: () => createWellConfig(),
            },
            {
              id: 'obstacle_house',
              name: t('palette.house'),
              description: t('palette.houseDesc'),
              icon: '🏠',
              createConfig: () => createHouseConfig(),
            },
            {
              id: 'obstacle_large_bridge',
              name: t('palette.largeBridge'),
              description: t('palette.largeBridgeDesc'),
              icon: '🌉',
              createConfig: () => createLargeBridgeConfig(),
            },
            {
              id: 'obstacle_doghouse',
              name: t('palette.doghouse'),
              description: t('palette.doghouseDesc'),
              icon: '🏠',
              createConfig: () => createDoghouseConfig(),
            },
            {
              id: 'obstacle_bridge',
              name: t('palette.bridge'),
              description: t('palette.bridgeDesc'),
              icon: '🌉',
              createConfig: () => createBridgeConfig(),
            },
            {
              id: 'obstacle_toilet',
              name: t('palette.toilet'),
              description: t('palette.toiletDesc'),
              icon: '🚪',
              createConfig: () => createToiletConfig(),
            },
          ],
        },
        {
          id: 'other',
          title: t('palette.subgroupOther'),
          items: [
            {
              id: 'obstacle_dock',
              name: t('palette.dock'),
              description: t('palette.dockDesc'),
              icon: '⚓',
              createConfig: () => createDockConfig(),
            },
            {
              id: 'obstacle_boat',
              name: t('palette.boat'),
              description: t('palette.boatDesc'),
              icon: '🛶',
              createConfig: () => createBoatConfig(),
            },
            {
              id: 'obstacle_wooden_box',
              name: t('palette.woodenBox'),
              description: t('palette.woodenBoxDesc'),
              icon: '📦',
              createConfig: () => createWoodenBoxConfig(),
            },
            {
              id: 'obstacle_signpost',
              name: t('palette.signpost'),
              description: t('palette.signpostDesc'),
              icon: '🪧',
              createConfig: () => createSignpostConfig(),
            },
            {
              id: 'obstacle_signpost_single',
              name: t('palette.signpostSingle'),
              description: t('palette.signpostSingleDesc'),
              icon: '🪧',
              createConfig: () => createSignpostSingleConfig(),
            },
            {
              id: 'obstacle_log_pile_1',
              name: t('palette.logPile1'),
              description: t('palette.logPile1Desc'),
              icon: '🪵',
              createConfig: () => createLogPileConfig(1),
            },
            {
              id: 'obstacle_log_pile_2',
              name: t('palette.logPile2'),
              description: t('palette.logPile2Desc'),
              icon: '🪵',
              createConfig: () => createLogPileConfig(2),
            },
            {
              id: 'obstacle_stump',
              name: t('palette.stump'),
              description: t('palette.stumpDesc'),
              icon: '🪓',
              createConfig: () => createStumpConfig(),
            },
            {
              id: 'obstacle_barrel',
              name: t('palette.barrel'),
              description: t('palette.barrelDesc'),
              icon: '🛢️',
              createConfig: () => createBarrelConfig(),
            },
            {
              id: 'obstacle_wooden_crate',
              name: t('palette.woodenCrate'),
              description: t('palette.woodenCrateDesc'),
              icon: '📦',
              createConfig: () => createCratePropConfig(),
            },
            {
              id: 'obstacle_lamp_post',
              name: t('palette.lampPost'),
              description: t('palette.lampPostDesc'),
              icon: '🏮',
              createConfig: () => createLampPostConfig(),
            },
            {
              id: 'obstacle_fence',
              name: t('palette.fence'),
              description: t('palette.fenceDesc'),
              icon: '🪵',
              createConfig: () => createFenceConfig(2.4),
            },
          ],
        },
        {
          id: 'special',
          title: t('palette.subgroupSpecial'),
          items: [
            {
              id: 'obstacle_invisible_wall',
              name: t('palette.invisibleWall'),
              description: t('palette.invisibleWallDesc'),
              icon: '🧱',
              createConfig: () => createInvisibleWallConfig(),
            },
          ],
        },
      ],
    },
    {
      id: 'zones',
      title: t('palette.categoryZones'),
      items: [
        {
          id: 'zone_quest_destination',
          name: 'Зона квеста (Точка назначения)',
          description: 'Триггер достижения цели квеста для игрока',
          icon: '🏁',
          createConfig: () =>
            createGameplayZoneConfig('quest', 'Точка назначения', 'quest_target_1', 'cylinder', {
              radius: 3.0,
              height: 3.0,
            }),
        },
        {
          id: 'zone_ai_gathering',
          name: 'Зона сбора (Лагерь)',
          description: 'Область, где существа собираются в режиме ожидания',
          icon: '🏕️',
          createConfig: () =>
            createGameplayZoneConfig('ai_area', 'Зона сбора', 'camp_gathering', 'cylinder', {
              radius: 6.0,
              height: 3.0,
            }),
        },
        {
          id: 'zone_throw_target',
          name: 'Зона цели броска',
          description: 'Прямоугольная область цели для бросков (футбол, мишень)',
          icon: '🎯',
          createConfig: () =>
            createGameplayZoneConfig('throw_target', 'Створ цели броска', 'goal_area', 'box', {
              width: 8.0,
              depth: 4.0,
              height: 3.0,
            }),
        },
        {
          id: 'zone_fetch_play',
          name: 'Зона игры в апорт',
          description: 'Область игры для хозяина и собак',
          icon: '🎾',
          createConfig: () =>
            createGameplayZoneConfig('ai_area', 'Зона апорта', 'fetch_play_zone', 'cylinder', {
              radius: 18.0,
              height: 3.0,
            }),
        },
        {
          id: 'zone_trap_ground',
          name: 'Наземная ловушка (Капкан)',
          description: 'Наносит 45 урона при наступлении (не срабатывает в приседе)',
          icon: '🪤',
          createConfig: () => createTrapZoneConfig(45, 1.2),
        },
        {
          id: 'zone_script_spawner',
          name: 'Скриптовый спавнер / Триггер',
          description: 'Зона с проверкой условий и вызовом действий движка',
          icon: '⚡',
          createConfig: () => createTriggerSpawnerConfig(3.0),
        },
        {
          id: 'zone_damage',
          name: t('palette.zoneFire'),
          description: t('palette.zoneFireDesc'),
          icon: '🔥',
          createConfig: () => createEffectorZoneConfig('damage', 2.5, 15, t('palette.zoneFire')),
        },
        {
          id: 'zone_joint_damage',
          name: t('palette.zoneJointDamage'),
          description: t('palette.zoneJointDamageDesc'),
          icon: '⛓️‍💥',
          createConfig: () =>
            createEffectorZoneConfig('joint_damage', 2.5, 25, t('palette.zoneJointDamage')),
        },
        {
          id: 'zone_heal',
          name: t('palette.zoneHeal'),
          description: t('palette.zoneHealDesc'),
          icon: '💚',
          createConfig: () => createEffectorZoneConfig('heal', 2.5, 15, t('palette.zoneHeal')),
        },
        {
          id: 'zone_repel',
          name: t('palette.zoneRepel'),
          description: t('palette.zoneRepelDesc'),
          icon: '💨',
          createConfig: () =>
            createEffectorZoneConfig(
              'repel',
              2.5,
              20,
              t('palette.zoneRepel'),
              false,
              false,
              false,
              true,
              50,
              0
            ),
        },
        {
          id: 'zone_attract',
          name: t('palette.zoneAttract'),
          description: t('palette.zoneAttractDesc'),
          icon: '🌀',
          createConfig: () =>
            createEffectorZoneConfig(
              'attract',
              2.5,
              20,
              t('palette.zoneAttract'),
              false,
              false,
              false,
              true,
              50,
              0
            ),
        },
        {
          id: 'zone_time_slow',
          name: t('palette.zoneTimeSlow'),
          description: t('palette.zoneTimeSlowDesc'),
          icon: '⏳',
          createConfig: () =>
            createEffectorZoneConfig(
              'time_dilation',
              2.5,
              0.5,
              t('palette.zoneTimeSlow'),
              false,
              false,
              false,
              false
            ),
        },
        {
          id: 'zone_time_fast',
          name: t('palette.zoneTimeFast'),
          description: t('palette.zoneTimeFastDesc'),
          icon: '⚡',
          createConfig: () =>
            createEffectorZoneConfig(
              'time_dilation',
              2.5,
              1.8,
              t('palette.zoneTimeFast'),
              false,
              false,
              false,
              false
            ),
        },
        {
          id: 'zone_time_vortex',
          name: t('palette.zoneTimeVortex'),
          description: t('palette.zoneTimeVortexDesc'),
          icon: '🌀',
          createConfig: () =>
            createEffectorZoneConfig(
              'time_dilation',
              3.5,
              0.5,
              t('palette.zoneTimeVortex'),
              false,
              false,
              false,
              true,
              0.2,
              1.0
            ),
        },
      ],
    },
    {
      id: 'water',
      title: t('palette.categoryWater'),
      items: [
        {
          id: 'water_lake',
          name: t('palette.lake'),
          description: t('palette.lakeDesc'),
          icon: '🏞️',
          createConfig: () => createWaterConfig('lake', 20, 20),
        },
        {
          id: 'water_river',
          name: t('palette.river'),
          description: t('palette.riverDesc'),
          icon: '🌊',
          createConfig: () => createWaterConfig('river', 8, 35),
        },
      ],
    },
  ];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '10px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onOpenWizard}
        style={{
          width: '100%',
          backgroundColor: '#27ae60',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          padding: '10px',
          fontSize: '12px',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'background-color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2ecc71')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#27ae60')}
      >
        <span>✨</span>
        <span>{t('palette.openWizard')}</span>
      </button>

      <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', flexShrink: 0 }}>
        {t('palette.subtitle')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '2px' }}>
        {(() => {
          const getTotalItemCount = (group: PaletteGroup): number => {
            let count = group.items ? group.items.length : 0;
            if (group.subgroups) {
              for (const sub of group.subgroups) {
                count += getTotalItemCount(sub);
              }
            }
            return count;
          };

          const renderItemCard = (item: PaletteItem) => (
            <div
              key={item.id}
              onClick={() => {
                if (item.onClick) item.onClick();
                else if (item.createConfig) onSelectPreset(item.createConfig());
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '8px 10px',
                cursor: 'pointer',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#252525';
                e.currentTarget.style.borderColor = '#3498db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1e1e1e';
                e.currentTarget.style.borderColor = '#333';
              }}
            >
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ecf0f1' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                  {item.description}
                </div>
              </div>
            </div>
          );

          const renderGroup = (group: PaletteGroup, depth: number = 0) => {
            const isCollapsed = Boolean(collapsedGroups[group.id]);
            const totalCount = getTotalItemCount(group);
            const accentColor = PALETTE_ACCENT_COLORS[depth % PALETTE_ACCENT_COLORS.length];

            const bg = depth === 0 ? '#202020' : depth === 1 ? '#1a1a1a' : '#151515';
            const border = depth === 0 ? '#2e2e2e' : depth === 1 ? '#282828' : '#222222';
            const fontSize = depth === 0 ? '11px' : '10px';
            const padding = depth === 0 ? '6px 10px' : '5px 8px';

            return (
              <div key={group.id} style={{ marginBottom: depth === 0 ? '10px' : '6px' }}>
                <div
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    fontSize,
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    color: isCollapsed ? '#888' : '#ecf0f1',
                    padding,
                    backgroundColor: bg,
                    borderRadius: '4px',
                    border: `1px solid ${border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = depth === 0 ? '#2a2a2a' : '#222222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = bg;
                  }}
                >
                  <span>
                    {group.title} ({totalCount})
                  </span>
                  <span
                    style={{
                      fontSize: depth === 0 ? '10px' : '9px',
                      color: isCollapsed ? '#666' : accentColor,
                      transition: 'transform 0.15s',
                    }}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                </div>

                {!isCollapsed && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      marginLeft: '8px',
                      paddingLeft: '8px',
                      borderLeft: `2px solid ${accentColor}`,
                      marginTop: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    {group.items && group.items.map(renderItemCard)}
                    {group.subgroups && group.subgroups.map((sub) => renderGroup(sub, depth + 1))}
                  </div>
                )}
              </div>
            );
          };

          return categories.map((cat) => renderGroup(cat, 0));
        })()}
      </div>
    </div>
  );
};
