import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { applyDamage } from '../utils/health';
import { getAllEquippedDescendants, getAggregatedInteractionSlots } from '../utils/hierarchy';
import { applyWeaponDamageToCreature } from '../utils/anatomyDamage';
import { getPartStatus, PartStatus } from '../utils/anatomyStatus';

export class AttackSystem {
  public update(dt: number, world: World, physics: PhysicsSystem): void {
    // В новой архитектуре слоты могут быть на частях тела, поэтому запрашиваем корневые сущности с activeAttacks
    const entities = world.getEntitiesWith('activeAttacks', 'health', 'input');

    for (const [id, { activeAttacks, health, input }] of entities) {
      if (!health.isAlive) continue;

      // Запрет параллельных атак: одновременно может выполняться строго одна атака
      if (activeAttacks.attacks.length > 0) {
        input.wantsAttack = false;
        input.attackSlotIndex = undefined;
        input.attackSlotKind = undefined;
      } else if (input.wantsAttack && !input.isRunning) {
        const aggSlots = getAggregatedInteractionSlots(world, id);
        let chosenGlobalIndex = -1;

        if (input.attackSlotKind !== undefined) {
          chosenGlobalIndex = aggSlots.findIndex((info) => {
            if (info.isBroken || info.slot.itemId === null) return false;
            if ((info.slot.slotKind ?? 'left_hand') !== input.attackSlotKind) return false;
            const item = world.getComponent(info.slot.itemId, 'item');
            return item?.type === 'weapon';
          });
        } else if (input.attackSlotIndex !== undefined) {
          const slotInfo = aggSlots[input.attackSlotIndex];
          if (slotInfo && !slotInfo.isBroken && slotInfo.slot.itemId !== null) {
            const item = world.getComponent(slotInfo.slot.itemId, 'item');
            if (item?.type === 'weapon') {
              chosenGlobalIndex = input.attackSlotIndex;
            }
          }
        } else {
          chosenGlobalIndex = aggSlots.findIndex((info) => {
            if (info.isBroken || info.slot.itemId === null) return false;
            const item = world.getComponent(info.slot.itemId, 'item');
            return item?.type === 'weapon';
          });
        }

        if (chosenGlobalIndex !== -1) {
          const weaponSlotInfo = aggSlots[chosenGlobalIndex];
          const weaponId = weaponSlotInfo.slot.itemId!;
          const wStats = world.getComponent(weaponId, 'weaponStats');

          if (wStats) {
            const prepTime = wStats.prepTime.current;
            activeAttacks.attacks.push({
              weaponId,
              slotIndex: chosenGlobalIndex,
              partId: weaponSlotInfo.partId,
              slotKind: weaponSlotInfo.slot.slotKind ?? 'left_hand',
              phase: 'prep',
              timer: prepTime,
              totalDuration: prepTime,
            });
          }
        }

        input.wantsAttack = false;
        input.attackSlotIndex = undefined;
        input.attackSlotKind = undefined;
      }

      for (let i = activeAttacks.attacks.length - 1; i >= 0; i--) {
        const atk = activeAttacks.attacks[i];

        // Прерывание атаки, если рука была повреждена или уничтожена в процессе замаха/удара
        if (atk.partId) {
          const partStatus = getPartStatus(world, atk.partId);
          if (partStatus !== PartStatus.INTACT) {
            activeAttacks.attacks.splice(i, 1);
            continue;
          }
        }

        let isStillEquipped = false;
        if (atk.partId) {
          const slotsComp = world.getComponent(atk.partId, 'interactionSlots');
          if (slotsComp) {
            isStillEquipped = slotsComp.itemId === atk.weaponId;
          }
        } else {
          const slotsComp = world.getComponent(id, 'interactionSlots');
          if (slotsComp) {
            isStillEquipped = slotsComp.itemId === atk.weaponId;
          }
        }

        const wStats = isStillEquipped
          ? world.getComponent(atk.weaponId, 'weaponStats')
          : undefined;

        if (!isStillEquipped || !wStats) {
          activeAttacks.attacks.splice(i, 1);
          continue;
        }

        const ts = world.getComponent(id, 'timeScale')?.multiplier.current ?? 1.0;
        const localDt = dt * ts;

        const castTime = wStats.castTime.current;
        const recoveryTime = wStats.recoveryTime.current;

        atk.timer -= localDt;

        if (atk.timer <= 0) {
          if (atk.phase === 'prep') {
            if (castTime > 0) {
              atk.phase = 'cast';
              atk.timer = castTime;
              atk.totalDuration = castTime;
            } else {
              this.executeHit(id, atk.weaponId, world, physics);
              atk.phase = 'recovery';
              atk.timer = recoveryTime;
              atk.totalDuration = recoveryTime;
            }
          } else if (atk.phase === 'cast') {
            this.executeHit(id, atk.weaponId, world, physics);
            atk.phase = 'recovery';
            atk.timer = recoveryTime;
            atk.totalDuration = recoveryTime;
          } else {
            activeAttacks.attacks.splice(i, 1);
          }
        }
      }
    }
  }

  private executeHit(
    attackerId: string,
    weaponId: string,
    world: World,
    physics: PhysicsSystem
  ): void {
    const wStats = world.getComponent(weaponId, 'weaponStats');
    const wZone = world.getComponent(weaponId, 'weaponZone');

    if (!wStats || !wZone) return;

    const targetIds = physics.checkWeaponHits(attackerId, wZone, world);

    const baseDamage = wStats.baseDamage.current;
    const minMultiplier = wStats.minMultiplier;
    const maxMultiplier = wStats.maxMultiplier;
    const critChance = wStats.critChance;
    const critMultiplier = wStats.critMultiplier;

    for (const targetId of targetIds) {
      const targetHealth = world.getComponent(targetId, 'health');
      if (!targetHealth || !targetHealth.isAlive) continue;

      const mult = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);
      let rawDamage = baseDamage * mult;
      if (Math.random() < critChance) {
        rawDamage *= critMultiplier;
      }

      const tag = world.getComponent(targetId, 'tag');
      const hasAnatomy =
        world.getComponent(targetId, 'assemblyRoot') ||
        world.getComponent(targetId, 'socketDef') ||
        tag?.archetype === 'creature';

      if (hasAnatomy) {
        applyWeaponDamageToCreature(world, targetId, rawDamage);
      } else {
        // Учет брони для обычных предметов/препятствий
        let defense = 0;
        let flatReduction = 0;

        const selfArmor = world.getComponent(targetId, 'armorStats');
        if (selfArmor) {
          defense += selfArmor.defense.current;
          flatReduction += selfArmor.flatReduction.current;
        }

        const allEquippedItemIds = getAllEquippedDescendants(world, targetId);
        for (const itemId of allEquippedItemIds) {
          const aStats = world.getComponent(itemId, 'armorStats');
          if (aStats) {
            defense += aStats.defense.current;
            flatReduction += aStats.flatReduction.current;
          }
        }

        const mitigatedDamage = rawDamage * (1 - Math.min(0.9, Math.max(0, defense / 100)));
        const finalDamage = Math.max(0, Math.round(mitigatedDamage - flatReduction));

        applyDamage(world, targetId, finalDamage);
      }
    }
  }
}
