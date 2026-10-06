import { GameSimulation } from '../../core/GameSimulation';
import { Vec3, Radians } from '../../types';
import { EntityConfig } from '../types';
import { CREATURE_BLUEPRINTS } from '../templates';
import { getTerrainHeightAt, TerrainComponent } from '../components/terrain';
import { getAnatomyParts } from '../utils/hierarchy';
import { t } from '../../locales';

export interface SpawnFetchGroupResult {
  masterId: string;
  dogIds: string[];
  ballIds: string[];
  allEntityIds: string[];
}

export function spawnFetchGroup(simulation: GameSimulation, origin: Vec3): SpawnFetchGroupResult {
  const world = simulation.world;
  const physics = simulation.physics;
  const aiSystem = simulation.aiSystem;
  const entityFactory = simulation.entityFactory;

  const terrainComp = world.getComponent('terrain', 'terrain') as TerrainComponent | undefined;
  const getHeight = (x: number, z: number, fallbackY: number): number => {
    if (!terrainComp) return fallbackY;
    const h = getTerrainHeightAt(terrainComp, x, z);
    return h !== null ? h : fallbackY;
  };

  // 1. Спавн Хозяина в точке origin (позиция на полу с учетом террейна)
  const masterY = getHeight(origin.x, origin.z, origin.y);
  const masterPos: Vec3 = { x: origin.x, y: masterY, z: origin.z };

  const masterName = t('palette.master') !== 'palette.master' ? t('palette.master') : 'Хозяин';

  const masterId = entityFactory.spawnModularHumanoid(
    world,
    physics,
    aiSystem,
    masterPos,
    'MasterFetchTree',
    masterName
  );

  // Поворот Хозяина на запад (PI радиан)
  const masterTrans = world.getComponent(masterId, 'transform');
  if (masterTrans) {
    masterTrans.angle = Math.PI as Radians;
    masterTrans.rotation = { x: 0, y: 1, z: 0, w: 0 };
  }

  // Привязка базового диалога к Хозяину
  world.addComponent(masterId, 'dialogueTarget', { dialogueId: 'default_npc_dialogue' });

  // 2. Спавн двух мячей в руки Хозяина
  const ballIds: string[] = [];
  const masterParts = getAnatomyParts(world, masterId);

  const leftHandPartId = masterParts.find((pId) => {
    const slot = world.getComponent(pId, 'interactionSlots');
    return slot && slot.slotKind === 'left_hand';
  });

  const rightHandPartId = masterParts.find((pId) => {
    const slot = world.getComponent(pId, 'interactionSlots');
    return slot && slot.slotKind === 'right_hand';
  });

  const ballName =
    t('palette.fetchBall') !== 'palette.fetchBall' ? t('palette.fetchBall') : 'Мячик для апорта';

  const createBallConfig = (ownerPartId: string, name: string): EntityConfig => ({
    tag: { archetype: 'item', subType: 'weapon' },
    meta: { name, entityType: 'item' },
    visualModel: { modelId: 'proc://prop/ball' },
    item: {
      name,
      type: 'weapon',
      icon: '🎾',
      maxStack: 1,
      count: 1,
      size: 4,
      equipTypes: [],
      equippable: false,
      equipTimeMultiplier: 1.0,
    },
    physics: {
      radius: 0.15,
      weight: 0.5,
      isSolid: true,
      shape: 'ball',
      restitution: 0.88,
      friction: 0.85,
      linearDamping: 0.25,
      angularDamping: 2.0,
    },
    weaponStats: { baseDamage: 5, prepTime: 0.2, recoveryTime: 0.3 },
    weaponZone: { hitZoneType: 'forward_line', length: 1.5 },
    ownership: { ownerId: ownerPartId, status: 'equipped' },
    fetchStick: {
      state: 'held_by_master',
      ownerMasterId: masterId,
      lastCarrierDogId: null,
    },
  });

  if (leftHandPartId) {
    const ball1Id = simulation.spawnEntity(
      createBallConfig(leftHandPartId, `${ballName} 1`),
      masterPos
    );
    const slot = world.getComponent(leftHandPartId, 'interactionSlots');
    if (slot) slot.itemId = ball1Id;
    ballIds.push(ball1Id);
  }

  if (rightHandPartId) {
    const ball2Id = simulation.spawnEntity(
      createBallConfig(rightHandPartId, `${ballName} 2`),
      masterPos
    );
    const slot = world.getComponent(rightHandPartId, 'interactionSlots');
    if (slot) slot.itemId = ball2Id;
    ballIds.push(ball2Id);
  }

  // 3. Спавн 3 собак равномерно по кругу радиусом 4 метра вокруг Хозяина
  const dogRadius = 4.0;
  const dogCount = 3;
  const dogIds: string[] = [];
  const baseDogName =
    t('palette.quadrupedBot') !== 'palette.quadrupedBot' ? t('palette.quadrupedBot') : 'Собака';

  for (let i = 0; i < dogCount; i++) {
    const angle = (i * 2 * Math.PI) / dogCount;
    const dx = Math.cos(angle) * dogRadius;
    const dz = Math.sin(angle) * dogRadius;
    const dogX = origin.x + dx;
    const dogZ = origin.z + dz;
    const dogY = getHeight(dogX, dogZ, origin.y);

    const dogPos: Vec3 = { x: dogX, y: dogY, z: dogZ };
    const dogName = `${baseDogName} ${i + 1}`;

    const dogId = entityFactory.spawnModularCreature(
      world,
      physics,
      aiSystem,
      dogPos,
      CREATURE_BLUEPRINTS.quadruped,
      'DogFetchTree',
      dogName
    );

    // Привязка диалога лая к собаке
    world.addComponent(dogId, 'dialogueTarget', { dialogueId: 'dog_bark_dialogue' });

    // Поворачиваем собаку мордой к Хозяину
    const dogTrans = world.getComponent(dogId, 'transform');
    if (dogTrans) {
      const faceAngle = Math.atan2(-dz, -dx) as Radians;
      dogTrans.angle = faceAngle;
      const half = -faceAngle * 0.5;
      dogTrans.rotation = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
    }

    dogIds.push(dogId);
  }

  // 4. Настройка Blackboard для Хозяина и Собак: точка origin становится центром игровой зоны
  const playZoneRadius = 35.0;

  const masterBrain = world.getComponent(masterId, 'brain');
  if (masterBrain) {
    masterBrain.blackboard.set('dogIds', dogIds);
    masterBrain.blackboard.set('playZoneCenter', masterPos);
    masterBrain.blackboard.set('playZoneRadius', playZoneRadius);
  }

  for (const dId of dogIds) {
    const dogBrain = world.getComponent(dId, 'brain');
    if (dogBrain) {
      dogBrain.blackboard.set('masterEntityId', masterId);
      dogBrain.blackboard.set('playZoneCenter', masterPos);
      dogBrain.blackboard.set('playZoneRadius', playZoneRadius);
    }
  }

  simulation.syncPhysicsStructures();

  return {
    masterId,
    dogIds,
    ballIds,
    allEntityIds: [masterId, ...dogIds, ...ballIds],
  };
}
