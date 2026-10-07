import {
  GameplayCondition,
  GameplayAction,
  GameplayConditionType,
  GameplayActionType,
} from '../gameplay/types';

export type DialogueConditionType = GameplayConditionType;
export type DialogueCondition = GameplayCondition;

export type DialogueActionType = GameplayActionType;
export type DialogueAction = GameplayAction;

export interface DialogueChoice {
  id: string;
  text: string;
  targetNodeId: string | null; // null означает выход из диалога
  conditions?: DialogueCondition[];
  actions?: DialogueAction[];
}

export interface BranchCase {
  id: string;
  name?: string;
  conditions: DialogueCondition[];
  targetNodeId: string | null;
}

export interface DialogueTextNode {
  id: string;
  nodeType?: 'text';
  speaker?: 'npc' | 'player';
  speakerName?: string;
  text: string;
  choices: DialogueChoice[];
  onEnterActions?: DialogueAction[];
  editorPosition?: { x: number; y: number };
}

export interface DialogueBranchNode {
  id: string;
  nodeType: 'branch';
  name?: string;
  branchCases: BranchCase[];
  defaultTargetNodeId: string | null;
  onEnterActions?: DialogueAction[];
  editorPosition?: { x: number; y: number };
}

export type DialogueNode = DialogueTextNode | DialogueBranchNode;

export function isBranchNode(node: DialogueNode | undefined): node is DialogueBranchNode {
  return node?.nodeType === 'branch';
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
