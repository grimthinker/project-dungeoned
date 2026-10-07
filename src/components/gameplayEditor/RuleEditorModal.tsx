import React, { useState } from 'react';
import {
  GameplayCondition,
  GameplayAction,
  GameplayConditionType,
  GameplayActionType,
} from '../../gameplay/types';
import { BEHAVIOR_TREE_NAMES } from '../../ai/trees_library';

export interface RuleEditorModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  conditions: GameplayCondition[];
  actions: GameplayAction[];
  tabTitles?: {
    conditions: string;
    actions: string;
  };
  onSave: (conditions: GameplayCondition[], actions: GameplayAction[]) => void;
  onClose: () => void;
}

export const RuleEditorModal: React.FC<RuleEditorModalProps> = ({
  isOpen,
  title,
  subtitle,
  conditions: initialConditions,
  actions: initialActions,
  tabTitles,
  onSave,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'conditions' | 'actions'>('conditions');
  const [conditions, setConditions] = useState<GameplayCondition[]>(() =>
    initialConditions.map((c) => ({ ...c }))
  );
  const [actions, setActions] = useState<GameplayAction[]>(() =>
    initialActions.map((a) => ({ ...a, payload: { ...a.payload } }))
  );

  if (!isOpen) return null;

  const handleAddCondition = () => {
    setConditions([...conditions, { type: 'flag_has', key: 'quest_flag_name', value: true }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleUpdateCondition = (index: number, patch: Partial<GameplayCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const handleAddAction = () => {
    setActions([
      ...actions,
      { type: 'set_flag', payload: { key: 'quest_flag_name', value: true } },
    ]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (index: number, type: GameplayActionType, payloadPatch: any) => {
    setActions(
      actions.map((a, i) => {
        if (i !== index) return a;
        return {
          type,
          payload: { ...a.payload, ...payloadPatch },
        };
      })
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 540,
          maxHeight: '85vh',
          backgroundColor: '#181818',
          border: '1px solid #333',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          color: '#ecf0f1',
          overflow: 'hidden',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* Шапка */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#202020',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#2ecc71' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* Вкладки */}
        <div
          style={{ display: 'flex', backgroundColor: '#141414', borderBottom: '1px solid #2a2a2a' }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('conditions')}
            style={{
              flex: 1,
              padding: '10px 0',
              backgroundColor: activeTab === 'conditions' ? '#222' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'conditions' ? '2px solid #e74c3c' : 'none',
              color: activeTab === 'conditions' ? '#fff' : '#777',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {tabTitles?.conditions || '🔒 Условия (Conditions)'} [{conditions.length}]
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            style={{
              flex: 1,
              padding: '10px 0',
              backgroundColor: activeTab === 'actions' ? '#222' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'actions' ? '2px solid #2ecc71' : 'none',
              color: activeTab === 'actions' ? '#fff' : '#777',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {tabTitles?.actions || '⚡ Действия (Actions)'} [{actions.length}]
          </button>
        </div>

        {/* Контент */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {activeTab === 'conditions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {conditions.length === 0 ? (
                <div
                  style={{ textAlign: 'center', color: '#666', fontSize: 12, padding: '20px 0' }}
                >
                  Нет условий. Элемент будет доступен всегда.
                </div>
              ) : (
                conditions.map((cond, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#202020',
                      border: '1px solid #333',
                      borderRadius: 6,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <select
                        value={cond.type}
                        onChange={(e) =>
                          handleUpdateCondition(idx, {
                            type: e.target.value as GameplayConditionType,
                          })
                        }
                        style={{
                          backgroundColor: '#111',
                          color: '#3498db',
                          border: '1px solid #444',
                          borderRadius: 4,
                          padding: '4px 6px',
                          fontSize: 11,
                          fontWeight: 'bold',
                        }}
                      >
                        <option value="flag_has">Флаг взведен (flag_has)</option>
                        <option value="flag_not">Флаг не взведен (flag_not)</option>
                        <option value="flag_equals">Флаг равен (flag_equals)</option>
                        <option value="has_item">Предмет в руках/слотах (has_item)</option>
                        <option value="is_alive">Сущность жива (is_alive)</option>
                        <option value="stance_is">Стойка тела равна (stance_is)</option>
                        <option value="stance_not">Стойка тела не равна (stance_not)</option>
                        <option value="quest_status">Статус квеста (quest_status)</option>
                        <option value="quest_stage">Стадия квеста (quest_stage)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#e74c3c',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Ключ флага / ID предмета / сущности"
                        value={cond.key || ''}
                        onChange={(e) => handleUpdateCondition(idx, { key: e.target.value })}
                        style={{
                          flex: 1,
                          backgroundColor: '#111',
                          border: '1px solid #333',
                          borderRadius: 4,
                          color: '#fff',
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      />

                      {(cond.type === 'flag_equals' ||
                        cond.type === 'stance_is' ||
                        cond.type === 'stance_not') && (
                        <input
                          type="text"
                          placeholder="Значение (true, standing, 10...)"
                          value={cond.value !== undefined ? String(cond.value) : ''}
                          onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                          style={{
                            width: 130,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#fff',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={handleAddCondition}
                style={{
                  backgroundColor: '#252525',
                  border: '1px dashed #444',
                  borderRadius: 6,
                  color: '#3498db',
                  padding: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                + Добавить условие
              </button>
            </div>
          )}

          {activeTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actions.length === 0 ? (
                <div
                  style={{ textAlign: 'center', color: '#666', fontSize: 12, padding: '20px 0' }}
                >
                  Нет действий. Никаких событий не будет вызвано.
                </div>
              ) : (
                actions.map((act, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#202020',
                      border: '1px solid #333',
                      borderRadius: 6,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <select
                        value={act.type}
                        onChange={(e) =>
                          handleUpdateAction(idx, e.target.value as GameplayActionType, {
                            behavior: 'AttackerTree',
                            name: 'Враг из засады',
                            offset: { x: 2, y: 0, z: 2 },
                          })
                        }
                        style={{
                          backgroundColor: '#111',
                          color: '#e67e22',
                          border: '1px solid #444',
                          borderRadius: 4,
                          padding: '4px 6px',
                          fontSize: 11,
                          fontWeight: 'bold',
                        }}
                      >
                        <option value="set_flag">Установить сюжетный флаг (set_flag)</option>
                        <option value="change_ai">Сменить поведение ИИ (change_ai)</option>
                        <option value="spawn_entity">
                          Заспавнить врага / объект (spawn_entity)
                        </option>
                        <option value="teleport">Телепортация (teleport)</option>
                        <option value="deal_damage">Нанести урон (deal_damage)</option>
                        <option value="end_dialogue">Завершить диалог (end_dialogue)</option>
                        <option value="start_quest">Начать квест (start_quest)</option>
                        <option value="set_quest_stage">
                          Сменить этап квеста (set_quest_stage)
                        </option>
                        <option value="complete_quest">Завершить квест (complete_quest)</option>
                        <option value="fail_quest">Провалить квест (fail_quest)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveAction(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#e74c3c',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Параметры экшена */}
                    {(act.type === 'start_quest' || act.type === 'complete_quest') && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="ID квеста (например: fetch_dog_quest)"
                          value={act.payload?.questId || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, act.type, { questId: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#f1c40f',
                            fontWeight: 'bold',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}

                    {act.type === 'set_quest_stage' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="ID квеста"
                          value={act.payload?.questId || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'set_quest_stage', { questId: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#fff',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                        <input
                          type="text"
                          placeholder="ID этапа"
                          value={act.payload?.stageId || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'set_quest_stage', { stageId: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#f1c40f',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}

                    {act.type === 'fail_quest' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="ID квеста"
                          value={act.payload?.questId || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'fail_quest', { questId: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#e74c3c',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Причина (опционально)"
                          value={act.payload?.reason || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'fail_quest', { reason: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#fff',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}

                    {act.type === 'set_flag' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          placeholder="Ключ флага"
                          value={act.payload?.key || ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'set_flag', { key: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#fff',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Значение (true/false/строка)"
                          value={act.payload?.value !== undefined ? String(act.payload.value) : ''}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'set_flag', {
                              value:
                                e.target.value === 'true'
                                  ? true
                                  : e.target.value === 'false'
                                    ? false
                                    : e.target.value,
                            })
                          }
                          style={{
                            width: 140,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#fff',
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}

                    {act.type === 'change_ai' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          value={act.payload?.target || 'speaker'}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'change_ai', { target: e.target.value })
                          }
                          style={{
                            width: 130,
                            backgroundColor: '#111',
                            color: '#fff',
                            border: '1px solid #333',
                            borderRadius: 4,
                            fontSize: 11,
                            padding: '4px',
                          }}
                        >
                          <option value="speaker">Собеседник (speaker)</option>
                          <option value="activator">Активатор (activator)</option>
                          <option value="player">Игрок (player)</option>
                        </select>

                        <select
                          value={act.payload?.behavior || 'IdleTree'}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'change_ai', { behavior: e.target.value })
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#111',
                            color: '#2ecc71',
                            border: '1px solid #333',
                            borderRadius: 4,
                            fontSize: 11,
                            padding: '4px 8px',
                          }}
                        >
                          {Object.entries(BEHAVIOR_TREE_NAMES).map(([bId, bLabel]) => (
                            <option key={bId} value={bId}>
                              {bLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {act.type === 'deal_damage' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={act.payload?.target || 'activator'}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'deal_damage', { target: e.target.value })
                          }
                          style={{
                            width: 140,
                            backgroundColor: '#111',
                            color: '#fff',
                            border: '1px solid #333',
                            borderRadius: 4,
                            fontSize: 11,
                            padding: '4px',
                          }}
                        >
                          <option value="activator">Активатор (activator)</option>
                          <option value="speaker">Собеседник (speaker)</option>
                          <option value="player">Игрок (player)</option>
                        </select>

                        <span style={{ fontSize: 11, color: '#888' }}>Урон (HP):</span>
                        <input
                          type="number"
                          value={act.payload?.amount ?? 25}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'deal_damage', {
                              amount: Number(e.target.value),
                            })
                          }
                          style={{
                            width: 80,
                            backgroundColor: '#111',
                            border: '1px solid #333',
                            borderRadius: 4,
                            color: '#e74c3c',
                            fontWeight: 'bold',
                            padding: '4px 6px',
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}

                    {act.type === 'spawn_entity' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#888' }}>Имя врага:</span>
                          <input
                            type="text"
                            placeholder="Например: Разбойник из засады"
                            value={act.payload?.name || 'Враг'}
                            onChange={(e) =>
                              handleUpdateAction(idx, 'spawn_entity', { name: e.target.value })
                            }
                            style={{
                              flex: 1,
                              backgroundColor: '#111',
                              border: '1px solid #333',
                              borderRadius: 4,
                              color: '#fff',
                              padding: '4px 8px',
                              fontSize: 11,
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#888' }}>Поведение (AI):</span>
                          <select
                            value={act.payload?.behavior || 'AttackerTree'}
                            onChange={(e) =>
                              handleUpdateAction(idx, 'spawn_entity', { behavior: e.target.value })
                            }
                            style={{
                              flex: 1,
                              backgroundColor: '#111',
                              color: '#e74c3c',
                              border: '1px solid #333',
                              borderRadius: 4,
                              fontSize: 11,
                              padding: '4px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            <option value="AttackerTree">Атакующий бот (AttackerTree)</option>
                            <option value="FollowerTree">Бот-спутник (FollowerTree)</option>
                            <option value="IdleTree">Бездействие (IdleTree)</option>
                          </select>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            fontSize: 11,
                            color: '#888',
                          }}
                        >
                          <span>Смещение спавна от зоны:</span>
                          <span>X:</span>
                          <input
                            type="number"
                            value={act.payload?.offset?.x ?? 2}
                            onChange={(e) =>
                              handleUpdateAction(idx, 'spawn_entity', {
                                offset: {
                                  ...(act.payload?.offset || { y: 0, z: 2 }),
                                  x: Number(e.target.value),
                                },
                              })
                            }
                            style={{
                              width: 45,
                              backgroundColor: '#111',
                              color: '#fff',
                              padding: 2,
                              fontSize: 11,
                            }}
                          />
                          <span>Z:</span>
                          <input
                            type="number"
                            value={act.payload?.offset?.z ?? 2}
                            onChange={(e) =>
                              handleUpdateAction(idx, 'spawn_entity', {
                                offset: {
                                  ...(act.payload?.offset || { x: 2, y: 0 }),
                                  z: Number(e.target.value),
                                },
                              })
                            }
                            style={{
                              width: 45,
                              backgroundColor: '#111',
                              color: '#fff',
                              padding: 2,
                              fontSize: 11,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {act.type === 'teleport' && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={act.payload?.target || 'player'}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'teleport', { target: e.target.value })
                          }
                          style={{
                            width: 120,
                            backgroundColor: '#111',
                            color: '#fff',
                            border: '1px solid #333',
                            borderRadius: 4,
                            fontSize: 11,
                            padding: '4px',
                          }}
                        >
                          <option value="player">Игрок (player)</option>
                          <option value="activator">Активатор (activator)</option>
                          <option value="speaker">Собеседник (speaker)</option>
                        </select>

                        <span style={{ fontSize: 10, color: '#888' }}>X:</span>
                        <input
                          type="number"
                          value={act.payload?.pos?.x ?? 0}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'teleport', {
                              pos: { ...(act.payload?.pos || {}), x: Number(e.target.value) },
                            })
                          }
                          style={{
                            width: 50,
                            backgroundColor: '#111',
                            color: '#fff',
                            padding: 2,
                            fontSize: 11,
                          }}
                        />
                        <span style={{ fontSize: 10, color: '#888' }}>Y:</span>
                        <input
                          type="number"
                          value={act.payload?.pos?.y ?? 0}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'teleport', {
                              pos: { ...(act.payload?.pos || {}), y: Number(e.target.value) },
                            })
                          }
                          style={{
                            width: 50,
                            backgroundColor: '#111',
                            color: '#fff',
                            padding: 2,
                            fontSize: 11,
                          }}
                        />
                        <span style={{ fontSize: 10, color: '#888' }}>Z:</span>
                        <input
                          type="number"
                          value={act.payload?.pos?.z ?? 0}
                          onChange={(e) =>
                            handleUpdateAction(idx, 'teleport', {
                              pos: { ...(act.payload?.pos || {}), z: Number(e.target.value) },
                            })
                          }
                          style={{
                            width: 50,
                            backgroundColor: '#111',
                            color: '#fff',
                            padding: 2,
                            fontSize: 11,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={handleAddAction}
                style={{
                  backgroundColor: '#252525',
                  border: '1px dashed #444',
                  borderRadius: 6,
                  color: '#e67e22',
                  padding: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                + Добавить действие
              </button>
            </div>
          )}
        </div>

        {/* Подвал */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#202020',
            borderTop: '1px solid #333',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(conditions, actions);
              onClose();
            }}
            style={{
              backgroundColor: '#27ae60',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
