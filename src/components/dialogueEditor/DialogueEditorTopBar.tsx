import React, { useRef } from 'react';
import { DialogueGraph } from '../../dialogue/types';

export interface DialogueEditorTopBarProps {
  currentDialogue: DialogueGraph;
  allDialogues: Array<{ id: string; title: string }>;
  onSelectDialogue: (id: string) => void;
  onCreateDialogue: () => void;
  onUpdateTitle: (title: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const DialogueEditorTopBar: React.FC<DialogueEditorTopBarProps> = ({
  currentDialogue,
  allDialogues,
  onSelectDialogue,
  onCreateDialogue,
  onUpdateTitle,
  onExport,
  onImport,
  onDelete,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSystemDialogue =
    currentDialogue.id === 'default_npc_dialogue' || currentDialogue.id === 'dog_bark_dialogue';

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
      {/* Левая секция: Выбор и создание диалогов */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18, marginRight: 2 }}>💬</span>

        <select
          value={currentDialogue.id}
          onChange={(e) => onSelectDialogue(e.target.value)}
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
          {allDialogues.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} ({d.id})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onCreateDialogue}
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
          title="Создать новый граф диалога"
        >
          + Новый диалог
        </button>
      </div>

      {/* Центральная секция: Редактирование названия */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 420 }}>
        <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>Название:</span>
        <input
          type="text"
          value={currentDialogue.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          style={{
            flex: 1,
            backgroundColor: '#111',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#2ecc71',
            fontWeight: 'bold',
            padding: '6px 10px',
            fontSize: 13,
            outline: 'none',
          }}
          placeholder="Название диалога"
        />
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
          title={`Идентификатор графа: ${currentDialogue.id}`}
        >
          ID: {currentDialogue.id}
        </span>
      </div>

      {/* Правая секция: Экспорт, Импорт, Удаление и Закрытие */}
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
          title="Сохранить текущий диалог в отдельный .json файл"
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
          title="Загрузить диалог из .json файла"
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

        {!isSystemDialogue && (
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
            title="Удалить данный диалог"
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
          title="Вернуться к 3D-сцене"
        >
          ✕ Закрыть
        </button>
      </div>
    </div>
  );
};
