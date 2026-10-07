import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { QuestNodeData } from '../../quest/questFlowAdapter';
import { ObjectiveType } from '../../quest/types';

export const QuestStageNodeComponent: React.FC<NodeProps<Node<QuestNodeData>>> = ({
  id,
  data,
  selected,
}) => {
  const isStart = data.isStartStage;

  return (
    <div
      style={{
        width: 360,
        backgroundColor: '#181818',
        border: selected
          ? '2px solid #2ecc71'
          : isStart
            ? '2px solid #f1c40f'
            : '1px solid #333333',
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
        id="stage-in"
        style={{
          width: 12,
          height: 12,
          backgroundColor: '#3498db',
          border: '2px solid #111',
          left: -7,
          top: '50%',
        }}
        title="Вход в этап"
      />

      {/* Шапка этапа */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          backgroundColor: isStart ? '#2e2610' : '#222222',
          borderBottom: '1px solid #333333',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {isStart && (
            <span
              style={{
                backgroundColor: '#f1c40f',
                color: '#111',
                fontWeight: 'bold',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
              }}
            >
              START
            </span>
          )}
          <span
            style={{
              fontWeight: 'bold',
              color: isStart ? '#f1c40f' : '#95a5a6',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            {id}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!isStart && (
            <button
              type="button"
              className="nodrag"
              onClick={() => (data as any).onSetStartStage?.()}
              style={{
                background: 'none',
                border: '1px solid #555',
                color: '#aaa',
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: 10,
                padding: '2px 5px',
              }}
            >
              ★ Старт
            </button>
          )}
          <button
            type="button"
            className="nodrag"
            onClick={() => (data as any).onDeleteStage?.()}
            style={{
              background: 'none',
              border: 'none',
              color: '#e74c3c',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Тело этапа */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          className="nodrag"
          placeholder="Название этапа..."
          value={data.title}
          onChange={(e) => (data as any).onUpdateTitle?.(e.target.value)}
          style={{
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#fff',
            padding: '4px 8px',
            fontSize: 12,
            fontWeight: 'bold',
            outline: 'none',
          }}
        />

        <textarea
          className="nodrag"
          rows={2}
          placeholder="Описание этапа для игрока..."
          value={data.description}
          onChange={(e) => (data as any).onUpdateDescription?.(e.target.value)}
          style={{
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#bbb',
            padding: '4px 6px',
            fontSize: 11,
            resize: 'vertical',
            outline: 'none',
          }}
        />

        {/* Переключатель завершения: AND (все цели) / OR (любая цель) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888' }}>Условие завершения этапа:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="nodrag"
              onClick={() => (data as any).onUpdateCompletionMode?.('all')}
              style={{
                backgroundColor: data.completionMode === 'all' ? '#2980b9' : '#222',
                color: '#fff',
                border: '1px solid #444',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: data.completionMode === 'all' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              [AND] Все цели
            </button>
            <button
              type="button"
              className="nodrag"
              onClick={() => (data as any).onUpdateCompletionMode?.('any')}
              style={{
                backgroundColor: data.completionMode === 'any' ? '#e67e22' : '#222',
                color: '#fff',
                border: '1px solid #444',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: data.completionMode === 'any' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              [OR] Любая цель
            </button>
          </div>
        </div>

        {/* Список целей */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#bdc3c7', fontWeight: 'bold' }}>
            ЗАДАЧИ ЭТАПА ({data.objectives.length}):
          </div>

          {data.objectives.map((obj, idx) => (
            <div
              key={obj.id}
              style={{
                position: 'relative',
                backgroundColor: '#202020',
                border: '1px solid #2e2e2e',
                borderRadius: 4,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#f1c40f', fontSize: 10 }}>{idx + 1}.</span>
                <input
                  type="text"
                  className="nodrag"
                  value={obj.title}
                  placeholder="Текст задачи..."
                  onChange={(e) =>
                    (data as any).onUpdateObjective?.(obj.id, { title: e.target.value })
                  }
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
                  onClick={() => (data as any).onDeleteObjective?.(obj.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#7f8c8d',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Строка 2: Тип задачи и целевой ключ на всю ширину */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="nodrag"
                  value={obj.type}
                  onChange={(e) =>
                    (data as any).onUpdateObjective?.(obj.id, {
                      type: e.target.value as ObjectiveType,
                    })
                  }
                  style={{
                    width: 130,
                    backgroundColor: '#111',
                    color: '#3498db',
                    border: '1px solid #333',
                    fontSize: 10,
                    borderRadius: 3,
                    padding: '3px 4px',
                    flexShrink: 0,
                  }}
                >
                  <option value="reach_zone">Зона (reach_zone)</option>
                  <option value="collect_item">Предмет (collect_item)</option>
                  <option value="talk_to_npc">Диалог (talk_to_npc)</option>
                  <option value="kill_entity">Убить (kill_entity)</option>
                  <option value="set_flag">Флаг (set_flag)</option>
                </select>

                <input
                  type="text"
                  className="nodrag"
                  placeholder="Тег зоны / Название предмета / ID..."
                  value={obj.targetKey || obj.targetZoneTag || ''}
                  onChange={(e) =>
                    (data as any).onUpdateObjective?.(obj.id, {
                      targetKey: e.target.value,
                      targetZoneTag: e.target.value,
                    })
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    backgroundColor: '#111',
                    border: '1px solid #333',
                    color: '#ecf0f1',
                    fontSize: 10,
                    padding: '3px 6px',
                    borderRadius: 3,
                  }}
                />
              </div>

              {/* Строка 3: Чекбоксы Опц./Скрытая, Кол-во и отображение ветки перехода */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 9,
                      color: '#aaa',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      className="nodrag"
                      checked={Boolean(obj.isOptional)}
                      onChange={(e) =>
                        (data as any).onUpdateObjective?.(obj.id, { isOptional: e.target.checked })
                      }
                    />
                    Опц.
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 9,
                      color: '#aaa',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      className="nodrag"
                      checked={Boolean(obj.isHidden)}
                      onChange={(e) => {
                        const isHidden = e.target.checked;
                        const patch: any = { isHidden };
                        // Если задача скрытая, она почти всегда опциональная
                        if (isHidden) {
                          patch.isOptional = true;
                        }
                        (data as any).onUpdateObjective?.(obj.id, patch);
                      }}
                    />
                    Скрытая
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
                    <span style={{ fontSize: 9, color: '#888' }}>Кол-во:</span>
                    <input
                      type="number"
                      className="nodrag"
                      min={1}
                      value={obj.requiredCount ?? 1}
                      onChange={(e) =>
                        (data as any).onUpdateObjective?.(obj.id, {
                          requiredCount: Math.max(1, Number(e.target.value)),
                        })
                      }
                      style={{
                        width: 38,
                        backgroundColor: '#111',
                        border: '1px solid #333',
                        color: '#2ecc71',
                        fontSize: 10,
                        textAlign: 'center',
                        padding: '1px 2px',
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>

                {obj.nextStageId && (
                  <div
                    style={{
                      fontSize: 9,
                      color: '#2ecc71',
                      fontWeight: 'bold',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 110,
                    }}
                    title={`Ветка ➔ ${obj.nextStageId}`}
                  >
                    ➔ {obj.nextStageId}
                  </div>
                )}
              </div>

              {/* Порт для вытягивания стрелки ветвления из этой конкретной задачи */}
              <Handle
                type="source"
                position={Position.Right}
                id={`obj-${obj.id}`}
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: obj.nextStageId ? '#2ecc71' : '#888888',
                  border: '2px solid #111',
                  right: -11,
                  top: '50%',
                }}
                title={
                  obj.nextStageId
                    ? `Ветка ведет в: ${obj.nextStageId}`
                    : 'Тяните стрелку для создания развилки'
                }
              />
            </div>
          ))}

          <button
            type="button"
            className="nodrag"
            onClick={() => (data as any).onAddObjective?.()}
            style={{
              backgroundColor: '#222',
              border: '1px dashed #444',
              borderRadius: 4,
              color: '#3498db',
              padding: '4px',
              fontSize: 10,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            + Добавить задачу
          </button>
        </div>

        {/* Футер этапа: Правила + Общий выход */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid #282828',
            position: 'relative',
          }}
        >
          <button
            type="button"
            className="nodrag"
            onClick={() => (data as any).onOpenRules?.()}
            style={{
              backgroundColor: '#2c3e50',
              border: '1px solid #444',
              color: '#fff',
              borderRadius: 3,
              fontSize: 10,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            ⚙️ Награды и Экшены этапа
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 'bold',
                color: data.nextStageId ? '#f1c40f' : '#7f8c8d',
              }}
            >
              {data.nextStageId ? `➔ ${data.nextStageId}` : '[Конец квеста]'}
            </span>
          </div>

          {/* Общий выход этапа по умолчанию (четко по центру правого края футера) */}
          <Handle
            type="source"
            position={Position.Right}
            id="stage-default-out"
            style={{
              width: 12,
              height: 12,
              backgroundColor: data.nextStageId ? '#f1c40f' : '#555555',
              border: '2px solid #111',
              right: -16,
              top: 'auto',
              bottom: 8,
              transform: 'none',
            }}
            title="Общий переход по умолчанию (когда выполнены все условия этапа)"
          />
        </div>
      </div>
    </div>
  );
};
