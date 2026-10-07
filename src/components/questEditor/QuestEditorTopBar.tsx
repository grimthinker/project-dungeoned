import React, { useRef } from 'react';
import { QuestGraph } from '../../quest/types';

export interface QuestEditorTopBarProps {
  currentQuest: QuestGraph;
  allQuests: Array<{ id: string; title: string }>;
  onSelectQuest: (id: string) => void;
  onCreateQuest: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateDescription: (description: string) => void;
  onToggleRepeatable: (isRepeatable: boolean) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const QuestEditorTopBar: React.FC<QuestEditorTopBarProps> = ({
  currentQuest,
  allQuests,
  onSelectQuest,
  onCreateQuest,
  onUpdateTitle,
  onUpdateDescription,
  onToggleRepeatable,
  onExport,
  onImport,
  onDelete,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSystemQuest = currentQuest.id === 'fetch_dog_quest';

  return (
    <div
      style={{
        height: 52,
        backgroundColor: '#181818',
        borderBottom: '1px solid #333333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        color: '#ecf0f1',
        boxSizing: 'border-box',
        zIndex: 50,
        gap: 12,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>📜</span>
        <select
          value={currentQuest.id}
          onChange={(e) => onSelectQuest(e.target.value)}
          style={{
            backgroundColor: '#111',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            outline: 'none',
            cursor: 'pointer',
            maxWidth: 240,
          }}
        >
          {allQuests.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title} ({q.id})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onCreateQuest}
          style={{
            backgroundColor: '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          title="Создать новый квест"
        >
          + Новый квест
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 440 }}>
        <input
          type="text"
          value={currentQuest.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          style={{
            flex: 1,
            backgroundColor: '#111',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#f1c40f',
            fontWeight: 'bold',
            padding: '6px 10px',
            fontSize: 13,
            outline: 'none',
          }}
          placeholder="Название квеста"
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#aaa',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(currentQuest.isRepeatable)}
            onChange={(e) => onToggleRepeatable(e.target.checked)}
          />
          Повторяемый
        </label>
        <span
          style={{
            fontSize: 10,
            color: '#777',
            fontFamily: 'monospace',
            backgroundColor: '#202020',
            padding: '4px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          ID: {currentQuest.id}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onExport}
          style={{
            backgroundColor: '#2c3e50',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          💾 Экспорт
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            backgroundColor: '#2c3e50',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          📂 Импорт
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = '';
          }}
        />

        {!isSystemQuest && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              backgroundColor: '#c0392b',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            🗑️
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: '#34495e',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 'bold',
            cursor: 'pointer',
            marginLeft: 6,
          }}
        >
          ✕ Закрыть
        </button>
      </div>
    </div>
  );
};
