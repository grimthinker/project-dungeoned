import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { DialogueNodeData } from '../../dialogue/dialogueFlowAdapter';

export const DialogueNodeComponent: React.FC<NodeProps<Node<DialogueNodeData>>> = ({
  id,
  data,
  selected,
}) => {
  const isStart = data.isStartNode;
  const onEnterActionsCount = data.onEnterActions?.length ?? 0;

  return (
    <div
      style={{
        width: 320,
        backgroundColor: '#181818',
        border: selected
          ? '2px solid #2ecc71'
          : isStart
            ? '2px solid #f39c12'
            : '1px solid #333333',
        borderRadius: 8,
        color: '#ecf0f1',
        boxShadow: selected ? '0 0 16px rgba(46, 204, 113, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.65)',
        fontSize: 12,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target-in"
        style={{
          width: 12,
          height: 12,
          backgroundColor: '#3498db',
          border: '2px solid #111',
          left: -6,
        }}
        title="Вход в реплику"
      />

      {/* Шапка узла */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          backgroundColor: isStart ? '#2c2211' : '#222222',
          borderBottom: '1px solid #333333',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {isStart && (
            <span
              style={{
                backgroundColor: '#f39c12',
                color: '#111',
                fontWeight: 'bold',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                flexShrink: 0,
              }}
            >
              START
            </span>
          )}
          <span
            style={{
              fontWeight: 'bold',
              color: isStart ? '#f39c12' : '#95a5a6',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
            title={id}
          >
            {id}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {!isStart && (
            <button
              type="button"
              className="nodrag"
              onClick={() => {
                if (typeof (data as any).onSetStartNode === 'function') {
                  (data as any).onSetStartNode();
                }
              }}
              style={{
                background: 'none',
                border: '1px solid #555',
                color: '#aaa',
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: 10,
                padding: '2px 5px',
              }}
              title="Сделать стартовым узлом диалога"
            >
              ★ Старт
            </button>
          )}

          <button
            type="button"
            className="nodrag"
            onClick={() => {
              if (typeof (data as any).onDeleteNode === 'function') {
                (data as any).onDeleteNode();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#e74c3c',
              cursor: 'pointer',
              fontSize: 13,
              padding: '0 4px',
              lineHeight: 1,
            }}
            title="Удалить узел"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Тело реплики */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            type="text"
            className="nodrag"
            placeholder="Имя NPC (по умолчанию)"
            value={data.speakerName || ''}
            onChange={(e) => {
              if (typeof (data as any).onUpdateSpeakerName === 'function') {
                (data as any).onUpdateSpeakerName(e.target.value);
              }
            }}
            style={{
              flex: 1,
              backgroundColor: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#fff',
              padding: '4px 8px',
              fontSize: 11,
              outline: 'none',
            }}
          />

          <button
            type="button"
            className="nodrag"
            onClick={() => {
              if (typeof (data as any).onOpenNodeActions === 'function') {
                (data as any).onOpenNodeActions();
              }
            }}
            style={{
              background: onEnterActionsCount > 0 ? '#d35400' : 'none',
              border: '1px solid #444',
              color: onEnterActionsCount > 0 ? '#fff' : '#888',
              borderRadius: 3,
              fontSize: 10,
              padding: '2px 6px',
              marginLeft: 6,
              cursor: 'pointer',
            }}
            title="Действия при переходе к этой реплике"
          >
            ⚡ {onEnterActionsCount > 0 ? `Экшены (${onEnterActionsCount})` : 'Экшены'}
          </button>
        </div>

        <textarea
          className="nodrag"
          rows={3}
          placeholder="Введите фразу..."
          value={data.text || ''}
          onChange={(e) => {
            if (typeof (data as any).onUpdateText === 'function') {
              (data as any).onUpdateText(e.target.value);
            }
          }}
          style={{
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff',
            padding: '6px 8px',
            fontSize: 12,
            lineHeight: 1.4,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
          }}
        />

        {/* Варианты ответов */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div
            style={{
              fontSize: 10,
              color: '#bdc3c7',
              fontWeight: 'bold',
              textTransform: 'uppercase',
            }}
          >
            Варианты ответа (выходы):
          </div>

          {(data.choices || []).map((choice, idx) => {
            const condCount = choice.conditions?.length ?? 0;
            const actCount = choice.actions?.length ?? 0;

            return (
              <div
                key={choice.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  backgroundColor: '#202020',
                  border: '1px solid #2e2e2e',
                  borderRadius: 4,
                  padding: '6px 8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#f39c12', fontWeight: 'bold' }}>
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    className="nodrag"
                    value={choice.text}
                    placeholder="Текст ответа игрока..."
                    onChange={(e) => {
                      if (typeof (data as any).onUpdateChoiceText === 'function') {
                        (data as any).onUpdateChoiceText(choice.id, e.target.value);
                      }
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#fff',
                      fontSize: 11,
                      outline: 'none',
                    }}
                  />

                  <button
                    type="button"
                    className="nodrag"
                    onClick={() => {
                      if (typeof (data as any).onDeleteChoice === 'function') {
                        (data as any).onDeleteChoice(choice.id);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#7f8c8d',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '0 2px',
                    }}
                    title="Удалить вариант ответа"
                  >
                    ✕
                  </button>
                </div>

                {/* Строка бейджей условий и экшенов */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 2,
                  }}
                >
                  <div style={{ display: 'flex', gap: 4 }}>
                    {condCount > 0 && (
                      <span
                        style={{
                          backgroundColor: '#2980b9',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 'bold',
                          padding: '1px 4px',
                          borderRadius: 3,
                        }}
                        title={`Условий: ${condCount}`}
                      >
                        🔒 {condCount}
                      </span>
                    )}
                    {actCount > 0 && (
                      <span
                        style={{
                          backgroundColor: '#8e44ad',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 'bold',
                          padding: '1px 4px',
                          borderRadius: 3,
                        }}
                        title={`Действий: ${actCount}`}
                      >
                        ⚡ {actCount}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="nodrag"
                    onClick={() => {
                      if (typeof (data as any).onOpenChoiceSettings === 'function') {
                        (data as any).onOpenChoiceSettings(choice.id);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid #444',
                      borderRadius: 3,
                      color: '#aaa',
                      fontSize: 10,
                      padding: '1px 5px',
                      cursor: 'pointer',
                    }}
                    title="Настроить условия и действия этого ответа"
                  >
                    ⚙️ Правила
                  </button>
                </div>

                <Handle
                  type="source"
                  position={Position.Right}
                  id={choice.id}
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: choice.targetNodeId ? '#2ecc71' : '#e74c3c',
                    border: '2px solid #111',
                    right: -6,
                    top: '50%',
                  }}
                  title={
                    choice.targetNodeId
                      ? `Ведет к узлу: ${choice.targetNodeId}`
                      : 'Свободный порт [Завершение диалога]'
                  }
                />
              </div>
            );
          })}

          <button
            type="button"
            className="nodrag"
            onClick={() => {
              if (typeof (data as any).onAddChoice === 'function') {
                (data as any).onAddChoice();
              }
            }}
            style={{
              backgroundColor: '#262626',
              border: '1px dashed #444',
              borderRadius: 4,
              color: '#3498db',
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >
            + Добавить вариант ответа
          </button>
        </div>
      </div>
    </div>
  );
};
