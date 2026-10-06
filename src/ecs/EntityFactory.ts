import { World } from './World';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { AISystem } from './systems/AISystem';
import { EntityId, EntityConfig, CollisionCategory, COLLISION_MASK_ALL } from './types';
import { Point, Vec3 } from '../types';
import { ARCHETYPE_ASSEMBLERS, detectArchetype } from './archetypes';
import { assembleBodyPart } from './archetypes/BodyPartArchetype';
import { createStat } from './stats/StatEvaluator';
import { BALANCE_CONFIG } from '../config/balanceConfig';
import { CreatureBodyBlueprint, CREATURE_BLUEPRINTS } from './templates';
import { AnatomySystem } from './systems/AnatomySystem';
import { fastClone } from './utils/clone';

export class EntityFactory {
  private anatomySystem = new AnatomySystem();

  public generateId(prefix: string = 'ent'): EntityId {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  }

  public spawnEntity(
    world: World,
    physics: PhysicsSystem,
    aiSystem: AISystem,
    config: EntityConfig,
    position?: Vec3,
    forcedId?: string
  ): EntityId {
    const id = forcedId || this.generateId('ent');
    world.createEntity(id);

    const archetype = detectArchetype(config);
    const assembler = ARCHETYPE_ASSEMBLERS[archetype] ?? ARCHETYPE_ASSEMBLERS.creature;
    assembler(world, physics, aiSystem, id, config, position);

    return id;
  }

  public spawnModularCreature(
    world: World,
    physics: PhysicsSystem,
    aiSystem: AISystem,
    position: Vec3,
    blueprint: CreatureBodyBlueprint,
    behavior: string = 'IdleTree',
    name?: string
  ): EntityId {
    const rootId = this.generateId('creature');
    world.createEntity(rootId);

    const creatureName = name || blueprint.name;

    // 1. Создание абстрактного корня существа
    // Первичный расчет радиуса и веса по частям шаблона
    let maxRadius = 0;
    let initialWeight = 0;
    for (const part of blueprint.parts) {
      const r = part.config.physics?.radius ?? 0.2;
      if (r > maxRadius) maxRadius = r;
      initialWeight += part.config.physics?.weight ?? 1;
    }

    const rootConfig: EntityConfig = {
      ai: { behavior },
      meta: { name: creatureName, entityType: 'creature' },
      movement: blueprint.movement ? fastClone(blueprint.movement) : undefined,
      visualModel: blueprint.rigAsset ? { modelId: blueprint.rigAsset } : undefined,
      animator: blueprint.rigAsset
        ? {
            rigType: blueprint.id,
            currentAnimation: 'idle',
            playbackSpeed: 1,
            clipsMap: {},
          }
        : undefined,
      physics: {
        radius: blueprint.baseRadius ?? maxRadius,
        height: blueprint.baseHeight ?? 1.8,
        weight: initialWeight || 10,
        isSolid: true,
      },
      perception: {
        visionFovAngle: BALANCE_CONFIG.senses.defaultFovAngle,
        visionClarity: BALANCE_CONFIG.senses.defaultVisionClarity,
        visionMaxDistance: BALANCE_CONFIG.senses.defaultVisionMaxDistance,
        hearingSensitivity: BALANCE_CONFIG.senses.defaultHearingSensitivity,
        hearingMaxDistance: BALANCE_CONFIG.senses.defaultHearingMaxDistance,
      },
      renderable: {
        zIndex: 40,
        isVisible: true,
        syncWithTransform: true,
      },
    };

    ARCHETYPE_ASSEMBLERS.creature(world, physics, aiSystem, rootId, rootConfig, position);

    // 2. Генерация ID для всех частей тела шаблона
    const partKeyToId = new Map<string, string>();
    for (const part of blueprint.parts) {
      partKeyToId.set(part.key, this.generateId(`part_${part.key}`));
    }

    // 3. Подготовка структуры сокет-связей для каждой части
    const partSocketLinks = new Map<string, Record<string, any>>();
    for (const part of blueprint.parts) {
      partSocketLinks.set(part.key, {});
    }

    for (const conn of blueprint.connections) {
      const idA = partKeyToId.get(conn.fromPartKey);
      const idB = partKeyToId.get(conn.toPartKey);
      const partDefA = blueprint.parts.find((p) => p.key === conn.fromPartKey);
      const partDefB = blueprint.parts.find((p) => p.key === conn.toPartKey);

      if (idA && idB && partDefA && partDefB) {
        const sockA = partDefA.config.socketDef?.sockets[conn.fromSocket];
        const sockB = partDefB.config.socketDef?.sockets[conn.toSocket];

        if (sockA && sockB) {
          const strength = Math.min(sockA.strength, sockB.strength);
          const socketSize = sockA.size + sockB.size;

          partSocketLinks.get(conn.fromPartKey)![conn.fromSocket] = {
            targetEntityId: idB,
            targetSocketId: conn.toSocket,
            currentStrength: strength,
            maxStrength: createStat(strength),
            socketSize,
          };

          partSocketLinks.get(conn.toPartKey)![conn.toSocket] = {
            targetEntityId: idA,
            targetSocketId: conn.fromSocket,
            currentStrength: strength,
            maxStrength: createStat(strength),
            socketSize,
          };
        }
      }
    }

    // Масштабные коэффициенты частей относительно нативных размеров рига
    const baseR = blueprint.baseRadius ?? 0.4;
    const baseH = blueprint.baseHeight ?? 1.8;
    const targetR = rootConfig.physics?.radius ?? baseR;
    const targetH = rootConfig.physics?.height ?? baseH;
    const scaleXZ = targetR / baseR;
    const scaleY = targetH / baseH;
    const scaleVol = scaleXZ * scaleXZ * scaleY;

    // 4. Создание и сборка частей тела с пропорциональным масштабом
    for (const part of blueprint.parts) {
      const partId = partKeyToId.get(part.key)!;
      world.createEntity(partId);

      const partConfig: EntityConfig = fastClone(part.config);
      if (partConfig.physics) {
        partConfig.physics.radius = (partConfig.physics.radius ?? 0.2) * scaleXZ;
        partConfig.physics.height = (partConfig.physics.height ?? 0.4) * scaleY;
        partConfig.physics.weight = (partConfig.physics.weight ?? 1) * scaleVol;
        if (partConfig.physics.size !== undefined) {
          partConfig.physics.size = Math.max(
            1,
            Math.round(partConfig.physics.size * Math.max(scaleXZ, scaleY))
          );
        }
      }

      partConfig.socketLink = {
        links: partSocketLinks.get(part.key) || {},
      };
      if (part.meshAsset) {
        partConfig.visualModel = {
          modelId: part.meshAsset,
          rigNodeName: part.rigNodeName,
        };
      }

      if (partConfig.bodyBrain) {
        partConfig.bodyBrain.rootEntityId = rootId;
      }

      assembleBodyPart(world, physics, aiSystem, partId, partConfig, position);

      if (partConfig.bodyBrain) {
        aiSystem.initBotBrain(world, partId, behavior);
      }
    }

    // 4.5. Регистрация анатомической сборки на корневом существе
    const anchorPartKey =
      blueprint.parts.find((p) => p.config.bodyBrain || p.config.heart)?.key ||
      blueprint.parts[0].key;
    const rootPartId = partKeyToId.get(anchorPartKey)!;
    const allPartIds = Array.from(partKeyToId.values());

    world.addComponent(rootId, 'assemblyRoot', {
      rootPartId,
      partIds: allPartIds,
    });

    // 5. Создание и привязка стартовых предметов (рюкзак на спину, меч в руку)
    if (blueprint.defaultItems) {
      for (const itemDef of blueprint.defaultItems) {
        const targetPartId = partKeyToId.get(itemDef.targetPartKey);
        if (targetPartId) {
          const itemId = this.generateId('item');
          world.createEntity(itemId);

          const itemConfig: EntityConfig = fastClone(itemDef.config);
          itemConfig.ownership = { ownerId: targetPartId, status: 'equipped' };

          ARCHETYPE_ASSEMBLERS.item(world, physics, aiSystem, itemId, itemConfig, position);

          const targetSlots = world.getComponent(targetPartId, 'interactionSlots');
          if (targetSlots && targetSlots.itemId === null && itemConfig.item?.type === 'weapon') {
            targetSlots.itemId = itemId;
          } else {
            const targetEquip = world.getComponent(targetPartId, 'equip');
            if (targetEquip) {
              const area = targetEquip.equipmentAreas.find(
                (a) => a.type === itemDef.targetAreaType
              );
              if (area) {
                area.itemIds.push(itemId);
              }
            }
          }
        }
      }
    }

    // Мгновенная синхронизация анатомической сборки и создание капсульного коллайдера в Rapier
    this.anatomySystem.update(0, world, physics);

    return rootId;
  }

  public spawnModularHumanoid(
    world: World,
    physics: PhysicsSystem,
    aiSystem: AISystem,
    position: Vec3,
    behavior: string = 'IdleTree',
    name: string = 'Существо'
  ): EntityId {
    return this.spawnModularCreature(
      world,
      physics,
      aiSystem,
      position,
      CREATURE_BLUEPRINTS.humanoid,
      behavior,
      name
    );
  }
}
