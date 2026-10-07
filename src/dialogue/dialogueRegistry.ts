import { DialogueGraph } from './types';
import { EventBus } from '../core/EventBus';

export const INITIAL_DIALOGUES: Record<string, DialogueGraph> = {
  branching_test_dialogue: {
    id: 'branching_test_dialogue',
    title: 'Тест ветвления (Стражник)',
    startNodeId: 'node_start',
    nodes: {
      node_start: {
        id: 'node_start',
        nodeType: 'text',
        speaker: 'npc',
        speakerName: 'Стражник',
        text: 'Стой! Проход только по пропускам или за звонкую монету. Что у тебя есть?',
        editorPosition: { x: 80, y: 160 },
        choices: [
          {
            id: 'choice_inspect_me',
            text: 'Проверь мои карманы и грамоту.',
            targetNodeId: 'branch_guard_check',
          },
          {
            id: 'choice_leave',
            text: 'У меня ничего нет, я ухожу.',
            targetNodeId: null,
          },
        ],
      },
      branch_guard_check: {
        id: 'branch_guard_check',
        nodeType: 'branch',
        name: 'Проверка пропуска / золота',
        editorPosition: { x: 480, y: 130 },
        branchCases: [
          {
            id: 'case_has_pass',
            name: 'Есть пропуск',
            conditions: [{ type: 'flag_has', key: 'has_castle_pass' }],
            targetNodeId: 'node_pass_success',
          },
          {
            id: 'case_has_gold',
            name: 'Есть монета',
            conditions: [{ type: 'flag_has', key: 'has_gold_coin' }],
            targetNodeId: 'node_bribe_success',
          },
        ],
        defaultTargetNodeId: 'node_check_failed',
      },
      node_pass_success: {
        id: 'node_pass_success',
        nodeType: 'text',
        speaker: 'npc',
        speakerName: 'Стражник',
        text: 'О, королевская грамота! Проходи, почтенный путник, ворота открыты.',
        editorPosition: { x: 880, y: 30 },
        choices: [
          {
            id: 'choice_enter',
            text: 'Благодарю за службу.',
            targetNodeId: null,
          },
        ],
      },
      node_bribe_success: {
        id: 'node_bribe_success',
        nodeType: 'text',
        speaker: 'npc',
        speakerName: 'Стражник',
        text: 'Хм, золото настоящее... Ладно, на этот раз проходи, но не попадайся капитану на глаза.',
        editorPosition: { x: 880, y: 200 },
        choices: [
          {
            id: 'choice_bribe_enter',
            text: 'Договорились. (Пройти в ворота)',
            targetNodeId: null,
          },
        ],
      },
      node_check_failed: {
        id: 'node_check_failed',
        nodeType: 'text',
        speaker: 'npc',
        speakerName: 'Стражник',
        text: 'У тебя ни гроша в кармане и никакой грамоты! Проваливай, пока я не позвал караул!',
        editorPosition: { x: 880, y: 370 },
        choices: [
          {
            id: 'choice_apology_leave',
            text: 'Прошу прощения, ухожу.',
            targetNodeId: null,
          },
        ],
      },
    },
  },
  dog_bark_dialogue: {
    id: 'dog_bark_dialogue',
    title: 'Собака',
    startNodeId: 'node_bark',
    nodes: {
      node_bark: {
        id: 'node_bark',
        speaker: 'npc',
        speakerName: 'Собака',
        text: 'Гав!',
        editorPosition: { x: 100, y: 150 },
        choices: [
          {
            id: 'choice_out',
            text: 'Окей',
            targetNodeId: null,
          },
        ],
      },
    },
  },
  default_npc_dialogue: {
    id: 'default_npc_dialogue',
    title: 'Разговор с жителем',
    startNodeId: 'node_start',
    nodes: {
      node_start: {
        id: 'node_start',
        speaker: 'npc',
        text: 'Здравствуй, путник! Чем могу тебе помочь в этих краях?',
        editorPosition: { x: 100, y: 150 },
        choices: [
          {
            id: 'choice_who',
            text: 'Кто ты такой?',
            targetNodeId: 'node_who',
          },
          {
            id: 'choice_follow',
            text: 'Мне пригодится спутник. Пойдешь со мной?',
            targetNodeId: 'node_follow',
            conditions: [{ type: 'flag_not', key: 'npc_is_follower' }],
            actions: [
              { type: 'set_flag', payload: { key: 'npc_is_follower', value: true } },
              { type: 'change_ai', payload: { entity: 'npc', behavior: 'FollowerTree' } },
            ],
          },
          {
            id: 'choice_provoke',
            text: 'Кошелек или жизнь! Сдавайся!',
            targetNodeId: 'node_provoke',
            actions: [
              { type: 'set_flag', payload: { key: 'npc_provoked', value: true } },
              { type: 'change_ai', payload: { entity: 'npc', behavior: 'AttackerTree' } },
            ],
          },
          {
            id: 'choice_secret',
            text: 'Я знаю, что ты охраняешь тайный проход...',
            targetNodeId: 'node_secret',
            conditions: [{ type: 'flag_has', key: 'knows_secret_pass' }],
          },
          {
            id: 'choice_leave',
            text: 'Я просто осматриваюсь. Бывай.',
            targetNodeId: null,
          },
        ],
      },
      node_who: {
        id: 'node_who',
        speaker: 'npc',
        text: 'Я местный страж. Охраняю здешние тропы и слежу, чтобы лесные твари не нападали на мирных путников.',
        editorPosition: { x: 500, y: 40 },
        choices: [
          {
            id: 'choice_learn_secret',
            text: 'Говорят, в этих руинах спрятан тайный проход?',
            targetNodeId: 'node_who_secret',
            actions: [{ type: 'set_flag', payload: { key: 'knows_secret_pass', value: true } }],
          },
          {
            id: 'choice_back_who',
            text: 'Понятно. Хотел спросить кое-что ещё.',
            targetNodeId: 'node_start',
          },
          {
            id: 'choice_exit_who',
            text: 'Удачи на службе.',
            targetNodeId: null,
          },
        ],
      },
      node_who_secret: {
        id: 'node_who_secret',
        speaker: 'npc',
        text: 'Тсс! Не болтай об этом при всех. Да, ход существует, но ключ от него глубоко в подземельях.',
        editorPosition: { x: 900, y: 40 },
        choices: [
          {
            id: 'choice_secret_back',
            text: 'Буду иметь в виду. Вернемся к разговору.',
            targetNodeId: 'node_start',
          },
        ],
      },
      node_follow: {
        id: 'node_follow',
        speaker: 'npc',
        text: 'Договорились, вместе безопаснее. Я буду следовать за тобой и прикрою спину!',
        editorPosition: { x: 500, y: 220 },
        choices: [
          {
            id: 'choice_follow_ok',
            text: 'Отлично, держись рядом!',
            targetNodeId: null,
          },
        ],
      },
      node_provoke: {
        id: 'node_provoke',
        speaker: 'npc',
        text: 'Ах ты негодяй! Защищайся, сейчас я преподам тебе урок!',
        editorPosition: { x: 500, y: 390 },
        choices: [
          {
            id: 'choice_fight_ok',
            text: 'К оружию!',
            targetNodeId: null,
          },
        ],
      },
      node_secret: {
        id: 'node_secret',
        speaker: 'npc',
        text: 'Ты знаешь про проход?! Ладно, будь осторожен — там полно ловушек.',
        editorPosition: { x: 500, y: 550 },
        choices: [
          {
            id: 'choice_secret_ok',
            text: 'Спасибо за предупреждение.',
            targetNodeId: null,
          },
        ],
      },
    },
  },
};

// Экспортируемый динамический реестр для обратной совместимости
export const DIALOGUE_REGISTRY: Record<string, DialogueGraph> = {
  ...INITIAL_DIALOGUES,
};

export function getDialogueGraph(dialogueId: string): DialogueGraph | undefined {
  return DIALOGUE_REGISTRY[dialogueId];
}

export function getAllDialogues(): Array<{ id: string; title: string }> {
  return Object.values(DIALOGUE_REGISTRY).map((d) => ({ id: d.id, title: d.title }));
}

export function getAllDialogueGraphs(): Record<string, DialogueGraph> {
  return { ...DIALOGUE_REGISTRY };
}

export function registerDialogue(graph: DialogueGraph): void {
  DIALOGUE_REGISTRY[graph.id] = graph;
  EventBus.emit('dialogue:registry-updated');
}

export function updateDialogue(id: string, graph: DialogueGraph): void {
  if (id !== graph.id && DIALOGUE_REGISTRY[id]) {
    delete DIALOGUE_REGISTRY[id];
  }
  DIALOGUE_REGISTRY[graph.id] = graph;
  EventBus.emit('dialogue:registry-updated');
}

export function deleteDialogue(id: string): boolean {
  if (id === 'default_npc_dialogue' || id === 'dog_bark_dialogue') {
    return false;
  }
  if (DIALOGUE_REGISTRY[id]) {
    delete DIALOGUE_REGISTRY[id];
    EventBus.emit('dialogue:registry-updated');
    return true;
  }
  return false;
}

export function createEmptyDialogue(forcedId?: string, title?: string): DialogueGraph {
  const id = forcedId || `dialogue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const startNodeId = 'node_start';
  const newGraph: DialogueGraph = {
    id,
    title: title || 'Новый диалог',
    startNodeId,
    nodes: {
      [startNodeId]: {
        id: startNodeId,
        speaker: 'npc',
        text: 'Приветствую!',
        editorPosition: { x: 120, y: 120 },
        choices: [
          {
            id: 'choice_1',
            text: 'Здравствуй.',
            targetNodeId: null,
          },
        ],
      },
    },
  };
  registerDialogue(newGraph);
  return newGraph;
}

export function exportDialogueToJson(id: string): string {
  const graph = DIALOGUE_REGISTRY[id];
  if (!graph) throw new Error(`Диалог ${id} не найден.`);
  return JSON.stringify(graph, null, 2);
}

export function importDialogueFromJson(jsonString: string): DialogueGraph {
  const parsed = JSON.parse(jsonString) as DialogueGraph;
  if (!parsed.id || !parsed.nodes || !parsed.startNodeId) {
    throw new Error('Некорректный формат файла диалога.');
  }
  registerDialogue(parsed);
  return parsed;
}

export function loadDialogues(dialogues?: Record<string, DialogueGraph>): void {
  for (const k of Object.keys(DIALOGUE_REGISTRY)) {
    if (!INITIAL_DIALOGUES[k]) {
      delete DIALOGUE_REGISTRY[k];
    }
  }
  for (const [k, v] of Object.entries(INITIAL_DIALOGUES)) {
    DIALOGUE_REGISTRY[k] = v;
  }

  if (dialogues && typeof dialogues === 'object') {
    for (const [id, graph] of Object.entries(dialogues)) {
      if (graph && graph.id && graph.nodes) {
        DIALOGUE_REGISTRY[id] = graph;
      }
    }
  }
  EventBus.emit('dialogue:registry-updated');
}
