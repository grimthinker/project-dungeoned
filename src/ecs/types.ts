import { BTLogicComponent } from '../ai/core';
import { Point } from '../types';

export * from './components/base';
export * from './components/stats';
export * from './components/physics';
export * from './components/movement';
export * from './components/combat';
export * from './components/ai';
export * from './components/inventory';
export * from './components/anatomy';
export * from './components/rendering';
export * from './components/terrain';
export * from './components/fetch';
export * from './components/environment';
export * from './components/water';
export * from './components/zone';
export * from './components/interaction';

import { FetchStickComponent } from './components/fetch';
import { ZoneShapeComponent, GameplayZoneComponent } from './components/zone';
import { TerrainComponent } from './components/terrain';
import { EnvironmentComponent } from './components/environment';
import { WaterComponent, WaterConfig } from './components/water';
import {
  TagComponent,
  RenderableComponent,
  AreaEffectorComponent,
  AttachmentComponent,
  GizmoComponent,
  VisualModelComponent,
  AnimatorComponent,
} from './components/rendering';
import {
  TransformComponent,
  PhysicsBodyComponent,
  PhysicsStatsComponent,
  PhysicsConfig,
} from './components/physics';
import {
  VelocityComponent,
  InputComponent,
  StanceTransitionComponent,
  MovementStatsComponent,
  MovementConfig,
  StealthStatsComponent,
  StealthConfig,
  CreatureMetaComponent,
} from './components/movement';
import {
  HealthComponent,
  HealthConfig,
  FunctionalHealthComponent,
  FunctionalHealthConfig,
  WeaponStatsComponent,
  WeaponCombatConfig,
  HitZoneConfig,
  ArmorStatsComponent,
  ArmorCombatConfig,
  ActiveAttackComponent,
} from './components/combat';
import {
  AIStatsComponent,
  AIConfig,
  VisionStatsComponent,
  HearingStatsComponent,
  PerceptionComponent,
  VisionConfig,
  HearingConfig,
} from './components/ai';
import {
  InventoryComponent,
  EquipmentComponent,
  InteractionSlotsComponent,
  InteractionActionComponent,
  PickupIntentComponent,
  DropItemIntentComponent,
  DroppedItemIntentComponent,
  ThrowItemIntentComponent,
  ItemComponent,
  OwnershipComponent,
  ItemConfig,
  InventorySetup,
  ThrownObjectComponent,
} from './components/inventory';
import { TimeScaleComponent } from './components/stats';
import {
  SocketDefComponent,
  SocketLinkComponent,
  BrainComponent,
  AssemblyRootComponent,
  LocomotionComponent,
  HeartComponent,
  ConsciousnessComponent,
  LocomotionStateComponent,
  HeadOrientationComponent,
} from './components/anatomy';
import { InteractableComponent } from './components/interaction';

export interface EntityComponents {
  tag?: TagComponent;
  visualModel?: VisualModelComponent;
  animator?: AnimatorComponent;
  renderable?: RenderableComponent;
  areaEffector?: AreaEffectorComponent;
  attachment?: AttachmentComponent;
  transform?: TransformComponent;
  physicsBody?: PhysicsBodyComponent;
  velocity?: VelocityComponent;
  input?: InputComponent;
  health?: HealthComponent;
  functionalHealth?: FunctionalHealthComponent;
  physicsStats?: PhysicsStatsComponent;
  movementStats?: MovementStatsComponent;
  stealthStats?: StealthStatsComponent;
  aiStats?: AIStatsComponent;
  brain?: BTLogicComponent;
  inventory?: InventoryComponent;
  equip?: EquipmentComponent;
  interactionSlots?: InteractionSlotsComponent;
  interactionAction?: InteractionActionComponent;
  stanceTransition?: StanceTransitionComponent;
  pickupIntent?: PickupIntentComponent;
  dropItemIntent?: DropItemIntentComponent;
  droppedItemIntent?: DroppedItemIntentComponent;
  throwItemIntent?: ThrowItemIntentComponent;
  activeAttacks?: ActiveAttackComponent;
  item?: ItemComponent;
  meta?: CreatureMetaComponent;
  ownership?: OwnershipComponent;
  gizmo?: GizmoComponent;
  weaponStats?: WeaponStatsComponent;
  weaponZone?: HitZoneConfig;
  armorStats?: ArmorStatsComponent;
  timeScale?: TimeScaleComponent;
  socketDef?: SocketDefComponent;
  socketLink?: SocketLinkComponent;
  bodyBrain?: BrainComponent;
  assemblyRoot?: AssemblyRootComponent;
  locomotion?: LocomotionComponent;
  heart?: HeartComponent;
  headOrientation?: HeadOrientationComponent;
  vision?: VisionStatsComponent;
  hearing?: HearingStatsComponent;
  perception?: PerceptionComponent;
  consciousness?: ConsciousnessComponent;
  locomotionState?: LocomotionStateComponent;
  terrain?: TerrainComponent;
  thrownObject?: ThrownObjectComponent;
  fetchStick?: FetchStickComponent;
  environment?: EnvironmentComponent;
  water?: WaterComponent;
  zoneShape?: ZoneShapeComponent;
  gameplayZone?: GameplayZoneComponent;
  interactable?: InteractableComponent;
}

export const SERIALIZABLE_COMPONENT_KEYS: ReadonlyArray<keyof EntityComponents> = [
  'tag',
  'visualModel',
  'animator',
  'renderable',
  'areaEffector',
  'attachment',
  'health',
  'functionalHealth',
  'transform',
  'physicsStats',
  'movementStats',
  'stealthStats',
  'aiStats',
  'item',
  'inventory',
  'equip',
  'interactionSlots',
  'interactionAction',
  'stanceTransition',
  'throwItemIntent',
  'droppedItemIntent',
  'meta',
  'ownership',
  'gizmo',
  'weaponStats',
  'weaponZone',
  'armorStats',
  'velocity',
  'activeAttacks',
  'input',
  'timeScale',
  'socketDef',
  'socketLink',
  'bodyBrain',
  'assemblyRoot',
  'locomotion',
  'heart',
  'vision',
  'hearing',
  'perception',
  'headOrientation',
  'consciousness',
  'locomotionState',
  'terrain',
  'thrownObject',
  'fetchStick',
  'environment',
  'water',
  'zoneShape',
  'gameplayZone',
  'interactable',
] as const;

export interface EntityConfig {
  tag?: TagComponent;
  visualModel?: VisualModelComponent;
  animator?: AnimatorComponent;
  renderable?: RenderableComponent;
  areaEffector?: AreaEffectorComponent;
  attachment?: AttachmentComponent;
  gizmo?: GizmoComponent;
  physics?: PhysicsConfig;
  health?: HealthConfig;
  functionalHealth?: FunctionalHealthConfig;
  movement?: Partial<MovementConfig>;
  stealth?: Partial<StealthConfig>;
  ai?: Partial<AIConfig>;
  item?: ItemConfig;
  inventory?: InventorySetup;
  equip?: EquipmentComponent;
  interactionSlots?: InteractionSlotsComponent;
  meta?: CreatureMetaComponent;
  ownership?: OwnershipComponent;
  transform?: TransformComponent;
  weaponStats?: Partial<WeaponCombatConfig>;
  weaponZone?: HitZoneConfig;
  armorStats?: Partial<ArmorCombatConfig>;
  timeScale?: TimeScaleComponent;
  socketDef?: SocketDefComponent;
  socketLink?: SocketLinkComponent;
  bodyBrain?: BrainComponent;
  assemblyRoot?: AssemblyRootComponent;
  locomotion?: LocomotionComponent;
  heart?: HeartComponent;
  vision?: VisionConfig;
  hearing?: HearingConfig;
  perception?: PerceptionComponent;
  headOrientation?: { turnSpeed?: number };
  terrain?: TerrainComponent;
  thrownObject?: ThrownObjectComponent;
  fetchStick?: FetchStickComponent;
  environment?: EnvironmentComponent;
  water?: WaterConfig;
  zoneShape?: ZoneShapeComponent;
  gameplayZone?: GameplayZoneComponent;
  interactable?: InteractableComponent;
}
