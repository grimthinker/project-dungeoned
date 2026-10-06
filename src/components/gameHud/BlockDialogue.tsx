import React, { useState, useEffect, useRef } from 'react';
import { RetroWindow } from './RetroWindow';
import { RETRO_SUNKEN_STYLE, RETRO_BUTTON_STYLE } from './RetroStyles';
import { ActiveDialogueDTO, IHudDataProvider } from './hudPorts';
import { DIALOGUE_CONFIG } from '../../config/dialogueConfig';

export interface BlockDialogueProps {
  hudProvider: IHudDataProvider;
  activeDialogue: ActiveDialogueDTO;
  onClose: () => void;
}

export const BlockDialogue: React.FC<BlockDialogueProps> = ({
  hudProvider,
  activeDialogue,
  onClose,
}) => {
  const { width, height } = DIALOGUE_CONFIG.windowSize;

  const defaultX =
    typeof window !== 'undefined' ? Math.max(10, (window.innerWidth - width) / 2) : 200;
  const defaultY =
    typeof window !== 'undefined' ? Math.max(10, (window.innerHeight - height) / 2) : 120;

  // Typewriter effect state
  const [displayedLength, setDisplayedLength] = useState<number>(0);
  const fullText = activeDialogue.currentText || '';

  const isTyping = displayedLength < fullText.length;

  useEffect(() => {
    if (!DIALOGUE_CONFIG.typewriterEnabled) {
      setDisplayedLength(fullText.length);
      return;
    }

    setDisplayedLength(0);
    const interval = setInterval(() => {
      setDisplayedLength((prev) => {
        if (prev >= fullText.length) {
          clearInterval(interval);
          return fullText.length;
        }
        return prev + 1;
      });
    }, DIALOGUE_CONFIG.typewriterSpeedMs);

    return () => clearInterval(interval);
  }, [activeDialogue.currentNodeId, fullText]);

  const handleSkipTyping = () => {
    if (isTyping) {
      setDisplayedLength(fullText.length);
    }
  };

  // Автопрокрутка истории вниз при появлении новых реплик
  const historyBottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    historyBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeDialogue.history.length, displayedLength]);

  // Прошлые реплики без последней активной
  const pastHistory = activeDialogue.history.slice(0, -1);

  return (
    <RetroWindow
      title={`ДИАЛОГ: ${activeDialogue.npcName.toUpperCase()}`}
      isOpen={true}
      onClose={onClose}
      initialX={defaultX}
      initialY={defaultY}
      initialWidth={width}
      initialHeight={height}
      minWidth={width}
      minHeight={340}
      resizable={false}
      resizableBottom={true}
      storageKey="hud_window_dialogue"
      zIndex={120}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: '8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Верхняя область: История диалога + текущая реплика */}
        <div
          onClick={handleSkipTyping}
          style={{
            flex: 1,
            minHeight: 0,
            ...RETRO_SUNKEN_STYLE,
            padding: '8px 10px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            cursor: isTyping ? 'pointer' : 'default',
          }}
          title={isTyping ? 'Кликните, чтобы показать реплику полностью' : undefined}
        >
          {/* Прошлые фразы диалога */}
          {pastHistory.map((entry, idx) => (
            <div
              key={`history_${idx}`}
              style={{
                fontSize: '13px',
                lineHeight: '1.35',
                color: entry.isPlayer ? '#a5d6a7' : '#ecf0f1',
              }}
            >
              <span
                style={{
                  fontWeight: 'bold',
                  color: entry.isPlayer ? '#2ecc71' : '#f39c12',
                  marginRight: '6px',
                }}
              >
                {entry.speaker}:
              </span>
              <span>{entry.text}</span>
            </div>
          ))}

          {/* Текущая активная фраза с Typewriter-эффектом */}
          <div
            style={{
              fontSize: '14px',
              lineHeight: '1.4',
              color: '#ffffff',
              fontWeight: 'bold',
              borderTop: pastHistory.length > 0 ? '1px dashed #444' : 'none',
              paddingTop: pastHistory.length > 0 ? '6px' : '0',
            }}
          >
            <span style={{ color: '#f39c12', marginRight: '6px' }}>
              {activeDialogue.currentSpeaker}:
            </span>
            <span>{fullText.slice(0, displayedLength)}</span>
            {isTyping && (
              <span
                style={{
                  color: '#f39c12',
                  display: 'inline-block',
                  marginLeft: '2px',
                  animation: 'blink 0.6s infinite',
                }}
              >
                ▌
              </span>
            )}
          </div>

          <div ref={historyBottomRef} />
        </div>

        {/* Нижняя область: Список вариантов ответов сохраняет фиксированный размер (до 4 кнопок) */}
        <div
          style={{
            flexShrink: 0,
            maxHeight: '190px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            paddingRight: '2px',
          }}
        >
          {activeDialogue.availableChoices.length > 0 ? (
            activeDialogue.availableChoices.map((choice, idx) => {
              const isExit = choice.targetNodeId === null;
              return (
                <button
                  key={choice.id}
                  type="button"
                  style={{
                    ...RETRO_BUTTON_STYLE,
                    width: '100%',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    padding: '10px 14px',
                    fontSize: '15px',
                    whiteSpace: 'normal',
                    height: 'auto',
                    color: isExit ? '#8b0000' : '#080808',
                  }}
                  onClick={() => {
                    handleSkipTyping();
                    hudProvider.chooseDialogueOption(choice.id);
                  }}
                >
                  <span style={{ color: isExit ? '#8b0000' : '#2980b9', marginRight: '8px' }}>
                    {idx + 1}.
                  </span>
                  <span>{choice.text}</span>
                </button>
              );
            })
          ) : (
            <button
              type="button"
              style={{
                ...RETRO_BUTTON_STYLE,
                width: '100%',
                justifyContent: 'center',
                color: '#8b0000',
                padding: '10px 14px',
                fontSize: '15px',
              }}
              onClick={() => hudProvider.closeDialogue()}
            >
              [Завершить диалог]
            </button>
          )}
        </div>
      </div>
    </RetroWindow>
  );
};
