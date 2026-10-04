import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import {
  EntityId,
  CollisionCategory,
  COLLISION_MASK_ALL,
  RENDER_Z_INDEX,
  EntityConfig,
} from '../types';
import {
  traverseAnatomyGraph,
  calculateSystemWeightAndRadius,
  findActiveBrain,
} from '../utils/anatomy';
import { destroyPartRecursive, forceDropItemFromPart } from '../utils/anatomyDamage';
import { ARCHETYPE_ASSEMBLERS } from '../archetypes';
import { setBaseStat, createStat } from '../stats/StatEvaluator';
import { evaluateConsciousness, getLocomotionState, getSensoryStats } from '../utils/anatomyStatus';
import { ConsciousnessState } from '../types';
import { CREATURE_BLUEPRINTS, BodyStructureType } from '../templates';
import { invalidateAnatomyCache } from '../utils/hierarchy';

export class AnatomySystem {
  public update(_dt: number, world: World, physics: PhysicsSystem): void {
    const destructibleParts = world.getEntitiesWith('socketDef', 'health');
    for (const [partId, { health }] of destructibleParts) {
      if (health.current <= 0) {
        destroyPartRecursive(world, partId);
      }
    }

    const bodyParts = world.getEntitiesWith('socketDef');
    const visitedParts = new Set<EntityId>();
    const subgraphs: EntityId[][] = [];

    for (const [partId] of bodyParts) {
      if (visitedParts.has(partId)) continue;
      const graph = traverseAnatomyGraph(world, partId);
      for (const id of graph) visitedParts.add(id);
      subgraphs.push(graph);
    }

    const existingCreatureRoots = world.getEntitiesWith('assemblyRoot').filter(([id]) => {
      const tag = world.getComponent(id, 'tag');
      return tag?.archetype === 'creature';
    });

    const claimedCreatureRootIds = new Set<string>();

    interface ViableCreaturePlan {
      graph: EntityId[];
      anchorId: EntityId;
      totalWeight: number;
      maxRadius: number;
      targetRootId: string;
      isNewRoot: boolean;
      inheritedBehavior?: string;
      inheritedName?: string;
    }

    interface NonViableItemPlan {
      graph: EntityId[];
      totalWeight: number;
      maxRadius: number;
      calculatedSize: number;
      rigType?: string;
      partName?: string;
    }

    const viablePlans: ViableCreaturePlan[] = [];
    const itemPlans: NonViableItemPlan[] = [];

    for (const graph of subgraphs) {
      const brainId = findActiveBrain(world, graph[0]);
      const heartId = graph.find((id) => world.getComponent(id, 'heart') !== undefined);
      const consciousness = evaluateConsciousness(world, graph[0]);
      const isViable = heartId !== undefined && consciousness !== ConsciousnessState.DEAD;

      const { totalWeight, maxRadius } = calculateSystemWeightAndRadius(world, graph[0]);

      if (isViable) {
        const anchorId = brainId ?? heartId!;

        let matchedRootId: string | null = null;

        for (const [rootId, comp] of existingCreatureRoots) {
          if (!claimedCreatureRootIds.has(rootId) && graph.includes(comp.assemblyRoot.rootPartId)) {
            matchedRootId = rootId;
            break;
          }
        }

        if (!matchedRootId) {
          for (const partId of graph) {
            const brain = world.getComponent(partId, 'bodyBrain');
            if (brain && brain.rootEntityId && !claimedCreatureRootIds.has(brain.rootEntityId)) {
              const rootTag = world.getComponent(brain.rootEntityId, 'tag');
              if (rootTag?.archetype === 'creature') {
                matchedRootId = brain.rootEntityId;
                break;
              }
            }
          }
        }

        if (!matchedRootId) {
          for (const [rootId, comp] of existingCreatureRoots) {
            if (
              !claimedCreatureRootIds.has(rootId) &&
              comp.assemblyRoot.partIds?.some((pId) => graph.includes(pId))
            ) {
              matchedRootId = rootId;
              break;
            }
          }
        }

        if (matchedRootId) {
          claimedCreatureRootIds.add(matchedRootId);
          viablePlans.push({
            graph,
            anchorId,
            totalWeight,
            maxRadius,
            targetRootId: matchedRootId,
            isNewRoot: false,
          });
        } else {
          let inheritedBehavior = 'IdleTree';
          let inheritedName = 'Существо';

          for (const [rootId, comp] of existingCreatureRoots) {
            if (comp.assemblyRoot.partIds?.some((pId) => graph.includes(pId))) {
              const oldAi = world.getComponent(rootId, 'aiStats');
              const oldMeta = world.getComponent(rootId, 'meta');
              if (oldAi) inheritedBehavior = oldAi.behavior.current;
              if (oldMeta) inheritedName = `${oldMeta.name} (Фрагмент)`;
              break;
            }
          }

          const newRootId = `creature_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          viablePlans.push({
            graph,
            anchorId,
            totalWeight,
            maxRadius,
            targetRootId: newRootId,
            isNewRoot: true,
            inheritedBehavior,
            inheritedName,
          });
        }
      } else {
        let sumSqSize = 0;
        for (const id of graph) {
          const pStats = world.getComponent(id, 'physicsStats');
          const partSize = pStats?.size ?? 10;
          sumSqSize += partSize * partSize;
        }
        const calculatedSize = Math.max(1, Math.round(Math.sqrt(sumSqSize)));

        let rigType = 'humanoid';
        for (const [rootId, comp] of existingCreatureRoots) {
          if (comp.assemblyRoot.partIds?.some((pId) => graph.includes(pId))) {
            const oldAnimator = world.getComponent(rootId, 'animator');
            if (oldAnimator) {
              rigType = oldAnimator.rigType;
              break;
            }
          }
        }

        const firstPartMeta = world.getComponent(graph[0], 'meta');
        const partName =
          graph.length === 1
            ? firstPartMeta?.name || 'Часть тела'
            : `${firstPartMeta?.name || 'Останки'} (Сборка)`;

        itemPlans.push({
          graph,
          totalWeight,
          maxRadius,
          calculatedSize,
          rigType,
          partName,
        });
      }
    }

    const hasTopologyChanges =
      existingCreatureRoots.length !== claimedCreatureRootIds.size ||
      viablePlans.some((p) => p.isNewRoot) ||
      itemPlans.length > 0;

    if (hasTopologyChanges) {
      invalidateAnatomyCache();
    }

    for (const [rootId] of existingCreatureRoots) {
      if (!claimedCreatureRootIds.has(rootId)) {
        const phys = world.getComponent(rootId, 'physicsBody');
        if (phys?.bodyHandle !== undefined) {
          physics.driver?.removeRigidBody(phys.bodyHandle);
        }
        world.removeEntity(rootId);
      }
    }

    for (const plan of viablePlans) {
      this.applyCreaturePlan(world, physics, plan);
    }

    for (const plan of itemPlans) {
      this.applyItemPlan(world, physics, plan);
    }
  }

  private applyCreaturePlan(
    world: World,
    physics: PhysicsSystem,
    plan: {
      graph: EntityId[];
      anchorId: EntityId;
      totalWeight: number;
      maxRadius: number;
      targetRootId: string;
      isNewRoot: boolean;
      inheritedBehavior?: string;
      inheritedName?: string;
    }
  ): void {
    const rootId = plan.targetRootId;
    const anchorTransform = world.getComponent(plan.anchorId, 'transform') ?? {
      x: 0,
      y: 0,
      z: 0,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      angle: 0,
    };

    if (plan.isNewRoot) {
      world.createEntity(rootId);
      const rootConfig: EntityConfig = {
        ai: { behavior: plan.inheritedBehavior || 'IdleTree' },
        meta: { name: plan.inheritedName || 'Существо', entityType: 'creature' },
      };
      ARCHETYPE_ASSEMBLERS.creature(world, physics, null as any, rootId, rootConfig, {
        x: anchorTransform.x,
        y: anchorTransform.y,
        z: anchorTransform.z,
      });
    }

    world.addComponent(rootId, 'assemblyRoot', { rootPartId: plan.anchorId, partIds: plan.graph });
    world.removeComponent(rootId, 'item');

    for (const partId of plan.graph) {
      const brainComp = world.getComponent(partId, 'bodyBrain');
      if (brainComp) {
        brainComp.rootEntityId = rootId;
      }
    }

    const sensory = getSensoryStats(world, rootId);
    let perception = world.getComponent(rootId, 'perception');
    if (!perception) {
      world.addComponent(rootId, 'perception', {
        visionFovAngle: sensory.vision.fovAngle,
        visionClarity: sensory.vision.clarity,
        visionMaxDistance: sensory.vision.maxDistance,
        hearingSensitivity: sensory.hearing.sensitivity,
        hearingMaxDistance: sensory.hearing.maxDistance,
      });
    } else {
      perception.visionFovAngle = sensory.vision.fovAngle;
      perception.visionClarity = sensory.vision.clarity;
      perception.visionMaxDistance = sensory.vision.maxDistance;
      perception.hearingSensitivity = sensory.hearing.sensitivity;
      perception.hearingMaxDistance = sensory.hearing.maxDistance;
    }

    const currentConsciousness = evaluateConsciousness(world, rootId);
    let consciousnessComp = world.getComponent(rootId, 'consciousness');
    if (!consciousnessComp) {
      world.addComponent(rootId, 'consciousness', { state: currentConsciousness });
    } else {
      consciousnessComp.state = currentConsciousness;
    }

    const currentLocomotion = getLocomotionState(world, rootId);
    let locomotionComp = world.getComponent(rootId, 'locomotionState');
    if (!locomotionComp) {
      world.addComponent(rootId, 'locomotionState', { ...currentLocomotion });
    } else {
      Object.assign(locomotionComp, currentLocomotion);
    }

    let rootPhysStats = world.getComponent(rootId, 'physicsStats');
    if (!rootPhysStats) {
      world.addComponent(rootId, 'physicsStats', {
        radius: createStat(plan.maxRadius),
        height: createStat(1.8),
        weight: createStat(plan.totalWeight),
        isSolid: true,
      });
      rootPhysStats = world.getComponent(rootId, 'physicsStats')!;
    } else {
      setBaseStat(rootPhysStats.weight, plan.totalWeight);
    }

    let rootPhysBody = world.getComponent(rootId, 'physicsBody');
    const rootTransform = world.getComponent(rootId, 'transform') ?? anchorTransform;

    let bodyHandle = rootPhysBody?.bodyHandle;
    let colliderHandle = rootPhysBody?.colliderHandle;

    if (bodyHandle === undefined && physics.driver && physics.driver.isReady) {
      bodyHandle = physics.driver.createKinematicPositionBody(
        { x: rootTransform.x, y: rootTransform.y, z: rootTransform.z },
        rootId
      );
      const radius = rootPhysStats.radius.current;
      const height = rootPhysStats.height.current;
      const halfHeight = Math.max(0.01, (height - 2 * radius) / 2);
      const offsetY = halfHeight + radius;
      colliderHandle = physics.driver.createCapsuleCollider(halfHeight, radius, bodyHandle, {
        mass: plan.totalWeight,
        offset: { x: 0, y: offsetY, z: 0 },
      });
    }

    const radius = rootPhysStats.radius.current;
    const height = rootPhysStats.height.current;

    if (!rootPhysBody) {
      world.addComponent(rootId, 'physicsBody', {
        bodyHandle,
        colliderHandle,
        bodyType: 'kinematicPositionBased',
        isStatic: false,
        category: CollisionCategory.CREATURE,
        mask: COLLISION_MASK_ALL,
        currentColliderStance: 'standing',
        lastAppliedRadius: radius,
        lastAppliedHeight: height,
      });
    } else {
      rootPhysBody.bodyHandle = bodyHandle;
      rootPhysBody.colliderHandle = colliderHandle;
      rootPhysBody.bodyType = 'kinematicPositionBased';
      rootPhysBody.currentColliderStance = 'standing';
      rootPhysBody.lastAppliedRadius = radius;
      rootPhysBody.lastAppliedHeight = height;
    }

    if (!currentLocomotion.canStand) {
      const input = world.getComponent(rootId, 'input');
      if (input) {
        input.desiredStance = 'prone';
      }
    }

    for (const partId of plan.graph) {
      const partTransform = world.getComponent(partId, 'transform');
      if (partTransform) {
        partTransform.x = rootTransform.x;
        partTransform.y = rootTransform.y;
        partTransform.z = rootTransform.z;
        partTransform.rotation = { ...rootTransform.rotation };
        partTransform.angle = rootTransform.angle;
      }
      const physBody = world.getComponent(partId, 'physicsBody');
      if (physBody) {
        if (physBody.bodyHandle !== undefined) physics.driver?.removeRigidBody(physBody.bodyHandle);
        world.removeComponent(partId, 'physicsBody');
      }
      world.removeComponent(partId, 'item');
    }
  }

  private applyItemPlan(
    world: World,
    physics: PhysicsSystem,
    plan: {
      graph: EntityId[];
      totalWeight: number;
      maxRadius: number;
      calculatedSize: number;
      rigType?: string;
      partName?: string;
    }
  ): void {
    let anchorPartId = plan.graph[0];
    let maxLinks = -1;
    for (const id of plan.graph) {
      const linkComp = world.getComponent(id, 'socketLink');
      const linksCount = linkComp ? Object.keys(linkComp.links).length : 0;
      if (linksCount > maxLinks) {
        maxLinks = linksCount;
        anchorPartId = id;
      } else if (linksCount === maxLinks && linksCount > -1) {
        const currentSize = world.getComponent(id, 'physicsStats')?.size ?? 0;
        const anchorSize = world.getComponent(anchorPartId, 'physicsStats')?.size ?? 0;
        if (currentSize > anchorSize) {
          anchorPartId = id;
        }
      }
    }

    const assemblyRoots = world.getEntitiesWith('assemblyRoot');
    let rootItemId = assemblyRoots.find(([id, comp]) => {
      const isItem = world.getComponent(id, 'tag')?.archetype === 'item';
      return isItem && plan.graph.includes(comp.assemblyRoot.rootPartId);
    })?.[0];

    const anchorTransform = world.getComponent(anchorPartId, 'transform') ?? {
      x: 0,
      y: 0,
      z: 0,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      angle: 0,
    };

    if (!rootItemId || !world.getEntity(rootItemId)) {
      rootItemId = `item_assembly_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      world.createEntity(rootItemId);
      world.addComponent(rootItemId, 'transform', {
        x: anchorTransform.x,
        y: anchorTransform.y,
        z: anchorTransform.z,
        rotation: { ...anchorTransform.rotation },
        angle: anchorTransform.angle,
      });
    }

    const anchorMeta = world.getComponent(anchorPartId, 'meta');
    const displayName =
      plan.partName ||
      (plan.graph.length === 1
        ? anchorMeta?.name || 'Часть тела'
        : `${anchorMeta?.name || 'Останки'} (Сборка)`);

    world.addComponent(rootItemId, 'tag', { archetype: 'item', subType: 'bodyPart' });
    world.addComponent(rootItemId, 'meta', { name: displayName, entityType: 'item' });
    world.addComponent(rootItemId, 'assemblyRoot', {
      rootPartId: anchorPartId,
      partIds: plan.graph,
    });

    const anchorVisual = world.getComponent(anchorPartId, 'visualModel');
    const rigStructure = (plan.rigType as BodyStructureType) || 'humanoid';
    const blueprint = CREATURE_BLUEPRINTS[rigStructure] || CREATURE_BLUEPRINTS.humanoid;
    const rigAsset = blueprint?.rigAsset ?? 'proc://rig/humanoid';

    world.addComponent(rootItemId, 'visualModel', {
      modelId: plan.graph.length === 1 && anchorVisual?.modelId ? anchorVisual.modelId : rigAsset,
      rigType: rigStructure,
      rigNodeName: plan.graph.length === 1 ? anchorVisual?.rigNodeName : undefined,
    });

    let itemComp = world.getComponent(rootItemId, 'item');
    if (!itemComp) {
      world.addComponent(rootItemId, 'item', {
        name: displayName,
        type: 'bodyPart',
        maxStack: 1,
        count: 1,
        size: plan.calculatedSize,
        equipTypes: [],
        equippable: false,
        equipTimeMultiplier: 1.0,
      });
    } else {
      itemComp.name = displayName;
      itemComp.size = plan.calculatedSize;
    }

    let rootPhysStats = world.getComponent(rootItemId, 'physicsStats');
    if (!rootPhysStats) {
      world.addComponent(rootItemId, 'physicsStats', {
        radius: createStat(plan.maxRadius),
        height: createStat(plan.maxRadius * 2),
        weight: createStat(plan.totalWeight),
        size: plan.calculatedSize,
        isSolid: true,
      });
      rootPhysStats = world.getComponent(rootItemId, 'physicsStats')!;
    } else {
      setBaseStat(rootPhysStats.radius, plan.maxRadius);
      setBaseStat(rootPhysStats.weight, plan.totalWeight);
      rootPhysStats.size = plan.calculatedSize;
    }

    const rootItemTransform = world.getComponent(rootItemId, 'transform') ?? anchorTransform;
    const ownership = world.getComponent(rootItemId, 'ownership');

    if (!ownership) {
      physics.createDynamicItemBody(world, rootItemId, {
        x: rootItemTransform.x,
        y: rootItemTransform.y + 0.5,
        z: rootItemTransform.z,
      });

      let renderable = world.getComponent(rootItemId, 'renderable');
      if (!renderable) {
        world.addComponent(rootItemId, 'renderable', {
          zIndex: RENDER_Z_INDEX.ITEMS,
          isVisible: true,
          syncWithTransform: true,
        });
      } else {
        renderable.isVisible = true;
      }
    } else {
      const physBody = world.getComponent(rootItemId, 'physicsBody');
      if (physBody) {
        if (physBody.bodyHandle !== undefined) physics.driver?.removeRigidBody(physBody.bodyHandle);
        world.removeComponent(rootItemId, 'physicsBody');
      }
      const renderable = world.getComponent(rootItemId, 'renderable');
      if (renderable) {
        renderable.isVisible = false;
      }
    }

    for (const partId of plan.graph) {
      forceDropItemFromPart(world, partId);

      const partTransform = world.getComponent(partId, 'transform');
      if (partTransform) {
        partTransform.x = rootItemTransform.x;
        partTransform.y = rootItemTransform.y;
        partTransform.z = rootItemTransform.z;
        partTransform.rotation = { ...rootItemTransform.rotation };
        partTransform.angle = rootItemTransform.angle;
      }
      const brainComp = world.getComponent(partId, 'bodyBrain');
      if (brainComp) {
        delete brainComp.rootEntityId;
        brainComp.isActive = false; // Отделенный от сердца мозг прекращает функционировать
      }
      const physBody = world.getComponent(partId, 'physicsBody');
      if (physBody) {
        if (physBody.bodyHandle !== undefined) physics.driver?.removeRigidBody(physBody.bodyHandle);
        world.removeComponent(partId, 'physicsBody');
      }
      world.removeComponent(partId, 'item');
      world.removeComponent(partId, 'renderable');
    }
  }
}
