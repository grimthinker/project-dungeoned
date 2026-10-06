import React, { useState, useEffect } from 'react';
import { World } from '../../ecs/World';
import { GameApp } from '../../GameApp';
import { WaterComponent, WaterBodyType } from '../../ecs/components/water';
import { t } from '../../locales';

export interface WaterInspectorProps {
  targetId: string;
  world: World;
  app?: GameApp | null;
  isReadOnly?: boolean;
  onCommit: (desc: string) => void;
}

export const WaterInspector: React.FC<WaterInspectorProps> = ({
  targetId,
  world,
  app,
  isReadOnly,
  onCommit,
}) => {
  const water = world.getComponent(targetId, 'water');
  const [values, setValues] = useState<WaterComponent | null>(water ? { ...water } : null);

  useEffect(() => {
    const comp = world.getComponent(targetId, 'water');
    if (comp) setValues({ ...comp });
    else setValues(null);
  }, [targetId, world]);

  if (!water || !values) return null;

  const handleChange = (patch: Partial<WaterComponent>) => {
    const next = { ...values, ...patch };
    setValues(next);
    if (app) {
      app.mutations.updateEntityWater(targetId, patch);
      onCommit(t('history.waterChange'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Тип водоема:
        <select
          disabled={isReadOnly}
          value={values.waterType}
          onChange={(e) => handleChange({ waterType: e.target.value as WaterBodyType })}
          style={{ width: '130px', padding: '3px' }}
        >
          <option value="lake">Озеро (Стоячая)</option>
          <option value="river">Река (Течение)</option>
        </select>
      </label>

      {/* Размеры водоема */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '8px',
          backgroundColor: '#1b1b1b',
          borderRadius: '4px',
          border: '1px solid #333',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#3498db' }}>
          Габариты водоема (метры)
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#ecf0f1',
            }}
          >
            <span>Ширина X:</span>
            <input
              disabled={isReadOnly}
              type="number"
              min={1}
              max={500}
              step={1}
              value={values.width}
              onChange={(e) => handleChange({ width: Math.max(1, Number(e.target.value)) })}
              style={{
                width: '110px',
                padding: '2px 6px',
                fontSize: '11px',
                textAlign: 'right',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#ecf0f1',
            }}
          >
            <span>Длина Z:</span>
            <input
              disabled={isReadOnly}
              type="number"
              min={1}
              max={500}
              step={1}
              value={values.depth}
              onChange={(e) => handleChange({ depth: Math.max(1, Number(e.target.value)) })}
              style={{
                width: '110px',
                padding: '2px 6px',
                fontSize: '11px',
                textAlign: 'right',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#ecf0f1',
            }}
          >
            <span>Глубина (maxDepth):</span>
            <input
              disabled={isReadOnly}
              type="number"
              min={0.2}
              max={50}
              step={0.5}
              value={values.maxDepth ?? (values.waterType === 'river' ? 2.5 : 4.0)}
              onChange={(e) => handleChange({ maxDepth: Math.max(0.2, Number(e.target.value)) })}
              style={{
                width: '110px',
                padding: '2px 6px',
                fontSize: '11px',
                textAlign: 'right',
                boxSizing: 'border-box',
              }}
            />
          </label>
        </div>
      </div>

      {/* Настройка цветов градиента глубины */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px',
          backgroundColor: '#1b1b1b',
          borderRadius: '4px',
          border: '1px solid #333',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#3498db' }}>
          Цветовой градиент глубины
        </span>

        {/* Цвет у берега (мелководье) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px' }}>У берега (мелководье):</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              disabled={isReadOnly}
              type="color"
              value={values.color}
              onChange={(e) => handleChange({ color: e.target.value })}
              style={{
                width: '30px',
                height: '22px',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
              }}
            />
            <input
              disabled={isReadOnly}
              type="text"
              value={values.color}
              onChange={(e) => handleChange({ color: e.target.value })}
              style={{ width: '68px', padding: '2px 4px', fontSize: '11px' }}
            />
          </div>
        </div>

        {/* Цвет на глубине (омут) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px' }}>На глубине (омут):</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              disabled={isReadOnly}
              type="color"
              value={values.deepColor || '#0b3954'}
              onChange={(e) => handleChange({ deepColor: e.target.value })}
              style={{
                width: '30px',
                height: '22px',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
              }}
            />
            <input
              disabled={isReadOnly}
              type="text"
              value={values.deepColor || '#0b3954'}
              onChange={(e) => handleChange({ deepColor: e.target.value })}
              style={{ width: '68px', padding: '2px 4px', fontSize: '11px' }}
            />
          </div>
        </div>
      </div>

      {/* Настройка прозрачности у берега и на глубине */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px',
          backgroundColor: '#1b1b1b',
          borderRadius: '4px',
          border: '1px solid #333',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#2ecc71' }}>
          Прозрачность и толща воды
        </span>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Непрозрачность у берега:</span>
            <span style={{ color: '#2ecc71' }}>
              {Math.round((values.shallowOpacity ?? 0.25) * 100)}%
            </span>
          </div>
          <input
            disabled={isReadOnly}
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={values.shallowOpacity ?? 0.25}
            onChange={(e) => handleChange({ shallowOpacity: parseFloat(e.target.value) })}
            style={{ accentColor: '#2ecc71', cursor: 'pointer' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Непрозрачность на глубине:</span>
            <span style={{ color: '#3498db' }}>{Math.round(values.opacity * 100)}%</span>
          </div>
          <input
            disabled={isReadOnly}
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={values.opacity}
            onChange={(e) => handleChange({ opacity: parseFloat(e.target.value) })}
            style={{ accentColor: '#3498db', cursor: 'pointer' }}
          />
        </label>

        <label
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            marginTop: '2px',
          }}
        >
          <span>Дистанция затемнения (м):</span>
          <input
            disabled={isReadOnly}
            type="number"
            min="0.2"
            max="20.0"
            step="0.2"
            value={values.clarity ?? 2.5}
            onChange={(e) =>
              handleChange({ clarity: Math.max(0.2, parseFloat(e.target.value) || 2.5) })
            }
            style={{ width: '60px', padding: '2px', textAlign: 'right' }}
            title="Глубина в метрах, на которой вода полностью темнеет и становится глубокой"
          />
        </label>
      </div>

      {/* Параметры волн и пены */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Интенсивность пены:</span>
          <span style={{ color: '#ecf0f1' }}>{(values.foamIntensity ?? 1.0).toFixed(2)}x</span>
        </div>
        <input
          disabled={isReadOnly}
          type="range"
          min="0.0"
          max="3.0"
          step="0.1"
          value={values.foamIntensity ?? 1.0}
          onChange={(e) => handleChange({ foamIntensity: parseFloat(e.target.value) })}
          style={{ accentColor: '#ecf0f1', cursor: 'pointer' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Высота волн:</span>
          <span style={{ color: '#2ecc71' }}>{values.waveHeight.toFixed(2)} м</span>
        </div>
        <input
          disabled={isReadOnly}
          type="range"
          min="0.0"
          max="0.5"
          step="0.01"
          value={values.waveHeight}
          onChange={(e) => handleChange({ waveHeight: parseFloat(e.target.value) })}
          style={{ accentColor: '#2ecc71', cursor: 'pointer' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Скорость фоновых волн:</span>
          <span style={{ color: '#f39c12' }}>{values.waveSpeed.toFixed(1)}x</span>
        </div>
        <input
          disabled={isReadOnly}
          type="range"
          min="0.2"
          max="5.0"
          step="0.1"
          value={values.waveSpeed}
          onChange={(e) => handleChange({ waveSpeed: parseFloat(e.target.value) })}
          style={{ accentColor: '#f39c12', cursor: 'pointer' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Скорость ряби от объектов:</span>
          <span style={{ color: '#3498db' }}>{(values.rippleSpeed ?? 1.0).toFixed(2)}x</span>
        </div>
        <input
          disabled={isReadOnly}
          type="range"
          min="0.05"
          max="3.0"
          step="0.05"
          value={values.rippleSpeed ?? 1.0}
          onChange={(e) => handleChange({ rippleSpeed: parseFloat(e.target.value) })}
          style={{ accentColor: '#3498db', cursor: 'pointer' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Затухание ряби (Damping):</span>
          <span style={{ color: '#2ecc71' }}>{(values.rippleDamping ?? 0.984).toFixed(3)}</span>
        </div>
        <input
          disabled={isReadOnly}
          type="range"
          min="0.900"
          max="0.995"
          step="0.001"
          value={values.rippleDamping ?? 0.984}
          onChange={(e) => handleChange({ rippleDamping: parseFloat(e.target.value) })}
          style={{ accentColor: '#2ecc71', cursor: 'pointer' }}
          title="0.900 = быстро исчезает • 0.995 = долгоиграющие круги"
        />
      </label>

      {/* Параметры реки */}
      {values.waterType === 'river' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '8px',
            backgroundColor: '#1b1b1b',
            borderRadius: '4px',
            border: '1px solid #333',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1abc9c' }}>
            Параметры течения реки
          </span>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}
          >
            Скорость потока (м/с):
            <input
              disabled={isReadOnly}
              type="number"
              min="0.0"
              max="15.0"
              step="0.2"
              value={values.flowSpeed}
              onChange={(e) =>
                handleChange({ flowSpeed: Math.max(0, parseFloat(e.target.value) || 0) })
              }
              style={{ width: '60px', padding: '2px', textAlign: 'right' }}
            />
          </label>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
            }}
          >
            <span>Направление течения (X/Z):</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                disabled={isReadOnly}
                type="number"
                step="0.1"
                value={values.flowDirection.x}
                onChange={(e) =>
                  handleChange({
                    flowDirection: { ...values.flowDirection, x: parseFloat(e.target.value) || 0 },
                  })
                }
                style={{ width: '42px', padding: '2px', textAlign: 'right' }}
                title="Ось X"
              />
              <input
                disabled={isReadOnly}
                type="number"
                step="0.1"
                value={values.flowDirection.z}
                onChange={(e) =>
                  handleChange({
                    flowDirection: { ...values.flowDirection, z: parseFloat(e.target.value) || 0 },
                  })
                }
                style={{ width: '42px', padding: '2px', textAlign: 'right' }}
                title="Ось Z"
              />
            </div>
          </div>
        </div>
      )}

      {/* Плотность и вязкость */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
          Плотность (кг/м³):
          <input
            disabled={isReadOnly}
            type="number"
            value={values.density}
            min={100}
            max={3000}
            step={50}
            onChange={(e) => handleChange({ density: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
          Вязкость среды:
          <input
            disabled={isReadOnly}
            type="number"
            value={values.viscosity}
            min={0.1}
            max={10.0}
            step={0.1}
            onChange={(e) => handleChange({ viscosity: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};
