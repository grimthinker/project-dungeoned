import { EntityConfig, MovementConfig } from '../types';
import { BodyStructureType } from '../../types';

export type { BodyStructureType };

export interface BlueprintPartDef {
  key: string;
  meshAsset?: string;
  rigNodeName?: string;
  config: EntityConfig;
}

export interface BlueprintConnectionDef {
  fromPartKey: string;
  fromSocket: string;
  toPartKey: string;
  toSocket: string;
}

export interface BlueprintItemDef {
  targetPartKey: string;
  targetAreaType: string;
  config: EntityConfig;
}

export interface HeadLimitsConfig {
  minYaw: number;
  maxYaw: number;
  minPitch: number;
  maxPitch: number;
}

export interface CreatureBodyBlueprint {
  id: BodyStructureType;
  name: string;
  baseHeight?: number;
  baseRadius?: number;
  rigAsset?: string;
  movement?: Partial<MovementConfig>;
  headLimits?: HeadLimitsConfig;
  parts: BlueprintPartDef[];
  connections: BlueprintConnectionDef[];
  defaultItems?: BlueprintItemDef[];
}
