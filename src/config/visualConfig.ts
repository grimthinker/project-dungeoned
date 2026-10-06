export const VISUAL_CONFIG = {
  creatureHoverScreenRatio: 0.01,
  // Параметры фоновой сетки
  grid: {
    size: 64,
    color: '#222',
    lineWidth: 1,
  },

  // Обводка при выделении и наведении курсора
  selection: {
    selectedColor: '#f1c40f',
    gameSelectedColor: 0x38bdf8, // Светло-голубой для режима игры
    editorSelectedColor: 0x2ecc71, // Зеленый для режима редактора/симуляции
    hoverColor: 'rgba(241, 196, 15, 0.4)',
    lineWidth: 3,
  },

  // Вспышки урона и исцеления
  flashes: {
    duration: 0.2,
    maxOffset: 6,
    baseWidth: 2.5,
    hitRgb: '231, 76, 60',
    healRgb: '46, 204, 113',
  },

  // Полоски здоровья (HP-бары)
  healthbar: {
    bgColor: '#c0392b',
    fillColor: '#2ecc71',
    height: 4,
    minWidth: 24,
    radiusMultiplier: 1.5,
    offsetY: 16,
  },

  // Отображение имени / ID сущности над телом
  nameOverlay: {
    color: '#ffffff',
    font: 'sans-serif',
    fontSize: 11,
    offsetY: 20,
  },

  // Тултип с названием предмета при наведении
  itemTooltip: {
    color: '#ffffff',
    font: 'sans-serif',
    fontSize: 12,
    offsetY: 15,
    shadowColor: 'black',
    shadowBlur: 4,
  },

  // Визуализация зон атаки оружия
  weaponAttacks: {
    defaultColor: '#f1c40f',
    defaultAlpha: 0.15,
    hitColor: '#e74c3c',
    hitAlpha: 0.9,
    prepColor: '#f39c12',
    prepAlpha: 0.5,
    lineWidth: 2,
  },

  // Эффект поднятия предметов и дальность ячеек
  pickupInteraction: {
    reachColor: '#3498db', // Фаза 1: тянется к предмету
    liftColor: '#2ecc71', // Фаза 2: подъем
    abortColor: '#e74c3c', // Отмена
    lineWidth: 2, // Толщина соединительной линии
    dotRadius: 5, // Радиус точки (диаметр 5px)
    rangeCircle: {
      color: '#f1c40f', // Желтый пунктир
      lineWidth: 1, // Толщина пунктира
      dash: [6, 4], // Шаг пунктирной линии
    },
  },
};
