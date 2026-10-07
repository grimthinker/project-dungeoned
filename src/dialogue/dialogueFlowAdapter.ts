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

export interface BranchCaseData {
  id: string;
  name?: string;
  conditions: DialogueCondition[];
  targetNodeId: string | null;
}

export interface DialogueNodeData extends Record<string, unknown> {
  nodeId: string;
  nodeType?: 'text' | 'branch';
  speaker?: 'npc' | 'player';
  speakerName?: string;
  text?: string;
  isStartNode: boolean;
  choices?: DialogueChoiceData[];
  onEnterActions?: DialogueAction[];
  name?: string;
  branchCases?: BranchCaseData[];
  defaultTargetNodeId?: string | null;
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

    if (dNode.nodeType === 'branch') {
      const casesData: BranchCaseData[] = (dNode.branchCases || []).map((c) => ({
        id: c.id,
        name: c.name,
        conditions: c.conditions ? [...c.conditions] : [],
        targetNodeId: c.targetNodeId,
      }));

      nodes.push({
        id: nodeId,
        type: 'branchNode',
        position,
        data: {
          nodeId,
          nodeType: 'branch',
          name: dNode.name || 'Ветвление',
          isStartNode: graph.startNodeId === nodeId,
          branchCases: casesData,
          defaultTargetNodeId: dNode.defaultTargetNodeId ?? null,
          onEnterActions: dNode.onEnterActions ? [...dNode.onEnterActions] : undefined,
        },
      });

      // Связи от условий веток
      casesData.forEach((bc) => {
        if (bc.targetNodeId && graph.nodes[bc.targetNodeId]) {
          edges.push({
            id: `edge-${nodeId}-${bc.id}-${bc.targetNodeId}`,
            source: nodeId,
            sourceHandle: bc.id,
            target: bc.targetNodeId,
            targetHandle: 'target-in',
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#9b59b6', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#9b59b6',
              width: 16,
              height: 16,
            },
          });
        }
      });

      // Связь от дефолтного выхода (Иначе / Else)
      if (dNode.defaultTargetNodeId && graph.nodes[dNode.defaultTargetNodeId]) {
        edges.push({
          id: `edge-${nodeId}-default-${dNode.defaultTargetNodeId}`,
          source: nodeId,
          sourceHandle: 'default-case',
          target: dNode.defaultTargetNodeId,
          targetHandle: 'target-in',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#f39c12', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#f39c12',
            width: 16,
            height: 16,
          },
        });
      }
    } else {
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
          nodeType: 'text',
          speaker: dNode.speaker || 'npc',
          speakerName: dNode.speakerName,
          text: dNode.text || '',
          isStartNode: graph.startNodeId === nodeId,
          choices: choicesData,
          onEnterActions: dNode.onEnterActions ? [...dNode.onEnterActions] : undefined,
        },
      });

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
    }
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

  const edgeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source && edge.sourceHandle && edge.target) {
      edgeMap.set(`${edge.source}:${edge.sourceHandle}`, edge.target);
    }
  }

  for (const fNode of nodes) {
    const data = fNode.data;
    const nodeId = fNode.id;

    if (data.nodeType === 'branch' || fNode.type === 'branchNode') {
      const cases = (data.branchCases || []).map((bc) => ({
        id: bc.id,
        name: bc.name,
        conditions: bc.conditions ? [...bc.conditions] : [],
        targetNodeId: edgeMap.get(`${nodeId}:${bc.id}`) ?? null,
      }));

      const defaultTarget = edgeMap.get(`${nodeId}:default-case`) ?? null;

      resultNodes[nodeId] = {
        id: nodeId,
        nodeType: 'branch',
        name: (data.name as string) || 'Ветвление',
        branchCases: cases,
        defaultTargetNodeId: defaultTarget,
        onEnterActions: data.onEnterActions ? [...data.onEnterActions] : undefined,
        editorPosition: {
          x: Math.round(fNode.position.x),
          y: Math.round(fNode.position.y),
        },
      };
    } else {
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
        nodeType: 'text',
        speaker: (data.speaker as any) || 'npc',
        speakerName: (data.speakerName as string) || undefined,
        text: (data.text as string) || '',
        choices,
        onEnterActions: data.onEnterActions ? [...data.onEnterActions] : undefined,
        editorPosition: {
          x: Math.round(fNode.position.x),
          y: Math.round(fNode.position.y),
        },
      };
    }
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
