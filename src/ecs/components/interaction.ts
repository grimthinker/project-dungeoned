export type InteractionVerb =
  'inspect' | 'take' | 'follow' | 'push' | 'talk' | 'use' | 'read' | string;

export interface InteractionOption {
  id: string;
  verb: InteractionVerb;
  label: string;
  icon?: string;
  enabled?: boolean;
  disabledReason?: string;
}

export interface InteractableComponent {
  options: InteractionOption[];
  defaultVerb?: InteractionVerb;
  interactDistance?: number;
}
