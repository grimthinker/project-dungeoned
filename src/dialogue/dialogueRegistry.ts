import { DialogueGraph } from './types';

export const DIALOGUE_REGISTRY: Record<string, DialogueGraph> = {
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
        editorPosition: { x: 460, y: 40 },
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
        editorPosition: { x: 800, y: 40 },
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
        editorPosition: { x: 460, y: 190 },
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
        editorPosition: { x: 460, y: 340 },
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
        editorPosition: { x: 460, y: 490 },
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

export function getDialogueGraph(dialogueId: string): DialogueGraph | undefined {
  return DIALOGUE_REGISTRY[dialogueId];
}

export function getAllDialogues(): Array<{ id: string; title: string }> {
  return Object.values(DIALOGUE_REGISTRY).map((d) => ({ id: d.id, title: d.title }));
}
