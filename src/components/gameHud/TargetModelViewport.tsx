import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GameApp } from '../../GameApp';
import { AssetManager } from '../../rendering/AssetManager';
import { CREATURE_RIG_PROFILES } from '../../rendering/rigProfiles';
import { BodyStructureType } from '../../ecs/templates';
import { ProceduralCreatureAssetManager } from '../../rendering/creatures/ProceduralAssetManager';
import { computeLocalBox, computeItemGrip } from '../../rendering/gripCalculators';
import { disposeObject } from '../../rendering/renderUtils';
import { OutlinePass } from '../../rendering/postprocessing/OutlinePass';
import { CEL_OUTLINE_LAYER, attachOutlineObjectId } from '../../rendering/outlineMask';
import { ToonMaterialManager } from '../../rendering/materials/ToonMaterialManager';
import { IHudDataProvider } from './hudPorts';
import { BALANCE_CONFIG } from '../../config/balanceConfig';
import { VISUAL_CONFIG } from '../../config/visualConfig';

export interface TargetModelViewportProps {
  app?: GameApp | null;
  hudProvider: IHudDataProvider;
  targetId: string;
  playerId: string | null;
}

export const TargetModelViewport: React.FC<TargetModelViewportProps> = ({
  app,
  hudProvider,
  targetId,
  playerId,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);

  // Ссылки на инстансы Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef<string>('');
  const targetCenterRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.5, 0));
  const rafIdRef = useRef<number>(0);
  const socketItemsHashRef = useRef<string>('');
  const outlinePassRef = useRef<OutlinePass | null>(null);

  // Сброс зума при переключении на новую цель
  useEffect(() => {
    setZoomFactor(1.0);
  }, [targetId]);

  // Приближение/отдаление колесиком мыши с нативным слушателем для корректного preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setZoomFactor((prev) => Math.max(0.5, Math.min(1.0, prev + e.deltaY * 0.001)));
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // 1. Инициализация сцены, мягкого освещения и рендерера
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 200;
    const h = container.clientHeight || 140;

    const scene = new THREE.Scene();
    // Темно-серый фон окна
    scene.background = new THREE.Color('#2d2d2d');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Рассеянное освещение полусферы (устраняет пластиковый глянец и жесткие блики)
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x444444, 0.95);
    scene.add(hemiLight);

    // Мягкий рассеянный свет спереди
    const dirLight = new THREE.DirectionalLight(0xfff8ee, 0.65);
    dirLight.position.set(3, 6, 5);
    scene.add(dirLight);

    // Контурная подсветка сзади для объема
    const backLight = new THREE.DirectionalLight(0x708090, 0.35);
    backLight.position.set(-3, 2, -4);
    scene.add(backLight);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      disposeObject(modelGroup);
      if (outlinePassRef.current) {
        outlinePassRef.current.dispose();
        outlinePassRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  const syncSocketItems = async (rig: THREE.Object3D, currentTargetId: string) => {
    const data = hudProvider.getTargetModelData(currentTargetId, playerId);
    if (!data) return;

    const newHash = data.socketItems.map((s) => `${s.socketName}:${s.itemId}`).join('|');
    if (newHash === socketItemsHashRef.current) return;
    socketItemsHashRef.current = newHash;

    for (const info of data.socketItems) {
      if (!info.socketName) continue;
      const socketBone = rig.getObjectByName(info.socketName);
      if (!socketBone) continue;

      while (socketBone.children.length > 0) {
        const child = socketBone.children[0];
        socketBone.remove(child);
        disposeObject(child);
      }

      if (info.modelId) {
        const itemMesh = await AssetManager.getInstance().getClonedModel(info.modelId);
        if (itemMesh) {
          const grip = computeItemGrip(itemMesh, info.itemType);
          itemMesh.position.copy(grip.position);
          itemMesh.quaternion.copy(grip.quaternion);

          if (app?.celShading) {
            ToonMaterialManager.getInstance().applyToon(itemMesh);
            // Слой cel-маски пост-процесс обводки (как в основной сцене)
            itemMesh.traverse((c) => {
              if (c instanceof THREE.Mesh) c.layers.enable(CEL_OUTLINE_LAYER);
            });
          }
          socketBone.add(itemMesh);
        }
      }
    }
  };

  useEffect(() => {
    if (!sceneRef.current || !modelGroupRef.current) return;
    const modelGroup = modelGroupRef.current;

    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }
    currentActionRef.current = null;
    currentClipNameRef.current = '';
    socketItemsHashRef.current = '';

    disposeObject(modelGroup);
    modelGroup.clear();

    let isCancelled = false;

    const loadTargetModel = async () => {
      const data = hudProvider.getTargetModelData(targetId, playerId);
      if (!data) return;

      let loadedObject: THREE.Object3D | null = null;
      const structureType = (data.animator?.rigType || data.rigType) as
        BodyStructureType | undefined;
      const rigProfile = structureType ? CREATURE_RIG_PROFILES[structureType] : undefined;

      if (structureType && rigProfile?.rigAsset) {
        const rig = await AssetManager.getInstance().getClonedModel(rigProfile.rigAsset);
        if (isCancelled || !rig) return;

        rig.scale.set(1, 1, 1);
        rig.rotation.y = Math.PI / 2;

        if (data.parts) {
          for (const part of data.parts) {
            const targetNode = rig.getObjectByName(part.rigNodeName);
            if (targetNode) {
              const meshClone = await AssetManager.getInstance().getClonedModel(part.modelId);
              if (!isCancelled && meshClone) {
                if (meshClone.type === 'Scene' || meshClone.type === 'Group') {
                  targetNode.add(...meshClone.children);
                } else {
                  targetNode.add(meshClone);
                }
              }
            }
          }
        }

        const mixer = new THREE.AnimationMixer(rig);
        mixerRef.current = mixer;

        await syncSocketItems(rig, targetId);

        loadedObject = rig;
      } else if (data.visualModelId) {
        const clone = await AssetManager.getInstance().getClonedModel(data.visualModelId);
        if (!isCancelled && clone) {
          loadedObject = clone;
        }
      } else {
        const r = data.physicsRadius ?? 0.4;
        const h = data.physicsHeight ?? 1.5;
        const geo = data.isCreature
          ? new THREE.CylinderGeometry(r, r, h, 16)
          : new THREE.BoxGeometry(r * 2, h, r * 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.6 });
        loadedObject = new THREE.Mesh(geo, mat);
        loadedObject.position.y = h / 2;
      }

      if (!isCancelled && loadedObject) {
        modelGroup.add(loadedObject);

        // Применяем стиль шейдинга из игры для единообразия картинки
        if (app?.celShading) {
          ToonMaterialManager.getInstance().applyToon(modelGroup);
          // Пост-процесс обводки: вся модель цели — кандидат cel-маски
          modelGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) child.layers.enable(CEL_OUTLINE_LAYER);
          });
          // Один id на всю модель: контур идет по внешнему силуэту, а не по стыкам мешей
          attachOutlineObjectId(modelGroup, 'hud-target-preview');
        }

        const box = computeLocalBox(modelGroup);
        const center = new THREE.Vector3();
        box.getCenter(center);

        if (data.isCreature) {
          const headBone = loadedObject.getObjectByName('HeadPivot');
          if (headBone) {
            headBone.getWorldPosition(center);
          } else {
            const headRatio = BALANCE_CONFIG.camera.gameMode.headHeightRatio ?? 0.81;
            center.y = box.min.y + (box.max.y - box.min.y) * headRatio;
          }
        }

        targetCenterRef.current.copy(center);
      }
    };

    loadTargetModel().catch(console.error);

    return () => {
      isCancelled = true;
    };
  }, [targetId, hudProvider, playerId, app?.celShading]);

  // 3. Покадровое копирование движений, положения головы, вращения и ракурса
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (sceneRef.current && cameraRef.current && rendererRef.current && modelGroupRef.current) {
        const modelData = hudProvider.getTargetModelData(targetId, playerId);
        const playerTrans = modelData?.playerTransform;
        const targetTrans = modelData?.transform;
        const animatorComp = modelData?.animator;
        const rig = modelGroupRef.current.children[0];

        // А. Синхронизация скелетной анимации и положения головы для существ
        if (rig && mixerRef.current && animatorComp) {
          const targetAnim = animatorComp.currentAnimation || 'stand_idle';
          const structureType = animatorComp.rigType as BodyStructureType;

          if (currentClipNameRef.current !== targetAnim) {
            currentClipNameRef.current = targetAnim;
            const pcam = ProceduralCreatureAssetManager.getInstance();
            const clip = pcam.getAnimationClip(structureType, targetAnim);
            if (clip) {
              mixerRef.current.stopAllAction();
              const action = mixerRef.current.clipAction(clip);
              action.play();
              currentActionRef.current = action;
            }
          }

          // Синхронизация времени кадра с живой анимацией оригинала
          const liveAnimator = (app?.simulation?.threeSyncSystem as any)?.animators?.get(targetId);
          if (liveAnimator?.currentAction && currentActionRef.current) {
            currentActionRef.current.time = liveAnimator.currentAction.time;
            currentActionRef.current.setEffectiveTimeScale(
              liveAnimator.currentAction.getEffectiveTimeScale()
            );
          }

          // Сброс предыдущего процедурного поворота шеи перед обновлением миксера
          const headBone = rig.getObjectByName('HeadPivot');
          if (headBone && headBone.userData.lastProceduralQuat) {
            const invQuat = headBone.userData.lastProceduralQuat.clone().invert();
            headBone.quaternion.multiply(invQuat);
          }

          mixerRef.current.update(dt);

          // Наложение точного поворота головы (Pitch/Yaw) из headOrientation
          const headOrientation = modelData?.headOrientation;
          if (headBone && headOrientation) {
            const headPitch = headOrientation.relativePitch ?? 0;
            const headYaw = headOrientation.relativeYaw ?? 0;
            if (Number.isFinite(headPitch) && Number.isFinite(headYaw)) {
              const headQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(-headPitch, -headYaw, 0, 'YXZ')
              );
              headBone.quaternion.multiply(headQuat);
              headBone.userData.lastProceduralQuat = headQuat;
            } else {
              headBone.userData.lastProceduralQuat = null;
            }
          }

          // Синхронизация предметов в руках при смене экипировки на лету
          syncSocketItems(rig, targetId);
        }

        // Б. Учет полного 3D-вращения объекта (катящийся мяч, падающие предметы)
        if (targetTrans) {
          if (animatorComp) {
            // У существ тело ориентируется по текущему курсу рыскания (Yaw)
            modelGroupRef.current.rotation.set(0, -targetTrans.angle, 0);
          } else if (targetTrans.rotation) {
            // У динамических предметов (мяч, меч) применяется полный 3D-кватернион вращения
            modelGroupRef.current.quaternion.set(
              targetTrans.rotation.x,
              targetTrans.rotation.y,
              targetTrans.rotation.z,
              targetTrans.rotation.w
            );
          } else {
            modelGroupRef.current.rotation.set(0, -targetTrans.angle, 0);
          }
        }

        // В. Расчет ракурса и зума камеры относительно игрока (взгляд "глаза-в-глаза")
        if (playerTrans && targetTrans) {
          // Динамически отслеживаем положение кости головы с учетом текущего кадра анимации
          if (modelData?.isCreature) {
            const headBone = rig?.getObjectByName('HeadPivot');
            if (headBone) {
              headBone.getWorldPosition(targetCenterRef.current);
            }
          }

          const headRatio = BALANCE_CONFIG.camera.gameMode.headHeightRatio ?? 0.81;
          const playerEyeY = playerTrans.y + 1.8 * headRatio;
          const targetWorldHeadY = targetTrans.y + targetCenterRef.current.y;

          const dx = playerTrans.x - targetTrans.x;
          const dy = playerEyeY - targetWorldHeadY;
          const dz = playerTrans.z - targetTrans.z;
          const realDist = Math.max(0.6, Math.hypot(dx, dy, dz));

          const effDist = realDist * zoomFactor;

          const dirX = dx / realDist;
          const dirY = dy / realDist;
          const dirZ = dz / realDist;

          const center = targetCenterRef.current;
          cameraRef.current.position.set(
            center.x + dirX * effDist,
            center.y + dirY * effDist,
            center.z + dirZ * effDist
          );
          cameraRef.current.lookAt(center);
        }

        rendererRef.current.render(sceneRef.current, cameraRef.current);

        // Пост-процесс cel-обводки для превью цели (малый рендерер)
        if (app?.celShading && outlinePassRef.current === null) {
          outlinePassRef.current = new OutlinePass();
        }
        if (app?.celShading && outlinePassRef.current) {
          const canvas = rendererRef.current.domElement;
          outlinePassRef.current.render(
            rendererRef.current,
            sceneRef.current,
            cameraRef.current,
            canvas.width,
            canvas.height,
            {
              cel: true,
              select: false,
              selectColor: VISUAL_CONFIG.selection.gameSelectedColor,
            }
          );
        }
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [hudProvider, targetId, playerId, zoomFactor, app?.celShading]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'ns-resize',
      }}
      title="Колесико мыши: приблизить/отдалить камеру на половину дистанции"
    />
  );
};
