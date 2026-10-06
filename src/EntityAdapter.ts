import { World } from './ecs/World';
import { EntityId } from './ecs/types';
import { IAIAgent, IAIWorld, HeadLimits, InteractionSlotInfo, ActiveInteraction } from './ai/ports';
import { Blackboard, AttackStatus } from './ai/core';
import { Vec3, Radians } from './types';
import { getEffectiveLogicBrain } from './ecs/utils/anatomy';
import { getAggregatedInteractionSlots } from './ecs/utils/hierarchy';
import { LOGIC_CONFIG } from './ai/config';
import { CREATURE_BLUEPRINTS, BodyStructureType } from './ecs/templates';
import { BALANCE_CONFIG } from './config/balanceConfig';

export class EntityAdapter implements IAIAgent {
  public dt: number = 0;

  constructor(
    public readonly id: EntityId,
    public readonly worldEcs: World,
    public readonly world: IAIWorld
  ) {}

  public get isAlive(): boolean {
    return this.worldEcs.getComponent(this.id, 'health')?.isAlive ?? false;
  }

  public get brain() {
    return getEffectiveLogicBrain(this.worldEcs, this.id);
  }

  public get blackboard(): Blackboard {
    return this.brain!.blackboard;
  }

  public getEventQueue() {
    return this.brain?.event_queue ?? [];
  }

  public get timeScaleMultiplier(): number {
    return this.worldEcs.getComponent(this.id, 'timeScale')?.multiplier.current ?? 1.0;
  }

  // === СЕНСОРЫ ===

  public getPos(): Vec3 {
    const t = this.worldEcs.getComponent(this.id, 'transform');
    return t ? { x: t.x, y: t.y, z: t.z } : { x: 0, y: 0, z: 0 };
  }

  public getAngle(): Radians {
    return this.worldEcs.getComponent(this.id, 'transform')?.angle ?? (0 as Radians);
  }

  public getHeadYaw(): Radians {
    return this.worldEcs.getComponent(this.id, 'headOrientation')?.yaw ?? this.getAngle();
  }

  public getPhysicsRadius(): number {
    return this.worldEcs.getComponent(this.id, 'physicsStats')?.radius.current ?? 0.4;
  }

  public getPhysicsHeight(): number {
    return this.worldEcs.getComponent(this.id, 'physicsStats')?.height?.current ?? 1.8;
  }

  public getHeadLimits(): HeadLimits | null {
    const animator = this.worldEcs.getComponent(this.id, 'animator');
    if (!animator) return null;
    const limits = CREATURE_BLUEPRINTS[animator.rigType as BodyStructureType]?.headLimits;
    if (!limits) return null;
    return {
      ...limits,
      turnBodyFollowRatio: BALANCE_CONFIG.creature.headTurnBodyFollowRatio,
      turnBodyStopRatio: BALANCE_CONFIG.creature.headTurnBodyStopRatio,
    };
  }

  public getSenseStats() {
    const p = this.worldEcs.getComponent(this.id, 'perception');
    if (!p) return null;
    return {
      visionFovAngle: p.visionFovAngle,
      visionClarity: p.visionClarity,
      visionMaxDist: p.visionMaxDistance,
      hearingSensitivity: p.hearingSensitivity,
      hearingMaxDist: p.hearingMaxDistance,
    };
  }

  public getBehaviorStats() {
    const s = this.worldEcs.getComponent(this.id, 'aiStats')?.stats;
    return s
      ? {
          detectDist: s.detectDist ?? LOGIC_CONFIG.detectDist,
          loseTargetDist: s.loseTargetDist ?? LOGIC_CONFIG.loseTargetDist,
          followStopDist: s.followStopDist ?? LOGIC_CONFIG.followStopDist,
          followUpDist: s.followUpDist ?? LOGIC_CONFIG.followUpDist,
        }
      : null;
  }

  public getHp(): number {
    return this.worldEcs.getComponent(this.id, 'health')?.current ?? 0;
  }

  public getMaxHp(): number {
    return this.worldEcs.getComponent(this.id, 'health')?.max.current ?? 0;
  }

  public getInteractionSlots(): InteractionSlotInfo[] {
    const agg = getAggregatedInteractionSlots(this.worldEcs, this.id);
    return agg.map((a) => ({
      globalSlotIndex: a.globalSlotIndex,
      partId: a.partId,
      slotKind: a.slot.slotKind ?? 'left_hand',
      itemId: a.slot.itemId,
      interactDist: a.slot.interactDist,
      strength: a.slot.strength,
      isBroken: a.isBroken,
    }));
  }

  public isSlotBusy(slotIndex: number): boolean {
    const atk = this.worldEcs.getComponent(this.id, 'activeAttacks');
    return atk?.attacks.some((a) => a.slotIndex === slotIndex) ?? false;
  }

  public getAttackStatus(): AttackStatus {
    const atk = this.worldEcs.getComponent(this.id, 'activeAttacks');
    const current = atk?.attacks[0];
    if (!current) return 'idle';
    return current.phase === 'prep' || current.phase === 'cast' ? 'attacking' : 'cooldown';
  }

  public hasPendingAttackRequest(): boolean {
    return this.worldEcs.getComponent(this.id, 'input')?.wantsAttack ?? false;
  }

  public getCurrentInteraction(): ActiveInteraction | null {
    const act = this.worldEcs.getComponent(this.id, 'interactionAction');
    return act ? { type: act.type, phase: act.phase, targetId: act.targetId } : null;
  }

  public get isInDialogue(): boolean {
    return this.worldEcs.getComponent(this.id, 'inDialogue') !== undefined;
  }

  public getDialoguePartnerId(): string | null {
    return this.worldEcs.getComponent(this.id, 'inDialogue')?.withEntityId ?? null;
  }

  // === АКТУАТОРЫ ===

  public clearMoveTarget(): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.desiredMoveVector = null;
      input.moveForward = 0;
      input.moveStrafe = 0;
      input.isMovingForward = false;
      input.isRunning = false;
      input.isSlowWalking = false;
    }
  }

  public setMoveTarget(dx: number, dz: number, run?: boolean, slowWalk?: boolean): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.desiredMoveVector = { x: dx, z: dz };
      if (run !== undefined) input.isRunning = run;
      if (slowWalk !== undefined) input.isSlowWalking = slowWalk;
    }
  }

  public setLookTarget(yaw: Radians, pitch?: Radians): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.targetLookAngle = yaw;
      if (pitch !== undefined) input.targetLookPitch = pitch;
    }
  }

  public clearLookTarget(): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.targetLookAngle = undefined;
      input.targetLookPitch = undefined;
    }
  }

  public setBodyAngleTarget(yaw: Radians): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) input.desiredBodyAngle = yaw;
  }

  public clearBodyAngleTarget(): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.desiredBodyAngle = undefined;
      input.turnDirection = 0;
      input.turnRatio = 0;
    }
  }

  public setStance(stance: 'standing' | 'crouching' | 'prone'): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) input.desiredStance = stance;
  }

  public intentAttack(slotIndex?: number, slotKind?: string): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.wantsAttack = true;
      input.attackSlotIndex = slotIndex;
      input.attackSlotKind = slotKind;
    }
  }

  public cancelAttack(slotIndex?: number): void {
    const input = this.worldEcs.getComponent(this.id, 'input');
    if (input) {
      input.wantsAttack = false;
      if (slotIndex !== undefined && input.attackSlotIndex === slotIndex) {
        input.attackSlotIndex = undefined;
      }
    }
    const activeAttacks = this.worldEcs.getComponent(this.id, 'activeAttacks');
    if (activeAttacks) {
      if (slotIndex !== undefined) {
        activeAttacks.attacks = activeAttacks.attacks.filter((a) => a.slotIndex !== slotIndex);
      } else {
        activeAttacks.attacks = [];
      }
    }
  }

  public intentPickupItem(targetId: string): void {
    this.worldEcs.addComponent(this.id, 'pickupIntent', { targetItemId: targetId });
  }

  public intentDropItem(slotIndex: number): void {
    this.worldEcs.addComponent(this.id, 'dropItemIntent', { slotIndex });
  }

  public intentThrowItem(slotIndex: number, partId: string, targetPos: Vec3): void {
    this.worldEcs.addComponent(this.id, 'throwItemIntent', { slotIndex, partId, targetPos });
  }
}
