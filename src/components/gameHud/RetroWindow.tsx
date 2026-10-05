import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RETRO_PANEL_STYLE, RETRO_HEADER_STYLE } from './RetroStyles';

export interface RetroWindowProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
  zIndex?: number;
  storageKey?: string;
  resizable?: boolean;
}

export const RetroWindow: React.FC<RetroWindowProps> = ({
  title,
  isOpen,
  onClose,
  initialX,
  initialY,
  initialWidth,
  initialHeight,
  minWidth = 180,
  minHeight = 140,
  children,
  zIndex = 90,
  storageKey,
  resizable = true,
}) => {
  const effectiveKey = storageKey || `hud_window_${title.replace(/[^a-zA-Zа-яА-Я0-9_]/g, '_')}`;

  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem(effectiveKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.max(0, Math.min(window.innerWidth - 100, parsed.x)),
            y: Math.max(0, Math.min(window.innerHeight - 100, parsed.y)),
          };
        }
      }
    } catch {}
    return { x: initialX, y: initialY };
  });

  const [size, setSize] = useState(() => {
    try {
      const saved = localStorage.getItem(effectiveKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
          return {
            width: Math.max(minWidth, Math.min(window.innerWidth, parsed.w)),
            height: Math.max(minHeight, Math.min(window.innerHeight, parsed.h)),
          };
        }
      }
    } catch {}
    return { width: initialWidth, height: initialHeight };
  });

  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const saveWindowState = useCallback(
    (newPos: { x: number; y: number }, newSize: { width: number; height: number }) => {
      try {
        localStorage.setItem(
          effectiveKey,
          JSON.stringify({ x: newPos.x, y: newPos.y, w: newSize.width, h: newSize.height })
        );
      } catch {}
    },
    [effectiveKey]
  );

  // Коррекция позиции при изменении размеров экрана
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(0, Math.min(window.innerWidth - size.width, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - size.height, prev.y)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      e.preventDefault();
      e.stopPropagation();
      let lastCalculatedPos = { ...posRef.current };

      const startX = e.clientX;
      const startY = e.clientY;
      const originX = posRef.current.x;
      const originY = posRef.current.y;

      const handleMouseMove = (moveEvt: MouseEvent) => {
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        const nextX = Math.max(
          0,
          Math.min(window.innerWidth - sizeRef.current.width, originX + dx)
        );
        const nextY = Math.max(
          0,
          Math.min(window.innerHeight - sizeRef.current.height, originY + dy)
        );
        lastCalculatedPos = { x: nextX, y: nextY };
        setPos(lastCalculatedPos);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        saveWindowState(lastCalculatedPos, sizeRef.current);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [saveWindowState]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let lastCalculatedSize = { ...sizeRef.current };

      const startX = e.clientX;
      const startY = e.clientY;
      const originW = sizeRef.current.width;
      const originH = sizeRef.current.height;

      const handleMouseMove = (moveEvt: MouseEvent) => {
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        const nextW = Math.max(
          minWidth,
          Math.min(window.innerWidth - posRef.current.x, originW + dx)
        );
        const nextH = Math.max(
          minHeight,
          Math.min(window.innerHeight - posRef.current.y, originH + dy)
        );
        lastCalculatedSize = { width: nextW, height: nextH };
        setSize(lastCalculatedSize);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        saveWindowState(posRef.current, lastCalculatedSize);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [minWidth, minHeight, saveWindowState]
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        ...RETRO_PANEL_STYLE,
        padding: '6px 6px 14px 6px',
        zIndex,
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Шапка для перетаскивания окна (находится внутри фаски панели) */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          ...RETRO_HEADER_STYLE,
          cursor: 'move',
          marginBottom: '6px',
        }}
      >
        <span>{title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 4px',
            fontFamily: 'inherit',
          }}
          title="СКРЫТЬ"
        >
          ✕
        </button>
      </div>

      {/* Контент окна */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>

      {/* Уголок масштабирования размера окна (Resize Handle) */}
      {resizable && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: 'absolute',
            right: 3,
            bottom: 2,
            width: 11,
            height: 11,
            cursor: 'se-resize',
            zIndex: 15,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            fontSize: '10px',
            color: '#222222',
            lineHeight: '10px',
            userSelect: 'none',
          }}
          title="Потяните для изменения размера"
        >
          ◢
        </div>
      )}
    </div>
  );
};
