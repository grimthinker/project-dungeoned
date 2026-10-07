import React, { useState, useEffect } from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE, RETRO_BUTTON_STYLE, RETRO_BUTTON_PRESSED_STYLE } from './RetroStyles';
import { IHudDataProvider, QuestItemDTO } from './hudPorts';
import { EventBus } from '../../core/EventBus';

export interface BlockQuestsProps {
  isOpen: boolean;
  onClose: () => void;
  hudProvider?: IHudDataProvider | null;
}

export const BlockQuests: React.FC<BlockQuestsProps> = ({ isOpen, onClose, hudProvider }) => {
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [quests, setQuests] = useState<QuestItemDTO[]>(() =>
    hudProvider ? hudProvider.getQuests() : []
  );
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  const refresh = () => {
    if (hudProvider) {
      setQuests(hudProvider.getQuests());
    }
  };

  useEffect(() => {
    refresh();
    const u1 = EventBus.on('quest:started', refresh);
    const u2 = EventBus.on('quest:stage-changed', refresh);
    const u3 = EventBus.on('quest:objective-updated', refresh);
    const u4 = EventBus.on('quest:completed', refresh);
    const u5 = EventBus.on('quest:failed', refresh);
    const u6 = EventBus.on('quest:tracking-changed', refresh);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, [hudProvider]);

  const displayedQuests = quests.filter((q) =>
    activeTab === 'active'
      ? q.status === 'active'
      : q.status === 'completed' || q.status === 'failed'
  );

  const currentQuest =
    displayedQuests.find((q) => q.id === selectedQuestId) || displayedQuests[0] || null;

  return (
    <RetroWindow
      title="КВЕСТЫ [H]"
      isOpen={isOpen}
      onClose={onClose}
      initialX={16}
      initialY={232}
      initialWidth={360}
      initialHeight={290}
      minWidth={280}
      minHeight={180}
      storageKey="hud_window_quests"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '6px' }}>
        {/* Переключатель вкладок: Активные / Архив */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            style={activeTab === 'active' ? RETRO_BUTTON_PRESSED_STYLE : RETRO_BUTTON_STYLE}
            onClick={() => setActiveTab('active')}
          >
            АКТИВНЫЕ ({quests.filter((q) => q.status === 'active').length})
          </button>
          <button
            type="button"
            style={activeTab === 'archive' ? RETRO_BUTTON_PRESSED_STYLE : RETRO_BUTTON_STYLE}
            onClick={() => setActiveTab('archive')}
          >
            АРХИВ ({quests.filter((q) => q.status !== 'active').length})
          </button>
        </div>

        {displayedQuests.length === 0 ? (
          <div
            style={{
              flex: 1,
              ...RETRO_SUNKEN_STYLE,
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: '#444',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            {activeTab === 'active' ? 'НЕТ АКТИВНЫХ ЗАДАНИЙ' : 'АРХИВ ЗАДАНИЙ ПУСТ'}
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: '6px' }}>
            {/* Список заданий слева */}
            <div
              style={{
                width: '120px',
                ...RETRO_SUNKEN_STYLE,
                padding: '4px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              {displayedQuests.map((q) => {
                const isSelected = currentQuest?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestId(q.id)}
                    style={{
                      padding: '4px 6px',
                      backgroundColor: isSelected ? '#1b4332' : 'transparent',
                      color: isSelected ? '#2ecc71' : '#222',
                      cursor: 'pointer',
                      borderRadius: '2px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={q.title}
                  >
                    {q.isTracking && (
                      <span style={{ color: '#f39c12', marginRight: '3px' }}>⦿</span>
                    )}
                    {q.title}
                  </div>
                );
              })}
            </div>

            {/* Подробности выбранного задания справа */}
            {currentQuest && (
              <div
                style={{
                  flex: 1,
                  ...RETRO_SUNKEN_STYLE,
                  padding: '8px 10px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  color: '#111',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#111' }}>
                    {currentQuest.title}
                  </div>
                  {currentQuest.status === 'active' && (
                    <button
                      type="button"
                      style={{
                        ...RETRO_BUTTON_STYLE,
                        padding: '2px 6px',
                        fontSize: '10px',
                        backgroundColor: currentQuest.isTracking ? '#2ecc71' : '#8c8c8c',
                        color: currentQuest.isTracking ? '#000' : '#111',
                      }}
                      onClick={() =>
                        hudProvider?.trackQuest(currentQuest.id, !currentQuest.isTracking)
                      }
                    >
                      {currentQuest.isTracking ? '✓ В фокусе' : 'Отслеживать'}
                    </button>
                  )}
                </div>

                <div style={{ fontSize: '10px', color: '#444' }}>
                  {currentQuest.currentStageTitle}
                </div>

                {currentQuest.currentStageDescription && (
                  <div style={{ fontSize: '10px', color: '#333', fontStyle: 'italic' }}>
                    {currentQuest.currentStageDescription}
                  </div>
                )}

                {/* Список целей */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}
                >
                  {currentQuest.objectives
                    .filter((obj) => !obj.isHidden || obj.isCompleted || obj.current > 0)
                    .map((obj) => (
                      <div
                        key={obj.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          color: obj.isCompleted ? '#27ae60' : '#111',
                          textDecoration: obj.isCompleted ? 'line-through' : 'none',
                        }}
                      >
                        <span>{obj.isCompleted ? '☑' : '☐'}</span>
                        <span style={{ flex: 1 }}>{obj.title}</span>
                        {obj.required > 1 && (
                          <span style={{ fontWeight: 'bold' }}>
                            ({obj.current}/{obj.required})
                          </span>
                        )}
                        {obj.isOptional && (
                          <span style={{ fontSize: '9px', color: '#7f8c8d' }}>[Опц.]</span>
                        )}
                        {obj.isHidden && (
                          <span style={{ fontSize: '9px', color: '#8e44ad' }}>[Секрет]</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </RetroWindow>
  );
};
