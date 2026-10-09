import React, { useState, useEffect } from 'react';
import { t } from '../../locales';
import { GRAPHICS_CONFIG } from '../../config/graphicsConfig';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { SettingsManager, UserSettings } from '../../config/SettingsManager';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'audio'>('graphics');

  // Инициализируем локальный стейт сразу актуальными значениями из конфигов,
  // чтобы при первом рендере (до срабатывания useEffect) объект не был пустым.
  const [settings, setSettings] = useState<UserSettings>(() => ({
    resScale: GRAPHICS_CONFIG.resolution.scale,
    resFilter: GRAPHICS_CONFIG.resolution.upscaleFilter,
    camFov: GRAPHICS_CONFIG.camera.fov,
    shadowEnabled: GRAPHICS_CONFIG.shadows.enabled,
    shadowMapSize: GRAPHICS_CONFIG.shadows.mapSize,
    waterRes: GRAPHICS_CONFIG.water.ripples.resolution,
    waterDisp: GRAPHICS_CONFIG.water.ripples.displacementScale,
    waterFoam: GRAPHICS_CONFIG.water.ripples.foamThreshold,
    waterFps: GRAPHICS_CONFIG.water.ripples.simFps,
    grassDensity: GRASS_CONFIG.defaultDensityFactor,
    showGameFPSMonitor: GRAPHICS_CONFIG.showGameFPSMonitor,
  }));

  // Синхронизируем стейт при каждом открытии окна (на случай, если конфиги изменились извне)
  useEffect(() => {
    if (isOpen) {
      setSettings({
        resScale: GRAPHICS_CONFIG.resolution.scale,
        resFilter: GRAPHICS_CONFIG.resolution.upscaleFilter,
        camFov: GRAPHICS_CONFIG.camera.fov,
        shadowEnabled: GRAPHICS_CONFIG.shadows.enabled,
        shadowMapSize: GRAPHICS_CONFIG.shadows.mapSize,
        waterRes: GRAPHICS_CONFIG.water.ripples.resolution,
        waterDisp: GRAPHICS_CONFIG.water.ripples.displacementScale,
        waterFoam: GRAPHICS_CONFIG.water.ripples.foamThreshold,
        waterFps: GRAPHICS_CONFIG.water.ripples.simFps,
        grassDensity: GRASS_CONFIG.defaultDensityFactor,
        showGameFPSMonitor: GRAPHICS_CONFIG.showGameFPSMonitor,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Сохраняем через единый менеджер
    SettingsManager.save(settings);
    onSave(); // Вызов применения настроек к движку в GameApp
    onClose();
  };

  const groupStyle: React.CSSProperties = {
    backgroundColor: '#1b1b1b',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    color: '#ecf0f1',
  };

  const inputControlStyle: React.CSSProperties = {
    backgroundColor: '#111',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    outline: 'none',
  };

  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ zIndex: 99999 }}
    >
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-dialog"
        style={{
          width: '500px',
          padding: '24px',
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', color: '#3498db' }}>{t('settingsModal.title')}</h3>

        {/* Табы */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('graphics')}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: activeTab === 'graphics' ? '#2980b9' : '#222',
              color: '#fff',
              border: activeTab === 'graphics' ? '1px solid #3498db' : '1px solid #444',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {t('settingsModal.tabs.graphics')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: activeTab === 'audio' ? '#2980b9' : '#222',
              color: '#fff',
              border: activeTab === 'audio' ? '1px solid #3498db' : '1px solid #444',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {t('settingsModal.tabs.audio')}
          </button>
        </div>

        {/* Контент таба Графика */}
        {activeTab === 'graphics' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '50vh',
              overflowY: 'auto',
              paddingRight: '6px',
            }}
          >
            {/* Общие настройки */}
            <div style={groupStyle}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>
                {t('settingsModal.graphics.general')}
              </div>
              <label
                style={{
                  ...labelStyle,
                  justifyContent: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.showGameFPSMonitor}
                  onChange={(e) =>
                    setSettings({ ...settings, showGameFPSMonitor: e.target.checked })
                  }
                  style={{ accentColor: '#10b981', transform: 'scale(1.2)' }}
                />
                <span>Мониторинг FPS в игре</span>
              </label>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.resScale')} ({settings.resScale.toFixed(2)}x)
                </span>
                <input
                  type="range"
                  min="0.2"
                  max="1.5"
                  step="0.05"
                  value={settings.resScale}
                  onChange={(e) =>
                    setSettings({ ...settings, resScale: parseFloat(e.target.value) })
                  }
                  style={{ width: '150px', accentColor: '#3498db', cursor: 'pointer' }}
                />
              </label>
              <label style={labelStyle}>
                <span>{t('settingsModal.graphics.resFilter')}</span>
                <select
                  value={settings.resFilter}
                  onChange={(e) => setSettings({ ...settings, resFilter: e.target.value })}
                  style={inputControlStyle}
                >
                  <option value="smooth">{t('settingsModal.graphics.filterSmooth')}</option>
                  <option value="crisp">{t('settingsModal.graphics.filterCrisp')}</option>
                  <option value="pixelated">{t('settingsModal.graphics.filterPixelated')}</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.fov')} ({settings.camFov}°)
                </span>
                <input
                  type="range"
                  min="30"
                  max="120"
                  step="1"
                  value={settings.camFov}
                  onChange={(e) =>
                    setSettings({ ...settings, camFov: parseInt(e.target.value, 10) })
                  }
                  style={{ width: '150px', accentColor: '#3498db', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Тени */}
            <div style={groupStyle}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>
                {t('settingsModal.graphics.shadows')}
              </div>
              <label
                style={{
                  ...labelStyle,
                  justifyContent: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.shadowEnabled}
                  onChange={(e) => setSettings({ ...settings, shadowEnabled: e.target.checked })}
                  style={{ accentColor: '#2ecc71', transform: 'scale(1.2)' }}
                />
                <span>{t('settingsModal.graphics.shadowEnabled')}</span>
              </label>
              <label style={labelStyle}>
                <span>{t('settingsModal.graphics.shadowMapSize')}</span>
                <select
                  value={settings.shadowMapSize}
                  onChange={(e) =>
                    setSettings({ ...settings, shadowMapSize: parseInt(e.target.value, 10) })
                  }
                  style={inputControlStyle}
                  disabled={!settings.shadowEnabled}
                >
                  <option value="1024">1024 (Low)</option>
                  <option value="2048">2048 (Medium)</option>
                  <option value="4096">4096 (High)</option>
                  <option value="8192">8192 (Max)</option>
                </select>
              </label>
            </div>

            {/* Вода */}
            <div style={groupStyle}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>
                {t('settingsModal.graphics.water')}
              </div>
              <label style={labelStyle}>
                <span>{t('settingsModal.graphics.waterRes')}</span>
                <select
                  value={settings.waterRes}
                  onChange={(e) =>
                    setSettings({ ...settings, waterRes: parseInt(e.target.value, 10) })
                  }
                  style={inputControlStyle}
                >
                  <option value="64">64 (Low)</option>
                  <option value="128">128 (Medium)</option>
                  <option value="256">256 (High)</option>
                  <option value="512">512 (Ultra)</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.waterDisp')} ({settings.waterDisp.toFixed(2)}m)
                </span>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.01"
                  value={settings.waterDisp}
                  onChange={(e) =>
                    setSettings({ ...settings, waterDisp: parseFloat(e.target.value) })
                  }
                  style={{ width: '150px', accentColor: '#1abc9c', cursor: 'pointer' }}
                />
              </label>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.waterFoam')} ({settings.waterFoam.toFixed(2)})
                </span>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.01"
                  value={settings.waterFoam}
                  onChange={(e) =>
                    setSettings({ ...settings, waterFoam: parseFloat(e.target.value) })
                  }
                  style={{ width: '150px', accentColor: '#1abc9c', cursor: 'pointer' }}
                />
              </label>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.waterFps')} ({settings.waterFps} FPS)
                </span>
                <input
                  type="range"
                  min="16"
                  max="60"
                  step="1"
                  value={settings.waterFps}
                  onChange={(e) =>
                    setSettings({ ...settings, waterFps: parseInt(e.target.value, 10) })
                  }
                  style={{ width: '150px', accentColor: '#1abc9c', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Трава */}
            <div style={groupStyle}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>
                {t('settingsModal.graphics.grass')}
              </div>
              <label style={labelStyle}>
                <span>
                  {t('settingsModal.graphics.grassDensity')} (
                  {Math.round(settings.grassDensity * 100)}%)
                </span>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={settings.grassDensity}
                  onChange={(e) =>
                    setSettings({ ...settings, grassDensity: parseFloat(e.target.value) })
                  }
                  style={{ width: '150px', accentColor: '#2ecc71', cursor: 'pointer' }}
                />
              </label>
            </div>
          </div>
        )}

        {/* Контент таба Звук */}
        {activeTab === 'audio' && (
          <div
            style={{
              padding: '40px 0',
              textAlign: 'center',
              color: '#777',
              fontStyle: 'italic',
              fontSize: '13px',
            }}
          >
            {t('settingsModal.audio.wip')}
          </div>
        )}

        {/* Кнопки действий */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            style={{ backgroundColor: '#444', color: '#fff', padding: '8px 16px' }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleSave}
            style={{
              backgroundColor: '#27ae60',
              color: '#fff',
              fontWeight: 'bold',
              padding: '8px 20px',
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
