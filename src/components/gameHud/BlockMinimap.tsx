import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RETRO_PANEL_STYLE, RETRO_SUNKEN_STYLE, RETRO_HEADER_STYLE } from './RetroStyles';
import { EventBus } from '../../core/EventBus';
import { Camera } from '../../Camera';
import { BALANCE_CONFIG } from '../../config/balanceConfig';
import { generateTopographyCanvas, getCameraFrustumGroundCorners } from './BlockMap';
import { IHudDataProvider } from './hudPorts';

export interface BlockMinimapProps {
  hudProvider: IHudDataProvider;
  playerId?: string | null;
  camera?: Camera | null | undefined;
}

export const BlockMinimap: React.FC<BlockMinimapProps> = ({ hudProvider, playerId, camera }) => {
  const [viewSizeMeters, setViewSizeMeters] = useState<number>(
    BALANCE_CONFIG.minimap.defaultViewMeters
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cachedTerrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTerrainVersionRef = useRef<number>(-1);

  // Регулировка масштаба колесиком мыши в диапазоне из конфига баланса
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY > 0 ? 5.0 : -5.0;
      setViewSizeMeters((prev) =>
        Math.max(
          BALANCE_CONFIG.minimap.minViewMeters,
          Math.min(BALANCE_CONFIG.minimap.maxViewMeters, prev + step)
        )
      );
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Очистка кэша топографии при обновлении мира
  useEffect(() => {
    const unsub = EventBus.on('world:updated', () => {
      cachedTerrainCanvasRef.current = null;
      lastTerrainVersionRef.current = -1;
    });
    return unsub;
  }, []);

  const renderMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#1e241e';
    ctx.fillRect(0, 0, w, h);

    const snapshot = hudProvider.getMapSnapshot(playerId ?? null);
    const terrain = snapshot.terrain;

    const currentVersion = terrain?.geometryVersion ?? 0;
    if (
      terrain &&
      (!cachedTerrainCanvasRef.current || lastTerrainVersionRef.current !== currentVersion)
    ) {
      cachedTerrainCanvasRef.current = generateTopographyCanvas(
        terrain as any,
        snapshot.waters,
        snapshot.obstacles
      );
      lastTerrainVersionRef.current = currentVersion;
    }

    const centerX = snapshot.playerPos?.x ?? 0;
    const centerZ = snapshot.playerPos?.z ?? 0;

    const terrainW = terrain?.width ?? 100;
    const terrainD = terrain?.depth ?? 100;

    const ppm = Math.min(w, h) / viewSizeMeters;

    const worldToScreen = (wx: number, wz: number) => ({
      x: w / 2 + (wx - centerX) * ppm,
      y: h / 2 + (wz - centerZ) * ppm,
    });

    // 1. Подложка террейна с водой и препятствиями
    if (cachedTerrainCanvasRef.current) {
      const topLeft = worldToScreen(-terrainW / 2, -terrainD / 2);
      const mapDrawW = terrainW * ppm;
      const mapDrawH = terrainD * ppm;

      ctx.drawImage(cachedTerrainCanvasRef.current, topLeft.x, topLeft.y, mapDrawW, mapDrawH);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.strokeRect(topLeft.x, topLeft.y, mapDrawW, mapDrawH);
    }

    // 2. Игровые зоны
    for (const zone of snapshot.zones) {
      const pos = worldToScreen(zone.x, zone.z);
      const r = zone.radius * ppm;

      ctx.fillStyle =
        zone.role === 'quest'
          ? 'rgba(0, 229, 255, 0.25)'
          : zone.role === 'throw_target'
            ? 'rgba(230, 126, 34, 0.25)'
            : 'rgba(241, 196, 15, 0.2)';
      ctx.strokeStyle =
        zone.role === 'quest' ? '#00e5ff' : zone.role === 'throw_target' ? '#e67e22' : '#f1c40f';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Другие существа
    for (const creature of snapshot.creatures) {
      const pos = worldToScreen(creature.x, creature.z);

      if (!creature.isAlive) {
        ctx.strokeStyle = '#7f8c8d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x - 3, pos.y - 3);
        ctx.lineTo(pos.x + 3, pos.y + 3);
        ctx.moveTo(pos.x + 3, pos.y - 3);
        ctx.lineTo(pos.x - 3, pos.y + 3);
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = creature.isAttacker ? '#e74c3c' : creature.isDog ? '#e67e22' : '#3498db';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3.5. Отрисовка маркеров отслеживаемых квестов
    if (snapshot.questMarkers) {
      for (const marker of snapshot.questMarkers) {
        const mPos = worldToScreen(marker.x, marker.z);
        ctx.save();
        ctx.translate(mPos.x, mPos.y);

        ctx.fillStyle = '#f1c40f';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 7);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#111';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0);

        ctx.restore();
      }
    }

    // 4. Поле видимости камеры (Frustum)
    if (camera) {
      const aspect =
        typeof window !== 'undefined' && window.innerHeight > 0
          ? window.innerWidth / window.innerHeight
          : 16 / 9;
      const frustumPoints = getCameraFrustumGroundCorners(camera, aspect, 50);

      if (frustumPoints.length === 4) {
        const screenCorners = frustumPoints.map((pt) => worldToScreen(pt.x, pt.z));

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
        for (let i = 1; i < screenCorners.length; i++) {
          ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        ctx.fillStyle = '#00e5ff';
        for (let i = 0; i < screenCorners.length; i++) {
          ctx.fillRect(screenCorners[i].x - 1.5, screenCorners[i].y - 1.5, 3, 3);
        }

        ctx.restore();
      }
    }

    // 5. Маркер игрока по центру
    if (snapshot.playerPos) {
      const pPos = worldToScreen(centerX, centerZ);
      const angle = snapshot.playerPos.angle;

      ctx.save();
      ctx.translate(pPos.x, pPos.y);

      ctx.fillStyle = 'rgba(46, 204, 113, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 24, angle - Math.PI / 6, angle + Math.PI / 6);
      ctx.closePath();
      ctx.fill();

      ctx.rotate(angle);
      ctx.fillStyle = '#2ecc71';
      ctx.strokeStyle = '#0e3a1f';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -4.5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // 6. Информационная плашка охвата
    ctx.fillStyle = 'rgba(10, 10, 10, 0.75)';
    ctx.fillRect(4, h - 18, 110, 14);
    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(viewSizeMeters)}x${Math.round(viewSizeMeters)} м`, 8, h - 8);
  }, [hudProvider, playerId, viewSizeMeters, camera]);

  // Анимационный цикл перерисовки
  useEffect(() => {
    let rafId: number;
    const loop = () => {
      renderMinimap();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [renderMinimap]);

  // Автоматическая подгонка размеров холста
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (canvasRef.current) {
          canvasRef.current.width = entry.contentRect.width;
          canvasRef.current.height = entry.contentRect.height;
          renderMinimap();
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderMinimap]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 220,
        height: 242,
        ...RETRO_PANEL_STYLE,
        padding: '6px',
        zIndex: 88,
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Шапка без кнопки закрытия и без возможности перетаскивания */}
      <div style={{ ...RETRO_HEADER_STYLE, marginBottom: '4px', padding: '3px 8px' }}>
        <span>МИНИКАРТА</span>
        <span style={{ fontSize: '11px', color: '#a7f3d0' }}>{Math.round(viewSizeMeters)}м</span>
      </div>

      {/* Углубленный контейнер с квадратным холстом */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          ...RETRO_SUNKEN_STYLE,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'crosshair',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

        {/* Кнопки регулировки масштаба в пределах лимитов конфига */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setViewSizeMeters((v) => Math.max(BALANCE_CONFIG.minimap.minViewMeters, v - 10.0));
            }}
            disabled={viewSizeMeters <= BALANCE_CONFIG.minimap.minViewMeters}
            style={{
              width: '18px',
              height: '18px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              cursor:
                viewSizeMeters <= BALANCE_CONFIG.minimap.minViewMeters ? 'default' : 'pointer',
              opacity: viewSizeMeters <= BALANCE_CONFIG.minimap.minViewMeters ? 0.4 : 1,
              fontWeight: 'bold',
              padding: 0,
              fontSize: '11px',
              lineHeight: '16px',
            }}
            title="Приблизить"
          >
            +
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setViewSizeMeters((v) => Math.min(BALANCE_CONFIG.minimap.maxViewMeters, v + 10.0));
            }}
            disabled={viewSizeMeters >= BALANCE_CONFIG.minimap.maxViewMeters}
            style={{
              width: '18px',
              height: '18px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              cursor:
                viewSizeMeters >= BALANCE_CONFIG.minimap.maxViewMeters ? 'default' : 'pointer',
              opacity: viewSizeMeters >= BALANCE_CONFIG.minimap.maxViewMeters ? 0.4 : 1,
              fontWeight: 'bold',
              padding: 0,
              fontSize: '11px',
              lineHeight: '16px',
            }}
            title="Отдалить"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
};
