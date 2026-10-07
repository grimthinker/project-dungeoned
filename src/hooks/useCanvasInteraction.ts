import {
  useRef,
  useEffect,
  useState,
  MutableRefObject,
  Dispatch,
  SetStateAction,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { GameApp } from '../GameApp';
import { GameMode } from '../config/gameConfig';
import { PlacementMode, Point, BlackboardPickingState, Vec3 } from '../types';
import { PieMenuState } from '../components/PieMenu/types';
import { EDITOR_CONFIG } from '../config/editorConfig';
import { useDragDrop } from '../dnd/DragDropContext';
import { CREATURE_BLUEPRINTS } from '../ecs/templates';
import { getPropRegistry } from '../editor/PropRegistry';
import { deg2Rad } from '../utils';
import { SerializedEntityData } from '../ecs/WorldSerializer';
import { EntitySnapshotCommand } from '../history/commands/EntitySnapshotCommand';
import { getRootOwner } from '../ecs/utils/hierarchy';
import { EventBus } from '../core/EventBus';
import { TerrainBrushController } from '../editor/TerrainBrushController';
import { TerrainModifyCommand } from '../history/commands/TerrainModifyCommand';
import { spawnFetchGroup } from '../ecs/prefabs/fetchGroupPrefab';
import { t } from '../locales';
import { GlobalInput } from '../input/GlobalInput';

interface UseCanvasInteractionProps {
  appRef: MutableRefObject<GameApp | null>;
  placementMode: PlacementMode | null;
  setPlacementMode: Dispatch<SetStateAction<PlacementMode | null>>;
  syncPlayerControls: () => void;
  updateStats: () => void;
  mode: GameMode;
  typeFilters: Record<string, boolean>;
  onOpenPieMenu?: (menuState: PieMenuState) => void;
  onClosePieMenu?: () => void;
  bbPicking?: BlackboardPickingState | null;
  setBbPicking?: Dispatch<SetStateAction<BlackboardPickingState | null>>;
}

export const useCanvasInteraction = ({
  appRef,
  placementMode,
  setPlacementMode,
  syncPlayerControls,
  updateStats,
  mode,
  typeFilters,
  onOpenPieMenu,
  onClosePieMenu,
  bbPicking,
  setBbPicking,
}: UseCanvasInteractionProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isMarqueeActiveRef = useRef<boolean>(false);
  const [cursorWorldPos, setCursorWorldPos] = useState<Vec3 | null>(null);
  const lastCursorUpdateRef = useRef<number>(0);

  const { isDragging, startDrag, setHoverTarget } = useDragDrop();
  const dragCandidateRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  const terrainEditStateRef = useRef<{
    entityId: string;
    beforeHeights: Float32Array;
    beforeSplat: Uint8Array;
    beforeFoliage: Uint8Array;
    isDragging: boolean;
    flattenTarget?: number;
  } | null>(null);

  // Реф для хранения транзакции кисти объектов (Prop Brush)
  const propBrushStateRef = useRef<{
    isDragging: boolean;
    lastSpawnTime: number;
    spawnedIds: Set<string>;
    deletedEntitiesData: SerializedEntityData[];
  }>({
    isDragging: false,
    lastSpawnTime: 0,
    spawnedIds: new Set(),
    deletedEntitiesData: [],
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isTargeting = appRef.current?.throwTargeting != null;
    container.style.cursor = placementMode || bbPicking || isTargeting ? 'crosshair' : 'default';

    const isTargetOnHUD = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const canvas = appRef.current?.canvas;
      return target !== canvas;
    };

    const onWheel = (e: WheelEvent) => {
      // Если колесико мыши крутится над панелью HUD — даем панели прокручиваться и не зумим сцену
      if (isTargetOnHUD(e.target)) {
        return;
      }

      e.preventDefault();
      if (onClosePieMenu) onClosePieMenu();
      const app = appRef.current;
      if (!app) return;
      if (e.altKey) {
        if (app.gameMode !== GameMode.GAME) {
          app.camera.adjustHeight(e.deltaY);
        }
      } else {
        app.camera.zoomAt(
          e.clientX,
          e.clientY,
          e.deltaY,
          app.canvas,
          app.gameMode === GameMode.GAME
        );
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        GlobalInput.isRmbDown = false;
        if (appRef.current?.gameMode === GameMode.GAME) {
          appRef.current.simulation.clearPlayerNavigationTarget();
        }
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onWindowMouseUp);
      GlobalInput.isRmbDown = false;
    };
  }, [placementMode, onClosePieMenu]);

  const isTargetOnHUD = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const canvas = appRef.current?.canvas;
    return target !== canvas;
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const app = appRef.current;
    if (!app || mode === GameMode.MENU) return;

    // Игнорируем клики по панелям HUD (панели сами обрабатывают свои кнопки и драг)
    if (isTargetOnHUD(e.target)) return;

    if (onClosePieMenu) onClosePieMenu();

    // Отмена прицеливания броска на ПКМ
    if (e.button === 2 && app.throwTargeting) {
      app.throwTargeting = null;
      syncPlayerControls();
      return;
    }

    // Совершение броска (ЛКМ) в режиме прицеливания
    if (e.button === 0 && app.throwTargeting && mode === GameMode.GAME) {
      const point = app.getCanvasPoint(e.clientX, e.clientY);
      const playerId = app.getPlayerEntityId();
      if (playerId) {
        app.world.addComponent(playerId, 'throwItemIntent', {
          slotIndex: app.throwTargeting.slotIndex,
          partId: app.throwTargeting.partId,
          targetPos: point,
        });
      }
      app.throwTargeting = null;
      syncPlayerControls();
      return;
    }

    // Вращение камеры (LAlt + ЛКМ)
    if (e.button === 0 && e.altKey) {
      e.preventDefault();
      app.camera.startRotate(e.clientX, e.clientY);
      return;
    }

    // Панорамирование камеры на СКМ (колесико мыши) — запрещено в режиме игры
    if (e.button === 1 && app.gameMode !== GameMode.GAME) {
      e.preventDefault();
      app.startPan(e.clientX, e.clientY);
      e.currentTarget.style.cursor = 'grabbing';
      return;
    }

    // В режиме игры: движение по ПКМ и активация непрерывного ведения
    if (e.button === 2 && mode === GameMode.GAME) {
      GlobalInput.isRmbDown = true;
      const physHit = app.raycastPhysics(e.clientX, e.clientY);
      const targetPos = physHit ? physHit.point : app.getCanvasPoint(e.clientX, e.clientY);
      app.simulation.setPlayerNavigationTarget(targetPos);
      return;
    }

    // Действия на ЛКМ
    if (e.button === 0) {
      if (app.gizmo.isDragging()) return;

      const point = app.getCanvasPoint(e.clientX, e.clientY);

      // В режиме кисти объектов (Prop Brush): начало мазка
      if (app.propBrush.active && mode === GameMode.EDITOR) {
        propBrushStateRef.current = {
          isDragging: true,
          lastSpawnTime: performance.now(),
          spawnedIds: new Set(),
          deletedEntitiesData: [],
        };
        applyPropBrushAtPoint(point);
        return;
      }

      // В режиме кисти террейна: начинаем мазок
      if (app.terrainBrush.active && mode === GameMode.EDITOR) {
        const terrains = app.world.getEntitiesWith('terrain');
        if (terrains.length > 0) {
          const [tId, tComp] = terrains[0];
          const dt = 1 / 60;
          terrainEditStateRef.current = {
            entityId: tId,
            beforeHeights: new Float32Array(tComp.terrain.heights),
            beforeSplat: new Uint8Array(tComp.terrain.splatData),
            beforeFoliage: new Uint8Array(tComp.terrain.foliageData),
            isDragging: true,
          };
          terrainEditStateRef.current.flattenTarget = TerrainBrushController.applyBrush(
            tComp.terrain,
            point.x,
            point.z,
            app.terrainBrush,
            dt
          );
        }
        return;
      }

      // В режиме игры: взаимодействие и выбор цели
      if (mode === GameMode.GAME) {
        // Подбор предмета через Ctrl+ЛКМ
        if (e.ctrlKey || e.metaKey) {
          let targetEntityId = app.selection.pickNearestEntity(
            point,
            undefined,
            e.clientX,
            e.clientY
          );
          if (targetEntityId) {
            if (!app.world.getComponent(targetEntityId, 'item')) {
              const assemblyRoots = app.world.getEntitiesWith('assemblyRoot', 'tag');
              const parentItem = assemblyRoots.find(
                ([, comp]) =>
                  comp.tag.archetype === 'item' &&
                  comp.assemblyRoot.partIds?.includes(targetEntityId!)
              );
              if (parentItem) {
                targetEntityId = parentItem[0];
              }
            }

            const itemComp = app.world.getComponent(targetEntityId, 'item');
            const tagComp = app.world.getComponent(targetEntityId, 'tag');
            const ownershipComp = app.world.getComponent(targetEntityId, 'ownership');
            const isItem = (tagComp?.archetype === 'item' || !!itemComp) && !ownershipComp;

            if (isItem) {
              const playerId = app.getPlayerEntityId();
              if (playerId) {
                app.updateEntityBlackboard(playerId, 'requestedPickupId', targetEntityId);
              }
            }
          }
          return;
        }

        // Обычный ЛКМ: выбор интерактивной цели или сброс при клике в пустоту
        const pickedId =
          app.selection.pickEntityAt(point, e.clientX, e.clientY) ??
          app.selection.pickNearestEntity(point, undefined, e.clientX, e.clientY);

        app.selection.selectGameTarget(pickedId);
        syncPlayerControls();
        updateStats();
        return;
      }

      // Интерактивный выбор сущности для Blackboard (Object Picker)
      if (bbPicking && setBbPicking && mode === GameMode.EDITOR) {
        const pickedId = app.selection.pickEntityAt(point, e.clientX, e.clientY);
        if (pickedId) {
          app.updateEntityBlackboard(bbPicking.entityId, bbPicking.key, pickedId);
        }
        setBbPicking(null);
        syncPlayerControls();
        updateStats();
        return;
      }

      if (placementMode) return;

      // Клик по сущности на поле — выбор с поддержкой Shift (мультиселект / инверсия)
      const entityId = app.selection.pickEntityAt(point, e.clientX, e.clientY);
      if (entityId) {
        const comp = app.world.getEntity(entityId);
        if (comp?.item && !comp.ownership && mode === GameMode.EDITOR) {
          dragCandidateRef.current = { id: entityId, startX: e.clientX, startY: e.clientY };
          return;
        }

        const isBodyPart =
          comp?.tag?.archetype === 'bodyPart' || !!app.world.getComponent(entityId, 'socketDef');
        const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;

        if (isBodyPart) {
          const rootId = getRootOwner(app.world, entityId);
          if (rootId && rootId !== entityId) {
            const rootTag = app.world.getComponent(rootId, 'tag');
            if (rootTag?.archetype === 'creature') {
              const creatureName = app.world.getComponent(rootId, 'meta')?.name || 'Существо';

              if (isMultiSelect && app.selection.selectedEntityIds.has(rootId)) {
                app.selection.deselectEntity(rootId);
              } else {
                app.selection.selectEntity(rootId, !isMultiSelect);
                EventBus.emit('inspector:navigate', {
                  rootEntityId: rootId,
                  path: [{ id: rootId, label: creatureName }],
                });
              }
              syncPlayerControls();
              updateStats();
              return;
            }
          }
        }

        if (isMultiSelect && app.selection.selectedEntityIds.has(entityId)) {
          app.selection.deselectEntity(entityId);
        } else {
          app.selection.selectEntity(entityId, !isMultiSelect);
        }
        syncPlayerControls();
        updateStats();
        return;
      }

      // Клик по пустому месту — начинаем рамку выделения
      isMarqueeActiveRef.current = true;
      app.selection.startMarquee({ x: e.clientX, y: e.clientY });
    }
  };

  const lastHoverCheckRef = useRef<number>(0);

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const app = appRef.current;
    if (!app) return;

    // При наведении на панель HUD в режиме игры сбрасываем прицеливание персонажа
    if (isTargetOnHUD(e.target)) {
      if (mode === GameMode.GAME) {
        GlobalInput.isRmbDown = false;
        app.simulation.clearPlayerNavigationTarget();
      }
      app.setMouseScreenPos(null, null);
      setCursorWorldPos(null);
      return;
    }

    if (app.camera.isRotating) {
      app.camera.rotate(e.clientX, e.clientY, app.gameMode === GameMode.GAME);
      e.currentTarget.style.cursor = 'move';
      return;
    }

    if ((e.buttons & 4) === 4 && app.gameMode !== GameMode.GAME) {
      app.pan(e.clientX, e.clientY);
      e.currentTarget.style.cursor = 'grabbing';
      return;
    }

    // Сохраняем экранную позицию курсора (быстрая операция без raycast)
    app.setMouseScreenPos(e.clientX, e.clientY);

    if (isDragging) {
      setHoverTarget({ type: 'ground' });
      return;
    }

    // Во время движения кистью пропов расчет точки производим только в момент спавна
    if (propBrushStateRef.current.isDragging && app.propBrush.active) {
      const now = performance.now();
      if (now - propBrushStateRef.current.lastSpawnTime > 80) {
        const point = app.getCanvasPoint(e.clientX, e.clientY);
        applyPropBrushAtPoint(point);
        propBrushStateRef.current.lastSpawnTime = now;
      }
      return;
    }

    // Во время движения кистью террейна наносим мазки
    if (terrainEditStateRef.current?.isDragging && app.terrainBrush.active) {
      const point = app.getCanvasPoint(e.clientX, e.clientY);
      const terrains = app.world.getEntitiesWith('terrain');
      if (terrains.length > 0) {
        TerrainBrushController.applyBrush(
          terrains[0][1].terrain,
          point.x,
          point.z,
          app.terrainBrush,
          1 / 60,
          terrainEditStateRef.current.flattenTarget
        );
      }
      return;
    }

    if (dragCandidateRef.current) {
      const dx = e.clientX - dragCandidateRef.current.startX;
      const dy = e.clientY - dragCandidateRef.current.startY;
      if (Math.hypot(dx, dy) > 5) {
        const id = dragCandidateRef.current.id;
        const comp = app.world.getEntity(id);
        if (comp && comp.item) {
          let icon = '📦';
          if (comp.item.type === 'weapon') icon = '⚔️';
          else if (comp.item.type === 'armor') icon = '🛡️';
          else if (comp.item.type === 'bag') icon = '🎒';
          else if (comp.item.type === 'bodyPart') icon = '🥩';

          startDrag(
            {
              id,
              name: comp.meta?.name ?? comp.item.name,
              icon,
              size: comp.item.size,
              weight: comp.physicsStats?.weight.current ?? 1,
            },
            { type: 'ground' },
            e.clientX,
            e.clientY
          );
        }
        dragCandidateRef.current = null;
      }
      return;
    }

    if (app.gizmo.isDragging() && mode === GameMode.EDITOR) {
      return;
    }

    // Обновление рамки выделения
    if (isMarqueeActiveRef.current && (e.buttons & 1) === 1) {
      app.selection.updateMarquee({ x: e.clientX, y: e.clientY });
      e.currentTarget.style.cursor = 'crosshair';
      return;
    }

    // Троттлинг тяжелых операций (raycast, hover-поиск в ECS и обновление React-статуса)
    const now = performance.now();
    if (now - lastHoverCheckRef.current >= 80) {
      lastHoverCheckRef.current = now;
      const point = app.getCanvasPoint(e.clientX, e.clientY);

      if (now - lastCursorUpdateRef.current > 120) {
        lastCursorUpdateRef.current = now;
        setCursorWorldPos({ x: point.x, y: point.y, z: point.z });
      }
      let isHoveringEntity = false;
      if (placementMode) {
        app.selection.hoverEntity(null);
      } else if (mode === GameMode.EDITOR) {
        // Убираем передачу координат мыши, чтобы полностью отключить
        // тяжелый визуальный Raycast при простом перемещении курсора (Hover).
        // Оставляем только мгновенный O(N) просчет 3D-дистанций до точки на земле.
        const nearestId = app.selection.pickNearestEntity(point);
        app.selection.hoverEntity(nearestId);
        isHoveringEntity = nearestId !== null;
      }

      if (placementMode || bbPicking) {
        e.currentTarget.style.cursor = 'crosshair';
      } else if (isHoveringEntity) {
        e.currentTarget.style.cursor = 'pointer';
      } else {
        e.currentTarget.style.cursor = 'default';
      }
    }
  };

  const handleMouseUp = (e: ReactMouseEvent<HTMLDivElement>) => {
    const app = appRef.current;
    if (!app) return;

    if (e.button === 2) {
      GlobalInput.isRmbDown = false;
      if (app.gameMode === GameMode.GAME) {
        app.simulation.clearPlayerNavigationTarget();
      }
    }

    if (app.camera.isRotating) {
      app.camera.endRotate();
      e.currentTarget.style.cursor = 'default';
      return;
    }

    if (e.button === 1) {
      app.endPan();
      e.currentTarget.style.cursor = 'default';
      return;
    }

    if (e.button !== 0) return;

    // Завершение мазка кисти объектов (Prop Brush)
    if (propBrushStateRef.current.isDragging) {
      propBrushStateRef.current.isDragging = false;
      const { spawnedIds, deletedEntitiesData } = propBrushStateRef.current;

      if (spawnedIds.size > 0 || deletedEntitiesData.length > 0) {
        const desc =
          app.propBrush.mode === 'paint' ? 'Посадка объектов кистью' : 'Удаление объектов ластиком';

        // Создаем After State для спавненных объектов
        const afterEntities = app.serializer.serializeEntities(Array.from(spawnedIds));

        const cmd = new EntitySnapshotCommand(
          desc,
          app,
          [...Array.from(spawnedIds), ...deletedEntitiesData.map((e) => e.id)],
          deletedEntitiesData, // В Before State кладем то, что удалили
          afterEntities, // В After State кладем то, что заспавнили
          { id: null, ids: [] },
          { id: null, ids: [] }
        );
        app.commandHistory.push(cmd);
        app.captureBaseState();
      }
      return;
    }

    // В момент завершения мазка террейна — формируем команду и отправляем в историю
    if (terrainEditStateRef.current?.isDragging) {
      terrainEditStateRef.current.isDragging = false;
      const terrains = app.world.getEntitiesWith('terrain');
      if (terrains.length > 0) {
        const [tId, tComp] = terrains[0];
        const isHeightTool =
          app.terrainBrush.tool === 'raise' ||
          app.terrainBrush.tool === 'lower' ||
          app.terrainBrush.tool === 'flatten' ||
          app.terrainBrush.tool === 'smooth' ||
          app.terrainBrush.tool === 'hills';

        if (isHeightTool) {
          tComp.terrain.isPhysicsDirty = true;
        }

        const afterHeights = new Float32Array(tComp.terrain.heights);
        const afterSplat = new Uint8Array(tComp.terrain.splatData);
        const afterFoliage = new Uint8Array(tComp.terrain.foliageData);

        const cmd = new TerrainModifyCommand(
          'Редактирование ландшафта',
          app,
          tId,
          terrainEditStateRef.current.beforeHeights,
          afterHeights,
          terrainEditStateRef.current.beforeSplat,
          afterSplat,
          terrainEditStateRef.current.beforeFoliage,
          afterFoliage
        );
        app.commandHistory.push(cmd);
      }
      terrainEditStateRef.current = null;
      return;
    }

    if (dragCandidateRef.current) {
      const id = dragCandidateRef.current.id;
      dragCandidateRef.current = null;

      if (e.shiftKey && app.selection.selectedEntityIds.has(id)) {
        app.selection.deselectEntity(id);
      } else {
        app.selection.selectEntity(id, !e.shiftKey);
      }
      syncPlayerControls();
      updateStats();
      return;
    }

    const point = app.getCanvasPoint(e.clientX, e.clientY);

    if (app.gizmo.isDragging() && mode === GameMode.EDITOR) {
      return;
    }

    // Завершение рамки выделения
    if (isMarqueeActiveRef.current) {
      isMarqueeActiveRef.current = false;
      app.selection.endMarquee(typeFilters);
      updateStats();
      e.currentTarget.style.cursor = 'default';
      return;
    }

    // Спавн сущности
    if (placementMode && mode === GameMode.EDITOR) {
      const physHit = app.raycastPhysics(e.clientX, e.clientY);
      const spawnPos: Vec3 = physHit ? { ...physHit.point } : { ...point };

      // Автоматическая компенсация уклона поверхности (Slope Clearance)
      if (physHit) {
        const ny = Math.max(0.15, physHit.normal.y);
        const slopeFactor = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;

        if (placementMode.kind === 'entity') {
          const isItem =
            !!placementMode.config.item || placementMode.config.tag?.archetype === 'item';
          const r = placementMode.config.physics?.radius ?? 0.3;
          if (isItem) {
            spawnPos.y += r + r * slopeFactor + 0.05;
          } else {
            spawnPos.y += r * slopeFactor * 0.5 + 0.02;
          }
        } else if (placementMode.kind === 'modular') {
          const r = 0.4;
          spawnPos.y += r * slopeFactor + 0.08;
        }
      }

      if (placementMode.kind === 'entity') {
        app.executeTransaction(t('history.spawnObject'), () => {
          const spawnedId = app.spawnEntity(placementMode.config, spawnPos);
          app.selection.selectEntity(spawnedId, true);
          return spawnedId;
        });
      } else if (placementMode.kind === 'modular') {
        app.executeTransaction(t('history.spawnModular'), () => {
          const blueprint = CREATURE_BLUEPRINTS[placementMode.options.structureType];
          const spawnedId = app.entityFactory.spawnModularCreature(
            app.world,
            app.physics,
            app.aiSystem,
            spawnPos,
            blueprint,
            placementMode.options.behavior,
            placementMode.options.name
          );
          app.selection.selectEntity(spawnedId, true);
          return spawnedId;
        });
      } else if (placementMode.kind === 'prefab') {
        if (placementMode.prefabId === 'fetch_group') {
          app.executeTransaction(t('history.spawnFetchGroup'), () => {
            const result = spawnFetchGroup(app.simulation, spawnPos);
            app.selection.selectEntities([result.masterId, ...result.dogIds]);
            return result.masterId;
          });
        }
      }
      setPlacementMode(null);
      syncPlayerControls();
      updateStats();
      return;
    }
  };

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCandidateRef.current = null;
    const app = appRef.current;
    if (!app || mode !== GameMode.EDITOR || !containerRef.current) return;

    if (bbPicking && setBbPicking) {
      setBbPicking(null);
      return;
    }

    if (placementMode) {
      setPlacementMode(null);
      if (onClosePieMenu) onClosePieMenu();
      return;
    }

    if (!onOpenPieMenu) return;

    if (app.gizmo.isDragging()) {
      app.gizmo.cancelDrag(true);
    }

    const point = app.getCanvasPoint(e.clientX, e.clientY);

    const margin = EDITOR_CONFIG.pieMenuMargin;
    const minX = Math.min(margin, window.innerWidth / 2);
    const maxX = Math.max(minX, window.innerWidth - margin);
    const minY = Math.min(margin, window.innerHeight / 2);
    const maxY = Math.max(minY, window.innerHeight - margin);

    const screenPos = {
      x: Math.min(maxX, Math.max(minX, e.clientX)),
      y: Math.min(maxY, Math.max(minY, e.clientY)),
    };

    const entityId = app.selection.pickEntityAt(point, e.clientX, e.clientY);

    if (entityId) {
      let targetId = entityId;
      const comp = app.world.getEntity(entityId);
      const isBodyPart =
        comp?.tag?.archetype === 'bodyPart' || !!app.world.getComponent(entityId, 'socketDef');
      if (isBodyPart) {
        const rootId = getRootOwner(app.world, entityId);
        if (rootId && app.world.getComponent(rootId, 'tag')?.archetype === 'creature') {
          targetId = rootId;
        }
      }

      if (app.selection.selectedEntityIds.has(targetId)) {
        app.selection.selectEntity(targetId, false);
      } else {
        app.selection.selectEntity(targetId, true);
      }
      syncPlayerControls();
      updateStats();

      onOpenPieMenu({
        screenPos,
        worldPos: point,
        targetEntityId: targetId,
        targetEntityIds: Array.from(app.selection.selectedEntityIds),
      });
    } else {
      onOpenPieMenu({
        screenPos,
        worldPos: point,
        targetEntityId: null,
        targetEntityIds: [],
      });
    }
  };

  const applyPropBrushAtPoint = (center: Vec3) => {
    const app = appRef.current;
    if (!app || !app.propBrush.activePresetId) return;

    const preset = app.propBrushPresets.find((p) => p.id === app.propBrush.activePresetId);
    if (!preset || preset.items.length === 0) return;

    const brush = app.propBrush;
    const r = brush.radius;

    // Получаем список моделей, участвующих в текущем пресете
    const registry = getPropRegistry();
    const activeModelIds = new Set(
      preset.items
        .map((i) => {
          const regItem = registry.find((r) => r.id === i.propId);
          if (!regItem) return null;
          return regItem.create().visualModel?.modelId;
        })
        .filter(Boolean)
    );

    if (brush.mode === 'erase') {
      // ЛАСТИК: ищем объекты в пределах формы кисти
      const entities = app.world.getEntitiesWith('transform', 'visualModel');
      for (const [eId, { transform, visualModel }] of entities) {
        if (!activeModelIds.has(visualModel.modelId)) continue;

        const dx = transform.x - center.x;
        const dz = transform.z - center.z;
        let inBounds = false;

        if (brush.shape === 'square') {
          const rad = (-(brush.rotation || 0) * Math.PI) / 180;
          const cosA = Math.cos(rad);
          const sinA = Math.sin(rad);
          const rx = dx * cosA - dz * sinA;
          const rz = dx * sinA + dz * cosA;
          inBounds = Math.abs(rx) <= r && Math.abs(rz) <= r;
        } else {
          inBounds = Math.hypot(dx, dz) <= r;
        }

        if (inBounds) {
          // Сериализуем ПЕРЕД удалением
          const serialized = app.serializer.serializeEntities([eId])[0];
          if (serialized) {
            propBrushStateRef.current.deletedEntitiesData.push(serialized);
          }
          app.simulation.deleteEntityRecursive(eId);
        }
      }
      app.syncPhysicsStructures();
      updateStats();
      return;
    }

    // ПОСАДКА:
    // 1. Проверяем плотность (шанс срабатывания кисти в этот тик)
    if (Math.random() > brush.density) return;

    // 2. Генерируем случайную точку внутри выбранной формы (круг или повернутый квадрат)
    let spawnX = center.x;
    let spawnZ = center.z;

    if (brush.shape === 'square') {
      const localX = (Math.random() * 2 - 1) * r;
      const localZ = (Math.random() * 2 - 1) * r;
      const rad = (-(brush.rotation || 0) * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      spawnX = center.x + (localX * cosA + localZ * sinA);
      spawnZ = center.z + (-localX * sinA + localZ * cosA);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * r;
      spawnX = center.x + Math.cos(angle) * dist;
      spawnZ = center.z + Math.sin(angle) * dist;
    }

    // 3. Проверка minDistance
    if (brush.minDistance > 0) {
      const minDSq = brush.minDistance * brush.minDistance;
      const entities = app.world.getEntitiesWith('transform', 'physicsStats');
      for (const [_, { transform }] of entities) {
        const dx = transform.x - spawnX;
        const dz = transform.z - spawnZ;
        if (dx * dx + dz * dz < minDSq) {
          return; // Слишком близко к другому объекту
        }
      }
    }

    // 4. Выбор элемента из пресета с учетом весов
    const totalWeight = preset.items.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedItem = preset.items[0];
    for (const item of preset.items) {
      if (rand < item.weight) {
        selectedItem = item;
        break;
      }
      rand -= item.weight;
    }

    const regItem = registry.find((r) => r.id === selectedItem.propId);
    if (!regItem) return;

    // 5. Подготовка конфига
    const config = regItem.create();

    // Получение высоты ландшафта
    let spawnY = center.y;
    const terrains = app.world.getEntitiesWith('terrain');
    if (terrains.length > 0) {
      const terrainHeight = terrains[0][1].terrain.heights;
      // Используем движковый рэйкаст или грубое приближение для Y
      const hit = app.raycastPhysics(0, 0); // Нельзя использовать экранные координаты тут.
      // Лучше использовать getTerrainHeightAt
      // Но у нас нет прямого импорта getTerrainHeightAt, так что берем через ECS, или полагаемся на компенсацию:
    }

    // Применяем случайный поворот по всем 3 осям (Pitch X, Yaw Y, Roll Z)
    const rotX =
      selectedItem.rotMin.x + Math.random() * (selectedItem.rotMax.x - selectedItem.rotMin.x);
    const rotY =
      selectedItem.rotMin.y + Math.random() * (selectedItem.rotMax.y - selectedItem.rotMin.y);
    const rotZ =
      selectedItem.rotMin.z + Math.random() * (selectedItem.rotMax.z - selectedItem.rotMin.z);

    if (config.transform) {
      const radX = deg2Rad(rotX);
      const radY = deg2Rad(rotY);
      const radZ = deg2Rad(rotZ);

      // Аналитический расчет 3D-кватерниона из углов Эйлера XYZ без сторонних зависимостей
      const c1 = Math.cos(radX * 0.5);
      const c2 = Math.cos(radY * 0.5);
      const c3 = Math.cos(radZ * 0.5);
      const s1 = Math.sin(radX * 0.5);
      const s2 = Math.sin(radY * 0.5);
      const s3 = Math.sin(radZ * 0.5);

      const qx = s1 * c2 * c3 + c1 * s2 * s3;
      const qy = c1 * s2 * c3 - s1 * c2 * s3;
      const qz = c1 * c2 * s3 + s1 * s2 * c3;
      const qw = c1 * c2 * c3 - s1 * s2 * s3;

      config.transform.angle = radY;
      config.transform.rotation = { x: qx, y: qy, z: qz, w: qw };
    }

    // Применяем случайный масштаб (модификация physics)
    const scaleX =
      selectedItem.scaleMin.x + Math.random() * (selectedItem.scaleMax.x - selectedItem.scaleMin.x);
    const scaleY =
      selectedItem.scaleMin.y + Math.random() * (selectedItem.scaleMax.y - selectedItem.scaleMin.y);
    const scaleZ =
      selectedItem.scaleMin.z + Math.random() * (selectedItem.scaleMax.z - selectedItem.scaleMin.z);

    if (config.physics) {
      config.physics.radius = (config.physics.radius || 1) * Math.max(scaleX, scaleZ);
      if (config.physics.height) config.physics.height *= scaleY;
      if (config.physics.points) {
        config.physics.points = config.physics.points.map((p) => ({
          x: p.x * scaleX,
          y: p.y * scaleZ,
        }));
      }
    }

    // Компенсация высоты для склонов
    const physHit = app.raycastPhysics(
      (app.renderer as any).canvas.clientWidth / 2, // Хаки, физику лучше через луч вниз делать.
      (app.renderer as any).canvas.clientHeight / 2
    );
    // Для надежности просто пускаем луч строго вниз из небес
    const rayHit = app.physicsDriver.castRay(
      { x: spawnX, y: 1000, z: spawnZ },
      { x: 0, y: -1, z: 0 },
      2000,
      true
    );
    if (rayHit) {
      spawnY = rayHit.point.y;
      const slopeFactor =
        Math.sqrt(Math.max(0, 1 - rayHit.normal.y * rayHit.normal.y)) / rayHit.normal.y;
      const r = config.physics?.radius ?? 0.3;
      spawnY += r * slopeFactor * 0.5 + 0.02; // Компенсация врезания в склон
    } else {
      spawnY = center.y;
    }

    // Применение ручного вертикального смещения (заглубления)
    if (selectedItem.offsetY !== undefined) {
      spawnY += selectedItem.offsetY;
    }

    // 6. Спавн
    const spawnedId = app.spawnEntity(config, { x: spawnX, y: spawnY, z: spawnZ });
    propBrushStateRef.current.spawnedIds.add(spawnedId);
  };

  const handleMouseLeave = () => {
    GlobalInput.isRmbDown = false;
    if (appRef.current?.gameMode === GameMode.GAME) {
      appRef.current.simulation.clearPlayerNavigationTarget();
    }
    if (isDragging) {
      setHoverTarget(null);
    }
    dragCandidateRef.current = null;

    const app = appRef.current;
    if (app) {
      app.setMouseScreenPos(null, null);
      if (app.gizmo.isDragging()) {
        app.gizmo.cancelDrag(true);
      }
      if (isMarqueeActiveRef.current) {
        app.selection.marqueeBox = null;
        isMarqueeActiveRef.current = false;
      }
      if (app.camera.isRotating) {
        app.camera.endRotate();
      }
      app.endPan();
      app.selection.hoverEntity(null);
    }
    setCursorWorldPos(null);
  };

  return {
    containerRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
    cursorWorldPos,
  };
};
