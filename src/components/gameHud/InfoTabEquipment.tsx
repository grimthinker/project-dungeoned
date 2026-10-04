import React, { useEffect, useState } from 'react';
import { RETRO_SUNKEN_STYLE } from './RetroStyles';
import { HUD_CONFIG } from '../../config/hudConfig';
import { GAMEPLAY_CONFIG } from '../../config/gameplayConfig';
import { IHudDataProvider } from './hudPorts';

export interface InfoTabEquipmentProps {
  hudProvider: IHudDataProvider;
  targetId: string;
  isCurrentlySelected: boolean;
}

export const InfoTabEquipment: React.FC<InfoTabEquipmentProps> = ({
  hudProvider,
  targetId,
  isCurrentlySelected,
}) => {
  const captureSnapshot = () => hudProvider.getInspectEquipment(targetId);
  const [snapshot, setSnapshot] = useState(captureSnapshot);

  useEffect(() => {
    if (!isCurrentlySelected) return;
    setSnapshot(captureSnapshot());

    const interval = setInterval(() => {
      setSnapshot(captureSnapshot());
    }, GAMEPLAY_CONFIG.infoWindowUpdateInterval * 1000);

    return () => clearInterval(interval);
  }, [isCurrentlySelected, targetId, hudProvider]);

  const { slotsData, areasData } = snapshot;

  const CELL_SIZE = 48;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Ряд 1: Слоты взаимодействия */}
      <div>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {slotsData.length > 0 ? (
            slotsData.map((slotInfo, idx) => {
              const item = slotInfo.item;
              return (
                <div
                  key={`info_slot_${idx}`}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    ...RETRO_SUNKEN_STYLE,
                    backgroundColor: slotInfo.isBroken
                      ? HUD_CONFIG.equipment.slotBroken
                      : item
                        ? HUD_CONFIG.equipment.slotFilled
                        : HUD_CONFIG.equipment.slotEmpty,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title={`${slotInfo.name || 'Слот'}: ${item ? item.name : 'Пусто'}`}
                >
                  {item ? (
                    <span style={{ fontSize: '20px' }}>
                      {item.icon ||
                        (item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '📦')}
                    </span>
                  ) : (
                    <span style={{ fontSize: '16px', opacity: 0.4 }}>✋</span>
                  )}
                </div>
              );
            })
          ) : (
            <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
              Слоты взаимодействия отсутствуют
            </span>
          )}
        </div>
      </div>

      {/* Ряд 2: Области экипировки */}
      <div>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {areasData.length > 0 ? (
            areasData.map((area, idx) => (
              <div
                key={`info_area_${area.containerId}_${area.areaId}_${idx}`}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  ...RETRO_SUNKEN_STYLE,
                  backgroundColor: area.item
                    ? HUD_CONFIG.equipment.slotFilled
                    : HUD_CONFIG.equipment.slotEmpty,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  flexShrink: 0,
                }}
                title={`${area.name}: ${area.item ? area.item.name : 'Пусто'} (${area.itemIdsCount} предм.)`}
              >
                {area.item ? (
                  <span style={{ fontSize: '18px' }}>
                    {area.item.icon ||
                      (area.item.type === 'armor'
                        ? '🦺'
                        : area.item.type === 'weapon'
                          ? '🗡️'
                          : '📦')}
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', color: '#777', fontWeight: 'bold' }}>
                    {area.name.substring(0, 3)}
                  </span>
                )}
                {area.itemIdsCount > 1 && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 1,
                      right: 3,
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: HUD_CONFIG.equipment.counterText,
                    }}
                  >
                    {area.itemIdsCount}
                  </span>
                )}
              </div>
            ))
          ) : (
            <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
              Области экипировки отсутствуют
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
