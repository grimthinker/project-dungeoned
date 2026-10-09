import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameApp } from './GameApp';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useWorldIO } from './hooks/useWorldIO';
import { EntityConfig } from './ecs/types';
import { BTNodeDTO } from './ai/core';
import { LeftDock, DockTab } from './components/LeftDock/LeftDock';
import { PieMenu } from './components/PieMenu/PieMenu';
import { PieMenuState } from './components/PieMenu/types';
import { usePieMenuTree } from './components/PieMenu/usePieMenuTree';
import { PlacementOverlays } from './components/canvas/PlacementOverlays';
import { Inspector } from './components/Inspector';
import { TopBar } from './components/TopBar';
import { MainMenu } from './components/MainMenu';
import { HotkeysModal } from './components/HotkeysModal';
import { CreatureWizardModal, NewWorldModal, SettingsModal } from './components/modals';
import { GameHUD } from './components/GameHUD';
import { DialogueEditorWorkspace } from './components/dialogueEditor/DialogueEditorWorkspace';
import { QuestEditorWorkspace } from './components/questEditor/QuestEditorWorkspace';
import { BodyStructureType } from './ecs/templates';
import { ModularPlacementOptions } from './types';
import { CanvasHUD } from './components/CanvasHUD';
import { useDragDrop } from './dnd/DragDropContext';
import { DragGhostOverlay } from './dnd/DragGhostOverlay';
import { MultiSelectionDrawer } from './components/MultiSelectionDrawer';
import { PlacementMode, BlackboardPickingState, GizmoTool } from './types';
import { GameMode } from './config/gameConfig';
import { GlobalInput } from './input/GlobalInput';
import { saveWorldToStorage, loadWorldFromStorage } from './storage/autoSave';
import { t } from './locales';
import { EventBus } from './core/EventBus';
import { initRapier } from './physics/rapierLoader';
import { TreeBBSchema } from './ai/schema';
import demoWorldData from './assets/levels/demo.json';
import './editor.css';

export const App: React.FC = () => {
  const appRef = useRef<GameApp | null>(null);
  const worldFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  const [engineState, setEngineState] = useState(() => ({
    mode: GameMode.MENU,
    isPaused: true,
    timeScale: 1.0,
    showUIOverlays: true,
    showAIDebug:
      localStorage.getItem('engine_show_ai_debug') !== null
        ? localStorage.getItem('engine_show_ai_debug') === 'true'
        : true,
    celShading:
      localStorage.getItem('engine_cel_shading') !== null
        ? localStorage.getItem('engine_cel_shading') === 'true'
        : true,
    outlineLines:
      localStorage.getItem('engine_outline_lines') !== null
        ? localStorage.getItem('engine_outline_lines') === 'true'
        : true,
    showFPSMonitor:
      localStorage.getItem('engine_show_fps_monitor') !== null
        ? localStorage.getItem('engine_show_fps_monitor') === 'true'
        : true,
  }));

  const [isWasmReady, setIsWasmReady] = useState<boolean>(false);
  const [, setIsEngineReady] = useState<boolean>(false);
  const [gizmoTool, setGizmoTool] = useState<GizmoTool>('translate');
  const [leftDockTab, setLeftDockTab] = useState<DockTab>('hierarchy');
  const [pieMenuState, setPieMenuState] = useState<PieMenuState | null>(null);

  const applyGizmoTool = useCallback((tool: GizmoTool) => {
    setGizmoTool(tool);
    if (appRef.current) appRef.current.gizmo.setTool(tool);
  }, []);

  const closePieMenu = useCallback(() => {
    setPieMenuState(null);
  }, []);

  const [obstaclesEnabled, setObstaclesEnabled] = useState(true);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>({
    creature: true,
    item: true,
    obstacle: true,
    zone: true,
    marker: true,
  });
  const [placementMode, setPlacementMode] = useState<PlacementMode | null>(null);
  const [bbPicking, setBbPicking] = useState<BlackboardPickingState | null>(null);

  const [btData, setBtData] = useState<BTNodeDTO | null>(null);
  const [btBlackboard, setBtBlackboard] = useState<Record<string, unknown> | null>(null);
  const [btSchema, setBtSchema] = useState<TreeBBSchema | null>(null);
  const [isHotkeysOpen, setIsHotkeysOpen] = useState(false);
  const [isCreatureWizardOpen, setIsCreatureWizardOpen] = useState(false);
  const [isNewWorldModalOpen, setIsNewWorldModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeDialogueEditorId, setActiveDialogueEditorId] = useState<string | null>(null);
  const [activeQuestEditorId, setActiveQuestEditorId] = useState<string | null>(null);

  const { setApp } = useDragDrop();

  // Синхронизация реального размера Canvas с Flex-контейнером
  useEffect(() => {
    if (!canvasWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        appRef.current?.resizeCanvas(width, height);
      }
    });
    observer.observe(canvasWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const { syncPlayerControls } = useKeyboardControls({
    isModalOpen: engineState.isPaused,
    isEditModalOpen: false,
    mode: engineState.mode,
  });

  // Подписка на события движка через EventBus
  useEffect(() => {
    const unsubState = EventBus.on('engine:state-changed', (state) => {
      setEngineState(state);
    });

    const unsubSelection = EventBus.on(
      'selection:changed',
      ({ selectedEntityId: sId, selectedEntityIds: sIds }) => {
        setSelectedEntityId((prev) => (prev !== sId ? sId : prev));
        setSelectedEntityIds((prev) => {
          if (prev.length === sIds.length && prev.every((id, idx) => id === sIds[idx])) {
            return prev;
          }
          return sIds;
        });
      }
    );

    const unsubBT = EventBus.on(
      'bt:updated',
      ({ btData: data, btBlackboard: bb, btSchema: schema }) => {
        setBtData(data);
        setBtBlackboard(bb);
        setBtSchema(schema);
      }
    );

    const unsubPlayerDied = EventBus.on('game:playerDied', () => {
      if (appRef.current) {
        if (appRef.current.gameMode === GameMode.GAME) {
          appRef.current.camera.restoreState();
        }
        appRef.current.gameMode = GameMode.SIMULATION;
        appRef.current.isPaused = true;
      }
    });

    const unsubWorld = EventBus.on('world:updated', () => {
      syncPlayerControls();
    });

    const unsubOpenDialogue = EventBus.on('dialogue:open-editor', ({ dialogueId }) => {
      setActiveDialogueEditorId(dialogueId || 'default_npc_dialogue');
    });

    const unsubOpenQuest = EventBus.on('quest:open-editor', ({ questId }) => {
      setActiveQuestEditorId(questId || 'fetch_dog_quest');
    });

    return () => {
      unsubState();
      unsubSelection();
      unsubBT();
      unsubPlayerDied();
      unsubWorld();
      unsubOpenDialogue();
      unsubOpenQuest();
    };
  }, [syncPlayerControls]);

  const updateStats = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    app.selection.emitSelectionChanged();
    app.updateBTData(true);
  }, []);

  const {
    containerRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
    cursorWorldPos,
  } = useCanvasInteraction({
    appRef,
    placementMode,
    setPlacementMode,
    syncPlayerControls,
    updateStats,
    mode: engineState.mode,
    typeFilters,
    onOpenPieMenu: setPieMenuState,
    onClosePieMenu: closePieMenu,
    bbPicking,
    setBbPicking,
  });

  const handleResetCamera = useCallback(() => {
    closePieMenu();
    const app = appRef.current;
    const canvas = app?.canvas;
    if (!app || !canvas) return;
    app.camera.resetZoomAndRotation(canvas);
    updateStats();
    saveWorldToStorage(app, app.editorSnapshot);
  }, [closePieMenu, updateStats]);

  // 1. Асинхронная инициализация WASM модуля Rapier3D
  useEffect(() => {
    let isCancelled = false;
    initRapier()
      .then(() => {
        if (!isCancelled) {
          setIsWasmReady(true);
        }
      })
      .catch((err) => {
        console.error('[RapierLoader] Ошибка инициализации WASM:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. Инициализация движка строго 1 раз после монтирования контейнера и готовности WASM
  useEffect(() => {
    if (!isWasmReady || !containerRef.current) return;
    const app = new GameApp(containerRef.current);
    appRef.current = app;
    setApp(app);

    app.gameMode = GameMode.MENU;
    app.isPaused = true;
    app.emitState(); // Форсируем первичную синхронизацию в React
    app.start();

    // В главном меню мы стартуем с пустой сцены для экономии памяти.
    // Загрузка мира отложена до вызова goToEditor.

    setIsEngineReady(true);

    // Доступ к движку из консоли браузера только в режиме разработки (DEV)
    if (import.meta.env.DEV) {
      (window as any).appRef = app;
    }

    return () => {
      if (import.meta.env.DEV) {
        delete (window as any).appRef;
      }
      setApp(null);
      app.destroy();
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWasmReady, setApp]);

  const togglePause = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    if (app.gameMode === GameMode.EDITOR || app.gameMode === GameMode.GAME) {
      return;
    }
    app.isPaused = !app.isPaused;
  }, []);

  const goToMenu = useCallback(() => {
    GlobalInput.keys.clear();
    const app = appRef.current;
    if (!app) return;
    app.clearPlayerAim();

    if (app.gameMode === GameMode.GAME) {
      app.camera.restoreState();
    }

    // Сохраняем прогресс перед полной выгрузкой мира
    if (app.gameMode === GameMode.EDITOR) {
      saveWorldToStorage(app);
    } else if (app.gameMode === GameMode.SIMULATION || app.gameMode === GameMode.GAME) {
      saveWorldToStorage(app, app.editorSnapshot);
    }

    app.gameMode = GameMode.MENU;
    app.isPaused = true;
    app.selection.clear();
    app.clearWorld(); // Выгружаем мир из памяти
  }, []);

  const goToEditor = useCallback(() => {
    GlobalInput.keys.clear();
    const app = appRef.current;
    if (!app) return;
    app.clearPlayerAim();

    // Восстанавливаем позицию камеры редактора/симуляции, если выходим из игры
    if (app.gameMode === GameMode.GAME) {
      app.camera.restoreState();
    }

    // Если мы переходим из МЕНЮ - значит память была пуста, нужно загрузить мир
    if (app.gameMode === GameMode.MENU) {
      const autoSave = loadWorldFromStorage();
      if (autoSave && autoSave.world) {
        app.deserializeWorld(autoSave.world);
        if (autoSave.camera) {
          app.camera.deserialize(autoSave.camera);
        }
      } else {
        app.initDefaultWorld();
      }
      app.selection.emitSelectionChanged();
      app.updateBTData(true);
    } else if (app.editorSnapshot) {
      app.deserializeWorld(app.editorSnapshot);
      app.editorSnapshot = null;
    }

    app.gameMode = GameMode.EDITOR;
    app.isPaused = true;
    app.selection.clear();
    saveWorldToStorage(app);
  }, []);

  const goToSimulation = useCallback(() => {
    GlobalInput.keys.clear();
    const app = appRef.current;
    if (!app) return;
    app.clearPlayerAim();

    // Восстанавливаем позицию камеры редактора/симуляции, если выходим из игры
    if (app.gameMode === GameMode.GAME) {
      app.camera.restoreState();
    }

    if (app.gameMode === GameMode.EDITOR) {
      app.editorSnapshot = app.serializeWorld();
    }

    app.gameMode = GameMode.SIMULATION;
    app.isPaused = false;
    app.selection.clear();
    saveWorldToStorage(app, app.editorSnapshot);
  }, []);

  const goToGame = useCallback(() => {
    GlobalInput.keys.clear();

    // Сбрасываем фокус с UI-кнопок, чтобы клавиатура (WASD, Space) сразу работала в игре
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const app = appRef.current;
    if (!app) return;

    const playerId = app.getPlayerEntityId();
    if (!playerId) {
      alert(t('app.noPlayerToPlay'));
      return;
    }

    // Сохраняем положение камеры редактора/симуляции перед переходом в игру
    app.camera.saveState();

    // Мгновенно наводим камеру на голову игрока при входе в режим игры и применяем игровые лимиты
    const headPos = app.simulation.getPlayerHeadPosition(playerId);
    if (headPos) {
      app.camera.snapToTarget(headPos.x, headPos.y, headPos.z);
    }
    app.camera.clampToGameBounds();

    if (app.gameMode === GameMode.EDITOR) {
      app.editorSnapshot = app.serializeWorld();
    }

    app.globalTimeScale = 1.0;
    app.gameMode = GameMode.GAME;
    app.isPaused = false;
    saveWorldToStorage(app, app.editorSnapshot);
  }, []);

  const handleDeleteEntity = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    app.deleteSelectedEntities();
    syncPlayerControls();
    updateStats();
  }, [syncPlayerControls, updateStats]);

  const handleUndo = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    if (app.undo()) {
      syncPlayerControls();
      updateStats();
    }
  }, [syncPlayerControls, updateStats]);

  const handleRedo = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    if (app.redo()) {
      syncPlayerControls();
      updateStats();
    }
  }, [syncPlayerControls, updateStats]);

  const handleQuickSpawn = useCallback((type: 'player' | 'attacker') => {
    const behavior = type === 'player' ? 'PlayerTree' : 'AttackerTree';
    const name = type === 'player' ? t('palette.player') : t('palette.attacker');
    setPlacementMode({
      kind: 'modular',
      options: {
        structureType: 'humanoid',
        behavior,
        name,
      },
    });
  }, []);

  const handleSelectSpawnPreset = useCallback((config: EntityConfig) => {
    setPlacementMode({
      kind: 'entity',
      config,
    });
  }, []);

  const handleFocusEntity = useCallback((id: string) => {
    const app = appRef.current;
    if (!app || !app.canvas) return;
    const transform = app.world.getComponent(id, 'transform');
    if (transform) {
      app.camera.lookAt(transform.x, transform.z, app.canvas);
    }
  }, []);

  const handleInspectBT = useCallback((id: string) => {
    appRef.current?.selection.selectEntity(id, true);
    setLeftDockTab('bt');
  }, []);

  const handleCancelGizmo = useCallback(() => {
    const app = appRef.current;
    if (app && app.gizmo.isDragging()) {
      app.gizmo.cancelDrag(true);
      updateStats();
      return true;
    }
    return false;
  }, [updateStats]);

  const handleClosePieMenuViaShortcut = useCallback(() => {
    if (pieMenuState !== null) {
      setPieMenuState(null);
      return true;
    }
    return false;
  }, [pieMenuState]);

  const handleCommitHistory = useCallback((desc: string) => {
    const app = appRef.current;
    if (!app) return;
    app.commitHistory(desc);
    app.updateBTData(true);
  }, []);

  const handleStartBBPicking = useCallback(
    (key: string) => {
      if (!selectedEntityId) return;
      setBbPicking({ entityId: selectedEntityId, key });
    },
    [selectedEntityId]
  );

  const handleCancelPicker = useCallback(() => {
    if (bbPicking) {
      setBbPicking(null);
      return true;
    }
    return false;
  }, [bbPicking]);

  // Вынесенные файловые операции и автосохранение
  const { saveWorldFile, loadWorldFile, createEmptyWorld, loadDemoWorld } = useWorldIO({
    appRef,
    closePieMenu,
    syncPlayerControls,
    updateStats,
  });

  // Вынесенное дерево радиального меню (Pie Menu)
  const pieMenuItems = usePieMenuTree({
    app: appRef.current,
    pieMenuState,
    onClose: closePieMenu,
    onFocusEntity: handleFocusEntity,
    onInspectBT: handleInspectBT,
    onDeleteSelected: handleDeleteEntity,
    syncPlayerControls,
    updateStats,
  });

  useGlobalShortcuts({
    mode: engineState.mode,
    isPaused: engineState.isPaused,
    togglePause,
    handleDeleteEntity,
    onQuickSpawn: handleQuickSpawn,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onExitGame: goToEditor,
    onSetGizmoTool: applyGizmoTool,
    onCancelGizmo: handleCancelGizmo,
    onClosePieMenu: handleClosePieMenuViaShortcut,
    onCancelPicker: handleCancelPicker,
  });

  return (
    <div
      id="app"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Экран загрузки WASM ядра физики */}
      {!isWasmReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#121212',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            fontFamily: 'sans-serif',
            fontSize: '13px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️</div>
          <div style={{ fontWeight: 'bold' }}>Инициализация физического ядра Rapier3D...</div>
        </div>
      )}

      {/* Верхняя панель управления скрывается в режиме игры и в главном меню */}
      {engineState.mode !== GameMode.GAME && engineState.mode !== GameMode.MENU && (
        <TopBar
          mode={engineState.mode}
          onOpenDialogueEditor={() => setActiveDialogueEditorId('default_npc_dialogue')}
          goToEditor={goToEditor}
          goToSimulation={goToSimulation}
          goToGame={goToGame}
          goToMenu={goToMenu}
          obstaclesEnabled={obstaclesEnabled}
          setObstaclesEnabled={(val) => {
            setObstaclesEnabled(val);
            appRef.current?.physics.setObstaclesEnabled(val);
          }}
          worldFileInputRef={worldFileInputRef}
          onNewWorld={() => setIsNewWorldModalOpen(true)}
          onDemoWorld={loadDemoWorld}
          onSaveWorld={saveWorldFile}
          onLoadWorldFile={loadWorldFile}
          isPaused={engineState.isPaused}
          togglePause={togglePause}
          globalTimeScale={engineState.timeScale}
          setGlobalTimeScale={(val) => {
            if (appRef.current) appRef.current.globalTimeScale = val;
          }}
          canUndo={appRef.current?.commandHistory.canUndo() ?? false}
          canRedo={appRef.current?.commandHistory.canRedo() ?? false}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenHotkeys={() => setIsHotkeysOpen(true)}
          showUIOverlays={engineState.showUIOverlays}
          setShowUIOverlays={(val) => {
            if (appRef.current) appRef.current.showUIOverlays = val;
          }}
          showAIDebug={engineState.showAIDebug}
          setShowAIDebug={(val) => {
            if (appRef.current) appRef.current.showAIDebug = val;
          }}
          celShading={engineState.celShading}
          setCelShading={(val) => {
            if (appRef.current) appRef.current.celShading = val;
          }}
          outlineLines={engineState.outlineLines}
          setOutlineLines={(val) => {
            if (appRef.current) appRef.current.outlineLines = val;
          }}
          showFPSMonitor={engineState.showFPSMonitor}
          setShowFPSMonitor={(val) => {
            if (appRef.current) appRef.current.showFPSMonitor = val;
          }}
        />
      )}

      {/* Основная рабочая область (Flex-контейнер) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Левый док (Иерархия, Палитра, BT, Анимации, Террейн) */}
        {engineState.mode !== GameMode.GAME && engineState.mode !== GameMode.MENU && (
          <LeftDock
            app={appRef.current}
            world={appRef.current?.world}
            selectedEntityId={selectedEntityId}
            onSelectEntity={(id, clearGroup = true) => {
              if (appRef.current) {
                if (!clearGroup && appRef.current.selection.selectedEntityIds.has(id)) {
                  appRef.current.selection.deselectEntity(id);
                } else {
                  appRef.current.selection.selectEntity(id, clearGroup);
                }
              }
            }}
            onFocusEntity={handleFocusEntity}
            onSelectSpawnPreset={handleSelectSpawnPreset}
            onSelectModular={(behavior, name, structureType: BodyStructureType = 'humanoid') =>
              setPlacementMode({
                kind: 'modular',
                options: { structureType, behavior, name },
              })
            }
            onSelectPrefab={(prefabId, name) =>
              setPlacementMode({
                kind: 'prefab',
                prefabId,
                name,
              })
            }
            onOpenWizard={() => setIsCreatureWizardOpen(true)}
            btData={btData}
            btBlackboard={btBlackboard}
            btSchema={btSchema}
            activeTab={leftDockTab}
            onTabChange={setLeftDockTab}
            onStartPicking={handleStartBBPicking}
            pickingKey={bbPicking?.key ?? null}
          />
        )}

        {/* Область отображения холста */}
        <div
          id="canvas-container"
          ref={(node) => {
            canvasWrapperRef.current = node;
            containerRef.current = node;
          }}
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        >
          {/* Главное меню */}
          {engineState.mode === GameMode.MENU && (
            <MainMenu
              onOpenEditor={goToEditor}
              onDemoLevel={() => {
                const app = appRef.current;
                if (!app) return;
                app.editorSnapshot = null;
                app.deserializeWorld(demoWorldData);
                saveWorldToStorage(app);
                syncPlayerControls();
                updateStats();
                goToGame();
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {/* Статус-бар холста (зум, координаты, сброс вида, выбор манипулятора) */}
          {engineState.mode !== GameMode.GAME && engineState.mode !== GameMode.MENU && (
            <CanvasHUD
              camera={appRef.current?.camera}
              cursorWorldPos={cursorWorldPos}
              onResetCamera={handleResetCamera}
              gizmoTool={gizmoTool}
              onSelectGizmoTool={applyGizmoTool}
            />
          )}

          {/* Внутриигровой интерфейс HUD */}
          {engineState.mode === GameMode.GAME && (
            <GameHUD
              app={appRef.current}
              hudProvider={appRef.current?.hudAdapter}
              selectedEntityId={selectedEntityId}
              onExitToEditor={goToEditor}
              onGotoSimulation={goToSimulation}
              onGotoMenu={goToMenu}
            />
          )}

          {/* Нижняя панель группового выделения (Drawer) */}
          {engineState.mode !== GameMode.GAME && engineState.mode !== GameMode.MENU && (
            <MultiSelectionDrawer
              selectedEntityIds={selectedEntityIds}
              selectedEntityId={selectedEntityId}
              world={appRef.current?.world}
              typeFilters={typeFilters}
              onToggleFilter={(type) =>
                setTypeFilters((prev) => ({
                  ...prev,
                  [type]: prev[type] === false ? true : false,
                }))
              }
              onSelectEntity={(id) => {
                appRef.current?.selection.selectEntity(id, false);
              }}
              onDeselectEntity={(id) => {
                appRef.current?.selection.deselectEntity(id);
              }}
              onClearSelection={() => {
                appRef.current?.selection.clear();
              }}
              onDeleteSelected={handleDeleteEntity}
            />
          )}

          {/* Плашки режимов размещения и пикера Blackboard */}
          <PlacementOverlays
            placementMode={placementMode}
            bbPicking={bbPicking}
            onCancelPlacement={() => setPlacementMode(null)}
            onCancelBBPicking={() => setBbPicking(null)}
          />

          {/* Радиальное контекстное меню (Pie Menu) */}
          {pieMenuState && engineState.mode === GameMode.EDITOR && (
            <PieMenu
              position={pieMenuState.screenPos}
              title={
                pieMenuState.targetEntityId
                  ? appRef.current?.world.getComponent(pieMenuState.targetEntityId, 'meta')?.name ||
                    pieMenuState.targetEntityId
                  : t('app.pieQuickSpawn')
              }
              onClose={closePieMenu}
              items={pieMenuItems}
            />
          )}
        </div>

        {/* Правый док (Живой Инспектор) */}
        {engineState.mode !== GameMode.GAME && engineState.mode !== GameMode.MENU && (
          <Inspector
            app={appRef.current}
            mode={engineState.mode}
            selectedEntityId={selectedEntityId}
            world={appRef.current?.world}
            onCommitHistory={handleCommitHistory}
            handleDeleteEntity={handleDeleteEntity}
            onOpenDialogueEditor={(dId) => setActiveDialogueEditorId(dId)}
          />
        )}
      </div>

      {activeDialogueEditorId && (
        <DialogueEditorWorkspace
          initialDialogueId={activeDialogueEditorId}
          onClose={() => setActiveDialogueEditorId(null)}
        />
      )}

      {activeQuestEditorId && (
        <QuestEditorWorkspace
          initialQuestId={activeQuestEditorId}
          onClose={() => setActiveQuestEditorId(null)}
        />
      )}

      <HotkeysModal isOpen={isHotkeysOpen} onClose={() => setIsHotkeysOpen(false)} />
      <CreatureWizardModal
        isOpen={isCreatureWizardOpen}
        onClose={() => setIsCreatureWizardOpen(false)}
        onConfirm={(options: ModularPlacementOptions) => {
          setIsCreatureWizardOpen(false);
          setPlacementMode({
            kind: 'modular',
            options,
          });
        }}
      />
      <NewWorldModal
        isOpen={isNewWorldModalOpen}
        onClose={() => setIsNewWorldModalOpen(false)}
        onConfirm={createEmptyWorld}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={() => appRef.current?.applyGlobalSettings()}
      />
      <DragGhostOverlay />
    </div>
  );
};
