import { World } from '../World';
import { EntityId } from '../types';
import { Blackboard, BTLogicComponent } from '../../ai/core';
import { createBTAISystem } from '../../ai/system';
import { BEHAVIOR_TREES } from '../../ai/trees_library';
import { EntityAdapter } from '../../EntityAdapter';
import { ConsciousnessState } from '../types';
import { IAIWorld, IAIAgent, FetchStickInfo } from '../../ai/ports';
import { getTerrainHeightAt } from '../components/terrain';
import { GlobalInput } from '../../input/GlobalInput';
import { getRandomPointInZone, getZoneCenter } from '../components/zone';
import { Vec3 } from '../../types';
import { getRootOwner } from '../utils/hierarchy';

export class AISystem implements IAIWorld {
  private aiSystem: { update: (dt: number) => void };
  private world!: World;
  private adapters: Map<EntityId, EntityAdapter> = new Map();

  constructor() {
    this.aiSystem = createBTAISystem(this);
  }

  // === IAIWorld Implementation ===

  public getAgent(id: string): IAIAgent | undefined {
    return this.getEntityAdapter(id);
  }

  public getAllAgents(): IAIAgent[] {
    const result: IAIAgent[] = [];
    const entities = this.world.getEntitiesWith('meta', 'transform', 'input', 'aiStats', 'health');
    for (const [id, comps] of entities) {
      const brain = this.world.getComponent(id, 'brain');
      if (brain && brain.behaviorId !== comps.aiStats.behavior.current) {
        this.initBotBrain(this.world, id, comps.aiStats.behavior.current);
      }
      const adapter = this.getEntityAdapter(id);
      if (adapter && adapter.brain) {
        const consciousnessComp = this.world.getComponent(id, 'consciousness');
        const state = consciousnessComp ? consciousnessComp.state : ConsciousnessState.CONSCIOUS;
        if (state === ConsciousnessState.CONSCIOUS) {
          result.push(adapter);
        }
      }
    }
    // Очистка кэша от удаленных из мира сущностей
    for (const id of this.adapters.keys()) {
      if (!this.world.hasEntity(id)) {
        this.adapters.delete(id);
      }
    }
    return result;
  }

  public getAgentsByBehavior(behaviorId: string): IAIAgent[] {
    return this.getAllAgents().filter((a) => (a as EntityAdapter).brain?.behaviorId === behaviorId);
  }

  public getPath(start: Vec3, end: Vec3, radius?: number): Promise<Vec3[]> {
    return Promise.resolve([{ x: end.x, y: end.y, z: end.z }]); // Навигационная сетка (Navigation Mesh) временно заглушена
  }

  public getEntityPos(id: string): Vec3 | null {
    const t = this.world.getComponent(id, 'transform');
    return t ? { x: t.x, y: t.y, z: t.z } : null;
  }

  public getEntityHeight(id: string): number {
    return this.world.getComponent(id, 'physicsStats')?.height?.current ?? 1.8;
  }

  public getEntityRadius(id: string): number {
    return this.world.getComponent(id, 'physicsStats')?.radius?.current ?? 0.4;
  }

  public isEntityAlive(id: string): boolean {
    return this.world.getComponent(id, 'health')?.isAlive ?? false;
  }

  public getTerrainHeight(x: number, z: number): number | null {
    const tEnts = this.world.getEntitiesWith('terrain');
    if (tEnts.length > 0) {
      return getTerrainHeightAt(tEnts[0][1].terrain, x, z);
    }
    return null;
  }

  public getPressedKeys(): string[] {
    return Array.from(GlobalInput.keys);
  }

  public getEntityOwnerId(id: string): string | null {
    const rawOwner = this.world.getComponent(id, 'ownership')?.ownerId;
    return rawOwner ? getRootOwner(this.world, rawOwner) : null;
  }

  public findFetchSticks(masterId: string): FetchStickInfo[] {
    const results: FetchStickInfo[] = [];
    for (const [sId, comps] of this.world.getEntitiesWith('fetchStick', 'transform')) {
      if (comps.fetchStick.ownerMasterId === masterId) {
        const rawOwner = this.world.getComponent(sId, 'ownership')?.ownerId;
        const rootOwner = rawOwner ? getRootOwner(this.world, rawOwner) : undefined;
        results.push({
          id: sId,
          pos: { x: comps.transform.x, y: comps.transform.y, z: comps.transform.z },
          state: comps.fetchStick.state,
          ownerId: rootOwner ?? undefined,
        });
      }
    }
    return results;
  }

  public isEntityInZone(entityId: string, zoneId: string): boolean {
    const zone = this.world.getComponent(zoneId, 'gameplayZone');
    if (zone) return zone.occupantIds.includes(entityId);

    const shape = this.world.getComponent(zoneId, 'zoneShape');
    const transform = this.world.getComponent(zoneId, 'transform');
    if (!shape || !transform) return false;

    const pos = this.getEntityPos(entityId);
    if (!pos) return false;

    const center = getZoneCenter(transform, shape);
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dz = pos.z - center.z;

    if (shape.shapeType === 'sphere') {
      return Math.hypot(dx, dy, dz) <= shape.radius;
    }
    if (shape.shapeType === 'cylinder') {
      return Math.hypot(dx, dz) <= shape.radius && Math.abs(dy) <= shape.height / 2;
    }
    return (
      Math.abs(dx) <= shape.width / 2 &&
      Math.abs(dz) <= shape.depth / 2 &&
      Math.abs(dy) <= shape.height / 2
    );
  }

  public getRandomPointInZone(zoneId: string): Vec3 | null {
    const shape = this.world.getComponent(zoneId, 'zoneShape');
    const transform = this.world.getComponent(zoneId, 'transform');
    if (!shape || !transform) return null;
    const tEnts = this.world.getEntitiesWith('terrain');
    const terrain = tEnts.length > 0 ? tEnts[0][1].terrain : undefined;
    return getRandomPointInZone(transform, shape, terrain);
  }

  // === Внутренние методы системы ИИ ===

  public initBotBrain(world: World, id: EntityId, behaviorId: string): void {
    const entity = world.getEntity(id);
    if (!entity) return;

    const treeFactory = BEHAVIOR_TREES[behaviorId] || BEHAVIOR_TREES['IdleTree'];

    const brain: BTLogicComponent = {
      root_node: treeFactory(),
      blackboard: new Blackboard(),
      event_queue: [],
      relations: {},
      behaviorId: behaviorId,
    };

    world.addComponent(id, 'brain' as any, brain);
  }

  public update(dt: number, world: World): void {
    this.world = world;

    // Предварительно пробрасываем локальный dt во все активные адаптеры
    const activeAgents = this.getAllAgents() as EntityAdapter[];
    for (const agent of activeAgents) {
      agent.dt = dt * agent.timeScaleMultiplier;
    }

    this.aiSystem.update(dt);
  }

  public unregisterEntity(id: EntityId): void {
    this.adapters.delete(id);
  }

  public clear(): void {
    this.adapters.clear();
  }

  private getEntityAdapter(id: EntityId): EntityAdapter | undefined {
    const ent = this.world.getEntity(id);
    if (!ent) {
      this.adapters.delete(id);
      return undefined;
    }

    let adapter = this.adapters.get(id);
    if (!adapter) {
      adapter = new EntityAdapter(id, this.world, this);
      this.adapters.set(id, adapter);
    }
    return adapter;
  }
}
