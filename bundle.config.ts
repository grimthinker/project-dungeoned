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
  gameHud: [
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

  // Полная сборка (на случай глобальных задач)
  all: ['src/**/*.{ts,tsx}'],
};

export type DomainName = keyof typeof DOMAINS;
