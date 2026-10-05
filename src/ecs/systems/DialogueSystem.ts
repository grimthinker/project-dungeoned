import { World } from '../World';
import { GameApp } from '../../GameApp';
import { EntityId } from '../types';
import { DIALOGUE_CONFIG } from '../../config/dialogueConfig';
import {
  ActiveDialogueDTO,
  DialogueChoice,
  DialogueCondition,
  DialogueGraph,
  DialogueHistoryEntry,
  DialogueNode,
} from '../../dialogue/types';
import { getDialogueGraph } from '../../dialogue/dialogueRegistry';
import { StoryFlagsManager } from '../../dialogue/StoryFlagsManager';
import { EventBus } from '../../core/EventBus';
import { Radians } from '../../utils';

interface ActiveDialogueSession {
  npcId: EntityId;
  playerId: EntityId;
  dialogueId: string;
  graph: DialogueGraph;
  currentNodeId: string;
  history: DialogueHistoryEntry[];
}

export class DialogueSystem {
  public activeSession: ActiveDialogueSession | null = null;

  constructor(private app: GameApp) {}

  public get isDialogueActive(): boolean {
    return this.activeSession !== null;
  }

  public startDialogue(world: World, npcId: EntityId, playerId: EntityId): boolean {
    if (this.activeSession) {
      this.closeDialogue(world);
    }

    const npcHealth = world.getComponent(npcId, 'health');
    const playerHealth = world.getComponent(playerId, 'health');
    if (!npcHealth?.isAlive || !playerHealth?.isAlive) return false;

    const dialogueTarget = world.getComponent(npcId, 'dialogueTarget');
    const dialogueId = dialogueTarget?.dialogueId || 'default_npc_dialogue';
    const graph = getDialogueGraph(dialogueId);

    const startNode = graph.nodes[graph.startNodeId];
    if (!startNode) return false;

    const npcMeta = world.getComponent(npcId, 'meta');
    const npcName = npcMeta?.name || 'Собеседник';

    this.activeSession = {
      npcId,
      playerId,
      dialogueId,
      graph,
      currentNodeId: startNode.id,
      history: [
        {
          speaker: startNode.speakerName || npcName,
          text: startNode.text,
          timestamp: Date.now(),
          isPlayer: false,
        },
      ],
    };

    world.addComponent(npcId, 'inDialogue', { withEntityId: playerId, dialogueId });
    world.addComponent(playerId, 'inDialogue', { withEntityId: npcId, dialogueId });

    // Останавливаем движение NPC
    const npcInput = world.getComponent(npcId, 'input');
    if (npcInput) {
      npcInput.desiredMoveVector = null;
      npcInput.isMovingForward = false;
      npcInput.moveForward = 0;
      npcInput.moveStrafe = 0;
    }

    this.executeActions(world, startNode.onEnterActions);
    this.emitCurrentState(world);
    return true;
  }

  public chooseOption(world: World, choiceId: string): void {
    if (!this.activeSession) return;

    const { graph, currentNodeId, npcId, playerId } = this.activeSession;
    const currentNode = graph.nodes[currentNodeId];
    if (!currentNode) return;

    const choice = currentNode.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    if (!this.checkConditions(world, choice.conditions)) return;

    const playerMeta = world.getComponent(playerId, 'meta');
    const playerName = playerMeta?.name || 'Вы';

    // Добавляем реплику игрока в историю
    this.activeSession.history.push({
      speaker: playerName,
      text: choice.text,
      timestamp: Date.now(),
      isPlayer: true,
    });

    // Применяем эффекты ответа игрока
    this.executeActions(world, choice.actions);

    // Если выбор ведет в null — завершаем разговор
    if (!choice.targetNodeId) {
      this.closeDialogue(world);
      return;
    }

    const nextNode = graph.nodes[choice.targetNodeId];
    if (!nextNode) {
      this.closeDialogue(world);
      return;
    }

    this.activeSession.currentNodeId = nextNode.id;

    const npcMeta = world.getComponent(npcId, 'meta');
    const npcName = npcMeta?.name || 'Собеседник';

    // Добавляем ответ NPC в историю
    this.activeSession.history.push({
      speaker: nextNode.speakerName || npcName,
      text: nextNode.text,
      timestamp: Date.now(),
      isPlayer: false,
    });

    this.executeActions(world, nextNode.onEnterActions);
    this.emitCurrentState(world);
  }

  public closeDialogue(world: World): void {
    if (!this.activeSession) return;

    const { npcId, playerId } = this.activeSession;
    world.removeComponent(npcId, 'inDialogue');
    world.removeComponent(playerId, 'inDialogue');

    this.activeSession = null;
    EventBus.emit('dialogue:closed');
  }

  public getActiveDialogueDTO(world: World): ActiveDialogueDTO | null {
    if (!this.activeSession) return null;

    const { npcId, dialogueId, currentNodeId, graph, history } = this.activeSession;
    const node = graph.nodes[currentNodeId];
    if (!node) return null;

    const npcMeta = world.getComponent(npcId, 'meta');
    const npcName = npcMeta?.name || 'Собеседник';

    const availableChoices = node.choices
      .filter((choice) => this.checkConditions(world, choice.conditions))
      .map((choice) => ({
        id: choice.id,
        text: choice.text,
        targetNodeId: choice.targetNodeId,
      }));

    return {
      npcId,
      npcName,
      dialogueId,
      currentNodeId,
      currentSpeaker: node.speakerName || npcName,
      currentText: node.text,
      availableChoices,
      history,
    };
  }

  public update(_dt: number, world: World): void {
    if (!this.activeSession) return;

    const { npcId, playerId } = this.activeSession;

    // 1. Проверка сознания и жизни участников
    const playerHealth = world.getComponent(playerId, 'health');
    const npcHealth = world.getComponent(npcId, 'health');
    if (!playerHealth?.isAlive || !npcHealth?.isAlive) {
      this.closeDialogue(world);
      return;
    }

    // 2. Проверка дистанции в реальном времени (до 8 метров)
    const pTrans = world.getComponent(playerId, 'transform');
    const nTrans = world.getComponent(npcId, 'transform');
    if (!pTrans || !nTrans) {
      this.closeDialogue(world);
      return;
    }

    const dist = Math.hypot(pTrans.x - nTrans.x, pTrans.z - nTrans.z);
    if (dist > DIALOGUE_CONFIG.maxInteractionDistance) {
      this.closeDialogue(world);
      return;
    }

    // 3. Поворот NPC и Игрока лицом друг к другу
    const dx = pTrans.x - nTrans.x;
    const dz = pTrans.z - nTrans.z;
    const angleToPlayer = Math.atan2(dz, dx) as Radians;
    const angleToNpc = Math.atan2(-dz, -dx) as Radians;

    const nInput = world.getComponent(npcId, 'input');
    if (nInput) {
      nInput.targetLookAngle = angleToPlayer;
      nInput.desiredBodyAngle = angleToPlayer;
      nInput.desiredMoveVector = null;
      nInput.isMovingForward = false;
    }

    const pInput = world.getComponent(playerId, 'input');
    if (pInput && pInput.desiredMoveVector === null && !pInput.isMovingForward) {
      pInput.targetLookAngle = angleToNpc;
    }
  }

  private checkConditions(world: World, conditions?: DialogueCondition[]): boolean {
    if (!conditions || conditions.length === 0) return true;

    for (const cond of conditions) {
      switch (cond.type) {
        case 'flag_equals':
          if (StoryFlagsManager.getFlag(cond.key) !== cond.value) return false;
          break;
        case 'flag_has':
          if (!StoryFlagsManager.hasFlag(cond.key) || !StoryFlagsManager.getFlag(cond.key))
            return false;
          break;
        case 'flag_not':
          if (StoryFlagsManager.hasFlag(cond.key) && StoryFlagsManager.getFlag(cond.key))
            return false;
          break;
        case 'has_item': {
          if (!this.activeSession) return false;
          const slots = world.getComponent(this.activeSession.playerId, 'interactionSlots');
          if (slots?.itemId === cond.key) break;
          return false;
        }
        case 'is_alive': {
          const targetHealth = world.getComponent(cond.key, 'health');
          if (!targetHealth?.isAlive) return false;
          break;
        }
      }
    }
    return true;
  }

  private executeActions(
    world: World,
    actions?: import('../../dialogue/types').DialogueAction[]
  ): void {
    if (!actions || actions.length === 0) return;

    for (const act of actions) {
      switch (act.type) {
        case 'set_flag':
          if (act.payload?.key) {
            StoryFlagsManager.setFlag(act.payload.key, act.payload.value);
          }
          break;
        case 'change_ai':
          if (this.activeSession && act.payload?.behavior) {
            const targetId =
              act.payload.entity === 'npc' ? this.activeSession.npcId : act.payload.entity;
            if (targetId) {
              this.app.mutations.updateEntityAIBehavior(targetId, act.payload.behavior);
            }
          }
          break;
        case 'end_dialogue':
          this.closeDialogue(world);
          break;
      }
    }
  }

  private emitCurrentState(world: World): void {
    const dto = this.getActiveDialogueDTO(world);
    if (dto) {
      EventBus.emit('dialogue:state-changed', dto);
    }
  }
}
