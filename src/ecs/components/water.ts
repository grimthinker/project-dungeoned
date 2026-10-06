import { WaterData, WaterBodyType } from '../../types';

export type { WaterBodyType };

export type WaterComponent = WaterData;

export interface WaterConfig {
  width?: number;
  depth?: number;
  maxDepth?: number;
  waterType?: WaterBodyType;
  color?: string;
  deepColor?: string;
  opacity?: number;
  shallowOpacity?: number;
  clarity?: number;
  waveSpeed?: number;
  rippleSpeed?: number;
  rippleDamping?: number;
  waveHeight?: number;
  flowDirection?: { x: number; z: number };
  flowSpeed?: number;
  density?: number;
  viscosity?: number;
  foamIntensity?: number;
}
