import { Point, Vec3 } from '../types';
import { EventBus } from '../core/EventBus';
import { EntityAdapter } from '../EntityAdapter';
import { GameMode } from '../config/gameConfig';
import { EDITOR_CONFIG } from '../config/editorConfig';
import { VISUAL_CONFIG } from '../config/visualConfig';
import type { ISelectionHostContext } from '../core/contexts';
import { getRootOwner } from '../ecs/utils/hierarchy';
import { LOGIC_CONFIG } from '../ai/config';

export class SelectionController {
  public selectedEntityId: string | null = null;
  public selectedEntityIds: Set<string> = new Set();
  public hoveredEntityId: string | null = null;

  private _cachedSelectedEntity: EntityAdapter | null = null;
  public marqueeBox: { start: Point; current: Point } | null = null;

  constructor(private host: ISelectionHostContext) {}

  public get selectedEntity(): EntityAdapter | null {
    if (!this.selectedEntityId) return null;
    if (!this.host.world.getEntity(this.selectedEntityId)) {
      this.selectedEntityId = null;
      this._cachedSelectedEntity = null;
      return null;
    }
    if (!this._cachedSelectedEntity || this._cachedSelectedEntity.id !== this.selectedEntityId) {
      this._cachedSelectedEntity = new EntityAdapter(
        this.selectedEntityId,
        this.host.world,
        this.host.aiSystem
      );
    }
    return this._cachedSelectedEntity;
  }

  public get hoveredEntity(): EntityAdapter | null {
    if (!this.hoveredEntityId) return null;
    if (!this.host.world.getEntity(this.hoveredEntityId)) {
      this.hoveredEntityId = null;
      return null;
    }
    return new EntityAdapter(this.hoveredEntityId, this.host.world, this.host.aiSystem);
  }

  public selectEntity(id: string | null, clearGroup: boolean = false): void {
    let changed = false;

    if (clearGroup) {
      if (this.selectedEntityIds.size !== (id ? 1 : 0) || (id && !this.selectedEntityIds.has(id))) {
        changed = true;
      }
      this.selectedEntityIds.clear();
      if (id) this.selectedEntityIds.add(id);
    } else if (id && !this.selectedEntityIds.has(id)) {
      this.selectedEntityIds.add(id);
      changed = true;
    }

    if (this.selectedEntityId !== id) {
      this.selectedEntityId = id;
      this._cachedSelectedEntity = id
        ? new EntityAdapter(id, this.host.world, this.host.aiSystem)
        : null;
      changed = true;
    }

    if (changed) {
      this.emitSelectionChanged();
      this.host.updateBTData(true);
    }
  }

  public selectEntities(ids: string[]): void {
    this.selectedEntityIds = new Set(ids);
    this.selectEntity(ids.length > 0 ? ids[0] : null, false);
    this.emitSelectionChanged();
  }

  public restoreSelection(id: string | null, ids: string[]): void {
    this.selectedEntityIds = new Set(ids);
    this.selectEntity(id, false);
  }

  public deselectEntity(id: string): void {
    this.selectedEntityIds.delete(id);
    if (this.selectedEntityId === id) {
      const next = this.selectedEntityIds.values().next().value ?? null;
      this.selectEntity(next, false);
    } else {
      this.emitSelectionChanged();
    }
  }

  public startMarquee(startPoint: Point): void {
    this.marqueeBox = { start: startPoint, current: startPoint };
  }

  public updateMarquee(currentPoint: Point): void {
    if (this.marqueeBox) {
      this.marqueeBox.current = currentPoint;
    }
  }

  public endMarquee(typeFilters: Record<string, boolean>): string[] {
    if (!this.marqueeBox) return [];
    const start = this.marqueeBox.start;
    const current = this.marqueeBox.current;
    this.marqueeBox = null;

    if (Math.hypot(current.x - start.x, current.y - start.y) < EDITOR_CONFIG.marqueeThresholdPx) {
      this.selectEntity(null, true);
      return [];
    }

    const rect = this.host.canvas.getBoundingClientRect();
    const startX = start.x - rect.left;
    const startY = start.y - rect.top;
    const currentX = current.x - rect.left;
    const currentY = current.y - rect.top;

    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxY = Math.max(startY, currentY);

    const filteredIds: string[] = [];
    const entities = this.host.world.getEntitiesWith('transform');

    for (const [id, { transform }] of entities) {
      const renderable = this.host.world.getComponent(id, 'renderable');
      if (renderable && !renderable.isVisible) continue;

      const tag = this.host.world.getComponent(id, 'tag');
      const meta = this.host.world.getComponent(id, 'meta');
      const archetype = tag?.archetype ?? meta?.entityType ?? 'creature';

      if (typeFilters && typeFilters[archetype] === false) {
        continue;
      }

      if (this.host.renderer.projectToScreen) {
        const meshHeight = archetype === 'creature' ? 0.9 : 0.2;
        const screenPos = this.host.renderer.projectToScreen({
          x: transform.x,
          y: transform.y + meshHeight,
          z: transform.z,
        });

        if (screenPos) {
          if (
            screenPos.x >= minX &&
            screenPos.x <= maxX &&
            screenPos.y >= minY &&
            screenPos.y <= maxY
          ) {
            filteredIds.push(id);
          }
        }
      }
    }

    this.selectedEntityIds = new Set(filteredIds);
    this.selectEntity(filteredIds.length > 0 ? filteredIds[0] : null, false);
    return filteredIds;
  }

  public hoverEntity(id: string | null): void {
    if (this.hoveredEntityId === id) return;
    this.hoveredEntityId = id;
  }

  public selectGameTarget(id: string | null): boolean {
    const playerId = this.host.getPlayerEntityId();

    if (!id) {
      if (this.selectedEntityId !== null) {
        this.selectEntity(null, true);
        if (playerId) {
          const bb = this.host.world.getComponent(playerId, 'brain')?.blackboard;
          if (bb) bb.remove('selectedId');
        }
      }
      return true;
    }

    // Запрещаем игроку выбирать самого себя
    const rootId = getRootOwner(this.host.world, id) ?? id;
    if (rootId === playerId || id === playerId) {
      return false;
    }

    const entity = this.host.world.getEntity(rootId);
    if (!entity) return false;

    // Нельзя выбирать предметы, находящиеся в руках или инвентаре
    if (this.host.world.getComponent(rootId, 'ownership')) {
      return false;
    }

    // В игровом режиме разрешено выбирать только интерактивные сущности
    const hasInteractable = this.host.world.getComponent(rootId, 'interactable') !== undefined;
    const arch = entity.tag?.archetype ?? entity.meta?.entityType;
    if (!hasInteractable && arch !== 'creature' && arch !== 'item' && arch !== 'bodyPart') {
      return false;
    }

    // Проверяем расстояние от игрока до цели с учетом detectDist
    if (playerId) {
      const playerTrans = this.host.world.getComponent(playerId, 'transform');
      const targetTrans = this.host.world.getComponent(rootId, 'transform');
      if (playerTrans && targetTrans) {
        const dx = targetTrans.x - playerTrans.x;
        const dy = targetTrans.y - playerTrans.y;
        const dz = targetTrans.z - playerTrans.z;
        const dist = Math.hypot(dx, dy, dz);

        const playerPerception = this.host.world.getComponent(playerId, 'perception');
        const playerAi = this.host.world.getComponent(playerId, 'aiStats');
        const detectDist =
          playerPerception?.visionMaxDistance ??
          playerAi?.stats?.detectDist ??
          LOGIC_CONFIG.detectDist;

        if (dist > detectDist) {
          return false;
        }
      }

      const bb = this.host.world.getComponent(playerId, 'brain')?.blackboard;
      if (bb) {
        bb.set('selectedId', rootId);
      }
    }

    this.selectEntity(rootId, true);
    return true;
  }

  public pickEntityAt(worldPoint: Vec3, clientX?: number, clientY?: number): string | null {
    const isUnpickable = (id: string | null | undefined): boolean => {
      if (!id) return true;
      if (id === 'terrain' || id === 'environment') return true;
      const entity = this.host.world.getEntity(id);
      if (!entity) return false;
      if (entity.terrain !== undefined || entity.environment !== undefined) return true;
      const arch = entity.tag?.archetype ?? entity.meta?.entityType;
      return arch === 'terrain' || arch === 'environment';
    };

    if (clientX !== undefined && clientY !== undefined) {
      // 1. Приоритетный клик по мешам Three.js (позволяет выбирать конкретные части тела partId)
      if (this.host.renderer.pickEntity) {
        const picked = this.host.renderer.pickEntity(clientX, clientY);
        if (picked && !isUnpickable(picked)) return picked;
      }

      // 2. Физический рейкаст Rapier3D (страховка при промахе сквозь меш или клике по коллайдерам)
      if (this.host.raycastPhysics) {
        const hit = this.host.raycastPhysics(clientX, clientY);
        if (hit && hit.entityId && !isUnpickable(hit.entityId)) {
          return hit.entityId;
        }
      }
    }
    return null;
  }

  public pickNearestEntity(
    worldPoint: Vec3,
    maxDistanceRatio: number = VISUAL_CONFIG.creatureHoverScreenRatio ?? 0.02,
    clientX?: number,
    clientY?: number
  ): string | null {
    if (clientX !== undefined && clientY !== undefined) {
      if (this.host.renderer.pickEntity) {
        const picked = this.host.renderer.pickEntity(clientX, clientY);
        if (picked) return picked;
      }
      if (this.host.raycastPhysics) {
        const hit = this.host.raycastPhysics(clientX, clientY);
        if (hit && hit.entityId) return hit.entityId;
      }
    }

    // Фолбэк по дистанции 3D (если кликнули в пределах допуска рядом с предметом)
    const isEditor = this.host.gameMode === GameMode.EDITOR;
    const maxWorldDist = 2.0; // 2 метра

    const entities = this.host.world.getEntitiesWith('transform');
    let nearestId: string | null = null;
    let minDistance = Infinity;

    for (const [entityId, { transform }] of entities) {
      const renderable = this.host.world.getComponent(entityId, 'renderable');
      if (renderable && !renderable.isVisible) continue;

      const physicsBody = this.host.world.getComponent(entityId, 'physicsBody');
      const physStats = this.host.world.getComponent(entityId, 'physicsStats');
      if (!isEditor && !physicsBody && !physStats) continue;

      const dx = transform.x - worldPoint.x;
      const dy = transform.y - worldPoint.y;
      const dz = transform.z - worldPoint.z;
      const dist = Math.hypot(dx, dy, dz);

      const radius = physStats?.radius.current ?? 0.4;
      const distToBoundary = Math.max(0, dist - radius);

      if (distToBoundary < minDistance && distToBoundary <= maxWorldDist) {
        minDistance = distToBoundary;
        nearestId = entityId;
      }
    }

    return nearestId;
  }

  public emitSelectionChanged(): void {
    EventBus.emit('selection:changed', {
      selectedEntityId: this.selectedEntityId,
      selectedEntityIds: Array.from(this.selectedEntityIds),
    });
  }

  public clear(): void {
    this.selectedEntityIds.clear();
    this.selectedEntityId = null;
    this.hoveredEntityId = null;
    this._cachedSelectedEntity = null;
    this.marqueeBox = null;
    this.emitSelectionChanged();
  }
}
