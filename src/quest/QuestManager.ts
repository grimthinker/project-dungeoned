import { World } from '../ecs/World';
import { GameApp } from '../GameApp';
import { EventBus } from '../core/EventBus';
import { ActionDispatcher } from '../gameplay/actions/ActionDispatcher';
import { ConditionEvaluator } from '../gameplay/conditions/ConditionEvaluator';
import { StoryFlagsManager } from '../dialogue/StoryFlagsManager';
import {
  QuestGraph,
  QuestObjective,
  QuestStage,
  RuntimeQuestState,
  SerializedQuestManagerData,
} from './types';
import { getQuestGraph } from './questRegistry';
import { ActionExecutionContext } from '../gameplay/types';
import { Vec3 } from '../types';

export class QuestManager {
  private quests = new Map<string, RuntimeQuestState>();
  private trackedQuestId: string | null = null;
  private unsubs: Array<() => void> = [];

  constructor(
    private app: GameApp,
    private world: World
  ) {
    this.initListeners();
  }

  private initListeners(): void {
    // 1. Вход в триггерную зону
    this.unsubs.push(
      EventBus.on('zone:entered', ({ zoneId, entityId }) => {
        const playerId = this.app.getPlayerEntityId();
        if (entityId !== playerId) return;

        const zone = this.world.getComponent(zoneId, 'gameplayZone');
        const zoneTag = zone?.zoneTag;

        this.handleEvent('reach_zone', { zoneId, zoneTag });
      })
    );

    // 2. Подбор предмета
    this.unsubs.push(
      EventBus.on('item:picked_up', ({ pickerId, itemId }) => {
        const playerId = this.app.getPlayerEntityId();
        if (pickerId !== playerId) return;

        const item = this.world.getComponent(itemId, 'item');
        const meta = this.world.getComponent(itemId, 'meta');
        const itemName = meta?.name ?? item?.name;

        this.handleEvent('collect_item', { itemId, itemName });
      })
    );

    // 3. Смерть сущностей
    this.unsubs.push(
      EventBus.on('entity:died', ({ entityId, archetype, name }) => {
        this.handleEntityDied(entityId, archetype, name);
      })
    );

    // 4. Изменение сюжетных флагов
    this.unsubs.push(
      EventBus.on('story:flag-changed', ({ key, value }) => {
        this.handleEvent('set_flag', { key, value });
      })
    );

    // 5. Диалоги
    this.unsubs.push(
      EventBus.on('dialogue:closed', () => {
        const activeDto = this.app.simulation.dialogueSystem.getActiveDialogueDTO(this.world);
        if (activeDto) {
          this.handleEvent('talk_to_npc', {
            dialogueId: activeDto.dialogueId,
            npcId: activeDto.npcId,
          });
        }
      })
    );
  }

  public startQuest(questId: string): boolean {
    const graph = getQuestGraph(questId);
    if (!graph) return false;

    const existing = this.quests.get(questId);
    if (existing && existing.status === 'active') return false;

    // Неповторяемый квест нельзя взять заново, если он завершен или провален
    if (
      existing &&
      (existing.status === 'completed' || existing.status === 'failed') &&
      !graph.isRepeatable
    ) {
      return false;
    }

    if (existing && graph.isRepeatable) {
      StoryFlagsManager.removeFlag(`quest:${questId}:completed`);
      StoryFlagsManager.removeFlag(`quest:${questId}:failed`);
    }

    const startStage = graph.stages[graph.startStageId];
    if (!startStage) return false;

    const objProgress: RuntimeQuestState['objectiveProgress'] = {};
    for (const obj of startStage.objectives) {
      objProgress[obj.id] = { current: obj.currentCount ?? 0, completed: false };
    }

    const state: RuntimeQuestState = {
      questId,
      status: 'active',
      currentStageId: graph.startStageId,
      objectiveProgress: objProgress,
      isTracking: !this.trackedQuestId,
      startedAt: Date.now(),
    };

    this.quests.set(questId, state);
    if (state.isTracking) {
      this.trackedQuestId = questId;
    }

    StoryFlagsManager.setFlag(`quest:${questId}:active`, true);
    StoryFlagsManager.setFlag(`quest:${questId}:stage`, startStage.id);

    this.log(`Получено задание: "${graph.title}"`, 'quest');
    EventBus.emit('quest:started', { questId });

    this.executeStageActions(startStage.onEnterActions, questId);
    return true;
  }

  public setStage(questId: string, targetStageId: string): boolean {
    const state = this.quests.get(questId);
    const graph = getQuestGraph(questId);
    if (!state || !graph || state.status !== 'active') return false;

    const currentStage = graph.stages[state.currentStageId];
    const nextStage = graph.stages[targetStageId];
    if (!nextStage) return false;

    const prevStageId = state.currentStageId;
    state.currentStageId = targetStageId;
    state.objectiveProgress = {};

    for (const obj of nextStage.objectives) {
      state.objectiveProgress[obj.id] = { current: obj.currentCount ?? 0, completed: false };
    }

    StoryFlagsManager.setFlag(`quest:${questId}:stage`, targetStageId);

    this.executeStageActions(currentStage?.onCompleteActions, questId);
    this.executeStageActions(nextStage.onEnterActions, questId);

    this.log(`Задание обновлено: "${graph.title}" — ${nextStage.title}`, 'quest');
    EventBus.emit('quest:stage-changed', {
      questId,
      fromStageId: prevStageId,
      toStageId: targetStageId,
    });

    return true;
  }

  public completeQuest(questId: string): boolean {
    const state = this.quests.get(questId);
    const graph = getQuestGraph(questId);
    if (!state || !graph || state.status !== 'active') return false;

    const currentStage = graph.stages[state.currentStageId];
    this.executeStageActions(currentStage?.onCompleteActions, questId);

    state.status = 'completed';
    state.completedAt = Date.now();

    StoryFlagsManager.setFlag(`quest:${questId}:active`, false);
    StoryFlagsManager.setFlag(`quest:${questId}:completed`, true);

    this.log(`Задание выполнено: "${graph.title}"!`, 'quest');
    EventBus.emit('quest:completed', { questId });

    if (this.trackedQuestId === questId) {
      this.findNextTrackedQuest();
    }
    return true;
  }

  public failQuest(questId: string, reason?: string): boolean {
    const state = this.quests.get(questId);
    const graph = getQuestGraph(questId);
    if (!state || !graph || state.status !== 'active') return false;

    const currentStage = graph.stages[state.currentStageId];
    this.executeStageActions(currentStage?.onFailActions, questId);

    state.status = 'failed';
    state.completedAt = Date.now();

    StoryFlagsManager.setFlag(`quest:${questId}:active`, false);
    StoryFlagsManager.setFlag(`quest:${questId}:failed`, true);

    this.log(`Задание провалено: "${graph.title}"${reason ? ` (${reason})` : ''}`, 'quest');
    EventBus.emit('quest:failed', { questId, reason });

    if (this.trackedQuestId === questId) {
      this.findNextTrackedQuest();
    }
    return true;
  }

  public trackQuest(questId: string, isTracking: boolean): void {
    if (isTracking) {
      for (const q of this.quests.values()) {
        q.isTracking = q.questId === questId;
      }
      this.trackedQuestId = questId;
    } else if (this.trackedQuestId === questId) {
      const q = this.quests.get(questId);
      if (q) q.isTracking = false;
      this.trackedQuestId = null;
    }
    EventBus.emit('quest:tracking-changed', { questId, isTracking });
  }

  public getTrackedQuestId(): string | null {
    return this.trackedQuestId;
  }

  public getQuestState(questId: string): RuntimeQuestState | undefined {
    return this.quests.get(questId);
  }

  public getAllActiveQuests(): RuntimeQuestState[] {
    return Array.from(this.quests.values()).filter((q) => q.status === 'active');
  }

  public getAllQuestsList(): RuntimeQuestState[] {
    return Array.from(this.quests.values());
  }

  private handleEvent(type: string, payload: any): void {
    for (const state of this.quests.values()) {
      if (state.status !== 'active') continue;
      const graph = getQuestGraph(state.questId);
      if (!graph) continue;

      const stage = graph.stages[state.currentStageId];
      if (!stage) continue;

      let stageProgressChanged = false;

      for (const obj of stage.objectives) {
        if (obj.type !== type) continue;
        const progress = state.objectiveProgress[obj.id] || { current: 0, completed: false };
        if (progress.completed) continue;

        let matched = false;
        if (type === 'reach_zone') {
          matched =
            Boolean(obj.targetZoneTag && obj.targetZoneTag === payload.zoneTag) ||
            Boolean(obj.targetEntityId && obj.targetEntityId === payload.zoneId);
        } else if (type === 'collect_item') {
          matched =
            Boolean(obj.targetKey && payload.itemName?.includes(obj.targetKey)) ||
            Boolean(obj.targetEntityId && obj.targetEntityId === payload.itemId);
        } else if (type === 'set_flag') {
          matched = Boolean(obj.targetKey && obj.targetKey === payload.key);
          if (matched && obj.targetValue !== undefined) {
            matched = obj.targetValue === payload.value;
          }
        } else if (type === 'talk_to_npc') {
          matched =
            Boolean(obj.targetKey && obj.targetKey === payload.dialogueId) ||
            Boolean(obj.targetEntityId && obj.targetEntityId === payload.npcId);
        }

        if (matched) {
          const req = obj.requiredCount ?? 1;
          progress.current = Math.min(req, progress.current + 1);
          if (progress.current >= req) {
            progress.completed = true;
          }
          state.objectiveProgress[obj.id] = progress;
          stageProgressChanged = true;

          this.log(`Цель обновлена: ${obj.title} (${progress.current}/${req})`, 'quest');
          EventBus.emit('quest:objective-updated', {
            questId: state.questId,
            stageId: stage.id,
            objectiveId: obj.id,
            current: progress.current,
            max: req,
          });

          // ВЕТВЛЕНИЕ: если у выполненной задачи есть своя ветка перехода
          if (progress.completed && obj.nextStageId) {
            this.setStage(state.questId, obj.nextStageId);
            return;
          }
        }
      }

      if (stageProgressChanged) {
        this.checkStageCompletion(state, stage, graph);
      }
    }
  }

  private handleEntityDied(entityId: string, archetype?: string, name?: string): void {
    for (const state of this.quests.values()) {
      if (state.status !== 'active') continue;
      const graph = getQuestGraph(state.questId);
      const stage = graph?.stages[state.currentStageId];
      if (!stage) continue;

      // 1. Проверка условий провала по гибели ключевых сущностей
      if (stage.failIfDeadEntityIds?.includes(entityId)) {
        this.failQuest(state.questId, `Погиб ключевой персонаж: ${name || entityId}`);
        continue;
      }

      // 2. Зачет целей типа kill_entity
      for (const obj of stage.objectives) {
        if (obj.type !== 'kill_entity') continue;
        const progress = state.objectiveProgress[obj.id] || { current: 0, completed: false };
        if (progress.completed) continue;

        let matched = false;
        if (obj.targetEntityId && obj.targetEntityId === entityId) matched = true;
        else if (obj.targetTag && (archetype === obj.targetTag || name?.includes(obj.targetTag)))
          matched = true;

        if (matched) {
          const req = obj.requiredCount ?? 1;
          progress.current = Math.min(req, progress.current + 1);
          if (progress.current >= req) progress.completed = true;
          state.objectiveProgress[obj.id] = progress;

          this.log(`Цель обновлена: ${obj.title} (${progress.current}/${req})`, 'quest');
          EventBus.emit('quest:objective-updated', {
            questId: state.questId,
            stageId: stage.id,
            objectiveId: obj.id,
            current: progress.current,
            max: req,
          });

          // ВЕТВЛЕНИЕ: если убийство этой цели открывает персональную ветку
          if (progress.completed && obj.nextStageId) {
            this.setStage(state.questId, obj.nextStageId);
            return;
          }
        }
      }

      this.checkStageCompletion(state, stage, graph!);
    }
  }

  private checkStageCompletion(
    state: RuntimeQuestState,
    stage: QuestStage,
    graph: QuestGraph
  ): void {
    const isAnyMode = stage.completionMode === 'any';

    const requiredObjectives = stage.objectives.filter((o) => !o.isOptional);
    if (requiredObjectives.length === 0) return;

    let isFinished = false;
    if (isAnyMode) {
      isFinished = requiredObjectives.some((o) => state.objectiveProgress[o.id]?.completed);
    } else {
      isFinished = requiredObjectives.every((o) => state.objectiveProgress[o.id]?.completed);
    }

    if (isFinished) {
      if (stage.nextStageId) {
        this.setStage(state.questId, stage.nextStageId);
      } else {
        this.completeQuest(state.questId);
      }
    }
  }

  private executeStageActions(actions: any[] | undefined, questId: string): void {
    if (!actions || actions.length === 0) return;
    const ctx: ActionExecutionContext = {
      world: this.world,
      app: this.app,
      activatorEntityId: this.app.getPlayerEntityId() ?? undefined,
    };
    ActionDispatcher.executeAll(actions, ctx);
  }

  private log(text: string, type: 'quest' | 'dialogue' | 'combat' | 'system'): void {
    EventBus.emit('log:entry', { text, type, timestamp: Date.now() });
  }

  private findNextTrackedQuest(): void {
    const next = this.getAllActiveQuests()[0];
    if (next) {
      this.trackQuest(next.questId, true);
    } else {
      this.trackedQuestId = null;
    }
  }

  public getActiveWaypoints(): Array<{
    x: number;
    z: number;
    title: string;
    questId: string;
    entityId?: string;
  }> {
    if (!this.trackedQuestId) return [];
    const state = this.quests.get(this.trackedQuestId);
    if (!state || state.status !== 'active') return [];

    const graph = getQuestGraph(state.questId);
    const stage = graph?.stages[state.currentStageId];
    if (!stage) return [];

    const result: Array<{
      x: number;
      z: number;
      title: string;
      questId: string;
      entityId?: string;
    }> = [];

    for (const obj of stage.objectives) {
      const progress = state.objectiveProgress[obj.id];
      if (progress?.completed) continue;

      if (obj.targetEntityId) {
        const trans = this.world.getComponent(obj.targetEntityId, 'transform');
        if (trans) {
          result.push({
            x: trans.x,
            z: trans.z,
            title: obj.title,
            questId: state.questId,
            entityId: obj.targetEntityId,
          });
          continue;
        }
      }

      if (obj.targetZoneTag) {
        for (const [zId, { gameplayZone, transform }] of this.world.getEntitiesWith(
          'gameplayZone',
          'transform'
        )) {
          if (gameplayZone.zoneTag === obj.targetZoneTag) {
            result.push({
              x: transform.x,
              z: transform.z,
              title: obj.title,
              questId: state.questId,
              entityId: zId,
            });
            break;
          }
        }
        continue;
      }

      if (obj.targetPos) {
        result.push({
          x: obj.targetPos.x,
          z: obj.targetPos.z,
          title: obj.title,
          questId: state.questId,
        });
      }
    }

    return result;
  }

  // --- DEV TOOLS / DEBUG API ---
  public debugForceStart(questId: string): void {
    this.startQuest(questId);
  }

  public debugCompleteObjective(questId: string, objectiveId: string): void {
    const state = this.quests.get(questId);
    const graph = getQuestGraph(questId);
    const stage = graph?.stages[state?.currentStageId ?? ''];
    if (!state || !stage || !graph) return;

    const prog = state.objectiveProgress[objectiveId];
    if (prog) {
      prog.completed = true;
      const obj = stage.objectives.find((o) => o.id === objectiveId);
      if (obj) prog.current = obj.requiredCount ?? 1;
      this.checkStageCompletion(state, stage, graph);
    }
  }

  public debugJumpToStage(questId: string, stageId: string): void {
    this.setStage(questId, stageId);
  }

  public debugCompleteQuest(questId: string): void {
    this.completeQuest(questId);
  }

  public debugResetQuest(questId: string): void {
    this.quests.delete(questId);
    StoryFlagsManager.removeFlag(`quest:${questId}:active`);
    StoryFlagsManager.removeFlag(`quest:${questId}:completed`);
    StoryFlagsManager.removeFlag(`quest:${questId}:failed`);
    StoryFlagsManager.removeFlag(`quest:${questId}:stage`);
    if (this.trackedQuestId === questId) this.trackedQuestId = null;
    this.log(`Квест сброшен: ${questId}`, 'system');
  }

  public serialize(): SerializedQuestManagerData {
    return {
      trackedQuestId: this.trackedQuestId,
      quests: Object.fromEntries(this.quests.entries()),
    };
  }

  public deserialize(data?: SerializedQuestManagerData): void {
    this.quests.clear();
    this.trackedQuestId = null;
    if (!data) return;

    this.trackedQuestId = data.trackedQuestId ?? null;
    if (data.quests && typeof data.quests === 'object') {
      for (const [qId, state] of Object.entries(data.quests)) {
        this.quests.set(qId, { ...state });
      }
    }
  }

  public update(_dt: number): void {
    // Реактивная логика управляется событиями EventBus
  }

  public clear(): void {
    this.quests.clear();
    this.trackedQuestId = null;
  }

  public destroy(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.clear();
  }
}
