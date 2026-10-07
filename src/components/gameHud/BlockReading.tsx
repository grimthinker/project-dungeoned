import React, { useEffect, useRef } from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE, RETRO_BUTTON_STYLE } from './RetroStyles';
import { ActiveReadingDTO, IHudDataProvider } from './hudPorts';
import { GameApp } from '../../GameApp';

export interface BlockReadingProps {
  app?: GameApp | null;
  hudProvider: IHudDataProvider;
  activeReading: ActiveReadingDTO;
  onClose: () => void;
}

export const BlockReading: React.FC<BlockReadingProps> = ({
  app,
  hudProvider,
  activeReading,
  onClose,
}) => {
  const width = 480;
  const height = 340;

  const defaultX =
    typeof window !== 'undefined' ? Math.max(10, (window.innerWidth - width) / 2) : 200;
  const defaultY =
    typeof window !== 'undefined' ? Math.max(10, (window.innerHeight - height) / 2) : 250;

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Сброс скролла наверх при смене страницы
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeReading.currentPage]);

  // Закрытие при удалении от объекта дальше 8 метров
  useEffect(() => {
    if (!app) return;

    const checkDistance = () => {
      const playerId = app.getPlayerEntityId();
      if (!playerId) {
        onClose();
        return;
      }
      const pTrans = app.world.getComponent(playerId, 'transform');
      const tTrans = app.world.getComponent(activeReading.entityId, 'transform');
      if (!pTrans || !tTrans) {
        onClose();
        return;
      }
      const dist = Math.hypot(pTrans.x - tTrans.x, pTrans.z - tTrans.z);
      if (dist > 8.0) {
        onClose();
      }
    };

    const interval = setInterval(checkDistance, 250);
    return () => clearInterval(interval);
  }, [app, activeReading.entityId, onClose]);

  const currentPageText =
    activeReading.pages && activeReading.pages.length > 0
      ? activeReading.pages[activeReading.currentPage] || ''
      : activeReading.text || '';

  const hasMultiplePages = activeReading.totalPages > 1;

  return (
    <RetroWindow
      title={`ЧТЕНИЕ: ${activeReading.title.toUpperCase()}`}
      isOpen={true}
      onClose={onClose}
      initialX={defaultX}
      initialY={defaultY}
      initialWidth={width}
      initialHeight={height}
      minWidth={width}
      minHeight={height}
      resizable={false}
      storageKey="hud_window_reading"
      zIndex={125}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: '8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Область прокручиваемого текста */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            minHeight: 0,
            ...RETRO_SUNKEN_STYLE,
            padding: '12px 14px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#ffffff',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {currentPageText}
          </div>
        </div>

        {/* Панель пагинации (если страниц больше одной) */}
        {hasMultiplePages && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              padding: '2px 4px',
            }}
          >
            <button
              type="button"
              disabled={activeReading.currentPage === 0}
              style={{
                ...RETRO_BUTTON_STYLE,
                padding: '8px 14px',
                fontSize: '14px',
                opacity: activeReading.currentPage === 0 ? 0.4 : 1,
                cursor: activeReading.currentPage === 0 ? 'default' : 'pointer',
              }}
              onClick={() => hudProvider.setReadingPage(activeReading.currentPage - 1)}
            >
              ◀ Назад
            </button>

            <span
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#ecf0f1',
                userSelect: 'none',
              }}
            >
              Страница {activeReading.currentPage + 1} из {activeReading.totalPages}
            </span>

            <button
              type="button"
              disabled={activeReading.currentPage >= activeReading.totalPages - 1}
              style={{
                ...RETRO_BUTTON_STYLE,
                padding: '8px 14px',
                fontSize: '14px',
                opacity: activeReading.currentPage >= activeReading.totalPages - 1 ? 0.4 : 1,
                cursor:
                  activeReading.currentPage >= activeReading.totalPages - 1 ? 'default' : 'pointer',
              }}
              onClick={() => hudProvider.setReadingPage(activeReading.currentPage + 1)}
            >
              Вперед ▶
            </button>
          </div>
        )}

        {/* Кнопка закрытия */}
        <button
          type="button"
          style={{
            ...RETRO_BUTTON_STYLE,
            width: '100%',
            justifyContent: 'center',
            color: '#8b0000',
            padding: '8px 14px',
            fontSize: '15px',
          }}
          onClick={onClose}
        >
          [Закрыть]
        </button>
      </div>
    </RetroWindow>
  );
};
