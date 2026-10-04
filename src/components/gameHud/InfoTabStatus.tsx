import React, { useEffect, useState } from 'react';
import { RETRO_SUNKEN_STYLE } from './RetroStyles';
import { HUD_CONFIG } from '../../config/hudConfig';
import { t } from '../../locales';
import { GAMEPLAY_CONFIG } from '../../config/gameplayConfig';
import { StatusBars } from './StatusBars';
import { IHudDataProvider } from './hudPorts';

export interface InfoTabStatusProps {
  hudProvider: IHudDataProvider;
  targetId: string;
  isCurrentlySelected: boolean;
}

export const InfoTabStatus: React.FC<InfoTabStatusProps> = ({
  hudProvider,
  targetId,
  isCurrentlySelected,
}) => {
  const [hoveredPartKey, setHoveredPartKey] = useState<string | null>(null);

  const captureSnapshot = () => hudProvider.getInspectStatus(targetId);
  const [snapshot, setSnapshot] = useState(captureSnapshot);

  useEffect(() => {
    if (!isCurrentlySelected) return;
    setSnapshot(captureSnapshot());

    const interval = setInterval(() => {
      setSnapshot(captureSnapshot());
    }, GAMEPLAY_CONFIG.infoWindowUpdateInterval * 1000);

    return () => clearInterval(interval);
  }, [isCurrentlySelected, targetId, hudProvider]);

  const { currentHp, maxHp, isHumanoid, partColors, partFp } = snapshot;

  const bars = [
    {
      id: 'blood',
      icon: '🩸',
      title: t('interaction.bars.blood'),
      color: HUD_CONFIG.status.bars.health,
      current: currentHp,
      max: maxHp,
    },
    {
      id: 'stamina',
      icon: '💪',
      title: t('interaction.bars.stamina'),
      color: HUD_CONFIG.status.bars.stamina,
      current: 85,
      max: 100,
    },
    {
      id: 'concentration',
      icon: '👁️',
      title: t('interaction.bars.concentration'),
      color: HUD_CONFIG.status.bars.energy,
      current: 60,
      max: 100,
    },
    {
      id: 'energy',
      icon: '🔷',
      title: t('interaction.bars.energy'),
      color: HUD_CONFIG.status.bars.resilience,
      current: 70,
      max: 100,
    },
    {
      id: 'balance',
      icon: '⚖️',
      title: t('interaction.bars.balance'),
      color: HUD_CONFIG.status.bars.balance,
      current: 50,
      max: 100,
    },
  ];

  const getPartStroke = (key: string) =>
    hoveredPartKey === key
      ? HUD_CONFIG.status.paperDoll.hoverStroke
      : HUD_CONFIG.status.paperDoll.outline;

  const getPartStrokeWidth = (key: string) => (hoveredPartKey === key ? 2.5 : 1.5);

  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
      {/* 5 статусных полосок с черным контуром без фасок */}
      <div style={{ flex: 1, display: 'flex' }}>
        <StatusBars bars={bars} gap={9} />
      </div>

      {/* Кукла анатомии на круглой плашке */}
      <div
        style={{
          width: 96,
          height: 96,
          minWidth: 96,
          minHeight: 96,
          ...RETRO_SUNKEN_STYLE,
          backgroundColor: HUD_CONFIG.status.paperDoll.circleBg,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {isHumanoid ? (
          <>
            <svg width="90" height="90" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
              <circle
                cx="50"
                cy="18"
                r="9"
                fill={partColors.head}
                stroke={getPartStroke('head')}
                strokeWidth={getPartStrokeWidth('head')}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('head')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.head.name}: {partFp.head.percent}%
                </title>
              </circle>
              <rect
                x="42"
                y="30"
                width="16"
                height="27"
                rx="1.5"
                fill={partColors.torso}
                stroke={getPartStroke('torso')}
                strokeWidth={getPartStrokeWidth('torso')}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('torso')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.torso.name}: {partFp.torso.percent}%
                </title>
              </rect>
              <rect
                x="13"
                y="32"
                width="27"
                height="7"
                rx="1.5"
                fill={partColors.arm_l}
                stroke={getPartStroke('arm_l')}
                strokeWidth={getPartStrokeWidth('arm_l')}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('arm_l')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.arm_l.name}: {partFp.arm_l.percent}%
                </title>
              </rect>
              <rect
                x="60"
                y="32"
                width="27"
                height="7"
                rx="1.5"
                fill={partColors.arm_r}
                stroke={getPartStroke('arm_r')}
                strokeWidth={getPartStrokeWidth('arm_r')}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('arm_r')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.arm_r.name}: {partFp.arm_r.percent}%
                </title>
              </rect>
              <rect
                x="41"
                y="59"
                width="7"
                height="31"
                rx="1.5"
                fill={partColors.leg_l}
                stroke={getPartStroke('leg_l')}
                strokeWidth={getPartStrokeWidth('leg_l')}
                transform="rotate(15 44.5 59)"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('leg_l')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.leg_l.name}: {partFp.leg_l.percent}%
                </title>
              </rect>
              <rect
                x="52"
                y="59"
                width="7"
                height="31"
                rx="1.5"
                fill={partColors.leg_r}
                stroke={getPartStroke('leg_r')}
                strokeWidth={getPartStrokeWidth('leg_r')}
                transform="rotate(-15 55.5 59)"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPartKey('leg_r')}
                onMouseLeave={() => setHoveredPartKey(null)}
              >
                <title>
                  {partFp.leg_r.name}: {partFp.leg_r.percent}%
                </title>
              </rect>
            </svg>

            {hoveredPartKey && partFp[hoveredPartKey] && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 3,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: HUD_CONFIG.status.paperDoll.badgeBg,
                  color: HUD_CONFIG.status.paperDoll.badgeText,
                  border: `1px solid ${HUD_CONFIG.status.paperDoll.badgeBorder}`,
                  borderRadius: '3px',
                  padding: '1px 5px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              >
                {partFp[hoveredPartKey].percent}%
              </div>
            )}
          </>
        ) : (
          <span
            style={{
              fontSize: '10px',
              color: HUD_CONFIG.status.paperDoll.textEmpty,
              textAlign: 'center',
            }}
          >
            [НЕТ СХЕМЫ]
          </span>
        )}
      </div>
    </div>
  );
};
