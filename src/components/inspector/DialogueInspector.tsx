import React, { useState, useMemo } from 'react';
import { World } from '../../ecs/World';
import { GameApp } from '../../GameApp';
import { DIALOGUE_REGISTRY } from '../../dialogue/dialogueRegistry';

export interface DialogueInspectorProps {
  targetId: string;
  world: World;
  app?: GameApp | null;
  isReadOnly?: boolean;
  onCommit: (desc: string) => void;
  onOpenDialogueEditor?: (dialogueId: string) => void;
}

export const DialogueInspector: React.FC<DialogueInspectorProps> = ({
  targetId,
  world,
  app,
  isReadOnly,
  onCommit,
  onOpenDialogueEditor,
}) => {
  const dialogueTarget = world.getComponent(targetId, 'dialogueTarget');
  const [search, setSearch] = useState('');

  const currentDialogueId = dialogueTarget?.dialogueId ?? '';

  const allDialogues = useMemo(() => {
    return Object.values(DIALOGUE_REGISTRY).map((d) => ({
      id: d.id,
      title: d.title,
      startText: d.nodes[d.startNodeId]?.text || '',
    }));
  }, []);

  const filteredDialogues = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDialogues;
    return allDialogues.filter(
      (d) => d.id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)
    );
  }, [allDialogues, search]);

  const handleSelectDialogue = (dialogueId: string) => {
    if (isReadOnly || !app) return;
    app.mutations.updateEntityDialogue(targetId, dialogueId);
    onCommit('Выбор диалога');
  };

  const currentDialogue = DIALOGUE_REGISTRY[currentDialogueId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Информация о текущем выбранном диалоге */}
      <div
        style={{
          padding: '8px',
          backgroundColor: '#1b1b1b',
          borderRadius: '4px',
          border: '1px solid #333',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
            Текущий диалог:
          </div>
          {currentDialogueId && onOpenDialogueEditor && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onOpenDialogueEditor(currentDialogueId)}
              style={{
                backgroundColor: '#2980b9',
                color: '#fff',
                padding: '2px 6px',
                fontSize: '10px',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              title="Открыть в визуальном нодовом редакторе"
            >
              Редактировать граф ↗
            </button>
          )}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#2ecc71' }}>
          {currentDialogue ? currentDialogue.title : currentDialogueId || 'Не выбран'}
        </div>
        <div style={{ fontSize: '10px', color: '#aaa', fontFamily: 'monospace' }}>
          ID: {currentDialogueId || '—'}
        </div>
        {currentDialogue && (
          <div
            style={{
              fontSize: '11px',
              color: '#bdc3c7',
              marginTop: '6px',
              fontStyle: 'italic',
              maxHeight: '45px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            "{currentDialogue.nodes[currentDialogue.startNodeId]?.text}"
          </div>
        )}
      </div>

      {/* Поле поиска по списку существующих диалогов */}
      {!isReadOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '11px', color: '#bdc3c7', fontWeight: 'bold' }}>
            Поиск диалогов:
          </div>
          <input
            type="text"
            value={search}
            placeholder="Поиск по названию или ID..."
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: '#111',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '3px',
              boxSizing: 'border-box',
              width: '100%',
            }}
          />
        </div>
      )}

      {/* Список доступных диалогов */}
      <div
        style={{
          maxHeight: '140px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          border: '1px solid #282828',
          padding: '4px',
          borderRadius: '4px',
          backgroundColor: '#151515',
        }}
      >
        {filteredDialogues.length === 0 ? (
          <div
            style={{
              fontSize: '11px',
              color: '#666',
              padding: '6px',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            Диалоги не найдены
          </div>
        ) : (
          filteredDialogues.map((d) => {
            const isSelected = d.id === currentDialogueId;
            return (
              <div
                key={d.id}
                onClick={() => handleSelectDialogue(d.id)}
                style={{
                  padding: '6px 8px',
                  backgroundColor: isSelected ? '#1b4332' : '#222',
                  border: isSelected ? '1px solid #2ecc71' : '1px solid #333',
                  borderRadius: '3px',
                  cursor: isReadOnly ? 'default' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    color: isSelected ? '#2ecc71' : '#ecf0f1',
                  }}
                >
                  {d.title}
                </div>
                <div style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>
                  {d.id}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
