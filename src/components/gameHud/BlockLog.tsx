import React, { useState, useEffect, useRef } from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE } from './RetroStyles';
import { EventBus } from '../../core/EventBus';
import { IHudDataProvider, LogEntryDTO } from './hudPorts';

export interface BlockLogProps {
  isOpen: boolean;
  onClose: () => void;
  hudProvider?: IHudDataProvider | null;
}

export const BlockLog: React.FC<BlockLogProps> = ({ isOpen, onClose, hudProvider }) => {
  const defaultX = typeof window !== 'undefined' ? window.innerWidth - 280 : 800;
  const defaultY = typeof window !== 'undefined' ? window.innerHeight - 246 : 600;

  const [entries, setEntries] = useState<LogEntryDTO[]>(() =>
    hudProvider ? hudProvider.getLogEntries() : []
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hudProvider) setEntries(hudProvider.getLogEntries());
    const unsub = EventBus.on('log:entry', (newEntry) => {
      setEntries((prev) => [...prev.slice(-99), newEntry]);
    });
    return unsub;
  }, [hudProvider]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'quest':
        return '#f39c12';
      case 'dialogue':
        return '#2ecc71';
      case 'combat':
        return '#e74c3c';
      default:
        return '#3498db';
    }
  };

  return (
    <RetroWindow
      title="ЖУРНАЛ [J]"
      isOpen={isOpen}
      onClose={onClose}
      initialX={defaultX}
      initialY={defaultY}
      initialWidth={320}
      initialHeight={230}
      minWidth={240}
      minHeight={140}
      storageKey="hud_window_log"
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          ...RETRO_SUNKEN_STYLE,
          padding: '8px 10px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          boxSizing: 'border-box',
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: '#444',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            ЖУРНАЛ СООБЩЕНИЙ ПУСТ.
          </div>
        ) : (
          entries.map((item, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '11px',
                lineHeight: '1.3',
                color: '#111',
                display: 'flex',
                gap: '6px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ color: '#555', fontFamily: 'monospace', flexShrink: 0 }}>
                [{formatTime(item.timestamp)}]
              </span>
              <span
                style={{
                  color: getBadgeColor(item.type),
                  fontWeight: 'bold',
                  flexShrink: 0,
                  fontSize: '9px',
                }}
              >
                [{item.type.toUpperCase()}]
              </span>
              <span style={{ wordBreak: 'break-word', color: '#111' }}>{item.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </RetroWindow>
  );
};
