import { BodyStructureType, CreatureBodyBlueprint } from './types';
import { BALANCE_CONFIG } from '../../config/balanceConfig';
import { deg2Rad } from '../../utils';
export const HUMANOID_BLUEPRINT: CreatureBodyBlueprint = {
  id: 'humanoid',
  name: 'Гуманоид',
  baseHeight: 1.8,
  baseRadius: 0.4,
  rigAsset: 'proc://rig/humanoid',
  headLimits: {
    minYaw: deg2Rad(-50),
    maxYaw: deg2Rad(50),
    minPitch: deg2Rad(-30),
    maxPitch: deg2Rad(40),
  },
  parts: [
    {
      key: 'torso',
      meshAsset: 'proc://mesh/humanoid/torso',
      rigNodeName: 'Torso',
      config: {
        tag: { archetype: 'bodyPart', subType: 'torso' },
        meta: { name: 'Туловище' },
        physics: { radius: 0.3, weight: 15, size: 20 },
        heart: { requiresBrain: true },
        socketDef: {
          sockets: {
            neck: { type: 'neck', size: 10, strength: 50 },
            l_shoulder: { type: 'shoulder', size: 10, strength: 40 },
            r_shoulder: { type: 'shoulder', size: 10, strength: 40 },
            l_hip: { type: 'hip', size: 12, strength: 50 },
            r_hip: { type: 'hip', size: 12, strength: 50 },
          },
        },
        equip: {
          equipmentAreas: [
            { id: 'torso', name: 'Туловище', type: 'torso', space: 20, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'head',
      meshAsset: 'proc://mesh/humanoid/head',
      rigNodeName: 'HeadPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'head' },
        meta: { name: 'Голова' },
        physics: { radius: 0.2, weight: 5, size: 10 },
        vision: {
          fovAngle: BALANCE_CONFIG.senses.defaultFovAngle,
          clarity: BALANCE_CONFIG.senses.defaultVisionClarity,
          maxDistance: BALANCE_CONFIG.senses.defaultVisionMaxDistance,
        },
        hearing: {
          sensitivity: BALANCE_CONFIG.senses.defaultHearingSensitivity,
          maxDistance: BALANCE_CONFIG.senses.defaultHearingMaxDistance,
        },
        socketDef: {
          sockets: {
            base: { type: 'neck', size: 10, strength: 50 },
          },
        },
        bodyBrain: { power: 100, isActive: true },
        equip: {
          equipmentAreas: [{ id: 'head', name: 'Голова', type: 'head', space: 10, itemIds: [] }],
        },
      },
    },
    {
      key: 'arm_l',
      meshAsset: 'proc://mesh/humanoid/arm_l',
      rigNodeName: 'LeftArmPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'arm' },
        meta: { name: 'Левая рука' },
        physics: { radius: 0.15, weight: 4, size: 10 },
        socketDef: {
          sockets: {
            base: { type: 'shoulder', size: 10, strength: 40 },
          },
        },
        interactionSlots: {
          id: 'hand_left',
          name: 'Левая рука',
          interactDist: 0.6,
          strength: 15,
          itemId: null,
          rigSocketName: 'LeftHandSocket',
          slotKind: 'left_hand',
        },
        equip: {
          equipmentAreas: [
            { id: 'hands_l', name: 'Левая рука', type: 'hands', space: 10, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'arm_r',
      meshAsset: 'proc://mesh/humanoid/arm_r',
      rigNodeName: 'RightArmPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'arm' },
        meta: { name: 'Правая рука' },
        physics: { radius: 0.15, weight: 4, size: 10 },
        socketDef: {
          sockets: {
            base: { type: 'shoulder', size: 10, strength: 40 },
          },
        },
        interactionSlots: {
          id: 'hand_right',
          name: 'Правая рука',
          interactDist: 0.6,
          strength: 15,
          itemId: null,
          rigSocketName: 'RightHandSocket',
          slotKind: 'right_hand',
        },
        equip: {
          equipmentAreas: [
            { id: 'hands_r', name: 'Правая рука', type: 'hands', space: 10, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'leg_l',
      meshAsset: 'proc://mesh/humanoid/leg_l',
      rigNodeName: 'LeftLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Левая нога' },
        physics: { radius: 0.2, weight: 6, size: 12 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'hip', size: 12, strength: 50 },
          },
        },
        equip: {
          equipmentAreas: [
            { id: 'legs_l', name: 'Левая нога', type: 'legs', space: 12, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'leg_r',
      meshAsset: 'proc://mesh/humanoid/leg_r',
      rigNodeName: 'RightLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Правая нога' },
        physics: { radius: 0.2, weight: 6, size: 12 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'hip', size: 12, strength: 50 },
          },
        },
        equip: {
          equipmentAreas: [
            { id: 'legs_r', name: 'Правая нога', type: 'legs', space: 12, itemIds: [] },
          ],
        },
      },
    },
  ],
  connections: [
    { fromPartKey: 'torso', fromSocket: 'neck', toPartKey: 'head', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'l_shoulder', toPartKey: 'arm_l', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'r_shoulder', toPartKey: 'arm_r', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'l_hip', toPartKey: 'leg_l', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'r_hip', toPartKey: 'leg_r', toSocket: 'base' },
  ],
  defaultItems: [
    {
      targetPartKey: 'torso',
      targetAreaType: 'torso',
      config: {
        tag: { archetype: 'item', subType: 'bag' },
        meta: { name: 'Рюкзак', entityType: 'item' },
        visualModel: { modelId: 'proc://prop/backpack' },
        item: {
          name: 'Рюкзак',
          type: 'bag',
          icon: '🎒',
          maxStack: 1,
          count: 1,
          size: 10,
          equipTypes: ['torso'],
          equippable: true,
          equipTimeMultiplier: 1.0,
        },
        physics: { radius: 0.35, height: 0.5, weight: 1.5, isSolid: true },
        inventory: { size: { width: 6, height: 4 } },
      },
    },
    {
      targetPartKey: 'arm_r',
      targetAreaType: 'hand_slot',
      config: {
        tag: { archetype: 'item', subType: 'weapon' },
        meta: { name: 'Меч', entityType: 'item' },
        visualModel: { modelId: 'proc://prop/sword' },
        item: {
          name: 'Меч',
          type: 'weapon',
          icon: '🗡️',
          maxStack: 1,
          count: 1,
          size: 10,
          equipTypes: [],
          equippable: false,
          equipTimeMultiplier: 1.0,
        },
        physics: {
          radius: 0.4,
          weight: 2,
          isSolid: true,
          halfExtents: { x: 0.15, y: 0.64, z: 0.02 },
          colliderOffset: { x: 0, y: 0.36, z: 0 },
          restitution: 0.78,
          linearDamping: 1,
        },
        weaponStats: { baseDamage: 25, prepTime: 0.2, recoveryTime: 0.3 },
        weaponZone: { hitZoneType: 'angle', radius: 2.5, angle: deg2Rad(90) },
      },
    },
  ],
};

export const QUADRUPED_BLUEPRINT: CreatureBodyBlueprint = {
  id: 'quadruped',
  name: 'Четвероногий',
  baseHeight: 0.8,
  baseRadius: 0.35,
  rigAsset: 'proc://rig/quadruped',
  headLimits: {
    minYaw: deg2Rad(-65),
    maxYaw: deg2Rad(65),
    minPitch: deg2Rad(-30),
    maxPitch: deg2Rad(35),
  },
  movement: {
    maxSpeed: 5.5, // Базовая скорость собаки (5.5 м/с против 4.5 м/с у человека)
    runSpeedMultiplier: 1.8, // Быстрый спринт (9.9 м/с)
    walkSpeedMultiplier: 0.4, // Спокойный шаг (2.2 м/с)
  },
  parts: [
    {
      key: 'torso',
      meshAsset: 'proc://mesh/quadruped/torso',
      rigNodeName: 'Torso',
      config: {
        tag: { archetype: 'bodyPart', subType: 'torso' },
        meta: { name: 'Туловище' },
        physics: { radius: 0.35, weight: 22, size: 25 },
        heart: { requiresBrain: true },
        socketDef: {
          sockets: {
            neck: { type: 'neck', size: 12, strength: 60 },
            l_front_shoulder: { type: 'shoulder', size: 10, strength: 45 },
            r_front_shoulder: { type: 'shoulder', size: 10, strength: 45 },
            l_rear_hip: { type: 'hip', size: 12, strength: 55 },
            r_rear_hip: { type: 'hip', size: 12, strength: 55 },
            tail: { type: 'tail', size: 6, strength: 25 },
          },
        },
        equip: {
          equipmentAreas: [
            { id: 'torso', name: 'Седло / Спина', type: 'torso', space: 25, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'head',
      meshAsset: 'proc://mesh/quadruped/head',
      rigNodeName: 'HeadPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'head' },
        meta: { name: 'Голова' },
        physics: { radius: 0.25, weight: 6, size: 12 },
        vision: {
          fovAngle: deg2Rad(150),
          clarity: 1.0,
          maxDistance: 25,
        },
        hearing: {
          sensitivity: 1.4,
          maxDistance: 35,
        },
        socketDef: {
          sockets: {
            base: { type: 'neck', size: 12, strength: 60 },
          },
        },
        bodyBrain: { power: 100, isActive: true },
        interactionSlots: {
          id: 'jaw',
          name: 'Пасть',
          interactDist: 0.4,
          strength: 20,
          itemId: null,
          rigSocketName: 'JawsSocket',
          slotKind: 'jaws',
        },
        equip: {
          equipmentAreas: [
            { id: 'head', name: 'Ошейник / Морда', type: 'head', space: 10, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'front_leg_l',
      meshAsset: 'proc://mesh/quadruped/front_leg_l',
      rigNodeName: 'FrontLeftLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Передняя левая лапа' },
        physics: { radius: 0.15, weight: 5, size: 10 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'shoulder', size: 10, strength: 45 },
          },
        },
      },
    },
    {
      key: 'front_leg_r',
      meshAsset: 'proc://mesh/quadruped/front_leg_r',
      rigNodeName: 'FrontRightLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Передняя правая лапа' },
        physics: { radius: 0.15, weight: 5, size: 10 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'shoulder', size: 10, strength: 45 },
          },
        },
      },
    },
    {
      key: 'rear_leg_l',
      meshAsset: 'proc://mesh/quadruped/rear_leg_l',
      rigNodeName: 'BackLeftLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Задняя левая лапа' },
        physics: { radius: 0.2, weight: 6, size: 12 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'hip', size: 12, strength: 55 },
          },
        },
      },
    },
    {
      key: 'rear_leg_r',
      meshAsset: 'proc://mesh/quadruped/rear_leg_r',
      rigNodeName: 'BackRightLegPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Задняя правая лапа' },
        physics: { radius: 0.2, weight: 6, size: 12 },
        locomotion: {},
        socketDef: {
          sockets: {
            base: { type: 'hip', size: 12, strength: 55 },
          },
        },
      },
    },
    {
      key: 'tail',
      meshAsset: 'proc://mesh/quadruped/tail',
      rigNodeName: 'TailPivot',
      config: {
        tag: { archetype: 'bodyPart', subType: 'tail' },
        meta: { name: 'Хвост' },
        physics: { radius: 0.1, weight: 2, size: 6 },
        socketDef: {
          sockets: {
            base: { type: 'tail', size: 6, strength: 25 },
          },
        },
      },
    },
  ],
  connections: [
    { fromPartKey: 'torso', fromSocket: 'neck', toPartKey: 'head', toSocket: 'base' },
    {
      fromPartKey: 'torso',
      fromSocket: 'l_front_shoulder',
      toPartKey: 'front_leg_l',
      toSocket: 'base',
    },
    {
      fromPartKey: 'torso',
      fromSocket: 'r_front_shoulder',
      toPartKey: 'front_leg_r',
      toSocket: 'base',
    },
    { fromPartKey: 'torso', fromSocket: 'l_rear_hip', toPartKey: 'rear_leg_l', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'r_rear_hip', toPartKey: 'rear_leg_r', toSocket: 'base' },
    { fromPartKey: 'torso', fromSocket: 'tail', toPartKey: 'tail', toSocket: 'base' },
  ],
};

export const ARACHNID_BLUEPRINT: CreatureBodyBlueprint = {
  id: 'arachnid',
  name: 'Паукообразный',
  baseHeight: 0.5,
  baseRadius: 0.6,
  headLimits: { minYaw: 0, maxYaw: 0, minPitch: 0, maxPitch: 0 },
  movement: {
    maxSpeed: 4.8,
    runSpeedMultiplier: 1.6,
    walkSpeedMultiplier: 0.5,
  },
  parts: [
    {
      key: 'prosoma',
      config: {
        tag: { archetype: 'bodyPart', subType: 'torso' },
        meta: { name: 'Головогрудь' },
        physics: { radius: 0.35, weight: 18, size: 22 },
        heart: { requiresBrain: true },
        bodyBrain: { power: 100, isActive: true },
        vision: {
          fovAngle: deg2Rad(260),
          clarity: 0.9,
          maxDistance: 25,
        },
        hearing: {
          sensitivity: 1.5,
          maxDistance: 30,
        },
        socketDef: {
          sockets: {
            abdomen: { type: 'abdomen', size: 16, strength: 60 },
            chelicera_l: { type: 'chelicera', size: 8, strength: 35 },
            chelicera_r: { type: 'chelicera', size: 8, strength: 35 },
            leg_l1: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_l2: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_l3: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_l4: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_r1: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_r2: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_r3: { type: 'arachnid_leg', size: 8, strength: 35 },
            leg_r4: { type: 'arachnid_leg', size: 8, strength: 35 },
          },
        },
      },
    },
    {
      key: 'opisthosoma',
      config: {
        tag: { archetype: 'bodyPart', subType: 'torso' },
        meta: { name: 'Брюшко' },
        physics: { radius: 0.3, weight: 16, size: 20 },
        socketDef: {
          sockets: {
            base: { type: 'abdomen', size: 16, strength: 60 },
          },
        },
        equip: {
          equipmentAreas: [
            { id: 'abdomen', name: 'Брюшко', type: 'torso', space: 20, itemIds: [] },
          ],
        },
      },
    },
    {
      key: 'chelicera_l',
      config: {
        tag: { archetype: 'bodyPart', subType: 'arm' },
        meta: { name: 'Левая хелицера' },
        physics: { radius: 0.15, weight: 3, size: 7 },
        socketDef: {
          sockets: {
            base: { type: 'chelicera', size: 8, strength: 35 },
          },
        },
        interactionSlots: {
          id: 'chelicera_l',
          name: 'Левая хелицера',
          interactDist: 1.2,
          strength: 12,
          itemId: null,
          slotKind: 'left_hand',
        },
      },
    },
    {
      key: 'chelicera_r',
      config: {
        tag: { archetype: 'bodyPart', subType: 'arm' },
        meta: { name: 'Правая хелицера' },
        physics: { radius: 0.15, weight: 3, size: 7 },
        socketDef: {
          sockets: {
            base: { type: 'chelicera', size: 8, strength: 35 },
          },
        },
        interactionSlots: {
          id: 'chelicera_r',
          name: 'Правая хелицера',
          interactDist: 1.2,
          strength: 12,
          itemId: null,
          slotKind: 'right_hand',
        },
      },
    },
    {
      key: 'leg_l1',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Левая нога 1' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_l2',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Левая нога 2' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_l3',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Левая нога 3' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_l4',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Левая нога 4' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_r1',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Правая нога 1' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_r2',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Правая нога 2' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_r3',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Правая нога 3' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
    {
      key: 'leg_r4',
      config: {
        tag: { archetype: 'bodyPart', subType: 'leg' },
        meta: { name: 'Правая нога 4' },
        physics: { radius: 0.15, weight: 3, size: 8 },
        locomotion: {},
        socketDef: { sockets: { base: { type: 'arachnid_leg', size: 8, strength: 35 } } },
      },
    },
  ],
  connections: [
    { fromPartKey: 'prosoma', fromSocket: 'abdomen', toPartKey: 'opisthosoma', toSocket: 'base' },
    {
      fromPartKey: 'prosoma',
      fromSocket: 'chelicera_l',
      toPartKey: 'chelicera_l',
      toSocket: 'base',
    },
    {
      fromPartKey: 'prosoma',
      fromSocket: 'chelicera_r',
      toPartKey: 'chelicera_r',
      toSocket: 'base',
    },
    { fromPartKey: 'prosoma', fromSocket: 'leg_l1', toPartKey: 'leg_l1', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_l2', toPartKey: 'leg_l2', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_l3', toPartKey: 'leg_l3', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_l4', toPartKey: 'leg_l4', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_r1', toPartKey: 'leg_r1', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_r2', toPartKey: 'leg_r2', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_r3', toPartKey: 'leg_r3', toSocket: 'base' },
    { fromPartKey: 'prosoma', fromSocket: 'leg_r4', toPartKey: 'leg_r4', toSocket: 'base' },
  ],
};

export const CREATURE_BLUEPRINTS: Record<BodyStructureType, CreatureBodyBlueprint> = {
  humanoid: HUMANOID_BLUEPRINT,
  quadruped: QUADRUPED_BLUEPRINT,
  arachnid: ARACHNID_BLUEPRINT,
};
