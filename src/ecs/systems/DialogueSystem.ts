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
import { ConditionEvaluator } from '../../gameplay/conditions/ConditionEvaluator';
import { ActionDispatcher } from '../../gameplay/actions/ActionDispatcher';
import { ActionExecutionContext } from '../../gameplay/types';

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

    const pTrans = world.getComponent(playerId, 'transform');
    const nTrans = world.getComponent(npcId, 'transform');
    if (pTrans && nTrans) {
      const dist = Math.hypot(pTrans.x - nTrans.x, pTrans.z - nTrans.z);
      if (dist > DIALOGUE_CONFIG.startInteractionDistance) {
        return false;
      }
    }

    const dialogueTarget = world.getComponent(npcId, 'dialogueTarget');
    if (!dialogueTarget || !dialogueTarget.dialogueId) return false;
    const dialogueId = dialogueTarget.dialogueId;
    const graph = getDialogueGraph(dialogueId);
    if (!graph) return false;

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

    const context: ActionExecutionContext = {
      world,
      app: this.app,
      sourceEntityId: npcId,
      activatorEntityId: playerId,
    };
    ActionDispatcher.executeAll(startNode.onEnterActions, context);
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

    const context: ActionExecutionContext = {
      world,
      app: this.app,
      sourceEntityId: npcId,
      activatorEntityId: playerId,
    };

    if (!ConditionEvaluator.evaluateAll(choice.conditions, context)) return;

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
    ActionDispatcher.executeAll(choice.actions, context);

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

    ActionDispatcher.executeAll(nextNode.onEnterActions, context);
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

    const { npcId, dialogueId, currentNodeId, graph, history, playerId } = this.activeSession;
    const node = graph.nodes[currentNodeId];
    if (!node) return null;

    const npcMeta = world.getComponent(npcId, 'meta');
    const npcName = npcMeta?.name || 'Собеседник';

    const context: ActionExecutionContext = {
      world,
      app: this.app,
      sourceEntityId: npcId,
      activatorEntityId: playerId,
    };

    const availableChoices = node.choices
      .filter((choice) => ConditionEvaluator.evaluateAll(choice.conditions, context))
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
  }

  private emitCurrentState(world: World): void {
    const dto = this.getActiveDialogueDTO(world);
    if (dto) {
      EventBus.emit('dialogue:state-changed', dto);
    }
  }
}
