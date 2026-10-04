import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE } from './RetroStyles';
import { EventBus } from '../../core/EventBus';
import { Camera } from '../../Camera';
import { Point } from '../../types';
import { getTerrainHeightAt } from '../../utils';
import { IHudDataProvider, WaterBodyData, ObstacleMapData } from './hudPorts';

export type { WaterBodyData, ObstacleMapData };

export interface BlockMapProps {
  isOpen: boolean;
  onClose: () => void;
  hudProvider: IHudDataProvider;
  playerId?: string | null;
  camera?: Camera | null | undefined;
}

/**
 * Процедурный генератор топографической текстуры террейна
 * с имитацией рельефа, высот, текстурных слоев дорог/песка/травы и препятствий сверху.
 */
export function generateTopographyCanvas(
  terrain: {
    width: number;
    depth: number;
    resolution: number;
    splatResolution: number;
    heights: Float32Array;
    splatData: Uint8Array;
  },
  waterBodies: WaterBodyData[],
  obstacles: ObstacleMapData[]
): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const halfW = terrain.width / 2;
  const halfD = terrain.depth / 2;
  const splatRes = terrain.splatResolution || 512;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      const u = px / (size - 1);
      const v = py / (size - 1);

      const wx = u * terrain.width - halfW;
      const wz = v * terrain.depth - halfD;

      // Сэмплирование Splatmap
      const su = Math.min(splatRes - 1, Math.max(0, Math.floor(u * (splatRes - 1))));
      const sv = Math.min(splatRes - 1, Math.max(0, Math.floor(v * (splatRes - 1))));
      const sIdx = (sv * splatRes + su) * 4;

      const rW = terrain.splatData[sIdx] / 255; // Трава
      const gW = terrain.splatData[sIdx + 1] / 255; // Камень/Дорога
      const bW = terrain.splatData[sIdx + 2] / 255; // Почва
      const aW = terrain.splatData[sIdx + 3] / 255; // Песок
      const sumW = rW + gW + bW + aW || 1;

      let red = (62 * rW + 135 * gW + 115 * bW + 205 * aW) / sumW;
      let green = (120 * rW + 140 * gW + 82 * bW + 180 * aW) / sumW;
      let blue = (52 * rW + 145 * gW + 54 * bW + 125 * aW) / sumW;

      // Аналитический расчет светотени холмов (Hillshade)
      const h = getTerrainHeightAt(terrain, wx, wz) ?? 0;
      const hR = getTerrainHeightAt(terrain, wx + 1.2, wz) ?? h;
      const hL = getTerrainHeightAt(terrain, wx - 1.2, wz) ?? h;
      const hD = getTerrainHeightAt(terrain, wx, wz + 1.2) ?? h;
      const hU = getTerrainHeightAt(terrain, wx, wz - 1.2) ?? h;

      const dx = (hR - hL) / 2.4;
      const dz = (hD - hU) / 2.4;

      // Освещение сверху-слева
      const slope = (-dx - dz) * 0.32;
      const shade = Math.max(0.65, Math.min(1.35, 1.0 + slope));

      red *= shade;
      green *= shade;
      blue *= shade;

      // Вода с корректным отображением мелководья и учетом поворота плоскости
      for (let i = 0; i < waterBodies.length; i++) {
        const w = waterBodies[i];

        const dxW = wx - w.x;
        const dzW = wz - w.z;
        const cosA = Math.cos(-w.angle);
        const sinA = Math.sin(-w.angle);
        const rx = dxW * cosA - dzW * sinA;
        const rz = dxW * sinA + dzW * cosA;

        // Буферный запас охвата для естественных отмелей и расширений русла
        const marginX = Math.max(12.0, w.width * 0.15);
        const marginZ = Math.max(14.0, w.depth * 0.5);

        if (Math.abs(rx) <= w.width / 2 + marginX && Math.abs(rz) <= w.depth / 2 + marginZ) {
          const waterDepth = w.surfaceY - h;

          // Захватываем мелководье, прибойную кромку и рябь волн
          if (waterDepth >= -0.18) {
            if (waterDepth < 0.55) {
              // Мелководье: светлый бирюзово-голубой тон
              red = 65;
              green = 155;
              blue = 215;
            } else {
              // Основная глубина: насыщенный синий
              red = 48;
              green = 125;
              blue = 200;
            }
            break;
          }
        }
      }

      data[idx] = Math.round(Math.min(255, Math.max(0, red)));
      data[idx + 1] = Math.round(Math.min(255, Math.max(0, green)));
      data[idx + 2] = Math.round(Math.min(255, Math.max(0, blue)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Отрисовка препятствий при взгляде сверху в пиксельном разрешении холста (256x256)
  const scaleX = size / terrain.width;
  const scaleZ = size / terrain.depth;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const px = ((obs.x + halfW) / terrain.width) * size;
    const py = ((obs.z + halfD) / terrain.depth) * size;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(obs.angle);

    const mId = obs.modelId || '';
    const subType = obs.subType || '';
    const rPx = obs.radius * scaleX;
    const wPx = obs.width * scaleX;
    const dPx = obs.depth * scaleZ;
    const hw = wPx / 2;
    const hd = dPx / 2;

    // 1. ДОМ: двухскатная крыша с продольным коньком и трубой
    if (mId.includes('house') || subType === 'house') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-hw + 1, -hd + 1, wPx, dPx);

      ctx.fillStyle = '#9c281a';
      ctx.fillRect(-hw, -hd, hw, dPx);

      ctx.fillStyle = '#c84332';
      ctx.fillRect(0, -hd, hw, dPx);

      ctx.strokeStyle = '#5a120a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -hd);
      ctx.lineTo(0, hd);
      ctx.stroke();

      ctx.fillStyle = '#d97736';
      ctx.fillRect(hw * 0.25, hd * 0.2, 2.5, 2.5);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(hw * 0.25 + 0.5, hd * 0.2 + 0.5, 1.5, 1.5);

      ctx.strokeStyle = '#2b0b06';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, -hd, wPx, dPx);
    }
    // 2. КОЛОДЕЦ: круглое основание с синим навесом
    else if (mId.includes('well') || obs.name?.includes('Колодец')) {
      ctx.fillStyle = '#5c636e';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2.5, rPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#383d44';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(-rPx * 0.85, -rPx * 0.85, rPx * 0.85, rPx * 1.7);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, -rPx * 0.85, rPx * 0.85, rPx * 1.7);
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -rPx * 0.85);
      ctx.lineTo(0, rPx * 0.85);
      ctx.stroke();
    }
    // 3. ЕЛЬ: многогранный ярусный силуэт хвои
    else if (mId.includes('spruce')) {
      const sides = 8;
      const crownR = Math.max(2.4, (obs.radius || 1.85) * 1.4);
      const treeRPx = crownR * scaleX;

      ctx.fillStyle = '#1a472a';
      ctx.beginPath();
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const sx = Math.cos(a) * treeRPx;
        const sy = Math.sin(a) * treeRPx;
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2e8540';
      ctx.beginPath();
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + Math.PI / 8;
        const sx = Math.cos(a) * (treeRPx * 0.65);
        const sy = Math.sin(a) * (treeRPx * 0.65);
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, treeRPx * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
    // 4. СОСНА: тонкий ствол и плотные пучки хвои на верхушке
    else if (mId.includes('pine')) {
      const crownR = Math.max(2.0, (obs.radius || 1.4) * 1.4);
      const treeRPx = crownR * scaleX;

      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, treeRPx * 0.22), 0, Math.PI * 2);
      ctx.fill();

      const offsets = [
        { dx: treeRPx * 0.35, dy: treeRPx * 0.15, rad: treeRPx * 0.6 },
        { dx: -treeRPx * 0.4, dy: -treeRPx * 0.2, rad: treeRPx * 0.55 },
        { dx: 0, dy: treeRPx * 0.05, rad: treeRPx * 0.5 },
      ];
      for (const off of offsets) {
        ctx.fillStyle = '#234d31';
        ctx.beginPath();
        ctx.arc(off.dx, off.dy, off.rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 5. ЛИСТВЕННЫЕ ДЕРЕВЬЯ (дуб, береза, стандарт)
    else if (mId.includes('tree') || subType === 'tree') {
      const isOak = mId.includes('tree_2');
      const isBirch = mId.includes('tree_3');
      const baseColor = isBirch ? '#4caf50' : isOak ? '#2e7d32' : '#388e3c';
      const shadowColor = isBirch ? '#2e7d32' : isOak ? '#1b5e20' : '#1e6827';

      const crownR = isOak ? 3.0 : isBirch ? 2.0 : 2.5;
      const treeRPx = Math.max(crownR, obs.radius * 2.2) * scaleX;

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(1, 1, treeRPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = shadowColor;
      ctx.beginPath();
      ctx.arc(0, 0, treeRPx, 0, Math.PI * 2);
      ctx.fill();

      const lobes = isOak ? 5 : 3;
      for (let l = 0; l < lobes; l++) {
        const la = (l / lobes) * Math.PI * 2;
        const lx = Math.cos(la) * (treeRPx * 0.4);
        const ly = Math.sin(la) * (treeRPx * 0.4);
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(lx, ly, treeRPx * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#81c784';
      ctx.beginPath();
      ctx.arc(-treeRPx * 0.15, -treeRPx * 0.15, treeRPx * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    // 6. КАМНИ И ВАЛУНЫ
    else if (mId.includes('rock') || subType === 'rock') {
      const rWidth = Math.max(3.0, hw);
      const rDepth = Math.max(2.5, hd);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(1, 1, rWidth, rDepth, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.ellipse(0, 0, rWidth, rDepth, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.ellipse(-rWidth * 0.15, -rDepth * 0.15, rWidth * 0.65, rDepth * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 7. МОСТ
    else if (mId.includes('bridge')) {
      ctx.fillStyle = '#8a5229';
      ctx.fillRect(-hw, -hd, wPx, dPx);

      ctx.strokeStyle = '#b57b4f';
      ctx.lineWidth = 1;
      const numPlanks = 8;
      for (let p = 0; p <= numPlanks; p++) {
        const pyPos = -hd + (dPx / numPlanks) * p;
        ctx.beginPath();
        ctx.moveTo(-hw, pyPos);
        ctx.lineTo(hw, pyPos);
        ctx.stroke();
      }

      ctx.fillStyle = '#4e2a14';
      ctx.fillRect(-hw, -hd, 1.5, dPx);
      ctx.fillRect(hw - 1.5, -hd, 1.5, dPx);
    }
    // 8. ЗАБОР
    else if (mId.includes('fence') || subType === 'fence') {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-hw, -Math.max(1, hd), wPx, Math.max(2, dPx));
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-hw - 1, -hd - 1, 3, dPx + 2);
      ctx.fillRect(hw - 2, -hd - 1, 3, dPx + 2);
    }
    // 9. СТОПКИ БРЕВЕН
    else if (mId.includes('log_pile')) {
      ctx.fillStyle = '#8a5229';
      ctx.fillRect(-hw, -hd, wPx, dPx);
      ctx.fillStyle = '#e0ad70';
      ctx.fillRect(-hw, -hd, wPx, 1.5);
      ctx.fillRect(-hw, hd - 1.5, wPx, 1.5);
    }
    // 10. ПЕНЬ
    else if (mId.includes('stump')) {
      ctx.fillStyle = '#8a5229';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, rPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#deb078';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, rPx * 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#95a5a6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-rPx * 0.3, 0);
      ctx.lineTo(rPx * 0.3, 0);
      ctx.stroke();
    }
    // 11. ТУАЛЕТ
    else if (mId.includes('toilet')) {
      ctx.fillStyle = '#734832';
      ctx.fillRect(-hw, -hd, wPx, dPx);
      ctx.strokeStyle = '#4e2a14';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, -hd, wPx, dPx);
    }
    // 12. БОЧКИ И ЯЩИКИ
    else if (mId.includes('barrel') || subType === 'barrel') {
      ctx.fillStyle = '#935c2b';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, rPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (mId.includes('crate') || subType === 'crate') {
      ctx.fillStyle = '#9e6c46';
      ctx.fillRect(-hw, -hd, wPx, dPx);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, -hd, wPx, dPx);
    }
    // 13. ФОНАРНЫЙ СТОЛБ
    else if (mId.includes('lamp_post')) {
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, rPx * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(rPx * 0.6, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 14. ОБЩИЙ ФОЛЛБЭК
    else {
      if (obs.points && obs.points.length > 2) {
        ctx.beginPath();
        for (let pi = 0; pi < obs.points.length; pi++) {
          const pt = obs.points[pi];
          const pxCoord = pt.x * scaleX;
          const pyCoord = pt.y * scaleZ;
          if (pi === 0) ctx.moveTo(pxCoord, pyCoord);
          else ctx.lineTo(pxCoord, pyCoord);
        }
        ctx.closePath();
        ctx.fillStyle = '#666666';
        ctx.fill();
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, rPx), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  return canvas;
}

/**
 * Рассчитывает 4 угловые точки проекции пирамиды видимости (Frustum) перспективной камеры
 * на горизонтальную плоскость пола Y = targetY.
 */
export function getCameraFrustumGroundCorners(
  camera: Camera,
  aspect: number,
  fovDeg: number = 50
): Array<{ x: number; z: number }> {
  const scale = camera.scale;
  const dist = Math.max(4, 18 / scale);
  const pitch = camera.pitch;
  const yaw = camera.yaw;

  const camY = camera.targetY + dist * Math.sin(pitch);
  const groundDist = dist * Math.cos(pitch);
  const camX = camera.targetX + groundDist * Math.sin(yaw);
  const camZ = camera.targetZ + groundDist * Math.cos(yaw);

  // Вектор взгляда камеры Forward (F)
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = -Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);

  // Вектор Right (R)
  const rx = -Math.cos(yaw);
  const ry = 0;
  const rz = Math.sin(yaw);

  // Вектор True Up (U)
  const ux = -Math.sin(yaw) * Math.sin(pitch);
  const uy = Math.cos(pitch);
  const uz = -Math.cos(yaw) * Math.sin(pitch);

  const vFovRad = (fovDeg * Math.PI) / 180;
  const tanHalfV = Math.tan(vFovRad / 2);
  const tanHalfH = tanHalfV * aspect;

  const corners = [
    { u: -1, v: -1 },
    { u: 1, v: -1 },
    { u: 1, v: 1 },
    { u: -1, v: 1 },
  ];

  const groundY = camera.targetY;
  const maxRange = 75;

  return corners.map(({ u, v }) => {
    const dx = fx + rx * (u * tanHalfH) + ux * (v * tanHalfV);
    const dy = fy + ry * (u * tanHalfH) + uy * (v * tanHalfV);
    const dz = fz + rz * (u * tanHalfH) + uz * (v * tanHalfV);

    if (dy < -0.04) {
      const t = Math.min((groundY - camY) / dy, maxRange);
      return { x: camX + dx * t, z: camZ + dz * t };
    } else {
      return { x: camX + dx * maxRange, z: camZ + dz * maxRange };
    }
  });
}

export const BlockMap: React.FC<BlockMapProps> = ({
  isOpen,
  onClose,
  hudProvider,
  playerId,
  camera,
}) => {
  const defaultX =
    typeof window !== 'undefined' ? Math.max(20, (window.innerWidth - 560) / 2) : 200;
  const defaultY =
    typeof window !== 'undefined' ? Math.max(20, (window.innerHeight - 500) / 2) : 100;

  const [zoom, setZoom] = useState<number>(1.0);
  const [mapCenter, setMapCenter] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [isLmbDragging, setIsLmbDragging] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cachedTerrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTerrainVersionRef = useRef<number>(-1);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    centerX: number;
    centerZ: number;
  }>({
    clientX: 0,
    clientY: 0,
    centerX: 0,
    centerZ: 0,
  });

  const hasInitializedCenterRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasInitializedCenterRef.current && playerId) {
      const snapshot = hudProvider.getMapSnapshot(playerId);
      if (snapshot.playerPos) {
        setMapCenter({ x: snapshot.playerPos.x, z: snapshot.playerPos.z });
        hasInitializedCenterRef.current = true;
      }
    }
  }, [isOpen, hudProvider, playerId]);

  // Зум колесиком мыши: привязан к [isOpen] для гарантированного подключения при каждом открытии окна
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoom((prev) => Math.max(0.3, Math.min(5.0, prev * factor)));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [isOpen]);

  // Перемещение карты зажатой ЛКМ
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      setIsLmbDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        centerX: mapCenter.x,
        centerZ: mapCenter.z,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isLmbDragging) return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const snapshot = hudProvider.getMapSnapshot(playerId ?? null);
    const terrainW = snapshot.terrain?.width ?? 100;
    const ppm = (Math.min(canvas.width, canvas.height) / terrainW) * zoom;

    const dxPx = e.clientX - dragStartRef.current.clientX;
    const dyPx = e.clientY - dragStartRef.current.clientY;

    setMapCenter({
      x: dragStartRef.current.centerX - dxPx / ppm,
      z: dragStartRef.current.centerZ - dyPx / ppm,
    });
  };

  const handleMouseUp = () => {
    setIsLmbDragging(false);
  };

  const handleCenterOnPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerId) {
      const snapshot = hudProvider.getMapSnapshot(playerId);
      if (snapshot.playerPos) {
        setMapCenter({ x: snapshot.playerPos.x, z: snapshot.playerPos.z });
      }
    }
  };

  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;

    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    }

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

    const centerX = mapCenter.x;
    const centerZ = mapCenter.z;

    const terrainW = terrain?.width ?? 100;
    const terrainD = terrain?.depth ?? 100;

    const basePpm = Math.min(w, h) / terrainW;
    const ppm = basePpm * zoom;

    const worldToScreen = (wx: number, wz: number) => ({
      x: w / 2 + (wx - centerX) * ppm,
      y: h / 2 + (wz - centerZ) * ppm,
    });

    // 2. Отрисовка подложки террейна
    if (cachedTerrainCanvasRef.current) {
      const topLeft = worldToScreen(-terrainW / 2, -terrainD / 2);
      const mapDrawW = terrainW * ppm;
      const mapDrawH = terrainD * ppm;

      ctx.drawImage(cachedTerrainCanvasRef.current, topLeft.x, topLeft.y, mapDrawW, mapDrawH);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.strokeRect(topLeft.x, topLeft.y, mapDrawW, mapDrawH);
    }

    // 3. Отрисовка игровых зон
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

    // 4. Отрисовка других существ
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

    // 5. Отрисовка рамки поля видимости (Frustum) камеры
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

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
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
    // 6. Отрисовка маркера игрока со стрелкой направления
    if (snapshot.playerPos) {
      const pPos = worldToScreen(snapshot.playerPos.x, snapshot.playerPos.z);
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

    // 7. Информационная плашка в углу карты
    ctx.fillStyle = 'rgba(10, 10, 10, 0.75)';
    ctx.fillRect(4, h - 20, 160, 16);
    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Центр X:${centerX.toFixed(1)} Z:${centerZ.toFixed(1)} | ${zoom.toFixed(2)}x`,
      8,
      h - 9
    );
  }, [hudProvider, playerId, zoom, mapCenter, camera]);

  // Сброс кэша топографии при обновлении мира
  useEffect(() => {
    const unsub = EventBus.on('world:updated', () => {
      cachedTerrainCanvasRef.current = null;
      lastTerrainVersionRef.current = -1;
    });
    return unsub;
  }, []);

  // Анимационный цикл перерисовки при открытом окне
  useEffect(() => {
    if (!isOpen) return;
    let rafId: number;
    const loop = () => {
      renderMap();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, renderMap]);

  // Автоматический ресайз холста под размер окна: запускается при открытии и сохраняет правильные пропорции
  useEffect(() => {
    if (!isOpen) return;
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    if (el.clientWidth > 0 && el.clientHeight > 0) {
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
      renderMap();
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (canvasRef.current) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            renderMap();
          }
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, renderMap]);

  return (
    <RetroWindow
      title="КАРТА [M]"
      isOpen={isOpen}
      onClose={onClose}
      initialX={defaultX}
      initialY={defaultY}
      initialWidth={520}
      initialHeight={460}
      minWidth={280}
      minHeight={240}
      storageKey="hud_window_full_map"
    >
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: '100%',
          height: '100%',
          ...RETRO_SUNKEN_STYLE,
          position: 'relative',
          overflow: 'hidden',
          cursor: isLmbDragging ? 'grabbing' : 'grab',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

        {/* Кнопки управления картой: Центровка на игроке, Зум [+] и [-] */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleCenterOnPlayer}
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: '#2a2a2a',
              color: '#2ecc71',
              border: '1px solid #444',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: 0,
              fontSize: '14px',
              lineHeight: '22px',
            }}
            title="Центрировать на игроке"
          >
            ⌖
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.min(5.0, z * 1.25));
            }}
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: 0,
              fontSize: '14px',
              lineHeight: '22px',
            }}
            title="Приблизить"
          >
            +
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.max(0.3, z * 0.8));
            }}
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: 0,
              fontSize: '14px',
              lineHeight: '22px',
            }}
            title="Отдалить"
          >
            −
          </button>
        </div>
      </div>
    </RetroWindow>
  );
};
