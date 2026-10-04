import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { RETRO_PANEL_STYLE, RETRO_SUNKEN_STYLE } from './RetroStyles';
import { HUD_CONFIG } from '../../config/hudConfig';
import { IHudDataProvider } from './hudPorts';

export interface BlockEquipmentProps {
  hudProvider: IHudDataProvider;
  playerId: string | null;
}

export const BlockEquipment: React.FC<BlockEquipmentProps> = ({ hudProvider, playerId }) => {
  const [slotScrollIndex, setSlotScrollIndex] = useState(0);
  const [equipScrollIndex, setEquipScrollIndex] = useState(0);
  const [areaItemIndices, setAreaItemIndices] = useState<Record<string, number>>({});

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    globalSlotIndex: number;
    itemName: string;
  } | null>(null);

  const slotDomRefs = useRef<(HTMLDivElement | null)[]>([]);

  const equipmentData = hudProvider.getPlayerEquipment(playerId);
  const slots = equipmentData?.slots || [];
  const equipAreas = equipmentData?.equipAreas || [];

  // Ровно 5 ячеек в ряду
  const VISIBLE_COUNT = 5;

  const maxSlotScroll = Math.max(0, slots.length - VISIBLE_COUNT);
  const visibleSlots = slots.slice(slotScrollIndex, slotScrollIndex + VISIBLE_COUNT);
  const slotPlaceholders = Array.from({
    length: Math.max(0, VISIBLE_COUNT - visibleSlots.length),
  });

  const maxEquipScroll = Math.max(0, equipAreas.length - VISIBLE_COUNT);
  const visibleEquipAreas = equipAreas.slice(equipScrollIndex, equipScrollIndex + VISIBLE_COUNT);
  const equipPlaceholders = Array.from({
    length: Math.max(0, VISIBLE_COUNT - visibleEquipAreas.length),
  });

  // Прокрутка содержимого внутри конкретной области экипировки колесиком мыши (с фиксацией границ)
  const handleAreaWheel = (areaKey: string, itemCount: number, e: React.WheelEvent) => {
    if (itemCount <= 1) return;
    e.preventDefault();
    e.stopPropagation();

    const current = areaItemIndices[areaKey] ?? 0;
    const delta = e.deltaY > 0 ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(itemCount - 1, current + delta));

    if (nextIdx !== current) {
      setAreaItemIndices((prev) => ({ ...prev, [areaKey]: nextIdx }));
    }
  };

  const handleDrop = (globalSlotIndex: number) => {
    if (playerId) {
      hudProvider.dropItem(playerId, globalSlotIndex);
    }
    setContextMenu(null);
  };

  const handleThrow = (globalSlotIndex: number) => {
    if (playerId) {
      hudProvider.throwItem(playerId, globalSlotIndex);
    }
    setContextMenu(null);
  };

  // Горячие клавиши 1..5 для слотов взаимодействия
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (contextMenu) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
        if (e.code === 'KeyQ' || e.key.toLowerCase() === 'q') {
          e.preventDefault();
          handleThrow(contextMenu.globalSlotIndex);
          return;
        }
        if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
          e.preventDefault();
          handleDrop(contextMenu.globalSlotIndex);
          return;
        }
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 5 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const slotIdx = num - 1;
        if (slotIdx >= 0 && slotIdx < visibleSlots.length) {
          const info = visibleSlots[slotIdx];
          const item = info.item;
          if (item) {
            e.preventDefault();
            if (contextMenu && contextMenu.globalSlotIndex === info.globalSlotIndex) {
              setContextMenu(null);
              return;
            }
            const el = slotDomRefs.current[slotIdx];
            let x = window.innerWidth / 2;
            let y = window.innerHeight - 100;
            if (el) {
              const rect = el.getBoundingClientRect();
              x = rect.left + rect.width / 2;
              y = rect.top;
            }
            setContextMenu({
              x,
              y,
              globalSlotIndex: info.globalSlotIndex,
              itemName: item.name,
            });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu, visibleSlots, playerId, hudProvider]);

  const CELL_SIZE = 54;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        ...RETRO_PANEL_STYLE,
        padding: '10px 12px',
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {/* 1. Ползунок НАД слотами взаимодействия (если слотов больше 5) */}
      {slots.length > VISIBLE_COUNT && (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setSlotScrollIndex((p) => Math.max(0, p - 1))}
            disabled={slotScrollIndex === 0}
            style={{
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: slotScrollIndex === 0 ? 'default' : 'pointer',
            }}
          >
            ◀
          </button>
          <input
            type="range"
            min={0}
            max={maxSlotScroll}
            value={slotScrollIndex}
            onChange={(e) => setSlotScrollIndex(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#444', height: '6px', cursor: 'pointer' }}
          />
          <button
            type="button"
            onClick={() => setSlotScrollIndex((p) => Math.min(maxSlotScroll, p + 1))}
            disabled={slotScrollIndex >= maxSlotScroll}
            style={{
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: slotScrollIndex >= maxSlotScroll ? 'default' : 'pointer',
            }}
          >
            ▶
          </button>
        </div>
      )}

      {/* 2. Ряд 1: Слоты взаимодействия (5 ячеек) */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {visibleSlots.map((info, idx) => {
          const item = info.item;
          const isBroken = info.isBroken;

          return (
            <div
              key={`slot_${info.partId}_${info.globalSlotIndex}`}
              ref={(el) => {
                slotDomRefs.current[idx] = el;
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (item) {
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    globalSlotIndex: info.globalSlotIndex,
                    itemName: item.name,
                  });
                }
              }}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                ...RETRO_SUNKEN_STYLE,
                backgroundColor: isBroken
                  ? HUD_CONFIG.equipment.slotBroken
                  : item
                    ? HUD_CONFIG.equipment.slotFilled
                    : HUD_CONFIG.equipment.slotEmpty,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title={`${info.name || 'Слот'} (${item ? item.name : 'Пусто'})`}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: HUD_CONFIG.equipment.hotkeyText,
                  lineHeight: '13px',
                  fontFamily: 'inherit',
                }}
              >
                {idx + 1}
              </span>

              {item ? (
                <span style={{ fontSize: '22px' }}>
                  {item.icon ||
                    (item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '📦')}
                </span>
              ) : (
                <span style={{ fontSize: '18px', opacity: 0.4 }}>✋</span>
              )}

              {isBroken && (
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 3,
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}
                >
                  ✕
                </span>
              )}
            </div>
          );
        })}

        {slotPlaceholders.map((_, i) => (
          <div
            key={`slot_ph_${i}`}
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              ...RETRO_SUNKEN_STYLE,
              opacity: 0.35,
            }}
          />
        ))}
      </div>

      {/* 3. Ряд 2: Области экипировки (5 ячеек с треугольными стрелками) */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        {visibleEquipAreas.map((area) => {
          const areaKey = `${area.containerId}_${area.areaId}`;
          const currentItemIdx = areaItemIndices[areaKey] ?? 0;
          const item = area.items[currentItemIdx] ?? null;
          const hasMultipleItems = area.items.length > 1;

          return (
            <div
              key={areaKey}
              onWheel={(e) => handleAreaWheel(areaKey, area.items.length, e)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <span
                style={{
                  height: '6px',
                  fontSize: '8px',
                  lineHeight: '6px',
                  color: hasMultipleItems ? HUD_CONFIG.equipment.arrowText : 'transparent',
                  marginBottom: '1px',
                }}
              >
                ▲
              </span>

              <div
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  ...RETRO_SUNKEN_STYLE,
                  backgroundColor: item
                    ? HUD_CONFIG.equipment.slotFilled
                    : HUD_CONFIG.equipment.slotEmpty,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
                title={`${area.name}: ${item ? item.name : 'Пусто'} (${area.items.length} предм.)`}
              >
                {item ? (
                  <span style={{ fontSize: '20px' }}>
                    {item.icon ||
                      (item.type === 'armor'
                        ? '🦺'
                        : item.type === 'weapon'
                          ? '🗡️'
                          : item.type === 'bag'
                            ? '🎒'
                            : '🥋')}
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', color: '#777', fontWeight: 'bold' }}>
                    {area.name.substring(0, 3)}
                  </span>
                )}

                {hasMultipleItems && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 4,
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: HUD_CONFIG.equipment.counterText,
                      fontFamily: 'inherit',
                    }}
                  >
                    {currentItemIdx + 1}/{area.items.length}
                  </span>
                )}
              </div>

              {/* Нижняя треугольная стрелка */}
              <span
                style={{
                  height: '6px',
                  fontSize: '8px',
                  lineHeight: '6px',
                  color: hasMultipleItems ? HUD_CONFIG.equipment.arrowText : 'transparent',
                  marginTop: '1px',
                }}
              >
                ▼
              </span>
            </div>
          );
        })}

        {equipPlaceholders.map((_, i) => (
          <div
            key={`equip_ph_${i}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ height: '6px', fontSize: '8px', color: 'transparent' }}>▲</span>
            <div
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                ...RETRO_SUNKEN_STYLE,
                opacity: 0.35,
              }}
            />
            <span style={{ height: '6px', fontSize: '8px', color: 'transparent' }}>▼</span>
          </div>
        ))}
      </div>

      {/* 4. Ползунок ПОД областями экипировки (если областей больше 5) */}
      {equipAreas.length > 5 && (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setEquipScrollIndex((p) => Math.max(0, p - 1))}
            disabled={equipScrollIndex === 0}
            style={{
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: equipScrollIndex === 0 ? 'default' : 'pointer',
            }}
          >
            ◀
          </button>
          <input
            type="range"
            min={0}
            max={maxEquipScroll}
            value={equipScrollIndex}
            onChange={(e) => setEquipScrollIndex(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#444', height: '6px', cursor: 'pointer' }}
          />
          <button
            type="button"
            onClick={() => setEquipScrollIndex((p) => Math.min(maxEquipScroll, p + 1))}
            disabled={equipScrollIndex >= maxEquipScroll}
            style={{
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: equipScrollIndex >= maxEquipScroll ? 'default' : 'pointer',
            }}
          >
            ▶
          </button>
        </div>
      )}

      {/* Контекстное меню слота */}
      {contextMenu &&
        createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: Math.min(window.innerWidth - 150, Math.max(10, contextMenu.x)),
                top: Math.max(10, contextMenu.y - 100),
                ...RETRO_PANEL_STYLE,
                padding: '6px',
                minWidth: '140px',
                zIndex: 99999,
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: HUD_CONFIG.equipment.contextMenu.titleText,
                  borderBottom: `2px solid ${HUD_CONFIG.equipment.contextMenu.titleBorder}`,
                  padding: '2px 4px 6px 4px',
                  marginBottom: '6px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {contextMenu.itemName}
              </div>
              <button
                type="button"
                onClick={() => handleDrop(contextMenu.globalSlotIndex)}
                style={{
                  backgroundColor: HUD_CONFIG.equipment.contextMenu.btnBg,
                  border: `2px solid ${HUD_CONFIG.equipment.contextMenu.btnBorder}`,
                  padding: '6px 8px',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  color: HUD_CONFIG.equipment.contextMenu.btnDropText,
                  width: '100%',
                  marginBottom: '4px',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                }}
              >
                ВЫБРОСИТЬ [R]
              </button>
              <button
                type="button"
                onClick={() => handleThrow(contextMenu.globalSlotIndex)}
                style={{
                  backgroundColor: HUD_CONFIG.equipment.contextMenu.btnBg,
                  border: `2px solid ${HUD_CONFIG.equipment.contextMenu.btnBorder}`,
                  padding: '6px 8px',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  color: HUD_CONFIG.equipment.contextMenu.btnThrowText,
                  width: '100%',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                }}
              >
                КИНУТЬ [Q]
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
