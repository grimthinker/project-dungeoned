import { EntityId } from './base';
import { Vec3 } from '../../types';
import { Radians } from '../../utils';
import { t } from '../../locales';

export type ItemType = 'weapon' | 'armor' | 'bag' | 'bodyPart' | 'resource' | 'consumable' | 'ammo';

export interface ItemData {
  name: string;
  type: ItemType;
  icon?: string;
  maxStack: number;
  count: number;
  size: number;
  equipTypes: string[];
  equippable: boolean;
  equipTimeMultiplier: number;
}

export type ItemConfig = Omit<ItemData, 'count'> & { count?: number };
export type ItemComponent = ItemData;

export interface InventorySlot {
  itemId: EntityId | null;
  count: number;
}

export type InventorySize = {
  width: number;
  height: number;
};

export interface InventoryComponent {
  size: InventorySize;
  slots: InventorySlot[][];
}

export interface InventorySetup {
  size: InventorySize;
  slots?: InventorySlot[][];
}

export type InteractionSlotKind = 'left_hand' | 'right_hand' | 'jaws' | string;

export interface InteractionSlot {
  id: string;
  name: string;
  interactDist: number;
  strength: number;
  itemId: EntityId | null;
  rigSocketName?: string;
  slotKind?: InteractionSlotKind;
}

export type InteractionSlotsComponent = InteractionSlot;

export const STANDARD_EQUIPMENT_AREA_TYPES = [
  'head',
  'neck',
  'torso',
  'hands',
  'legs',
  'feet',
  'waist',
  'belt_slot',
  'sheath',
  'holster',
  'sling',
  'pouch',
] as const;

export type StandardEquipmentAreaType = (typeof STANDARD_EQUIPMENT_AREA_TYPES)[number];

export const EQUIPMENT_AREA_TYPE_LABELS: Record<string, string> = {
  get head() {
    return t('equipmentAreas.head');
  },
  get neck() {
    return t('equipmentAreas.neck');
  },
  get torso() {
    return t('equipmentAreas.torso');
  },
  get hands() {
    return t('equipmentAreas.hands');
  },
  get legs() {
    return t('equipmentAreas.legs');
  },
  get feet() {
    return t('equipmentAreas.feet');
  },
  get waist() {
    return t('equipmentAreas.waist');
  },
  get belt_slot() {
    return t('equipmentAreas.belt_slot');
  },
  get sheath() {
    return t('equipmentAreas.sheath');
  },
  get holster() {
    return t('equipmentAreas.holster');
  },
  get sling() {
    return t('equipmentAreas.sling');
  },
  get pouch() {
    return t('equipmentAreas.pouch');
  },
};

export interface EquipmentArea {
  id: string;
  name: string;
  type: string;
  space: number;
  itemIds: EntityId[];
}

export interface EquipmentComponent {
  equipmentAreas: EquipmentArea[];
}

export type InteractionPhase =
  | 'reach'
  | 'lift'
  | 'abort_reach'
  | 'abort_lift'
  | 'drop_prep'
  | 'drop_recovery'
  | 'abort_drop'
  | 'throw_turn'
  | 'throw_prep'
  | 'throw_recovery'
  | 'abort_throw';

export interface InteractionActionComponent {
  type: 'pickup' | 'equip' | 'unequip' | 'drop' | 'throw';
  targetId?: string;
  slotIndex?: number;
  partId?: string;
  areaId?: string;
  containerId?: EntityId;
  timer: number;
  totalDuration: number;
  phase?: InteractionPhase;
  targetItemPos?: Vec3;
  elapsedInReach?: number;
  wantsCancel?: boolean;
  relativeDist?: number;
  relativeAngle?: Radians;
  abortStartProgress?: number;
  slotKind?: InteractionSlotKind;
}

export interface PickupIntentComponent {
  targetItemId: EntityId;
}

export interface DropItemIntentComponent {
  slotIndex: number;
}

export interface DroppedItemIntentComponent {
  position?: Vec3;
}

export interface OwnershipComponent {
  ownerId: EntityId;
  status: 'equipped' | 'inventory';
}

export interface ThrowItemIntentComponent {
  slotIndex: number;
  partId: string;
  targetPos: Vec3;
}

export interface ThrownObjectComponent {
  throwerId: string;
  timestamp: number;
  isAirborne: boolean;
}
