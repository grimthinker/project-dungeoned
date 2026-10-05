export const DIALOGUE_CONFIG = {
  /** Максимальная дистанция между игроком и NPC в реальном времени (в метрах) */
  maxInteractionDistance: 8.0,

  /** Скорость печати текста эффекта печатной машинки (мс на символ) */
  typewriterSpeedMs: 25,

  /** Разрешен ли эффект печатной машинки по умолчанию */
  typewriterEnabled: true,

  /** Фиксированные габариты окна диалога */
  windowSize: {
    width: 480,
    height: 330,
  },
} as const;
