import { QuestGraph } from './types';
import { EventBus } from '../core/EventBus';

export const INITIAL_QUESTS: Record<string, QuestGraph> = {
  fetch_dog_quest: {
    id: 'fetch_dog_quest',
    title: 'Верный друг',
    description: 'Помогите Хозяину поиграть с собаками в апорт и осмотрите окрестности.',
    category: 'side',
    isRepeatable: true,
    startStageId: 'stage_find_sticks',
    stages: {
      stage_find_sticks: {
        id: 'stage_find_sticks',
        title: 'Собрать мячики',
        description: 'Найдите и подберите мячик для апорта.',
        completionMode: 'all',
        objectives: [
          {
            id: 'obj_pickup_ball',
            type: 'collect_item',
            title: 'Подобрать мячик для апорта',
            targetKey: 'Мячик для апорта',
            requiredCount: 1,
            currentCount: 0,
          },
        ],
        onCompleteActions: [{ type: 'set_flag', payload: { key: 'has_fetch_ball', value: true } }],
        nextStageId: 'stage_talk_master',
        editorPosition: { x: 100, y: 150 },
      },
      stage_talk_master: {
        id: 'stage_talk_master',
        title: 'Разговор с Хозяином',
        description: 'Подойдите к Хозяину и начните диалог.',
        completionMode: 'all',
        objectives: [
          {
            id: 'obj_talk_master',
            type: 'talk_to_npc',
            title: 'Поговорить с Хозяином',
            targetKey: 'default_npc_dialogue',
            requiredCount: 1,
            currentCount: 0,
          },
        ],
        onCompleteActions: [
          { type: 'set_flag', payload: { key: 'master_conversed', value: true } },
        ],
        nextStageId: 'stage_explore_camp',
        editorPosition: { x: 520, y: 150 },
      },
      stage_explore_camp: {
        id: 'stage_explore_camp',
        title: 'Осмотр поляны',
        description: 'Дойдите до зоны сбора лагеря.',
        completionMode: 'all',
        objectives: [
          {
            id: 'obj_reach_camp',
            type: 'reach_zone',
            title: 'Дойти до зоны лагеря',
            targetZoneTag: 'camp_gathering',
            requiredCount: 1,
            currentCount: 0,
          },
        ],
        onCompleteActions: [{ type: 'set_flag', payload: { key: 'camp_explored', value: true } }],
        nextStageId: null,
        editorPosition: { x: 940, y: 150 },
      },
    },
  },
};

export const QUEST_REGISTRY: Record<string, QuestGraph> = {
  ...INITIAL_QUESTS,
};

export function getQuestGraph(id: string): QuestGraph | undefined {
  return QUEST_REGISTRY[id];
}

export function getAllQuests(): Array<{ id: string; title: string }> {
  return Object.values(QUEST_REGISTRY).map((q) => ({ id: q.id, title: q.title }));
}

export function getAllQuestGraphs(): Record<string, QuestGraph> {
  return { ...QUEST_REGISTRY };
}

export function registerQuest(graph: QuestGraph): void {
  QUEST_REGISTRY[graph.id] = graph;
  EventBus.emit('quest:registry-updated');
}

export function updateQuest(id: string, graph: QuestGraph): void {
  if (id !== graph.id && QUEST_REGISTRY[id]) {
    delete QUEST_REGISTRY[id];
  }
  QUEST_REGISTRY[graph.id] = graph;
  EventBus.emit('quest:registry-updated');
}

export function deleteQuest(id: string): boolean {
  if (id === 'fetch_dog_quest') {
    return false;
  }
  if (QUEST_REGISTRY[id]) {
    delete QUEST_REGISTRY[id];
    EventBus.emit('quest:registry-updated');
    return true;
  }
  return false;
}

export function createEmptyQuest(forcedId?: string, title?: string): QuestGraph {
  const id = forcedId || `quest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const startStageId = 'stage_start';
  const newGraph: QuestGraph = {
    id,
    title: title || 'Новое задание',
    description: '',
    category: 'side',
    startStageId,
    stages: {
      [startStageId]: {
        id: startStageId,
        title: 'Начальный этап',
        description: 'Описание первого этапа задания',
        completionMode: 'all',
        objectives: [
          {
            id: 'obj_1',
            type: 'reach_zone',
            title: 'Достичь цели',
            requiredCount: 1,
            currentCount: 0,
          },
        ],
        nextStageId: null,
        editorPosition: { x: 120, y: 120 },
      },
    },
  };
  registerQuest(newGraph);
  return newGraph;
}

export function exportQuestToJson(id: string): string {
  const graph = QUEST_REGISTRY[id];
  if (!graph) throw new Error(`Квест ${id} не найден.`);
  return JSON.stringify(graph, null, 2);
}

export function importQuestFromJson(jsonString: string): QuestGraph {
  const parsed = JSON.parse(jsonString) as QuestGraph;
  if (!parsed.id || !parsed.stages || !parsed.startStageId) {
    throw new Error('Некорректный формат файла квеста.');
  }
  registerQuest(parsed);
  return parsed;
}

export function loadQuests(quests?: Record<string, QuestGraph>): void {
  for (const k of Object.keys(QUEST_REGISTRY)) {
    if (!INITIAL_QUESTS[k]) {
      delete QUEST_REGISTRY[k];
    }
  }
  for (const [k, v] of Object.entries(INITIAL_QUESTS)) {
    QUEST_REGISTRY[k] = v;
  }
  if (quests && typeof quests === 'object') {
    for (const [id, graph] of Object.entries(quests)) {
      if (graph && graph.id && graph.stages) {
        QUEST_REGISTRY[id] = graph;
      }
    }
  }
  EventBus.emit('quest:registry-updated');
}
