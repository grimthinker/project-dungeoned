import * as THREE from 'three';
import { BodyStructureType } from '../../types';
import { CREATURE_RIG_PROFILES } from '../rigProfiles';
import { AssetManager } from '../AssetManager';
import { computeLocalBox, computeDetachedLimbGrip } from '../gripCalculators';
import { disposeObject } from '../renderUtils';
import { CEL_OUTLINE_LAYER, attachOutlineObjectId } from '../outlineMask';

export interface RigAnimatorState {
  mixer: THREE.AnimationMixer;
  currentClipName: string;
  targetClipName: string;
  currentAction: THREE.AnimationAction | null;
  rig: THREE.Object3D;
  socketBones: Map<string, THREE.Object3D>;
}

export interface MeshAttachmentDesc {
  partId: string;
  modelId: string;
  rigNodeName: string;
}

export interface ModularRigDesc {
  rigType: BodyStructureType;
  parts: MeshAttachmentDesc[];
}

export interface DetachedLimbDesc {
  rigType: BodyStructureType;
  rootPartSubType?: string;
  parts: MeshAttachmentDesc[];
}

export class CreatureMeshAssembler {
  constructor(
    private scene: THREE.Scene,
    private loadingMeshes: Set<string>,
    private loadingGenerations: Map<string, number>,
    private onRegisterAnimator: (id: string, state: RigAnimatorState) => void,
    private onPlayDefaultAnimation: (
      id: string,
      rigType: BodyStructureType,
      animKey: string
    ) => Promise<void>,
    private isEntityActive: (id: string) => boolean
  ) {}

  public canAssembleModularRig(rigType?: string, archetype?: string): boolean {
    if (!rigType || archetype !== 'creature') return false;
    const profile = CREATURE_RIG_PROFILES[rigType as BodyStructureType];
    return Boolean(profile?.rigAsset);
  }

  public createModularRig(id: string, desc: ModularRigDesc): THREE.Group {
    this.loadingMeshes.add(id);
    const group = new THREE.Group();
    group.userData.entityId = id;
    group.userData.isModularRig = true;
    this.assembleModularRigAsync(id, group, desc).catch(console.error);
    return group;
  }

  public createDetachedLimb(id: string, desc: DetachedLimbDesc): THREE.Group {
    this.loadingMeshes.add(id);
    const group = new THREE.Group();
    group.userData.entityId = id;
    group.userData.isDetachedLimb = true;
    this.assembleDetachedLimbAsync(id, group, desc).catch(console.error);
    return group;
  }

  public async assembleModularRigAsync(
    rootId: string,
    parentGroup: THREE.Group,
    desc: ModularRigDesc
  ): Promise<void> {
    const rigProfile = CREATURE_RIG_PROFILES[desc.rigType];
    if (!rigProfile || !rigProfile.rigAsset) {
      this.loadingMeshes.delete(rootId);
      return;
    }

    const currentGen = (this.loadingGenerations.get(rootId) ?? 0) + 1;
    this.loadingGenerations.set(rootId, currentGen);

    const isAborted = () =>
      this.loadingGenerations.get(rootId) !== currentGen || !this.isEntityActive(rootId);

    try {
      const assetManager = AssetManager.getInstance();
      const rig = await assetManager.getClonedModel(rigProfile.rigAsset);
      if (!rig) throw new Error(`Rig ${rigProfile.rigAsset} failed to load`);

      if (isAborted()) {
        disposeObject(rig);
        disposeObject(parentGroup);
        this.scene.remove(parentGroup);
        return;
      }

      rig.scale.set(1, 1, 1);
      rig.rotation.y = Math.PI / 2;
      parentGroup.add(rig);

      const socketBones = new Map<string, THREE.Object3D>();
      rig.traverse((child) => {
        if (child.name.includes('Socket')) {
          socketBones.set(child.name, child);
        }
      });

      const mixer = new THREE.AnimationMixer(rig);
      this.onRegisterAnimator(rootId, {
        mixer,
        currentClipName: '',
        targetClipName: '',
        currentAction: null,
        rig,
        socketBones,
      });

      for (const part of desc.parts) {
        const targetNode = rig.getObjectByName(part.rigNodeName);
        if (targetNode) {
          const meshClone = await assetManager.getClonedModel(part.modelId);

          if (isAborted()) {
            if (meshClone) disposeObject(meshClone);
            disposeObject(parentGroup);
            this.scene.remove(parentGroup);
            return;
          }

          if (meshClone) {
            meshClone.userData.partId = part.partId;
            meshClone.userData.entityId = part.partId;
            meshClone.traverse((c) => {
              c.userData.partId = part.partId;
              c.userData.entityId = part.partId;
            });

            if (meshClone.type === 'Scene' || meshClone.type === 'Group') {
              targetNode.add(...meshClone.children);
            } else {
              targetNode.add(meshClone);
            }
          }
        }
      }

      // Пост-процесс обводок: существо всегда кандидат cel-обводки (слой маски)
      this.enableCelOutlineLayer(parentGroup, rootId);

      const box = computeLocalBox(rig);
      const visualCorrectionY = -box.min.y;
      rig.position.set(0, visualCorrectionY, 0);

      this.onPlayDefaultAnimation(rootId, desc.rigType, 'stand_idle').catch(console.error);
    } catch (err) {
      console.error(`[CreatureMeshAssembler] Error assembling rig for ${rootId}:`, err);
    } finally {
      if (this.loadingGenerations.get(rootId) === currentGen) {
        this.loadingMeshes.delete(rootId);
      }
    }
  }

  public async assembleDetachedLimbAsync(
    rootId: string,
    parentGroup: THREE.Group,
    desc: DetachedLimbDesc
  ): Promise<void> {
    const currentGen = (this.loadingGenerations.get(rootId) ?? 0) + 1;
    this.loadingGenerations.set(rootId, currentGen);

    const isAborted = () =>
      this.loadingGenerations.get(rootId) !== currentGen || !this.isEntityActive(rootId);

    try {
      const assetManager = AssetManager.getInstance();
      const rigProfile = CREATURE_RIG_PROFILES[desc.rigType] || CREATURE_RIG_PROFILES.humanoid;
      const rigAsset = rigProfile?.rigAsset;

      if (!rigAsset) {
        throw new Error(`Rig asset not found for structure: ${desc.rigType}`);
      }

      const rig = await assetManager.getClonedModel(rigAsset);
      if (!rig) throw new Error(`Rig ${rigAsset} failed to load for detached limb`);

      if (isAborted()) {
        disposeObject(rig);
        disposeObject(parentGroup);
        this.scene.remove(parentGroup);
        return;
      }

      rig.scale.set(1, 1, 1);
      rig.rotation.y = Math.PI / 2;

      rig.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = false;
        }
      });

      for (const part of desc.parts) {
        const targetNode = rig.getObjectByName(part.rigNodeName);
        if (targetNode) {
          const meshClone = await assetManager.getClonedModel(part.modelId);

          if (isAborted()) {
            if (meshClone) disposeObject(meshClone);
            disposeObject(parentGroup);
            this.scene.remove(parentGroup);
            return;
          }

          if (meshClone) {
            meshClone.userData.entityId = rootId;
            delete meshClone.userData.partId;

            meshClone.traverse((c) => {
              c.userData.entityId = rootId;
              delete c.userData.partId;
            });

            const childrenToAttach = [...meshClone.children];
            if (childrenToAttach.length > 0) {
              for (const child of childrenToAttach) {
                targetNode.add(child);
              }
            } else {
              targetNode.add(meshClone);
            }
          }
        }
      }

      const limbBox = computeLocalBox(rig);
      const boxCenter = new THREE.Vector3();

      if (!limbBox.isEmpty()) {
        limbBox.getCenter(boxCenter);
        rig.position.sub(boxCenter);
      }

      parentGroup.add(rig);

      parentGroup.userData.gripTransform = computeDetachedLimbGrip(
        parentGroup,
        desc.rootPartSubType
      );

      // Пост-процесс обводок: отсоединенная конечность всегда кандидат cel-обводки
      this.enableCelOutlineLayer(parentGroup, rootId);
    } catch (err) {
      console.error(`[CreatureMeshAssembler] Error assembling detached limb ${rootId}:`, err);
    } finally {
      if (this.loadingGenerations.get(rootId) === currentGen) {
        this.loadingMeshes.delete(rootId);
      }
    }
  }

  /**
   * Включает слой cel-маски обводки на всех мешах собранного объекта (существа/конечности)
   * и привязывает идентификатор сущности: контур должен идти по внешнему силуэту рига,
   * а не по стыкам отдельных мешей внутри него.
   */
  private enableCelOutlineLayer(obj: THREE.Object3D, entityId: string): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.layers.enable(CEL_OUTLINE_LAYER);
      }
    });
    attachOutlineObjectId(obj, entityId);
  }
}
