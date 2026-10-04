import React, { useState } from 'react';
import { RETRO_PANEL_STYLE, RETRO_SUNKEN_STYLE } from './RetroStyles';
import { HUD_CONFIG } from '../../config/hudConfig';
import { StatusBars } from './StatusBars';
import { IHudDataProvider } from './hudPorts';

export interface BlockStatusProps {
  hudProvider: IHudDataProvider;
  playerId: string | null;
}

interface StatBarDef {
  id: string;
  label: string;
  color: string;
  current: number;
  max: number;
}

interface PartFpInfo {
  name: string;
  percent: number;
}

/**
 * Рассчитывает цвет части тела по ее функциональной прочности (ФП)
 */
function getFpColor(currentFp: number, maxFp: number): string {
  if (maxFp <= 0) return HUD_CONFIG.status.paperDoll.fpIntact;
  const ratio = currentFp / maxFp;

  if (ratio >= 0.5) {
    const t = Math.min(1, Math.max(0, (ratio - 0.5) / 0.5));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - t) + 230 * t);
    return `rgb(${r}, ${g}, 0)`;
  } else if (ratio >= 0) {
    const t = Math.min(1, Math.max(0, ratio / 0.5));
    const g = Math.round(255 * t);
    return `rgb(255, ${g}, 0)`;
  } else {
    const t = Math.min(1, Math.max(0, (ratio - -2.0) / 2.0));
    const r = Math.round(255 * t);
    return `rgb(${r}, 0, 0)`;
  }
}

export const BlockStatus: React.FC<BlockStatusProps> = ({ hudProvider, playerId }) => {
  const [hoveredPartKey, setHoveredPartKey] = useState<string | null>(null);

  const statusData = hudProvider.getPlayerStatus(playerId);

  const [bars, setBars] = useState(
    () =>
      statusData?.bars || [
        {
          id: 'red',
          icon: '🩸',
          title: 'Запас крови',
          label: 'Запас крови',
          color: HUD_CONFIG.status.bars.health,
          current: 75,
          max: 100,
        },
        {
          id: 'green',
          icon: '💪',
          title: 'Запас сил',
          label: 'Запас сил',
          color: HUD_CONFIG.status.bars.stamina,
          current: 90,
          max: 100,
        },
        {
          id: 'purple',
          icon: '👁️',
          title: 'Концентрация',
          label: 'Концентрация',
          color: HUD_CONFIG.status.bars.energy,
          current: 50,
          max: 100,
        },
        {
          id: 'cyan',
          icon: '🔷',
          title: 'Запас энергии',
          label: 'Запас энергии',
          color: HUD_CONFIG.status.bars.resilience,
          current: 65,
          max: 100,
        },
        {
          id: 'orange',
          icon: '⚖️',
          title: 'Баланс',
          label: 'Баланс',
          color: HUD_CONFIG.status.bars.balance,
          current: 40,
          max: 100,
        },
      ]
  );

  const playerName = statusData?.name || 'Игрок';
  const isHumanoid = statusData?.isHumanoid ?? true;
  const partColors = statusData?.partColors || {
    head: HUD_CONFIG.status.paperDoll.fpIntact,
    torso: HUD_CONFIG.status.paperDoll.fpIntact,
    arm_l: HUD_CONFIG.status.paperDoll.fpIntact,
    arm_r: HUD_CONFIG.status.paperDoll.fpIntact,
    leg_l: HUD_CONFIG.status.paperDoll.fpIntact,
    leg_r: HUD_CONFIG.status.paperDoll.fpIntact,
  };
  const partFp = statusData?.partFp || {
    head: { name: 'Голова', percent: 100 },
    torso: { name: 'Туловище', percent: 100 },
    arm_l: { name: 'Левая рука', percent: 100 },
    arm_r: { name: 'Правая рука', percent: 100 },
    leg_l: { name: 'Левая нога', percent: 100 },
    leg_r: { name: 'Правая нога', percent: 100 },
  };

  const handleSpendBar = (barId: string) => {
    setBars((prev) =>
      prev.map((b) => {
        if (b.id !== barId) return b;
        const nextVal = b.current - 15 < 0 ? b.max : b.current - 15;
        return { ...b, current: nextVal };
      })
    );
  };

  const getPartStroke = (key: string) =>
    hoveredPartKey === key
      ? HUD_CONFIG.status.paperDoll.hoverStroke
      : HUD_CONFIG.status.paperDoll.outline;

  const getPartStrokeWidth = (key: string) => (hoveredPartKey === key ? 2.5 : 1.5);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        width: 480,
        height: 196,
        ...RETRO_PANEL_STYLE,
        padding: '12px 16px',
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* Имя персонажа */}
      <div
        style={{
          fontSize: '20px',
          lineHeight: '22px',
          fontWeight: 'bold',
          color: HUD_CONFIG.status.playerNameText,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'visible',
          margin: 0,
          padding: 0,
        }}
        title={playerName}
      >
        {playerName}
      </div>

      {/* Блок полосок и куклы: отступ до имени и до низа панели строго равен 18px */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginTop: '18px' }}>
        <div style={{ flex: 1, display: 'flex' }}>
          <StatusBars bars={bars} gap={11} onBarClick={handleSpendBar} />
        </div>

        {/* Кукла анатомии: диаметр 114px строго вровень с высотой колонки полосок */}
        <div
          style={{
            width: 114,
            height: 114,
            minWidth: 114,
            minHeight: 114,
            ...RETRO_SUNKEN_STYLE,
            backgroundColor: HUD_CONFIG.status.paperDoll.circleBg,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {isHumanoid ? (
            <>
              <svg width="110" height="110" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                {/* Голова */}
                <circle
                  cx="50"
                  cy="15"
                  r="9.5"
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
                {/* Туловище */}
                <rect
                  x="41"
                  y="28"
                  width="18"
                  height="30"
                  rx="2"
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
                {/* Левая рука */}
                <rect
                  x="10"
                  y="30"
                  width="29"
                  height="8"
                  rx="2"
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
                {/* Правая рука */}
                <rect
                  x="61"
                  y="30"
                  width="29"
                  height="8"
                  rx="2"
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
                {/* Левая нога */}
                <rect
                  x="40"
                  y="60"
                  width="8"
                  height="33"
                  rx="2"
                  fill={partColors.leg_l}
                  stroke={getPartStroke('leg_l')}
                  strokeWidth={getPartStrokeWidth('leg_l')}
                  transform="rotate(15 44 60)"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPartKey('leg_l')}
                  onMouseLeave={() => setHoveredPartKey(null)}
                >
                  <title>
                    {partFp.leg_l.name}: {partFp.leg_l.percent}%
                  </title>
                </rect>
                {/* Правая нога */}
                <rect
                  x="52"
                  y="60"
                  width="8"
                  height="33"
                  rx="2"
                  fill={partColors.leg_r}
                  stroke={getPartStroke('leg_r')}
                  strokeWidth={getPartStrokeWidth('leg_r')}
                  transform="rotate(-15 56 60)"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPartKey('leg_r')}
                  onMouseLeave={() => setHoveredPartKey(null)}
                >
                  <title>
                    {partFp.leg_r.name}: {partFp.leg_r.percent}%
                  </title>
                </rect>
              </svg>

              {/* Всплывающий процент ФП прямо на кукле при наведении на часть тела */}
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
                    fontFamily: 'inherit',
                  }}
                >
                  {partFp[hoveredPartKey].percent}%
                </div>
              )}
            </>
          ) : (
            <span
              style={{
                fontSize: '11px',
                color: HUD_CONFIG.status.paperDoll.textEmpty,
                textAlign: 'center',
              }}
            >
              [НЕТ СХЕМЫ]
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
