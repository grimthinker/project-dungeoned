import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { DialogueNodeData } from '../../dialogue/dialogueFlowAdapter';

export const DialogueBranchNodeComponent: React.FC<NodeProps<Node<DialogueNodeData>>> = ({
  id,
  data,
  selected,
}) => {
  const isStart = data.isStartNode;
  const onEnterActionsCount = data.onEnterActions?.length ?? 0;
  const cases = data.branchCases || [];

  return (
    <div
      style={{
        width: 320,
        backgroundColor: '#181818',
        border: selected
          ? '2px solid #2ecc71'
          : isStart
            ? '2px solid #f1c40f'
            : '1px solid #8e44ad',
        borderRadius: 8,
        color: '#ecf0f1',
        boxShadow: selected ? '0 0 16px rgba(46, 204, 113, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.65)',
        fontSize: 12,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: 'visible',
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
          backgroundColor: '#9b59b6',
          border: '2px solid #111',
          left: -6,
        }}
        title="Вход в ветвление"
      />

      {/* Шапка узла */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          backgroundColor: isStart ? '#2e2610' : '#2b1b33',
          borderBottom: '1px solid #333333',
          borderRadius: '7px 7px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {isStart ? (
            <span
              style={{
                backgroundColor: '#f1c40f',
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
          ) : (
            <span
              style={{
                backgroundColor: '#8e44ad',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                flexShrink: 0,
              }}
            >
              BRANCH
            </span>
          )}
          <span
            style={{
              fontWeight: 'bold',
              color: isStart ? '#f1c40f' : '#bb86fc',
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
              onClick={() => (data as any).onSetStartNode?.()}
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
            onClick={() => (data as any).onDeleteNode?.()}
            style={{
              background: 'none',
              border: 'none',
              color: '#e74c3c',
              cursor: 'pointer',
              fontSize: 13,
              padding: '0 4px',
              lineHeight: 1,
            }}
            title="Удалить узел ветвления"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Тело узла */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            type="text"
            className="nodrag"
            placeholder="Описание развилки..."
            value={data.name || ''}
            onChange={(e) => (data as any).onUpdateBranchName?.(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#bb86fc',
              fontWeight: 'bold',
              padding: '4px 8px',
              fontSize: 11,
              outline: 'none',
            }}
          />

          <button
            type="button"
            className="nodrag"
            onClick={() => (data as any).onOpenNodeActions?.()}
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
            title="Действия при прохождении через это ветвление"
          >
            ⚡ {onEnterActionsCount > 0 ? `(${onEnterActionsCount})` : 'Экшены'}
          </button>
        </div>

        {/* Список условных веток */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontSize: 10,
              color: '#bdc3c7',
              fontWeight: 'bold',
              textTransform: 'uppercase',
            }}
          >
            Ветки условий (по порядку):
          </div>

          {cases.map((bc, idx) => {
            const condCount = bc.conditions?.length ?? 0;

            return (
              <div
                key={bc.id}
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
                  <span style={{ fontSize: 10, color: '#9b59b6', fontWeight: 'bold' }}>
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    className="nodrag"
                    value={bc.name || ''}
                    placeholder="Описание ветки..."
                    onChange={(e) => (data as any).onUpdateBranchCaseName?.(bc.id, e.target.value)}
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
                    onClick={() => (data as any).onDeleteBranchCase?.(bc.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#7f8c8d',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '0 2px',
                    }}
                    title="Удалить ветку"
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        backgroundColor: condCount > 0 ? '#2980b9' : '#444',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 'bold',
                        padding: '1px 5px',
                        borderRadius: 3,
                      }}
                      title={`Условий: ${condCount}`}
                    >
                      🔒 {condCount} {condCount === 1 ? 'условие' : 'условий'}
                    </span>

                    <button
                      type="button"
                      className="nodrag"
                      onClick={() => (data as any).onOpenBranchCaseConditions?.(bc.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #444',
                        borderRadius: 3,
                        color: '#aaa',
                        fontSize: 10,
                        padding: '1px 5px',
                        cursor: 'pointer',
                      }}
                      title="Настроить условия ветвления"
                    >
                      ⚙️ Настроить
                    </button>
                  </div>

                  {bc.targetNodeId && (
                    <span
                      style={{
                        fontSize: 9,
                        color: '#2ecc71',
                        fontFamily: 'monospace',
                        maxWidth: 90,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Ведет к: ${bc.targetNodeId}`}
                    >
                      ➔ {bc.targetNodeId}
                    </span>
                  )}
                </div>

                <Handle
                  type="source"
                  position={Position.Right}
                  id={bc.id}
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: bc.targetNodeId ? '#2ecc71' : '#e74c3c',
                    border: '2px solid #111',
                    right: -6,
                    top: '50%',
                  }}
                  title={
                    bc.targetNodeId ? `Ведет к: ${bc.targetNodeId}` : 'Свободный порт [Завершение]'
                  }
                />
              </div>
            );
          })}

          <button
            type="button"
            className="nodrag"
            onClick={() => (data as any).onAddBranchCase?.()}
            style={{
              backgroundColor: '#262626',
              border: '1px dashed #444',
              borderRadius: 4,
              color: '#bb86fc',
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >
            + Добавить ветку с условием
          </button>
        </div>

        {/* Секция Fallback / Иначе */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1f1a14',
            border: '1px solid #4a3818',
            borderRadius: 4,
            padding: '6px 8px',
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 'bold', color: '#f39c12' }}>
            Иначе (Else / Fallback):
          </span>

          {data.defaultTargetNodeId ? (
            <span
              style={{
                fontSize: 9,
                color: '#2ecc71',
                fontFamily: 'monospace',
                maxWidth: 110,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginRight: 4,
              }}
              title={`Ведет к: ${data.defaultTargetNodeId}`}
            >
              ➔ {data.defaultTargetNodeId}
            </span>
          ) : (
            <span style={{ fontSize: 9, color: '#888', marginRight: 4 }}>[Завершение]</span>
          )}

          <Handle
            type="source"
            position={Position.Right}
            id="default-case"
            style={{
              width: 10,
              height: 10,
              backgroundColor: data.defaultTargetNodeId ? '#f39c12' : '#7f8c8d',
              border: '2px solid #111',
              right: -6,
              top: '50%',
            }}
            title={
              data.defaultTargetNodeId
                ? `По умолчанию ведет к: ${data.defaultTargetNodeId}`
                : 'Свободный порт [Завершение]'
            }
          />
        </div>
      </div>
    </div>
  );
};
