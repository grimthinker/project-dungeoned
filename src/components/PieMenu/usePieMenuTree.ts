import { useMemo } from 'react';
import { GameApp } from '../../GameApp';
import { PieMenuItem, PieMenuState } from './types';
import { Vec3 } from '../../types';
import { EDITOR_CONFIG } from '../../config/editorConfig';
import { createRectanglePoints, deg2Rad } from '../../utils';
import { createEffectorZoneConfig } from '../../ecs/archetypes';
import { CREATURE_BLUEPRINTS } from '../../ecs/templates';
import { spawnFetchGroup } from '../../ecs/prefabs/fetchGroupPrefab';
import { t } from '../../locales';

export interface UsePieMenuTreeOptions {
  app: GameApp | null;
  pieMenuState: PieMenuState | null;
  onClose: () => void;
  onFocusEntity: (id: string) => void;
  onInspectBT: (id: string) => void;
  onDeleteSelected: () => void;
  syncPlayerControls: () => void;
  updateStats: () => void;
}

export function usePieMenuTree({
  app,
  pieMenuState,
  onClose,
  onFocusEntity,
  onInspectBT,
  onDeleteSelected,
  syncPlayerControls,
  updateStats,
}: UsePieMenuTreeOptions): PieMenuItem[] {
  return useMemo(() => {
    if (!app || !pieMenuState) return [];

    // 1. Контекстное меню над выбранной сущностью
    if (pieMenuState.targetEntityId) {
      const targetId = pieMenuState.targetEntityId;
      const targetCount = pieMenuState.targetEntityIds.length;

      return [
        {
          id: 'clone',
          label:
            targetCount > 1 ? t('pieMenu.cloneCount', { count: targetCount }) : t('pieMenu.clone'),
          icon: '📑',
          color: '#27ae60',
          onSelect: () => {
            const idsToClone = targetCount > 0 ? pieMenuState.targetEntityIds : [targetId];
            app.duplicateEntities(idsToClone, EDITOR_CONFIG.cloneOffset);
            syncPlayerControls();
            updateStats();
          },
        },
        {
          id: 'focus',
          label: t('pieMenu.focus'),
          icon: '🎯',
          color: '#3498db',
          onSelect: () => onFocusEntity(targetId),
        },
        {
          id: 'inspect_bt',
          label: t('pieMenu.inspectBt'),
          icon: '🧠',
          color: '#9b59b6',
          onSelect: () => onInspectBT(targetId),
        },
        {
          id: 'delete',
          label:
            targetCount > 1
              ? t('pieMenu.deleteCount', { count: targetCount })
              : t('pieMenu.delete'),
          icon: '🗑️',
          danger: true,
          onSelect: onDeleteSelected,
        },
      ];
    }

    // 2. Радиальное меню быстрого спавна на пустом месте
    const worldPos = pieMenuState.worldPos;

    const spawnModularAtCursor = (
      structureType: keyof typeof CREATURE_BLUEPRINTS,
      behavior: string,
      name: string,
      historyKey: string
    ) => {
      app.executeTransaction(t(historyKey), () => {
        const spawnPos: Vec3 = {
          x: worldPos.x,
          y: worldPos.y + 0.15,
          z: worldPos.z,
        };
        const id =
          structureType === 'humanoid'
            ? app.entityFactory.spawnModularHumanoid(
                app.world,
                app.physics,
                app.aiSystem,
                spawnPos,
                behavior,
                name
              )
            : app.entityFactory.spawnModularCreature(
                app.world,
                app.physics,
                app.aiSystem,
                spawnPos,
                CREATURE_BLUEPRINTS[structureType],
                behavior,
                name
              );
        app.selection.selectEntity(id, true);
        return id;
      });
      syncPlayerControls();
    };

    return [
      {
        id: 'category_creatures',
        label: t('pieMenu.creatures'),
        icon: '👤',
        color: '#2980b9',
        children: [
          {
            id: 'spawn_player',
            label: t('pieMenu.player'),
            icon: '🎮',
            onSelect: () =>
              spawnModularAtCursor(
                'humanoid',
                'PlayerTree',
                t('palette.player'),
                'history.spawnPlayer'
              ),
          },
          {
            id: 'spawn_attacker',
            label: t('pieMenu.attacker'),
            icon: '⚔️',
            onSelect: () =>
              spawnModularAtCursor(
                'humanoid',
                'AttackerTree',
                t('palette.attacker'),
                'history.spawnAttacker'
              ),
          },
          {
            id: 'spawn_quadruped',
            label: t('palette.quadrupedBot'),
            icon: '🐕',
            onSelect: () =>
              spawnModularAtCursor(
                'quadruped',
                'AttackerTree',
                t('palette.quadrupedBot'),
                'history.spawnModular'
              ),
          },
          {
            id: 'spawn_arachnid',
            label: t('palette.arachnidBot'),
            icon: '🕷️',
            onSelect: () =>
              spawnModularAtCursor(
                'arachnid',
                'AttackerTree',
                t('palette.arachnidBot'),
                'history.spawnModular'
              ),
          },
          {
            id: 'spawn_idle',
            label: t('palette.idleBot'),
            icon: '👤',
            onSelect: () =>
              spawnModularAtCursor(
                'humanoid',
                'IdleTree',
                t('palette.idleBot'),
                'history.spawnModular'
              ),
          },
          {
            id: 'spawn_master_single',
            label: t('pieMenu.master'),
            icon: '🚶',
            onSelect: () =>
              spawnModularAtCursor(
                'humanoid',
                'MasterFetchTree',
                t('palette.master'),
                'history.spawnModular'
              ),
          },
        ],
      },
      {
        id: 'category_weapons',
        label: t('pieMenu.weapons'),
        icon: '⚔️',
        color: '#f39c12',
        children: [
          {
            id: 'spawn_spear',
            label: t('pieMenu.spear'),
            icon: '🗡️',
            onSelect: () => {
              app.executeTransaction(t('history.spawnSpear'), () => {
                const id = app.spawnEntity(
                  {
                    tag: { archetype: 'item', subType: 'weapon' },
                    item: {
                      name: t('palette.spear'),
                      type: 'weapon',
                      maxStack: 1,
                      size: 10,
                      equipTypes: [],
                      equippable: false,
                      equipTimeMultiplier: 1.0,
                    },
                    physics: { radius: 0.4, weight: 1, isSolid: true },
                    weaponStats: { baseDamage: 25, prepTime: 0.2, recoveryTime: 0.3 },
                    weaponZone: { hitZoneType: 'forward_line', length: 4.5 },
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_sword',
            label: 'Меч',
            icon: '🗡️',
            onSelect: () => {
              app.executeTransaction(t('history.spawnSpear'), () => {
                const id = app.spawnEntity(
                  {
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
                    },
                    weaponStats: { baseDamage: 25, prepTime: 0.2, recoveryTime: 0.3 },
                    weaponZone: { hitZoneType: 'angle', radius: 2.5, angle: deg2Rad(90) },
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_shotgun',
            label: t('palette.shotgun'),
            icon: '💥',
            onSelect: () => {
              app.executeTransaction(t('history.spawnSpear'), () => {
                const id = app.spawnEntity(
                  {
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
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_aura',
            label: t('palette.auraWeapon'),
            icon: '✨',
            onSelect: () => {
              app.executeTransaction(t('history.spawnSpear'), () => {
                const id = app.spawnEntity(
                  {
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
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_ball',
            label: 'Мячик',
            icon: '🎾',
            onSelect: () => {
              app.executeTransaction(t('history.spawnSpear'), () => {
                const id = app.spawnEntity(
                  {
                    tag: { archetype: 'item', subType: 'weapon' },
                    meta: { name: 'Мячик', entityType: 'item' },
                    visualModel: { modelId: 'proc://prop/ball' },
                    item: {
                      name: 'Мячик',
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
                      angularDamping: 1.0,
                    },
                    weaponStats: { baseDamage: 5, prepTime: 0.2, recoveryTime: 0.3 },
                    weaponZone: { hitZoneType: 'forward_line', length: 1.5 },
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
        ],
      },
      {
        id: 'category_items',
        label: t('pieMenu.items'),
        icon: '📦',
        color: '#27ae60',
        children: [
          {
            id: 'spawn_fire_zone',
            label: t('pieMenu.fireZone'),
            icon: '🔥',
            onSelect: () => {
              app.executeTransaction(t('history.spawnFireZone'), () => {
                const id = app.spawnEntity(
                  createEffectorZoneConfig('damage', 2.5, 15, t('palette.zoneFire')),
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_heal_zone',
            label: t('palette.zoneHeal'),
            icon: '💚',
            onSelect: () => {
              app.executeTransaction(t('history.spawnFireZone'), () => {
                const id = app.spawnEntity(
                  createEffectorZoneConfig('heal', 2.5, 15, t('palette.zoneHeal')),
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_backpack',
            label: t('palette.backpack'),
            icon: '🎒',
            onSelect: () => {
              app.executeTransaction(t('history.spawnObject'), () => {
                const id = app.spawnEntity(
                  {
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
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
          {
            id: 'spawn_chestplate',
            label: t('palette.chestplate'),
            icon: '🛡️',
            onSelect: () => {
              app.executeTransaction(t('history.spawnObject'), () => {
                const id = app.spawnEntity(
                  {
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
                  },
                  worldPos
                );
                app.selection.selectEntity(id, true);
                return id;
              });
              syncPlayerControls();
            },
          },
        ],
      },
      {
        id: 'category_groups',
        label: t('pieMenu.groups'),
        icon: '👥',
        color: '#9b59b6',
        children: [
          {
            id: 'spawn_group_fetch',
            label: t('pieMenu.fetchGroup'),
            icon: '🐕',
            onSelect: () => {
              app.executeTransaction(t('history.spawnFetchGroup'), () => {
                const result = spawnFetchGroup(app.simulation, worldPos);
                app.selection.selectEntities([result.masterId, ...result.dogIds]);
                return result.masterId;
              });
              syncPlayerControls();
            },
          },
        ],
      },
    ];
  }, [
    app,
    pieMenuState,
    onClose,
    onFocusEntity,
    onInspectBT,
    onDeleteSelected,
    syncPlayerControls,
    updateStats,
  ]);
}
