import { Vec3, Radians } from '../types';
import { Blackboard, AttackStatus } from './core';

export interface HeadLimits {
  minYaw: Radians;
  maxYaw: Radians;
  minPitch: Radians;
  maxPitch: Radians;
  turnBodyFollowRatio: number;
  turnBodyStopRatio: number;
}

export interface InteractionSlotInfo {
  globalSlotIndex: number;
  partId: string;
  slotKind: string;
  itemId: string | null;
  interactDist: number;
  strength: number;
  isBroken: boolean;
}

export interface ActiveInteraction {
  type: string; // 'pickup' | 'equip' | 'unequip' | 'drop' | 'throw'
  phase?: string;
  targetId?: string;
}

export interface FetchStickInfo {
  id: string;
  pos: Vec3;
  state: string; // 'held_by_master' | 'thrown' | 'held_by_dog' | 'delivered'
  ownerId?: string;
}

export interface IAIWorld {
  getAgent(id: string): IAIAgent | undefined;
  getAllAgents(): IAIAgent[];
  getAgentsByBehavior(behaviorId: string): IAIAgent[];
  getPath(start: Vec3, end: Vec3, radius?: number): Promise<Vec3[]>;

  getEntityPos(id: string): Vec3 | null;
  getEntityHeight(id: string): number;
  getEntityRadius(id: string): number;
  isEntityAlive(id: string): boolean;
  getEntityOwnerId(id: string): string | null;

  // Глобальные сенсоры мира
  getTerrainHeight(x: number, z: number): number | null;
  getPressedKeys(): string[];

  // Специфичные игровые запросы (заменяют прямые выборки ECS-компонентов)
  findFetchSticks(masterId: string): FetchStickInfo[];
  isEntityInZone(entityId: string, zoneId: string): boolean;
  getRandomPointInZone(zoneId: string): Vec3 | null;
}

export interface IAIAgent {
  readonly id: string;
  readonly dt: number;
  readonly blackboard: Blackboard;
  readonly isAlive: boolean;
  readonly world: IAIWorld;

  // Чтение базовых параметров (Сенсоры)
  getPos(): Vec3;
  getAngle(): Radians;
  getHeadYaw(): Radians;
  getPhysicsRadius(): number;
  getPhysicsHeight(): number;
  getHeadLimits(): HeadLimits | null;

  getSenseStats(): {
    visionFovAngle: number;
    visionClarity: number;
    visionMaxDist: number;
    hearingSensitivity: number;
    hearingMaxDist: number;
  } | null;
  getBehaviorStats(): {
    detectDist: number;
    loseTargetDist: number;
    followStopDist: number;
    followUpDist: number;
  } | null;
  getHp(): number;
  getMaxHp(): number;

  // Сенсоры экипировки и взаимодействия
  getInteractionSlots(): InteractionSlotInfo[];
  isSlotBusy(slotIndex: number): boolean;
  getAttackStatus(): AttackStatus;
  hasPendingAttackRequest(): boolean;
  getCurrentInteraction(): ActiveInteraction | null;
  readonly isInDialogue: boolean;
  getDialoguePartnerId(): string | null;

  // Актуаторы: Движение
  clearMoveTarget(): void;
  setMoveTarget(dx: number, dz: number, run?: boolean, slowWalk?: boolean): void;
  intentJump(): void;

  // Актуаторы: Взгляд и корпус
  setLookTarget(yaw: Radians, pitch?: Radians): void;
  clearLookTarget(): void;
  setBodyAngleTarget(yaw: Radians): void;
  clearBodyAngleTarget(): void;

  // Актуаторы: Поза
  setStance(stance: 'standing' | 'crouching' | 'prone'): void;

  // Актуаторы: Взаимодействие
  intentAttack(slotIndex?: number, slotKind?: string): void;
  cancelAttack(slotIndex?: number): void;
  intentPickupItem(targetId: string): void;
  intentDropItem(slotIndex: number): void;
  intentThrowItem(slotIndex: number, partId: string, targetPos: Vec3): void;
}
