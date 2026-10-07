export const DOMAINS = {
  // 1. Искусственный интеллект и логика поведений (BT)
  ai: ['src/ai/**/*', 'src/types.ts', 'src/utils.ts'],

  // 2. Боевая система, анатомия и статы
  combat: [
    'src/ecs/systems/AttackSystem.ts',
    'src/ecs/systems/DamageSystem.ts',
    'src/ecs/systems/AnatomySystem.ts',
    'src/ecs/services/DeathService.ts',
    'src/ecs/utils/anatomy*.ts',
    'src/ecs/utils/combat.ts',
    'src/ecs/utils/health.ts',
    'src/ecs/utils/hierarchy.ts',
    'src/ecs/components/combat.ts',
    'src/ecs/components/anatomy.ts',
    'src/ecs/components/stats.ts',
    'src/ecs/components/movement.ts',
    'src/ecs/templates/**/*',
    'src/types.ts',
    'src/utils.ts',
  ],

  // 3. Рендеринг, Three.js и окружение (Чистый графический домен)
  rendering: [
    'src/rendering/**/*',
    'src/config/graphicsConfig.ts',
    'src/config/grassConfig.ts',
    'src/config/cameraConfig.ts',
    'src/config/terrainConfig.ts',
    'src/config/visualConfig.ts',
    'src/types.ts',
    'src/utils.ts',
  ],

  // 4. Инвентарь, предметы и Drag-and-Drop
  inventory: [
    'src/ecs/components/inventory.ts',
    'src/ecs/utils/inventory.ts',
    'src/ecs/utils/itemValidation.ts',
    'src/ecs/utils/hierarchy.ts',
    'src/editor/ItemTransferService.ts',
    'src/core/contexts.ts',
    'src/history/TransactionBuilder.ts',
    'src/history/ICommand.ts',
    'src/history/commands/EntitySnapshotCommand.ts',
    'src/dnd/**/*',
    'src/types.ts',
    'src/utils.ts',
  ],

  // 5. Игровой интерфейс (Game HUD - чистый UI без ECS)
  game_hud: [
    'src/components/gameHud/**/*',
    'src/components/GameHUD.tsx',
    'src/config/hudConfig.ts',
    'src/config/gameplayConfig.ts',
    'src/config/balanceConfig.ts',
    'src/types.ts',
    'src/utils.ts',
    'src/locales/**/*',
  ],

  // 6. UI редактора и общие элементы интерфейса
  ui: [
    'src/components/Inspector.tsx',
    'src/components/inspector/**/*',
    'src/components/LeftDock/**/*',
    'src/components/PieMenu/**/*',
    'src/components/TopBar.tsx',
    'src/components/MainMenu.tsx',
    'src/components/HotkeysModal.tsx',
    'src/components/CanvasHUD.tsx',
    'src/components/MultiSelectionDrawer.tsx',
    'src/components/canvas/**/*',
    'src/components/modals/**/*',
    'src/dnd/**/*',
    'src/hooks/**/*',
    'src/editor/**/*',
    'src/core/contexts.ts',
    'src/types.ts',
    'src/utils.ts',
    'src/locales/**/*',
  ],

  // 7. Физическое ядро и адаптер ECS
  physics: [
    'src/physics/**/*',
    'src/ecs/systems/PhysicsSystem.ts',
    'src/ecs/components/physics.ts',
    'src/ecs/utils/obstacleColliders.ts',
    'src/types.ts',
    'src/utils.ts',
  ],

  // --- ПОДДОМЕНЫ (Узкие задачи) ---
  core_ecs: [
    'src/ecs/World.ts',
    'src/ecs/types.ts',
    'src/ecs/components/**/*.ts',
    'src/ecs/EntityFactory.ts',
  ],
  dialogue_system: [
    'src/ecs/systems/DialogueSystem.ts',
    'src/ecs/components/dialogue.ts',
    'src/dialogue/**/*',
    'src/components/gameHud/BlockDialogue.tsx',
  ],
  interaction: [
    'src/ecs/systems/InteractionSystem.ts',
    'src/ecs/components/interaction.ts',
    'src/ecs/utils/itemValidation.ts',
  ],

  // --- НАДДОМЕНЫ (Широкие задачи) ---
  gameplay_core: [
    // Вся бизнес-логика игрового процесса (без рендера и редактора)
    'src/ecs/World.ts',
    'src/ecs/types.ts',
    'src/ecs/components/**/*.ts',
    'src/ecs/systems/!(ThreeSyncSystem|PhysicsSystem)*.ts', // берем все системы кроме рендера и физики
    'src/ecs/utils/**/*.ts',
    'src/dialogue/**/*',
    'src/core/EventBus.ts',
  ],

  task_reading_system: [
    'src/ecs/types.ts',
    'src/ecs/components/interaction.ts', // Куда добавим новый глагол
    'src/ecs/components/readable.ts', // (Нейросеть создаст этот файл)
    'src/components/gameHud/BlockTargetPanel.tsx', // Где кнопка "Читать"
    'src/components/gameHud/BlockDialogue.tsx', // Как референс для создания окна с текстом
    'src/components/GameHUD.tsx', // Куда вмонтируем новое окно
    'src/components/gameHud/hudPorts.ts', // Порты адаптера для связи ECS и React
    'src/HudAdapter.ts', // Реализация связи
    'src/core/EventBus.ts',
  ],

  task_trigger_system: [
    'src/ecs/types.ts',
    'src/core/EventBus.ts',
    'src/ecs/systems/TriggerVolumeSystem.ts', // Источник событий зон
    'src/ecs/systems/DialogueSystem.ts', // Источник событий диалогов
    'src/dialogue/StoryFlagsManager.ts', // Хранилище флагов квестов
    'src/ecs/EntityFactory.ts', // Для экшенов спавна
    'src/editor/EditorMutationsAPI.ts', // Набор готовых методов для изменения компонентов (смена ИИ, статов и т.д.)
    'src/ecs/World.ts',
    'src/ecs/components/zone.ts',
  ],

  // Визуальный нодовый редактор диалогов (@xyflow/react)
  dialogue_editor: [
    'src/dialogue/**/*',
    'src/gameplay/**/*',
    'src/components/dialogueEditor/**/*',
    'src/components/gameplayEditor/**/*',
    'src/components/inspector/DialogueInspector.tsx',
    'src/components/gameHud/BlockDialogue.tsx',
    'src/ecs/systems/DialogueSystem.ts',
    'src/ecs/components/dialogue.ts',
    'src/ecs/components/triggerRule.ts',
    'src/ecs/WorldSerializer.ts',
  ],

  // Полная сборка (на случай глобальных задач)
  all: ['src/**/*.{ts,tsx}'],
};

export type DomainName = keyof typeof DOMAINS;
