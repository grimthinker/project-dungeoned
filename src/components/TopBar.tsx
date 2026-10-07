import React, { useState } from 'react';
import { t, useLocale, setLocale } from '../locales';
import { GameMode } from '../config/gameConfig';
import { EventBus } from '../core/EventBus';

export interface TopBarProps {
  mode: GameMode;
  goToEditor: () => void;
  goToSimulation: () => void;
  goToGame: () => void;
  goToMenu: () => void;
  obstaclesEnabled: boolean;
  setObstaclesEnabled: (val: boolean) => void;
  worldFileInputRef: React.RefObject<HTMLInputElement | null>;
  onNewWorld: () => void;
  onDemoWorld: () => void;
  onSaveWorld: () => void;
  onLoadWorldFile: (file: File) => void;
  isPaused: boolean;
  togglePause: () => void;
  globalTimeScale: number;
  setGlobalTimeScale: (val: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHotkeys: () => void;
  showUIOverlays: boolean;
  setShowUIOverlays: (val: boolean) => void;
  showAIDebug: boolean;
  setShowAIDebug: (val: boolean) => void;
  celShading: boolean;
  setCelShading: (val: boolean) => void;
  showFPSMonitor: boolean;
  setShowFPSMonitor: (val: boolean) => void;
  onOpenDialogueEditor?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  mode,
  goToEditor,
  goToSimulation,
  goToGame,
  goToMenu,
  obstaclesEnabled,
  setObstaclesEnabled,
  worldFileInputRef,
  onNewWorld,
  onDemoWorld,
  onSaveWorld,
  onLoadWorldFile,
  isPaused,
  togglePause,
  globalTimeScale,
  setGlobalTimeScale,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenHotkeys,
  showUIOverlays,
  setShowUIOverlays,
  showAIDebug,
  setShowAIDebug,
  celShading,
  setCelShading,
  showFPSMonitor,
  setShowFPSMonitor,
  onOpenDialogueEditor,
}) => {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const locale = useLocale();

  return (
    <div
      style={{
        height: '48px',
        backgroundColor: '#111',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        color: '#ecf0f1',
        boxSizing: 'border-box',
        zIndex: 200,
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
      }}
    >
      {/* Левая часть: Файл и История */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-sm"
            style={{ backgroundColor: '#2c3e50', color: '#fff', border: 'none' }}
            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
          >
            {t('topbar.file')} ▼
          </button>
          {isFileMenuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                onClick={() => setIsFileMenuOpen(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  backgroundColor: '#222',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '4px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '150px',
                  zIndex: 200,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                }}
              >
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    onNewWorld();
                    setIsFileMenuOpen(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('topbar.newWorld')}
                </button>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    onSaveWorld();
                    setIsFileMenuOpen(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('topbar.saveJson')}
                </button>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    worldFileInputRef.current?.click();
                    setIsFileMenuOpen(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('topbar.loadJson')}
                </button>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f39c12',
                    padding: '8px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    onDemoWorld();
                    setIsFileMenuOpen(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('topbar.demoWorld')}
                </button>
              </div>
            </>
          )}

          {/* Инпут вынесен за пределы условного блока, чтобы не размонтироваться при клике */}
          <input
            type="file"
            ref={worldFileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoadWorldFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <div
          style={{ display: 'flex', gap: '4px', borderLeft: '1px solid #444', paddingLeft: '12px' }}
        >
          <button
            className="btn btn-sm"
            style={{
              opacity: canUndo ? 1 : 0.5,
              backgroundColor: 'transparent',
              color: '#fff',
              border: '1px solid #444',
            }}
            disabled={!canUndo}
            onClick={onUndo}
            title="Ctrl+Z"
          >
            {t('topbar.undo')}
          </button>
          <button
            className="btn btn-sm"
            style={{
              opacity: canRedo ? 1 : 0.5,
              backgroundColor: 'transparent',
              color: '#fff',
              border: '1px solid #444',
            }}
            disabled={!canRedo}
            onClick={onRedo}
            title="Ctrl+Y"
          >
            {t('topbar.redo')}
          </button>
        </div>

        {onOpenDialogueEditor && mode === GameMode.EDITOR && (
          <button
            className="btn btn-sm"
            style={{
              backgroundColor: '#16a085',
              color: '#fff',
              border: 'none',
              marginLeft: '4px',
              padding: '4px 10px',
              fontWeight: 'bold',
            }}
            onClick={onOpenDialogueEditor}
            title="Открыть визуальный редактор графов диалогов"
          >
            💬 Диалоги
          </button>
        )}

        {mode === GameMode.EDITOR && (
          <button
            className="btn btn-sm"
            style={{
              backgroundColor: '#d35400',
              color: '#fff',
              border: 'none',
              marginLeft: '4px',
              padding: '4px 10px',
              fontWeight: 'bold',
            }}
            onClick={() => EventBus.emit('quest:open-editor', { questId: 'fetch_dog_quest' })}
            title="Открыть визуальный редактор графов квестов"
          >
            📜 Квесты
          </button>
        )}
      </div>

      {/* Центральная часть: Режимы и Пауза */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#1a1a1a',
          padding: '4px',
          borderRadius: '6px',
          border: '1px solid #333',
        }}
      >
        <button
          className="btn btn-sm"
          style={{
            backgroundColor: mode === GameMode.EDITOR ? '#2980b9' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
          }}
          onClick={goToEditor}
        >
          {t('topbar.editor')}
        </button>
        <button
          className="btn btn-sm"
          style={{
            backgroundColor: mode === GameMode.SIMULATION ? '#27ae60' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
          }}
          onClick={goToSimulation}
        >
          {t('topbar.simulation')}
        </button>
        <button
          className="btn btn-sm"
          style={{
            backgroundColor: mode === GameMode.GAME ? '#8e44ad' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
          }}
          onClick={goToGame}
        >
          {t('topbar.game')}
        </button>
        <button
          className="btn btn-sm"
          style={{
            backgroundColor: mode === GameMode.MENU ? '#d35400' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
          }}
          onClick={goToMenu}
        >
          {t('topbar.menu')}
        </button>

        {mode !== GameMode.EDITOR && (
          <>
            <div
              style={{ width: '1px', height: '20px', backgroundColor: '#444', margin: '0 4px' }}
            />

            <button
              className="btn btn-sm"
              style={{
                backgroundColor: isPaused ? '#e74c3c' : 'transparent',
                color: isPaused ? '#fff' : '#e74c3c',
                border: '1px solid #e74c3c',
                padding: '4px 12px',
              }}
              onClick={togglePause}
              disabled={mode === GameMode.GAME}
              title="Space"
            >
              {isPaused ? t('topbar.pause') : t('topbar.running')}
            </button>
          </>
        )}

        {mode === GameMode.SIMULATION && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderLeft: '1px solid #333',
              paddingLeft: '8px',
              marginLeft: '4px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#bdc3c7' }}>{t('topbar.speed')}</span>
            <input
              type="range"
              min="0.05"
              max="5"
              step="0.05"
              value={globalTimeScale}
              onChange={(e) => setGlobalTimeScale(parseFloat(e.target.value))}
              style={{ width: '70px', accentColor: '#27ae60', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', color: '#fff', width: '30px' }}>
              {globalTimeScale.toFixed(2)}x
            </span>
          </div>
        )}
      </div>

      {/* Правая часть: Настройки отображения и Язык */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#bdc3c7',
          }}
        >
          <input
            type="checkbox"
            checked={showUIOverlays}
            onChange={(e) => setShowUIOverlays(e.target.checked)}
          />
          {t('topbar.namesAndHp')}
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#bdc3c7',
          }}
        >
          <input
            type="checkbox"
            checked={obstaclesEnabled}
            onChange={(e) => setObstaclesEnabled(e.target.checked)}
          />
          {t('topbar.collisions')}
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#f39c12',
          }}
        >
          <input
            type="checkbox"
            checked={showAIDebug}
            onChange={(e) => setShowAIDebug(e.target.checked)}
            style={{ accentColor: '#f39c12' }}
          />
          {t('topbar.aiDebug')}
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#9b59b6',
          }}
        >
          <input
            type="checkbox"
            checked={celShading}
            onChange={(e) => setCelShading(e.target.checked)}
            style={{ accentColor: '#9b59b6' }}
          />
          {t('topbar.celShading')}
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#10b981',
          }}
        >
          <input
            type="checkbox"
            checked={showFPSMonitor}
            onChange={(e) => setShowFPSMonitor(e.target.checked)}
            style={{ accentColor: '#10b981' }}
          />
          {t('topbar.fpsMonitor')}
        </label>

        {/* Переключатель языка RU / EN */}
        <button
          className="btn btn-sm"
          style={{
            backgroundColor: '#1f2d3d',
            color: '#3498db',
            border: '1px solid #3498db',
            borderRadius: '4px',
            fontWeight: 'bold',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
          onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}
          title="Switch Language / Сменить язык"
        >
          🌐 {locale.toUpperCase()}
        </button>

        <button
          className="btn btn-sm"
          style={{
            backgroundColor: '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            padding: 0,
          }}
          onClick={onOpenHotkeys}
          title={t('topbar.hotkeysTitle')}
        >
          ?
        </button>
      </div>
    </div>
  );
};
