export type DialogueConditionType =
  'flag_equals' | 'flag_has' | 'flag_not' | 'has_item' | 'is_alive';

export interface DialogueCondition {
  type: DialogueConditionType;
  key: string;
  value?: any;
}

export type DialogueActionType =
  'set_flag' | 'change_ai' | 'give_item' | 'take_item' | 'end_dialogue';

export interface DialogueAction {
  type: DialogueActionType;
  payload?: any;
}

export interface DialogueChoice {
  id: string;
  text: string;
  targetNodeId: string | null; // null означает выход из диалога
  conditions?: DialogueCondition[];
  actions?: DialogueAction[];
}

export interface DialogueNode {
  id: string;
  speaker?: 'npc' | 'player';
  speakerName?: string;
  text: string;
  choices: DialogueChoice[];
  onEnterActions?: DialogueAction[];
  /** Координаты узла для визуального редактора диалогов */
  editorPosition?: { x: number; y: number };
}

export interface DialogueGraph {
  id: string;
  title: string;
  startNodeId: string;
  nodes: Record<string, DialogueNode>;
}

export interface DialogueHistoryEntry {
  speaker: string;
  text: string;
  timestamp: number;
  isPlayer: boolean;
}

export interface ActiveDialogueDTO {
  npcId: string;
  npcName: string;
  dialogueId: string;
  currentNodeId: string;
  currentSpeaker: string;
  currentText: string;
  availableChoices: Array<{
    id: string;
    text: string;
    targetNodeId: string | null;
  }>;
  history: DialogueHistoryEntry[];
}
