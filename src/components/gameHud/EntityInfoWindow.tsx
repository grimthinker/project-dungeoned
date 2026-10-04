import React from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE, RETRO_BUTTON_STYLE, RETRO_BUTTON_PRESSED_STYLE } from './RetroStyles';
import { InfoTabStatus } from './InfoTabStatus';
import { InfoTabEquipment } from './InfoTabEquipment';
import { InfoTabParameters } from './InfoTabParameters';
import { t } from '../../locales';
import { IHudDataProvider } from './hudPorts';

export interface EntityInfoWindowProps {
  hudProvider: IHudDataProvider;
  targetId: string;
  isCurrentlySelected: boolean;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  onClose: () => void;
  onFocus: () => void;
  initialX: number;
  initialY: number;
  zIndex: number;
}

export const EntityInfoWindow: React.FC<EntityInfoWindowProps> = ({
  hudProvider,
  targetId,
  isCurrentlySelected,
  activeTab,
  onChangeTab,
  onClose,
  onFocus,
  initialX,
  initialY,
  zIndex,
}) => {
  const targetInfo = hudProvider.getTargetPanelInfo(targetId);
  const isCreature = targetInfo?.isCreature ?? false;
  const rawName = targetInfo?.name ?? targetId;
  const title = `ИНФО: ${rawName}`;

  // Доступные вкладки в зависимости от типа
  const availableTabs = isCreature
    ? [
        { id: 'status', label: t('interaction.tabStatus') },
        { id: 'equipment', label: t('interaction.tabEquipment') },
        { id: 'parameters', label: t('interaction.tabParameters') },
      ]
    : [{ id: 'parameters', label: t('interaction.tabParameters') }];

  const currentTab = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : availableTabs[0].id;

  return (
    <div onMouseDown={onFocus} style={{ position: 'relative' }}>
      <RetroWindow
        title={title}
        isOpen={true}
        onClose={onClose}
        initialX={initialX}
        initialY={initialY}
        initialWidth={432}
        initialHeight={312}
        minWidth={432}
        minHeight={312}
        zIndex={zIndex}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: '8px',
          }}
        >
          {/* Панель вкладок + индикатор актуальности справа */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  style={{
                    ...(currentTab === tab.id ? RETRO_BUTTON_PRESSED_STYLE : RETRO_BUTTON_STYLE),
                    padding: '6px 12px',
                    fontSize: '14px',
                  }}
                  onClick={() => onChangeTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Индикатор актуальности: Зеленая галочка / Красный крестик */}
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'help',
                padding: '0 6px',
                flexShrink: 0,
                color: isCurrentlySelected ? '#2ecc71' : '#e74c3c',
              }}
              title={isCurrentlySelected ? t('interaction.dataFresh') : t('interaction.dataStale')}
            >
              {isCurrentlySelected ? '✔' : '✖'}
            </div>
          </div>

          {/* Содержимое активной вкладки с заморозкой данных при потере фокуса */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              ...RETRO_SUNKEN_STYLE,
              padding: currentTab === 'parameters' ? '6px' : '10px',
              overflow: currentTab === 'parameters' ? 'hidden' : 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {currentTab === 'status' && (
              <InfoTabStatus
                hudProvider={hudProvider}
                targetId={targetId}
                isCurrentlySelected={isCurrentlySelected}
              />
            )}
            {currentTab === 'equipment' && (
              <InfoTabEquipment
                hudProvider={hudProvider}
                targetId={targetId}
                isCurrentlySelected={isCurrentlySelected}
              />
            )}
            {currentTab === 'parameters' && (
              <InfoTabParameters
                hudProvider={hudProvider}
                targetId={targetId}
                isCurrentlySelected={isCurrentlySelected}
              />
            )}
          </div>
        </div>
      </RetroWindow>
    </div>
  );
};
