import { setBaseStat } from '../ecs/stats/StatEvaluator';
import { createRectanglePoints, deg2Rad, calculateBoundingRadius } from '../utils';
import { HitZoneType, WaterComponent, ZoneEffectType } from '../ecs/types';
import { World } from '../ecs/World';
import { EnvironmentComponent } from '../ecs/components/environment';
import { scaleObstacleColliders } from '../ecs/utils/obstacleColliders';

export interface MovementStatsPatch {
  maxSpeed?: number;
  maxTurnSpeed?: number;
  runSpeedMultiplier?: number;
  crouchSpeedMultiplier?: number;
  proneSpeedMultiplier?: number;
  walkSpeedMultiplier?: number;
  runTurnMultiplier?: number;
  crouchTurnMultiplier?: number;
  proneTurnMultiplier?: number;
  walkTurnMultiplier?: number;
  turnInPlaceTurnMultiplier?: number;
  strafeSpeedMultiplier?: number;
  backwardSpeedMultiplier?: number;
  strafeTurnMultiplier?: number;
  backwardTurnMultiplier?: number;
  pickupSpeedMultiplier?: number;
  pickupTurnMultiplier?: number;
  standToCrouchTime?: number;
  crouchToStandTime?: number;
  standToProneTime?: number;
  proneToStandTime?: number;
  crouchToProneTime?: number;
  proneToCrouchTime?: number;
  dropPrepTime?: number;
  dropRecoveryTime?: number;
}

export interface StealthStatsPatch {
  stealthPower?: number;
  crouchStealthMultiplier?: number;
  proneStealthMultiplier?: number;
  runStealthMultiplier?: number;
  walkStealthMultiplier?: number;
  turnInPlaceStealthMultiplier?: number;
  immobileStealthMultiplier?: number;
}

export interface AreaEffectorPatch {
  effect?: ZoneEffectType;
  valuePerSec?: number;
  radius?: number;
  ignoreParent?: boolean;
  destroyOnParentDeath?: boolean;
  destroyOnParentRemoval?: boolean;
  distanceAttenuation?: boolean;
  centerValue?: number;
  boundaryValue?: number;
}

export interface WeaponMutationPatch {
  name?: string;
  size?: number;
  equipTypes?: string[];
  equippable?: boolean;
  equipTimeMultiplier?: number;
  baseDamage?: number;
  prepTime?: number;
  recoveryTime?: number;
  length?: number;
  radius?: number;
  rayCount?: number;
  angle?: number;
  pierceObstacles?: boolean;
  pierceCreatures?: boolean;
  pierceItems?: boolean;
  hitZoneType?: HitZoneType;
}

export interface ArmorMutationPatch {
  name?: string;
  size?: number;
  equipTypes?: string[];
  equippable?: boolean;
  equipTimeMultiplier?: number;
  defense?: number;
  flatReduction?: number;
}

export interface GenericItemMutationPatch {
  size?: number;
  equipTypes?: string[];
  equippable?: boolean;
  equipTimeMultiplier?: number;
}

export interface BagMutationPatch {
  name?: string;
  size?: number;
  equipTypes?: string[];
  equippable?: boolean;
  equipTimeMultiplier?: number;
  width?: number;
  height?: number;
}

export class EditorMutationsAPI {
  constructor(private world: World) {}

  public updateEntityTransform(
    id: string,
    patch: { x?: number; y?: number; z?: number; angle?: number }
  ): boolean {
    const transform = this.world.getComponent(id, 'transform');
    if (!transform) return false;
    let changed = false;

    if (patch.x !== undefined && transform.x !== patch.x) {
      transform.x = patch.x;
      changed = true;
    }
    if (patch.y !== undefined && transform.y !== patch.y) {
      transform.y = patch.y;
      changed = true;
    }
    if (patch.z !== undefined && transform.z !== patch.z) {
      transform.z = patch.z;
      changed = true;
    }
    if (patch.angle !== undefined && transform.angle !== patch.angle) {
      transform.angle = patch.angle;
      const half = -patch.angle * 0.5;
      transform.rotation = {
        x: 0,
        y: Math.sin(half),
        z: 0,
        w: Math.cos(half),
      };
      changed = true;
    }

    // Делегируем синхронизацию физическому движку через Data-Oriented подход
    if (changed) {
      transform.isDirty = true;
      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.prevZ = transform.z;
    }

    return changed;
  }

  public updateEntityMeta(id: string, patch: { name?: string; destructible?: boolean }): boolean {
    const meta = this.world.getComponent(id, 'meta');
    const item = this.world.getComponent(id, 'item');
    let changed = false;

    if (meta && patch.name !== undefined && meta.name !== patch.name) {
      meta.name = patch.name;
      changed = true;
    }
    if (item && patch.name !== undefined && item.name !== patch.name) {
      item.name = patch.name;
      changed = true;
    }
    if (meta && patch.destructible !== undefined && meta.destructible !== patch.destructible) {
      meta.destructible = patch.destructible;
      changed = true;
    }
    return changed;
  }

  public updateEntityPhysics(
    id: string,
    patch: {
      radius?: number;
      width?: number;
      depth?: number;
      height?: number;
      weight?: number;
      isSolid?: boolean;
    }
  ): boolean {
    const physStats = this.world.getComponent(id, 'physicsStats');
    if (!physStats) return false;
    let changed = false;

    const prevRadius = physStats.radius.base;
    const prevHeight = physStats.height.base;

    const oldRadius = physStats.radius.base;
    const oldHeight = physStats.height.base;

    // Вычисляем текущие габариты по X и Z из точек полигона
    let curWidth = oldRadius * 2;
    let curDepth = oldRadius * 2;
    if (physStats.points && physStats.points.length > 0) {
      let minX = physStats.points[0].x,
        maxX = physStats.points[0].x;
      let minY = physStats.points[0].y,
        maxY = physStats.points[0].y;
      for (const p of physStats.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      curWidth = Math.max(0.1, maxX - minX);
      curDepth = Math.max(0.1, maxY - minY);
    }

    let ratioX = 1.0;
    let ratioZ = 1.0;
    let ratioY = 1.0;

    if (patch.width !== undefined || patch.depth !== undefined) {
      const newW = patch.width !== undefined ? Math.max(0.1, patch.width) : curWidth;
      const newD = patch.depth !== undefined ? Math.max(0.1, patch.depth) : curDepth;

      ratioX = curWidth > 0 ? newW / curWidth : 1.0;
      ratioZ = curDepth > 0 ? newD / curDepth : 1.0;

      if (physStats.points) {
        for (const p of physStats.points) {
          p.x *= ratioX;
          p.y *= ratioZ;
        }
      }

      const newRadius = physStats.points
        ? calculateBoundingRadius(physStats.points)
        : Math.max(newW, newD) / 2;

      setBaseStat(physStats.radius, newRadius);
      changed = true;
    } else if (patch.radius !== undefined && physStats.radius.base !== patch.radius) {
      const ratioXZ = oldRadius > 0 ? patch.radius / oldRadius : 1.0;
      ratioX = ratioXZ;
      ratioZ = ratioXZ;
      setBaseStat(physStats.radius, patch.radius);

      // Если это зона — синхронизируем радиус эффектора
      const effector = this.world.getComponent(id, 'areaEffector');
      if (effector && effector.radius !== patch.radius) {
        effector.radius = patch.radius;
      }
      const shape = this.world.getComponent(id, 'zoneShape');
      if (shape && patch.radius !== undefined) {
        shape.radius = patch.radius;
        shape.width = patch.radius * 2;
        shape.depth = patch.radius * 2;
      }
      // Если это препятствие с полигоном точек — масштабируем точки от центра
      if (physStats.points && oldRadius > 0) {
        for (const p of physStats.points) {
          p.x *= ratioXZ;
          p.y *= ratioXZ;
        }
      }
      changed = true;
    }

    if (patch.height !== undefined && physStats.height.base !== patch.height) {
      ratioY = oldHeight > 0 ? patch.height / oldHeight : 1.0;
      setBaseStat(physStats.height, patch.height);
      changed = true;
    }

    if (patch.weight !== undefined && physStats.weight.base !== patch.weight) {
      setBaseStat(physStats.weight, patch.weight);
      changed = true;
    }

    if (patch.isSolid !== undefined && physStats.isSolid !== patch.isSolid) {
      physStats.isSolid = patch.isSolid;
      changed = true;
    }

    // Если у препятствия есть составные коллайдеры (ствол дерева, крыша дома) — масштабируем их геометрию
    if (changed && physStats.colliders && (ratioX !== 1.0 || ratioY !== 1.0 || ratioZ !== 1.0)) {
      scaleObstacleColliders(physStats.colliders, ratioX, ratioY, ratioZ);
    }

    // Если это составное существо — пропорционально масштабируем его дочерние части тела
    const assembly = this.world.getComponent(id, 'assemblyRoot');
    const tag = this.world.getComponent(id, 'tag');
    if (changed && (tag?.archetype === 'creature' || assembly) && assembly?.partIds) {
      const scaleDeltaXZ =
        patch.radius !== undefined && prevRadius > 0 ? patch.radius / prevRadius : ratioX;
      const scaleDeltaY =
        patch.height !== undefined && prevHeight > 0 ? patch.height / prevHeight : ratioY;
      const scaleDeltaVol = scaleDeltaXZ * scaleDeltaXZ * scaleDeltaY;

      for (const partId of assembly.partIds) {
        if (partId === id) continue;
        const partPhys = this.world.getComponent(partId, 'physicsStats');
        if (partPhys) {
          if (scaleDeltaXZ !== 1.0)
            setBaseStat(partPhys.radius, partPhys.radius.base * scaleDeltaXZ);
          if (scaleDeltaY !== 1.0) setBaseStat(partPhys.height, partPhys.height.base * scaleDeltaY);
          if (scaleDeltaVol !== 1.0) {
            setBaseStat(partPhys.weight, partPhys.weight.base * scaleDeltaVol);
            if (partPhys.size !== undefined) {
              partPhys.size = Math.max(
                1,
                Math.round(partPhys.size * Math.max(scaleDeltaXZ, scaleDeltaY))
              );
            }
          }
        }
      }
    }

    if (changed) {
      const transform = this.world.getComponent(id, 'transform');
      if (transform) {
        transform.isDirty = true;
      }
    }

    return changed;
  }

  public updateEntityHealth(id: string, patch: { hp?: number; maxHp?: number }): boolean {
    const health = this.world.getComponent(id, 'health');
    if (!health) return false;
    let changed = false;

    if (patch.maxHp !== undefined && health.max.base !== patch.maxHp) {
      setBaseStat(health.max, Math.max(1, patch.maxHp));
      changed = true;
    }
    if (patch.hp !== undefined && health.current !== patch.hp) {
      health.current = Math.min(health.max.current, Math.max(0, patch.hp));
      if (health.current > 0) {
        health.isAlive = true;
      }
      changed = true;
    }
    return changed;
  }

  public updateEntityFunctionalHealth(id: string, patch: { fp?: number; maxFp?: number }): boolean {
    const fp = this.world.getComponent(id, 'functionalHealth');
    if (!fp) return false;
    let changed = false;

    if (patch.maxFp !== undefined && fp.max.base !== patch.maxFp) {
      setBaseStat(fp.max, Math.max(1, patch.maxFp));
      changed = true;
    }
    if (patch.fp !== undefined && fp.current !== patch.fp) {
      fp.current = Math.min(fp.max.current, Math.max(-2 * fp.max.current, patch.fp));
      fp.isFunctional = fp.current >= 0;
      changed = true;
    }
    return changed;
  }

  public updateEntitySocketLinkStrength(id: string, socketId: string, strength: number): boolean {
    const socketLink = this.world.getComponent(id, 'socketLink');
    const link = socketLink?.links[socketId];
    if (!link) return false;
    link.currentStrength = strength;

    const targetLink = this.world.getComponent(link.targetEntityId, 'socketLink')?.links[
      link.targetSocketId
    ];
    if (targetLink) {
      targetLink.currentStrength = strength;
    }
    return true;
  }

  public updateEntityMovementStats(id: string, patch: MovementStatsPatch): boolean {
    const ms = this.world.getComponent(id, 'movementStats');
    if (!ms) return false;
    let changed = false;

    if (patch.maxSpeed !== undefined && ms.maxSpeed.base !== patch.maxSpeed) {
      setBaseStat(ms.maxSpeed, patch.maxSpeed);
      changed = true;
    }
    if (patch.maxTurnSpeed !== undefined) {
      const draftTurn = deg2Rad(patch.maxTurnSpeed);
      if (ms.maxTurnSpeed.base !== draftTurn) {
        setBaseStat(ms.maxTurnSpeed, draftTurn);
        changed = true;
      }
    }
    const multipliers = [
      'runSpeedMultiplier',
      'crouchSpeedMultiplier',
      'proneSpeedMultiplier',
      'walkSpeedMultiplier',
      'runTurnMultiplier',
      'crouchTurnMultiplier',
      'proneTurnMultiplier',
      'walkTurnMultiplier',
      'turnInPlaceTurnMultiplier',
      'strafeSpeedMultiplier',
      'backwardSpeedMultiplier',
      'strafeTurnMultiplier',
      'backwardTurnMultiplier',
      'pickupSpeedMultiplier',
      'pickupTurnMultiplier',
    ] as const;

    for (const m of multipliers) {
      const val = patch[m];
      if (val !== undefined && ms[m] !== val) {
        ms[m] = val;
        changed = true;
      }
    }

    const transitionTimes = [
      'standToCrouchTime',
      'crouchToStandTime',
      'standToProneTime',
      'proneToStandTime',
      'crouchToProneTime',
      'proneToCrouchTime',
      'dropPrepTime',
      'dropRecoveryTime',
    ] as const;

    for (const t of transitionTimes) {
      const val = patch[t];
      if (val !== undefined && ms[t]?.base !== val) {
        setBaseStat(ms[t], val);
        changed = true;
      }
    }
    return changed;
  }

  public updateEntityStealthStats(id: string, patch: StealthStatsPatch): boolean {
    const st = this.world.getComponent(id, 'stealthStats');
    if (!st) return false;
    let changed = false;

    if (patch.stealthPower !== undefined && st.stealthPower.base !== patch.stealthPower) {
      setBaseStat(st.stealthPower, patch.stealthPower);
      changed = true;
    }
    const multipliers = [
      'crouchStealthMultiplier',
      'proneStealthMultiplier',
      'runStealthMultiplier',
      'walkStealthMultiplier',
      'turnInPlaceStealthMultiplier',
      'immobileStealthMultiplier',
    ] as const;

    for (const m of multipliers) {
      const val = patch[m];
      if (val !== undefined && st[m] !== val) {
        st[m] = val;
        changed = true;
      }
    }
    return changed;
  }

  public updateEntityAIBehavior(id: string, behavior: string): boolean {
    const aiStats = this.world.getComponent(id, 'aiStats');
    if (!aiStats || aiStats.behavior.current === behavior) return false;
    aiStats.behavior.current = behavior;
    aiStats.behavior.base = behavior;
    return true;
  }

  public updateEntityAreaEffector(id: string, patch: AreaEffectorPatch): boolean {
    const effector = this.world.getComponent(id, 'areaEffector');
    const physStats = this.world.getComponent(id, 'physicsStats');
    if (!effector) return false;

    Object.assign(effector, patch);
    if (patch.radius !== undefined) {
      if (physStats && physStats.radius.base !== patch.radius) {
        setBaseStat(physStats.radius, patch.radius);
      }
      const shape = this.world.getComponent(id, 'zoneShape');
      if (shape) {
        shape.radius = patch.radius;
        shape.width = patch.radius * 2;
        shape.depth = patch.radius * 2;
      }
    }
    return true;
  }

  public updateEntityWeapon(id: string, patch: WeaponMutationPatch): boolean {
    const item = this.world.getComponent(id, 'item');
    const wStats = this.world.getComponent(id, 'weaponStats');
    const wZone = this.world.getComponent(id, 'weaponZone');
    let changed = false;

    if (item && item.type === 'weapon') {
      if (patch.size !== undefined && item.size !== patch.size) {
        item.size = patch.size;
        changed = true;
      }
      if (
        patch.equipTypes !== undefined &&
        JSON.stringify(item.equipTypes) !== JSON.stringify(patch.equipTypes)
      ) {
        item.equipTypes = [...patch.equipTypes];
        changed = true;
      }
      if (patch.equippable !== undefined && item.equippable !== patch.equippable) {
        item.equippable = patch.equippable;
        changed = true;
      }
      if (
        patch.equipTimeMultiplier !== undefined &&
        item.equipTimeMultiplier !== patch.equipTimeMultiplier
      ) {
        item.equipTimeMultiplier = patch.equipTimeMultiplier;
        changed = true;
      }
    }

    if (wStats) {
      if (patch.baseDamage !== undefined && wStats.baseDamage.base !== patch.baseDamage) {
        setBaseStat(wStats.baseDamage, patch.baseDamage);
        changed = true;
      }
      if (patch.prepTime !== undefined && wStats.prepTime.base !== patch.prepTime) {
        setBaseStat(wStats.prepTime, patch.prepTime);
        changed = true;
      }
      if (patch.recoveryTime !== undefined && wStats.recoveryTime.base !== patch.recoveryTime) {
        setBaseStat(wStats.recoveryTime, patch.recoveryTime);
        changed = true;
      }
    }

    if (wZone) {
      if (patch.hitZoneType !== undefined) wZone.hitZoneType = patch.hitZoneType;
      if (patch.radius !== undefined) wZone.radius = patch.radius;
      if (patch.length !== undefined) wZone.length = patch.length;
      if (patch.angle !== undefined) wZone.angle = deg2Rad(patch.angle);
      if (patch.rayCount !== undefined) wZone.rayCount = patch.rayCount;
      if (patch.pierceObstacles !== undefined) wZone.pierceObstacles = patch.pierceObstacles;
      if (patch.pierceCreatures !== undefined) wZone.pierceCreatures = patch.pierceCreatures;
      if (patch.pierceItems !== undefined) wZone.pierceItems = patch.pierceItems;
      changed = true;
    }
    return changed;
  }

  public updateEntityArmor(id: string, patch: ArmorMutationPatch): boolean {
    const item = this.world.getComponent(id, 'item');
    const aStats = this.world.getComponent(id, 'armorStats');
    const meta = this.world.getComponent(id, 'meta');
    let changed = false;

    if (item && item.type === 'armor') {
      if (patch.size !== undefined && item.size !== patch.size) {
        item.size = patch.size;
        changed = true;
      }
      if (
        patch.equipTypes !== undefined &&
        JSON.stringify(item.equipTypes) !== JSON.stringify(patch.equipTypes)
      ) {
        item.equipTypes = [...patch.equipTypes];
        changed = true;
      }
      if (patch.equippable !== undefined && item.equippable !== patch.equippable) {
        item.equippable = patch.equippable;
        changed = true;
      }
      if (
        patch.equipTimeMultiplier !== undefined &&
        item.equipTimeMultiplier !== patch.equipTimeMultiplier
      ) {
        item.equipTimeMultiplier = patch.equipTimeMultiplier;
        changed = true;
      }
    }

    if (aStats) {
      if (patch.defense !== undefined && aStats.defense.base !== patch.defense) {
        setBaseStat(aStats.defense, patch.defense);
        changed = true;
      }
      if (patch.flatReduction !== undefined && aStats.flatReduction.base !== patch.flatReduction) {
        setBaseStat(aStats.flatReduction, patch.flatReduction);
        changed = true;
      }
    } else if (meta?.entityType === 'creature') {
      let selfArmor = this.world.getComponent(id, 'armorStats');
      if (!selfArmor) {
        this.world.addComponent(id, 'armorStats', {
          defense: { base: 0, current: 0 },
          flatReduction: { base: 0, current: 0 },
        });
        selfArmor = this.world.getComponent(id, 'armorStats');
      }
      if (selfArmor) {
        if (patch.defense !== undefined && selfArmor.defense.base !== patch.defense) {
          setBaseStat(selfArmor.defense, patch.defense);
          changed = true;
        }
        if (
          patch.flatReduction !== undefined &&
          selfArmor.flatReduction.base !== patch.flatReduction
        ) {
          setBaseStat(selfArmor.flatReduction, patch.flatReduction);
          changed = true;
        }
      }
    }
    return changed;
  }

  public updateEntityGenericItem(id: string, patch: GenericItemMutationPatch): boolean {
    const item = this.world.getComponent(id, 'item');
    if (!item) return false;
    let changed = false;

    if (patch.size !== undefined && item.size !== patch.size) {
      item.size = patch.size;
      changed = true;
    }
    if (
      patch.equipTypes !== undefined &&
      JSON.stringify(item.equipTypes) !== JSON.stringify(patch.equipTypes)
    ) {
      item.equipTypes = [...patch.equipTypes];
      changed = true;
    }
    if (patch.equippable !== undefined && item.equippable !== patch.equippable) {
      item.equippable = patch.equippable;
      changed = true;
    }
    if (
      patch.equipTimeMultiplier !== undefined &&
      item.equipTimeMultiplier !== patch.equipTimeMultiplier
    ) {
      item.equipTimeMultiplier = patch.equipTimeMultiplier;
      changed = true;
    }
    return changed;
  }

  public updateEntityHeart(id: string, patch: { requiresBrain?: boolean }): boolean {
    const heart = this.world.getComponent(id, 'heart');
    if (!heart) return false;
    let changed = false;
    if (patch.requiresBrain !== undefined && heart.requiresBrain !== patch.requiresBrain) {
      heart.requiresBrain = patch.requiresBrain;
      changed = true;
    }
    return changed;
  }

  public updateEntityVision(
    id: string,
    patch: { fovAngle?: number; clarity?: number; maxDistance?: number }
  ): boolean {
    const vision = this.world.getComponent(id, 'vision');
    if (!vision) return false;
    let changed = false;
    if (patch.fovAngle !== undefined && vision.fovAngle.base !== patch.fovAngle) {
      setBaseStat(vision.fovAngle, patch.fovAngle);
      changed = true;
    }
    if (patch.clarity !== undefined && vision.clarity.base !== patch.clarity) {
      setBaseStat(vision.clarity, patch.clarity);
      changed = true;
    }
    if (patch.maxDistance !== undefined && vision.maxDistance.base !== patch.maxDistance) {
      setBaseStat(vision.maxDistance, patch.maxDistance);
      changed = true;
    }
    return changed;
  }

  public updateEntityHearing(
    id: string,
    patch: { sensitivity?: number; maxDistance?: number }
  ): boolean {
    const hearing = this.world.getComponent(id, 'hearing');
    if (!hearing) return false;
    let changed = false;
    if (patch.sensitivity !== undefined && hearing.sensitivity.base !== patch.sensitivity) {
      setBaseStat(hearing.sensitivity, patch.sensitivity);
      changed = true;
    }
    if (patch.maxDistance !== undefined && hearing.maxDistance.base !== patch.maxDistance) {
      setBaseStat(hearing.maxDistance, patch.maxDistance);
      changed = true;
    }
    return changed;
  }

  public updateEntityBag(id: string, patch: BagMutationPatch, isBagEmpty: boolean): boolean {
    const item = this.world.getComponent(id, 'item');
    const inv = this.world.getComponent(id, 'inventory');
    let changed = false;

    if (item) {
      if (patch.size !== undefined && item.size !== patch.size) {
        item.size = patch.size;
        changed = true;
      }
      if (
        patch.equipTypes !== undefined &&
        JSON.stringify(item.equipTypes) !== JSON.stringify(patch.equipTypes)
      ) {
        item.equipTypes = [...patch.equipTypes];
        changed = true;
      }
      if (patch.equippable !== undefined && item.equippable !== patch.equippable) {
        item.equippable = patch.equippable;
        changed = true;
      }
      if (
        patch.equipTimeMultiplier !== undefined &&
        item.equipTimeMultiplier !== patch.equipTimeMultiplier
      ) {
        item.equipTimeMultiplier = patch.equipTimeMultiplier;
        changed = true;
      }
    }

    if (inv && isBagEmpty && patch.width !== undefined && patch.height !== undefined) {
      const newWidth = patch.width;
      const newHeight = patch.height;
      if (inv.size.width !== newWidth || inv.size.height !== newHeight) {
        inv.size = { width: newWidth, height: newHeight };
        inv.slots = Array.from({ length: newHeight }, () =>
          Array.from({ length: newWidth }, () => ({ itemId: null, count: 0 }))
        );
        changed = true;
      }
    }
    return changed;
  }

  public updateEntityInteractionSlot(
    partOrCreatureId: string,
    patch: { name?: string; interactDist?: number; strength?: number; slotKind?: string }
  ): boolean {
    const slot = this.world.getComponent(partOrCreatureId, 'interactionSlots');
    if (!slot) return false;
    let changed = false;
    if (patch.name !== undefined && slot.name !== patch.name) {
      slot.name = patch.name;
      changed = true;
    }
    if (patch.interactDist !== undefined && slot.interactDist !== patch.interactDist) {
      slot.interactDist = patch.interactDist;
      changed = true;
    }
    if (patch.strength !== undefined && slot.strength !== patch.strength) {
      slot.strength = patch.strength;
      changed = true;
    }
    if (patch.slotKind !== undefined && slot.slotKind !== patch.slotKind) {
      slot.slotKind = patch.slotKind;
      changed = true;
    }
    return changed;
  }

  public updateEquipmentArea(
    containerId: string,
    areaId: string,
    patch: { name?: string; space?: number; type?: string }
  ): boolean {
    const equip = this.world.getComponent(containerId, 'equip');
    const area = equip?.equipmentAreas.find((a) => a.id === areaId);
    if (!area) return false;
    let changed = false;
    if (patch.name !== undefined && area.name !== patch.name) {
      area.name = patch.name;
      changed = true;
    }
    if (patch.space !== undefined && area.space !== patch.space) {
      area.space = patch.space;
      changed = true;
    }
    if (patch.type !== undefined && area.type !== patch.type) {
      area.type = patch.type;
      changed = true;
    }
    return changed;
  }

  public addEquipmentArea(
    containerId: string,
    defaultType: string = 'new_equip_type',
    defaultName: string = 'Новая область',
    space?: number
  ): string {
    const tag = this.world.getComponent(containerId, 'tag');
    const meta = this.world.getComponent(containerId, 'meta');
    const arch = tag?.archetype ?? meta?.entityType;

    // Области экипировки логически разрешены ТОЛЬКО предметам и частям тел
    if (arch !== 'item' && arch !== 'bodyPart') {
      return '';
    }

    let targetEquip = this.world.getComponent(containerId, 'equip');
    if (!targetEquip) {
      targetEquip = { equipmentAreas: [] };
      this.world.addComponent(containerId, 'equip', targetEquip);
    }
    const partSize = space ?? this.world.getComponent(containerId, 'physicsStats')?.size ?? 10;
    const areaId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    targetEquip.equipmentAreas.push({
      id: areaId,
      name: defaultName,
      type: defaultType,
      space: partSize,
      itemIds: [],
    });
    return areaId;
  }

  public removeEquipmentArea(containerId: string, areaId: string): boolean {
    const equip = this.world.getComponent(containerId, 'equip');
    if (!equip) return false;
    const idx = equip.equipmentAreas.findIndex((a) => a.id === areaId);
    if (idx === -1) return false;
    if (equip.equipmentAreas[idx].itemIds.length > 0) return false;
    equip.equipmentAreas.splice(idx, 1);
    return true;
  }

  public setEntityInventoryGrid(id: string, enable: boolean): boolean {
    const tag = this.world.getComponent(id, 'tag');
    const meta = this.world.getComponent(id, 'meta');
    const arch = tag?.archetype ?? meta?.entityType;

    if (enable) {
      // Сетка инвентаря разрешена ТОЛЬКО предметам (сумкам) и препятствиям (ящикам/сундукам)
      if (arch !== 'item' && arch !== 'obstacle') {
        return false;
      }

      if (this.world.getComponent(id, 'inventory')) return false;
      this.world.addComponent(id, 'inventory', {
        size: { width: 4, height: 2 },
        slots: Array.from({ length: 2 }, () =>
          Array.from({ length: 4 }, () => ({ itemId: null, count: 0 }))
        ),
      });
      return true;
    } else {
      const inv = this.world.getComponent(id, 'inventory');
      if (!inv) return false;
      const isEmpty = inv.slots.every((row) => row.every((cell) => !cell.itemId));
      if (!isEmpty) return false;
      this.world.removeComponent(id, 'inventory');
      return true;
    }
  }

  public addEntityInteractionSlot(
    partId: string,
    defaultName: string = 'Новая рука',
    interactDist: number = 1.5,
    strength: number = 15,
    slotKind: string = 'left_hand'
  ): boolean {
    if (this.world.getComponent(partId, 'interactionSlots')) return false;

    const slotId = `slot_${Date.now().toString(36).substring(2, 6)}`;
    this.world.addComponent(partId, 'interactionSlots', {
      id: slotId,
      name: defaultName,
      interactDist,
      strength,
      itemId: null,
      slotKind,
    });
    return true;
  }

  public removeEntityInteractionSlot(partId: string): boolean {
    const slot = this.world.getComponent(partId, 'interactionSlots');
    if (!slot) return false;
    if (slot.itemId !== null) return false;

    this.world.removeComponent(partId, 'interactionSlots');
    return true;
  }

  public updateEntityEnvironment(id: string, patch: Partial<EnvironmentComponent>): boolean {
    const env = this.world.getComponent(id, 'environment');
    if (!env) return false;
    Object.assign(env, patch);
    return true;
  }

  public updateEntityWater(id: string, patch: Partial<WaterComponent>): boolean {
    const water = this.world.getComponent(id, 'water');
    const physStats = this.world.getComponent(id, 'physicsStats');
    if (!water) return false;

    Object.assign(water, patch);

    if (patch.width !== undefined || patch.depth !== undefined) {
      const w = water.width;
      const d = water.depth;
      const r = Math.max(w, d) / 2;
      if (physStats) {
        setBaseStat(physStats.radius, r);
        if (physStats.points) {
          physStats.points = createRectanglePoints(w, d);
        }
      }
    }

    if (patch.maxDepth !== undefined && physStats) {
      setBaseStat(physStats.height, patch.maxDepth);
    }

    return true;
  }

  public updateEntityZoneShape(
    id: string,
    patch: Partial<import('../ecs/components/zone').ZoneShapeComponent>
  ): boolean {
    let shape = this.world.getComponent(id, 'zoneShape');
    if (!shape) {
      const effector = this.world.getComponent(id, 'areaEffector');
      const r = effector?.radius ?? 2.5;
      shape = {
        shapeType: 'cylinder',
        radius: r,
        height: 2.5,
        width: r * 2,
        depth: r * 2,
      };
      this.world.addComponent(id, 'zoneShape', shape);
    }

    Object.assign(shape, patch);

    const effector = this.world.getComponent(id, 'areaEffector');
    if (effector && patch.radius !== undefined) {
      effector.radius = patch.radius;
    }

    const physStats = this.world.getComponent(id, 'physicsStats');
    if (physStats && patch.radius !== undefined) {
      setBaseStat(physStats.radius, patch.radius);
    }

    return true;
  }

  public updateEntityGameplayZone(
    id: string,
    patch: Partial<import('../ecs/components/zone').GameplayZoneComponent>
  ): boolean {
    const zone = this.world.getComponent(id, 'gameplayZone');
    if (!zone) return false;
    Object.assign(zone, patch);
    return true;
  }
}
