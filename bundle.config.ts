export const DOMAINS = {
  // 1. Искусственный интеллект и логика поведений (BT)
  ai: ['src/ai/**/*'],

  // 2. Боевая система, анатомия и статы
  combat: [
    'src/ecs/systems/AttackSystem.ts',
    'src/ecs/systems/DamageSystem.ts',
    'src/ecs/systems/AnatomySystem.ts',
    'src/ecs/utils/anatomy*.ts',
    'src/ecs/utils/combat.ts',
    'src/ecs/utils/health.ts',
    'src/ecs/components/combat.ts',
    'src/ecs/components/anatomy.ts',
    'src/ecs/components/stats.ts',
  ],

  // 3. Рендеринг, Three.js и окружение
  rendering: ['src/rendering/**/*', 'src/ecs/systems/ThreeSyncSystem.ts'],

  // 4. Инвентарь, предметы и Drag-and-Drop
  inventory: [
    'src/ecs/components/inventory.ts',
    'src/ecs/utils/inventory.ts',
    'src/ecs/utils/itemValidation.ts',
    'src/editor/ItemTransferService.ts',
    'src/dnd/**/*',
  ],

  // 5. UI, HUD и Инспектор
  ui: ['src/components/**/*', 'src/hooks/**/*', 'src/editor/**/*', 'src/core/contexts.ts'],

  // Полная сборка (на случай глобальных задач)
  all: ['src/**/*.{ts,tsx}'],
};

export type DomainName = keyof typeof DOMAINS;
