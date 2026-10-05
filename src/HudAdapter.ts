import { World } from './ecs/World';
import { GameApp } from './GameApp';
import {
  IHudDataProvider,
  PlayerStatusDTO,
  PlayerEquipmentDTO,
  MapSnapshotDTO,
  TargetPanelDTO,
  InspectStatusDTO,
  InspectEquipmentDTO,
  TargetModelDataDTO,
  WaterBodyData,
  ObstacleMapData,
  MapZoneData,
  MapCreatureData,
  EquipAreaDTO,
} from './components/gameHud/hudPorts';
import {
  getAnatomyParts,
  getAggregatedInteractionSlots,
  calculateTotalEntityWeight,
} from './ecs/utils/hierarchy';
import { HUD_CONFIG } from './config/hudConfig';

function getFpColor(currentFp: number, maxFp: number): string {
  if (maxFp <= 0) return HUD_CONFIG.status.paperDoll.fpIntact;
  const ratio = currentFp / maxFp;
  if (ratio >= 0.5) {
    const t = Math.min(1, Math.max(0, (ratio - 0.5) / 0.5));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - t) + 230 * t);
    return `rgb(${r}, ${g}, 0)`;
  } else if (ratio >= 0) {
    const t = Math.min(1, Math.max(0, ratio / 0.5));
    const g = Math.round(255 * t);
    return `rgb(255, ${g}, 0)`;
  } else {
    const t = Math.min(1, Math.max(0, (ratio - -2.0) / 2.0));
    const r = Math.round(255 * t);
    return `rgb(${r}, 0, 0)`;
  }
}

export class HudAdapter implements IHudDataProvider {
  constructor(
    private world: World,
    private app: GameApp
  ) {}

  public getPlayerStatus(playerId: string | null): PlayerStatusDTO | null {
    if (!playerId) return null;
    const meta = this.world.getComponent(playerId, 'meta');
    const animator = this.world.getComponent(playerId, 'animator');
    const isHumanoid = animator?.rigType === 'humanoid';

    const partColors: Record<string, string> = {
      head: HUD_CONFIG.status.paperDoll.fpIntact,
      torso: HUD_CONFIG.status.paperDoll.fpIntact,
      arm_l: HUD_CONFIG.status.paperDoll.fpIntact,
      arm_r: HUD_CONFIG.status.paperDoll.fpIntact,
      leg_l: HUD_CONFIG.status.paperDoll.fpIntact,
      leg_r: HUD_CONFIG.status.paperDoll.fpIntact,
    };

    const partFp: Record<string, { name: string; percent: number }> = {
      head: { name: 'Голова', percent: 100 },
      torso: { name: 'Туловище', percent: 100 },
      arm_l: { name: 'Левая рука', percent: 100 },
      arm_r: { name: 'Правая рука', percent: 100 },
      leg_l: { name: 'Левая нога', percent: 100 },
      leg_r: { name: 'Правая нога', percent: 100 },
    };

    if (isHumanoid) {
      const parts = getAnatomyParts(this.world, playerId);
      for (const pId of parts) {
        const tag = this.world.getComponent(pId, 'tag');
        const fp = this.world.getComponent(pId, 'functionalHealth');
        const partMeta = this.world.getComponent(pId, 'meta');
        const color = fp
          ? getFpColor(fp.current, fp.max.current)
          : HUD_CONFIG.status.paperDoll.fpIntact;
        const percent =
          fp && fp.max.current > 0 ? Math.round((fp.current / fp.max.current) * 100) : 100;

        if (tag?.subType === 'head' || pId.includes('head')) {
          partColors.head = color;
          partFp.head = { name: partMeta?.name || 'Голова', percent };
        } else if (tag?.subType === 'torso' || pId.includes('torso')) {
          partColors.torso = color;
          partFp.torso = { name: partMeta?.name || 'Туловище', percent };
        } else if (tag?.subType === 'arm' || pId.includes('arm')) {
          if (pId.includes('arm_l') || pId.includes('left')) {
            partColors.arm_l = color;
            partFp.arm_l = { name: partMeta?.name || 'Левая рука', percent };
          } else {
            partColors.arm_r = color;
            partFp.arm_r = { name: partMeta?.name || 'Правая рука', percent };
          }
        } else if (tag?.subType === 'leg' || pId.includes('leg')) {
          if (pId.includes('leg_l') || pId.includes('left')) {
            partColors.leg_l = color;
            partFp.leg_l = { name: partMeta?.name || 'Левая нога', percent };
          } else {
            partColors.leg_r = color;
            partFp.leg_r = { name: partMeta?.name || 'Правая нога', percent };
          }
        }
      }
    }

    return {
      name: meta?.name || 'Игрок',
      isHumanoid: Boolean(isHumanoid),
      bars: [
        {
          id: 'red',
          icon: '🩸',
          title: 'Запас крови',
          label: 'Запас крови',
          color: HUD_CONFIG.status.bars.health,
          current: 75,
          max: 100,
        },
        {
          id: 'green',
          icon: '💪',
          title: 'Запас сил',
          label: 'Запас сил',
          color: HUD_CONFIG.status.bars.stamina,
          current: 90,
          max: 100,
        },
        {
          id: 'purple',
          icon: '👁️',
          title: 'Концентрация',
          label: 'Концентрация',
          color: HUD_CONFIG.status.bars.energy,
          current: 50,
          max: 100,
        },
        {
          id: 'cyan',
          icon: '🔷',
          title: 'Запас энергии',
          label: 'Запас энергии',
          color: HUD_CONFIG.status.bars.resilience,
          current: 65,
          max: 100,
        },
        {
          id: 'orange',
          icon: '⚖️',
          title: 'Баланс',
          label: 'Баланс',
          color: HUD_CONFIG.status.bars.balance,
          current: 40,
          max: 100,
        },
      ],
      partColors,
      partFp,
    };
  }

  public getPlayerEquipment(playerId: string | null): PlayerEquipmentDTO | null {
    if (!playerId) return null;
    const aggSlots = getAggregatedInteractionSlots(this.world, playerId);
    const slots = aggSlots.map((s) => {
      const item = s.slot.itemId ? this.world.getComponent(s.slot.itemId, 'item') : null;
      return {
        globalSlotIndex: s.globalSlotIndex,
        partId: s.partId,
        name: s.slot.name || 'Слот',
        isBroken: s.isBroken,
        slotKind: s.slot.slotKind,
        item: item
          ? {
              id: s.slot.itemId!,
              name: item.name,
              type: item.type,
              icon: item.icon,
            }
          : null,
      };
    });

    const equipAreas: PlayerEquipmentDTO['equipAreas'] = [];
    const parts = getAnatomyParts(this.world, playerId);

    for (const pId of parts) {
      const pEquip = this.world.getComponent(pId, 'equip');
      if (pEquip && pEquip.equipmentAreas) {
        for (const area of pEquip.equipmentAreas) {
          const items: EquipAreaDTO['items'] = [];
          for (const itId of area.itemIds) {
            const it = this.world.getComponent(itId, 'item');
            const physStats = this.world.getComponent(itId, 'physicsStats');
            if (it) {
              items.push({
                id: itId,
                name: it.name,
                type: it.type,
                icon: it.icon,
                size: it.size,
                weight: physStats?.weight.current ?? 1,
              });
            }
          }
          equipAreas.push({
            areaId: area.id,
            containerId: pId,
            name: area.name,
            type: area.type,
            space: area.space,
            items,
          });
        }
      }
    }

    return { slots, equipAreas };
  }

  public getMapSnapshot(playerId: string | null): MapSnapshotDTO {
    const terrainEntities = this.world.getEntitiesWith('terrain');
    const terrainComp = terrainEntities.length > 0 ? terrainEntities[0][1].terrain : undefined;

    const waters: WaterBodyData[] = this.world
      .getEntitiesWith('water', 'transform')
      .map(([, c]) => ({
        width: c.water.width,
        depth: c.water.depth,
        x: c.transform.x,
        z: c.transform.z,
        surfaceY: c.transform.y,
        angle: c.transform.angle ?? 0,
      }));

    const obstacles: ObstacleMapData[] = [];
    for (const [id, comp] of this.world.getEntitiesWith('tag', 'transform')) {
      if (comp.tag.archetype !== 'obstacle') continue;
      const visual = this.world.getComponent(id, 'visualModel');
      const physStats = this.world.getComponent(id, 'physicsStats');
      const meta = this.world.getComponent(id, 'meta');

      const r = physStats?.radius.current ?? 1.0;
      let widthVal = r * 2;
      let depthVal = r * 2;

      if (physStats?.points && physStats.points.length > 0) {
        let minX = physStats.points[0].x,
          maxX = physStats.points[0].x;
        let minY = physStats.points[0].y,
          maxY = physStats.points[0].y;
        for (let pi = 1; pi < physStats.points.length; pi++) {
          const pt = physStats.points[pi];
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        widthVal = Math.max(0.2, maxX - minX);
        depthVal = Math.max(0.2, maxY - minY);
      }

      obstacles.push({
        id,
        subType: comp.tag.subType,
        modelId: visual?.modelId,
        name: meta?.name,
        x: comp.transform.x,
        z: comp.transform.z,
        angle: comp.transform.angle ?? 0,
        radius: r,
        width: widthVal,
        depth: depthVal,
        points: physStats?.points,
      });
    }

    const zones: MapZoneData[] = this.world
      .getEntitiesWith('gameplayZone', 'transform')
      .map(([zId, { gameplayZone, transform }]) => {
        const shape = this.world.getComponent(zId, 'zoneShape');
        return {
          id: zId,
          x: transform.x,
          z: transform.z,
          radius: shape?.radius ?? 3.0,
          role: gameplayZone.role,
        };
      });

    const creatures: MapCreatureData[] = [];
    for (const [cId, { meta, transform, health }] of this.world.getEntitiesWith(
      'meta',
      'transform',
      'health'
    )) {
      if (cId === playerId) continue;
      const tag = this.world.getComponent(cId, 'tag');
      if (tag?.archetype !== 'creature' && meta.entityType !== 'creature') continue;

      const ai = this.world.getComponent(cId, 'aiStats');
      const isAttacker = ai?.behavior.current === 'AttackerTree';
      const isDog =
        meta.name.toLowerCase().includes('собака') || meta.name.toLowerCase().includes('dog');

      creatures.push({
        id: cId,
        x: transform.x,
        z: transform.z,
        isAlive: health.isAlive,
        isAttacker,
        isDog,
      });
    }

    let playerPos: { x: number; z: number; angle: number } | undefined;
    if (playerId) {
      const pTrans = this.world.getComponent(playerId, 'transform');
      if (pTrans) {
        playerPos = { x: pTrans.x, z: pTrans.z, angle: pTrans.angle };
      }
    }

    return {
      terrain: terrainComp
        ? {
            width: terrainComp.width,
            depth: terrainComp.depth,
            resolution: terrainComp.resolution,
            geometryVersion: terrainComp.geometryVersion ?? 0,
            heights: terrainComp.heights,
            splatData: terrainComp.splatData,
            splatResolution: terrainComp.splatResolution || 512,
          }
        : undefined,
      waters,
      obstacles,
      zones,
      creatures,
      playerPos,
    };
  }

  public getTargetPanelInfo(targetId: string): TargetPanelDTO | null {
    const meta = this.world.getComponent(targetId, 'meta');
    const item = this.world.getComponent(targetId, 'item');
    const tag = this.world.getComponent(targetId, 'tag');
    if (!meta && !item && !tag) return null;

    const arch = tag?.archetype ?? meta?.entityType;
    return {
      name: meta?.name ?? item?.name ?? targetId,
      isCreature: arch === 'creature',
      isItem: arch === 'item' || Boolean(item),
    };
  }

  public getInspectStatus(targetId: string): InspectStatusDTO {
    const health = this.world.getComponent(targetId, 'health');
    const animator = this.world.getComponent(targetId, 'animator');
    const isHumanoid = animator?.rigType === 'humanoid';

    const currentHp = health ? Math.round(health.current) : 100;
    const maxHp = health ? Math.round(health.max.current) : 100;

    const partColors: Record<string, string> = {
      head: HUD_CONFIG.status.paperDoll.fpIntact,
      torso: HUD_CONFIG.status.paperDoll.fpIntact,
      arm_l: HUD_CONFIG.status.paperDoll.fpIntact,
      arm_r: HUD_CONFIG.status.paperDoll.fpIntact,
      leg_l: HUD_CONFIG.status.paperDoll.fpIntact,
      leg_r: HUD_CONFIG.status.paperDoll.fpIntact,
    };

    const partFp: Record<string, { name: string; percent: number }> = {
      head: { name: 'Голова', percent: 100 },
      torso: { name: 'Туловище', percent: 100 },
      arm_l: { name: 'Левая рука', percent: 100 },
      arm_r: { name: 'Правая рука', percent: 100 },
      leg_l: { name: 'Левая нога', percent: 100 },
      leg_r: { name: 'Правая нога', percent: 100 },
    };

    if (isHumanoid) {
      const parts = getAnatomyParts(this.world, targetId);
      for (const pId of parts) {
        const tag = this.world.getComponent(pId, 'tag');
        const fp = this.world.getComponent(pId, 'functionalHealth');
        const meta = this.world.getComponent(pId, 'meta');
        const color = fp
          ? getFpColor(fp.current, fp.max.current)
          : HUD_CONFIG.status.paperDoll.fpIntact;
        const percent =
          fp && fp.max.current > 0 ? Math.round((fp.current / fp.max.current) * 100) : 100;

        if (tag?.subType === 'head' || pId.includes('head')) {
          partColors.head = color;
          partFp.head = { name: meta?.name || 'Голова', percent };
        } else if (tag?.subType === 'torso' || pId.includes('torso')) {
          partColors.torso = color;
          partFp.torso = { name: meta?.name || 'Туловище', percent };
        } else if (tag?.subType === 'arm' || pId.includes('arm')) {
          if (pId.includes('arm_l') || pId.includes('left')) {
            partColors.arm_l = color;
            partFp.arm_l = { name: meta?.name || 'Левая рука', percent };
          } else {
            partColors.arm_r = color;
            partFp.arm_r = { name: meta?.name || 'Правая рука', percent };
          }
        } else if (tag?.subType === 'leg' || pId.includes('leg')) {
          if (pId.includes('leg_l') || pId.includes('left')) {
            partColors.leg_l = color;
            partFp.leg_l = { name: meta?.name || 'Левая нога', percent };
          } else {
            partColors.leg_r = color;
            partFp.leg_r = { name: meta?.name || 'Правая нога', percent };
          }
        }
      }
    }

    return { currentHp, maxHp, isHumanoid: Boolean(isHumanoid), partColors, partFp };
  }

  public getInspectEquipment(targetId: string): InspectEquipmentDTO {
    const liveSlots = getAggregatedInteractionSlots(this.world, targetId);
    const slotsData = liveSlots.map((info) => {
      const it = info.slot.itemId ? this.world.getComponent(info.slot.itemId, 'item') : null;
      return {
        id: info.slot.id,
        name: info.slot.name,
        isBroken: info.isBroken,
        item: it ? { id: info.slot.itemId!, name: it.name, type: it.type, icon: it.icon } : null,
      };
    });

    const areasData: InspectEquipmentDTO['areasData'] = [];
    const parts = getAnatomyParts(this.world, targetId);
    for (const pId of parts) {
      const pEquip = this.world.getComponent(pId, 'equip');
      if (pEquip?.equipmentAreas) {
        for (const area of pEquip.equipmentAreas) {
          const activeItemId = area.itemIds[0] ?? null;
          const it = activeItemId ? this.world.getComponent(activeItemId, 'item') : null;
          areasData.push({
            areaId: area.id,
            containerId: pId,
            name: area.name,
            type: area.type,
            itemIdsCount: area.itemIds.length,
            item: it ? { id: activeItemId, name: it.name, type: it.type, icon: it.icon } : null,
          });
        }
      }
    }

    return { slotsData, areasData };
  }

  public getInspectParameters(targetId: string): Array<{ label: string; value: string }> {
    const physStats = this.world.getComponent(targetId, 'physicsStats');
    const meta = this.world.getComponent(targetId, 'meta');
    const velocity = this.world.getComponent(targetId, 'velocity');
    const stealthStats = this.world.getComponent(targetId, 'stealthStats');
    const tag = this.world.getComponent(targetId, 'tag');
    const isCreature = tag?.archetype === 'creature' || Boolean(meta?.stance);

    const radius = physStats ? physStats.radius.current.toFixed(2) : '—';
    const height = physStats?.height ? physStats.height.current.toFixed(2) : '—';
    const weight = physStats ? (physStats.totalWeight ?? physStats.weight.current).toFixed(1) : '—';

    const rows = [
      { label: 'Радиус коллизии', value: `${radius} м` },
      { label: 'Рост / Высота', value: `${height} м` },
      { label: 'Текущий вес', value: `${weight} кг` },
    ];

    if (isCreature) {
      const speed = velocity
        ? (velocity.actualSpeed ?? velocity.currentSpeed ?? 0).toFixed(2)
        : '0.00';
      const stealth = stealthStats ? Math.round(stealthStats.stealthPower.current).toString() : '—';

      rows.push(
        { label: 'Положение тела', value: meta?.stance || 'standing' },
        { label: 'Вид передвижения', value: meta?.movementMode || 'immobile' },
        { label: 'Текущее действие', value: meta?.actionMode || 'idle' },
        { label: 'Скорость движения', value: `${speed} м/с` },
        { label: 'Скрытность', value: stealth }
      );
    }

    return rows;
  }

  public getTargetModelData(targetId: string, playerId: string | null): TargetModelDataDTO | null {
    const meta = this.world.getComponent(targetId, 'meta');
    const animator = this.world.getComponent(targetId, 'animator');
    const visual = this.world.getComponent(targetId, 'visualModel');
    const tag = this.world.getComponent(targetId, 'tag');
    const assembly = this.world.getComponent(targetId, 'assemblyRoot');
    const physStats = this.world.getComponent(targetId, 'physicsStats');
    const transform = this.world.getComponent(targetId, 'transform');
    const playerTrans = playerId ? this.world.getComponent(playerId, 'transform') : undefined;

    const parts: Array<{ modelId: string; rigNodeName: string }> = [];
    if (assembly?.partIds) {
      for (const pId of assembly.partIds) {
        const pVis = this.world.getComponent(pId, 'visualModel');
        if (pVis?.modelId && pVis.rigNodeName) {
          parts.push({ modelId: pVis.modelId, rigNodeName: pVis.rigNodeName });
        }
      }
    }

    const socketItems: TargetModelDataDTO['socketItems'] = [];
    const aggSlots = getAggregatedInteractionSlots(this.world, targetId);
    for (const info of aggSlots) {
      if (info.slot.rigSocketName && info.slot.itemId) {
        const itVis = this.world.getComponent(info.slot.itemId, 'visualModel');
        const it = this.world.getComponent(info.slot.itemId, 'item');
        socketItems.push({
          socketName: info.slot.rigSocketName,
          itemId: info.slot.itemId,
          modelId: itVis?.modelId,
          itemType: it?.type,
        });
      }
    }

    const headOrientation = this.world.getComponent(targetId, 'headOrientation');

    return {
      animator: animator
        ? {
            rigType: animator.rigType,
            currentAnimation: animator.currentAnimation,
            playbackSpeed: animator.playbackSpeed,
          }
        : undefined,
      visualModelId: visual?.modelId,
      rigType: animator?.rigType || visual?.rigType,
      assemblyPartIds: assembly?.partIds,
      parts,
      physicsRadius: physStats?.radius.current ?? 0.4,
      physicsHeight: physStats?.height?.current ?? 1.5,
      isCreature: tag?.archetype === 'creature' || Boolean(meta?.stance),
      transform: transform
        ? {
            x: transform.x,
            y: transform.y,
            z: transform.z,
            angle: transform.angle,
            rotation: transform.rotation,
          }
        : undefined,
      playerTransform: playerTrans
        ? { x: playerTrans.x, y: playerTrans.y, z: playerTrans.z }
        : undefined,
      headOrientation: headOrientation
        ? { relativePitch: headOrientation.relativePitch, relativeYaw: headOrientation.relativeYaw }
        : undefined,
      socketItems,
    };
  }

  public dropItem(playerId: string, globalSlotIndex: number): void {
    const brain = this.world.getComponent(playerId, 'brain');
    if (brain) {
      this.app.updateEntityBlackboard(playerId, 'requestedDropSlot', globalSlotIndex);
    } else {
      this.world.addComponent(playerId, 'dropItemIntent', { slotIndex: globalSlotIndex });
    }
  }

  public throwItem(playerId: string, globalSlotIndex: number): void {
    const aggSlots = getAggregatedInteractionSlots(this.world, playerId);
    const slotInfo = aggSlots[globalSlotIndex];
    if (slotInfo && slotInfo.slot.itemId) {
      this.app.throwTargeting = {
        slotIndex: globalSlotIndex,
        partId: slotInfo.partId,
        itemId: slotInfo.slot.itemId,
      };
    }
  }

  public pickupItem(playerId: string, targetItemId: string): void {
    this.app.updateEntityBlackboard(playerId, 'requestedPickupId', targetItemId);
  }

  public selectTarget(targetId: string | null): void {
    this.app.selection.selectGameTarget(targetId);
  }

  public startDialogue(targetId: string): boolean {
    const playerId = this.app.getPlayerEntityId();
    if (!playerId) return false;
    return this.app.simulation.dialogueSystem.startDialogue(this.world, targetId, playerId);
  }

  public chooseDialogueOption(choiceId: string): void {
    this.app.simulation.dialogueSystem.chooseOption(this.world, choiceId);
  }

  public closeDialogue(): void {
    this.app.simulation.dialogueSystem.closeDialogue(this.world);
  }

  public getActiveDialogue(): import('./components/gameHud/hudPorts').ActiveDialogueDTO | null {
    return this.app.simulation.dialogueSystem.getActiveDialogueDTO(this.world);
  }
}
