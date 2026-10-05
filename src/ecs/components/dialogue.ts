import { EntityId } from './base';

export interface DialogueTargetComponent {
  dialogueId: string;
}

export interface InDialogueComponent {
  withEntityId: EntityId;
  dialogueId: string;
}
