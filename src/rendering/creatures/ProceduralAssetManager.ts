import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BodyStructureType } from '../../types';
import { IProceduralCreatureBuilder } from './IProceduralBuilder';
import { QuadrupedProceduralBuilder } from './QuadrupedProceduralBuilder';
import { HumanoidProceduralBuilder } from './HumanoidProceduralBuilder';

export class ProceduralCreatureAssetManager {
  private static instance: ProceduralCreatureAssetManager;
  private builders = new Map<BodyStructureType, IProceduralCreatureBuilder>();
  private rigCache = new Map<BodyStructureType, THREE.Group>();

  private constructor() {
    this.builders.set('humanoid', new HumanoidProceduralBuilder());
    this.builders.set('quadruped', new QuadrupedProceduralBuilder());
  }

  public static getInstance(): ProceduralCreatureAssetManager {
    if (!ProceduralCreatureAssetManager.instance) {
      ProceduralCreatureAssetManager.instance = new ProceduralCreatureAssetManager();
    }
    return ProceduralCreatureAssetManager.instance;
  }

  public hasBuilder(type: BodyStructureType): boolean {
    return this.builders.has(type);
  }

  public getClonedRig(type: BodyStructureType): THREE.Group | null {
    const builder = this.builders.get(type);
    if (!builder) return null;

    let baseRig = this.rigCache.get(type);
    if (!baseRig) {
      baseRig = builder.createRigTemplate();
      this.rigCache.set(type, baseRig);
    }
    return SkeletonUtils.clone(baseRig) as THREE.Group;
  }

  public getPartMesh(type: BodyStructureType, partKey: string): THREE.Object3D | null {
    const builder = this.builders.get(type);
    if (!builder) return null;
    return builder.createPartMesh(partKey);
  }

  public getAnimationClip(type: BodyStructureType, animKey: string): THREE.AnimationClip | null {
    const builder = this.builders.get(type);
    if (!builder) return null;
    const clips = builder.createAnimationClips();
    if (clips.has(animKey)) return clips.get(animKey)!;
    const baseAction = animKey.replace(/_(left_hand|right_hand|jaws)$/, '');
    if (clips.has(baseAction)) return clips.get(baseAction)!;
    return clips.get('stand_idle') || null;
  }

  public getClonedAsset(virtualUri: string): THREE.Object3D | null {
    // Форматы URI:
    // proc://rig/{type}
    // proc://mesh/{type}/{partKey}
    const clean = virtualUri.replace('proc://', '');
    const parts = clean.split('/');
    const category = parts[0];
    const structureType = parts[1] as BodyStructureType;

    if (category === 'rig') {
      return this.getClonedRig(structureType);
    } else if (category === 'mesh') {
      const partKey = parts[2];
      return this.getPartMesh(structureType, partKey);
    }
    return null;
  }
}
