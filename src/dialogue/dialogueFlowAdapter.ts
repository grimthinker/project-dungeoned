import { Node, Edge, MarkerType } from '@xyflow/react';
import {
  DialogueGraph,
  DialogueNode,
  DialogueChoice,
  DialogueCondition,
  DialogueAction,
} from './types';

export interface DialogueChoiceData {
  id: string;
  text: string;
  targetNodeId: string | null;
  conditions?: DialogueCondition[];
  actions?: DialogueAction[];
}

export interface DialogueNodeData extends Record<string, unknown> {
  nodeId: string;
  speaker: 'npc' | 'player';
  speakerName?: string;
  text: string;
  isStartNode: boolean;
  choices: DialogueChoiceData[];
  onEnterActions?: DialogueAction[];
}

export function dialogueGraphToFlow(graph: DialogueGraph): {
  nodes: Node<DialogueNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<DialogueNodeData>[] = [];
  const edges: Edge[] = [];

  const nodeEntries = Object.entries(graph.nodes);

  nodeEntries.forEach(([nodeId, dNode], index) => {
    const position = dNode.editorPosition || {
      x: 100 + (index % 3) * 380,
      y: 100 + Math.floor(index / 3) * 320,
    };

    const choicesData: DialogueChoiceData[] = (dNode.choices || []).map((c) => ({
      id: c.id,
      text: c.text,
      targetNodeId: c.targetNodeId,
      conditions: c.conditions ? [...c.conditions] : undefined,
      actions: c.actions ? [...c.actions] : undefined,
    }));

    nodes.push({
      id: nodeId,
      type: 'dialogueNode',
      position,
      data: {
        nodeId,
        speaker: dNode.speaker || 'npc',
        speakerName: dNode.speakerName,
        text: dNode.text || '',
        isStartNode: graph.startNodeId === nodeId,
        choices: choicesData,
        onEnterActions: dNode.onEnterActions ? [...dNode.onEnterActions] : undefined,
      },
    });

    // Создаем связи (Edges) от портов ответов к целевым узлам
    choicesData.forEach((choice) => {
      if (choice.targetNodeId && graph.nodes[choice.targetNodeId]) {
        edges.push({
          id: `edge-${nodeId}-${choice.id}-${choice.targetNodeId}`,
          source: nodeId,
          sourceHandle: choice.id,
          target: choice.targetNodeId,
          targetHandle: 'target-in',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#3498db', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#3498db',
            width: 16,
            height: 16,
          },
        });
      }
    });
  });

  return { nodes, edges };
}

export function flowToDialogueGraph(
  id: string,
  title: string,
  startNodeId: string,
  nodes: Node<DialogueNodeData>[],
  edges: Edge[]
): DialogueGraph {
  const resultNodes: Record<string, DialogueNode> = {};

  // Карта исходящих соединений: "sourceNodeId:choiceId" -> targetNodeId
  const edgeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source && edge.sourceHandle && edge.target) {
      edgeMap.set(`${edge.source}:${edge.sourceHandle}`, edge.target);
    }
  }

  for (const fNode of nodes) {
    const data = fNode.data;
    const nodeId = fNode.id;

    const choices: DialogueChoice[] = (data.choices || []).map((c) => {
      const key = `${nodeId}:${c.id}`;
      const connectedTarget = edgeMap.get(key) ?? null;

      return {
        id: c.id,
        text: c.text,
        targetNodeId: connectedTarget,
        conditions: c.conditions ? [...c.conditions] : undefined,
        actions: c.actions ? [...c.actions] : undefined,
      };
    });

    resultNodes[nodeId] = {
      id: nodeId,
      speaker: data.speaker || 'npc',
      speakerName: data.speakerName || undefined,
      text: data.text || '',
      choices,
      onEnterActions: data.onEnterActions ? [...data.onEnterActions] : undefined,
      editorPosition: {
        x: Math.round(fNode.position.x),
        y: Math.round(fNode.position.y),
      },
    };
  }

  // Проверяем валидность startNodeId
  let validStartNodeId = startNodeId;
  if (!resultNodes[validStartNodeId]) {
    const firstId = Object.keys(resultNodes)[0];
    validStartNodeId = firstId || 'node_start';
  }

  return {
    id,
    title,
    startNodeId: validStartNodeId,
    nodes: resultNodes,
  };
}
