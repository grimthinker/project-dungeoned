import * as THREE from 'three';
import { IModelPreview, PreviewPartAttachment } from './IModelPreview';
import { AssetManager } from './AssetManager';
import { CREATURE_RIG_PROFILES } from './rigProfiles';
import { BodyStructureType } from '../types';
import { computeLocalBox } from './gripCalculators';
import { ProceduralCreatureAssetManager } from './creatures/ProceduralAssetManager';
import { disposeObject } from './renderUtils';

export class ThreeModelPreview implements IModelPreview {
  private container: HTMLDivElement | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private modelGroup: THREE.Group;

  private targetOrbit = new THREE.Vector3(0, 0.8, 0);
  private orbitParams = {
    yaw: 0.3,
    pitch: 0.15,
    distance: 2.8,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  };

  private rafId: number = 0;
  private lastTime: number = 0;
  private isDisposed: boolean = false;

  private currentStructureType: BodyStructureType | null = null;
  private currentSpeed: number = 1.0;
  private pendingAnimName: string | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#141414');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 8, 5);
    this.scene.add(dir);
    const fillLight = new THREE.DirectionalLight(0x90b0ff, 0.4);
    fillLight.position.set(-4, 3, -3);
    this.scene.add(fillLight);

    const platformGeo = new THREE.CylinderGeometry(0.8, 0.85, 0.04, 32);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.7 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.02;
    this.scene.add(platform);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
  }

  public init(container: HTMLDivElement): void {
    this.container = container;
    this.container.appendChild(this.renderer.domElement);
    this.resize(container.clientWidth || 300, container.clientHeight || 240);

    this.container.addEventListener('mousedown', this.handlePointerDown);
    window.addEventListener('mousemove', this.handlePointerMove);
    window.addEventListener('mouseup', this.handlePointerUp);
    this.container.addEventListener('wheel', this.handleWheel, { passive: false });

    this.lastTime = performance.now();
    this.animate(this.lastTime);
  }

  public async loadRig(
    structureType: string,
    attachments?: PreviewPartAttachment[]
  ): Promise<void> {
    if (this.isDisposed) return;
    this.currentStructureType = structureType as BodyStructureType;

    // Очистка предыдущей модели
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAction = null;
    disposeObject(this.modelGroup);
    this.modelGroup.clear();

    try {
      let modelToLoad: string | null = null;
      const rigProfile = CREATURE_RIG_PROFILES[this.currentStructureType];

      if (rigProfile?.rigAsset) {
        modelToLoad = rigProfile.rigAsset;
      } else if (
        this.currentStructureType &&
        (this.currentStructureType.startsWith('proc://') ||
          this.currentStructureType.endsWith('.glb'))
      ) {
        modelToLoad = this.currentStructureType;
      }

      if (!modelToLoad) return;

      const rig = await AssetManager.getInstance().getClonedModel(modelToLoad);
      if (this.isDisposed || !rig) return;

      rig.scale.set(1, 1, 1);
      if (rigProfile) {
        rig.rotation.y = Math.PI / 2;
      }
      this.modelGroup.add(rig);

      if (rigProfile && attachments) {
        for (const att of attachments) {
          if (att.modelId && att.rigNodeName) {
            const targetNode = rig.getObjectByName(att.rigNodeName);
            if (targetNode) {
              const meshClone = await AssetManager.getInstance().getClonedModel(att.modelId);
              if (this.isDisposed) return;
              if (meshClone) {
                if (meshClone.type === 'Scene' || meshClone.type === 'Group') {
                  targetNode.add(...meshClone.children);
                } else {
                  targetNode.add(meshClone);
                }
              }
            }
          }
        }
      }

      const box = computeLocalBox(rig);
      rig.position.set(0, -box.min.y, 0);

      const updatedBox = new THREE.Box3().setFromObject(rig);
      updatedBox.getCenter(this.targetOrbit);

      const size = new THREE.Vector3();
      updatedBox.getSize(size);
      this.orbitParams.distance = Math.max(1.8, Math.max(size.x, size.y, size.z) * 1.9);

      if ((rig.animations && rig.animations.length > 0) || rigProfile) {
        this.mixer = new THREE.AnimationMixer(rig);
        const animToPlay = this.pendingAnimName || 'stand_idle';
        this.applyAnimation(animToPlay);
      }
    } catch (err) {
      console.error('[ThreeModelPreview] Ошибка загрузки модели превью:', err);
    }
  }

  public playAnimation(animName: string): void {
    this.pendingAnimName = animName;
    this.applyAnimation(animName);
  }

  private applyAnimation(animName: string): void {
    if (!this.mixer || !this.currentStructureType) return;

    let clip: THREE.AnimationClip | null = null;
    const pcam = ProceduralCreatureAssetManager.getInstance();

    if (pcam.hasBuilder(this.currentStructureType)) {
      clip = pcam.getAnimationClip(this.currentStructureType, animName);
    }

    const applyToMixer = (c: THREE.AnimationClip) => {
      if (!this.mixer) return;
      this.mixer.stopAllAction();
      const action = this.mixer.clipAction(c);
      action.reset();
      action.setEffectiveTimeScale(this.currentSpeed);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      this.currentAction = action;
    };

    if (clip) {
      applyToMixer(clip);
    } else {
      const profile = CREATURE_RIG_PROFILES[this.currentStructureType];
      const url = profile?.animations?.[animName];
      if (url && !url.startsWith('proc://')) {
        AssetManager.getInstance()
          .loadGLTF(url)
          .then((gltf) => {
            if (this.isDisposed) return;
            if (this.pendingAnimName && this.pendingAnimName !== animName) return;
            if (gltf.animations?.[0]) {
              applyToMixer(gltf.animations[0]);
            }
          });
      }
    }
  }

  public setSpeed(speed: number): void {
    this.currentSpeed = speed;
    if (this.currentAction) {
      this.currentAction.setEffectiveTimeScale(speed);
    }
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public destroy(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.rafId);

    if (this.container) {
      this.container.removeEventListener('mousedown', this.handlePointerDown);
      this.container.removeEventListener('wheel', this.handleWheel);
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    window.removeEventListener('mousemove', this.handlePointerMove);
    window.removeEventListener('mouseup', this.handlePointerUp);

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAction = null;

    disposeObject(this.modelGroup);
    this.renderer.dispose();
  }

  private animate = (time: number) => {
    if (this.isDisposed) return;
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    if (this.mixer) this.mixer.update(dt);

    const { yaw, pitch, distance } = this.orbitParams;
    const camX = this.targetOrbit.x + distance * Math.cos(pitch) * Math.sin(yaw);
    const camY = this.targetOrbit.y + distance * Math.sin(pitch);
    const camZ = this.targetOrbit.z + distance * Math.cos(pitch) * Math.cos(yaw);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.targetOrbit);

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.animate);
  };

  private handlePointerDown = (e: MouseEvent) => {
    this.orbitParams.isDragging = true;
    this.orbitParams.lastX = e.clientX;
    this.orbitParams.lastY = e.clientY;
  };
  private handlePointerMove = (e: MouseEvent) => {
    if (!this.orbitParams.isDragging) return;
    const dx = e.clientX - this.orbitParams.lastX;
    const dy = e.clientY - this.orbitParams.lastY;
    this.orbitParams.yaw -= dx * 0.01;
    this.orbitParams.pitch = Math.max(-0.3, Math.min(1.2, this.orbitParams.pitch + dy * 0.01));
    this.orbitParams.lastX = e.clientX;
    this.orbitParams.lastY = e.clientY;
  };
  private handlePointerUp = () => {
    this.orbitParams.isDragging = false;
  };
  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbitParams.distance = Math.max(
      0.8,
      Math.min(6.0, this.orbitParams.distance + e.deltaY * 0.002)
    );
  };
}
