import React, { useState, useEffect } from 'react';
import { GAMEPLAY_CONFIG } from '../../config/gameplayConfig';
import { IHudDataProvider } from './hudPorts';

export interface InfoTabParametersProps {
  hudProvider: IHudDataProvider;
  targetId: string;
  isCurrentlySelected: boolean;
}

export const InfoTabParameters: React.FC<InfoTabParametersProps> = ({
  hudProvider,
  targetId,
  isCurrentlySelected,
}) => {
  const captureSnapshot = () => hudProvider.getInspectParameters(targetId);
  const [rows, setRows] = useState(captureSnapshot);

  useEffect(() => {
    if (!isCurrentlySelected) return;
    setRows(captureSnapshot());

    const interval = setInterval(() => {
      setRows(captureSnapshot());
    }, GAMEPLAY_CONFIG.infoWindowUpdateInterval * 1000);

    return () => clearInterval(interval);
  }, [isCurrentlySelected, targetId, hudProvider]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        paddingRight: '6px',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: '#383838 #757575',
      }}
    >
      {rows.map((row, idx) => (
        <div
          key={`param_${idx}`}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            backgroundColor: idx % 2 === 0 ? '#b8b8b8' : 'transparent',
            borderRadius: '2px',
            fontSize: '12px',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ color: '#222', fontWeight: 'bold' }}>{row.label}:</span>
          <span style={{ color: '#111', fontFamily: 'monospace' }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
};
