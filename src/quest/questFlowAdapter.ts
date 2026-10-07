import { Node, Edge, MarkerType } from '@xyflow/react';
import { QuestGraph, QuestStage, StageCompletionMode, QuestObjective } from './types';

export interface QuestNodeData extends Record<string, unknown> {
  stageId: string;
  title: string;
  description: string;
  isStartStage: boolean;
  completionMode: StageCompletionMode;
  objectives: QuestObjective[];
  failIfDeadEntityIds: string[];
  nextStageId: string | null;
}

export function questGraphToFlow(graph: QuestGraph): {
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<QuestNodeData>[] = [];
  const edges: Edge[] = [];

  const stageEntries = Object.entries(graph.stages);

  stageEntries.forEach(([stageId, stage], index) => {
    const position = stage.editorPosition || {
      x: 100 + (index % 3) * 420,
      y: 100 + Math.floor(index / 3) * 360,
    };

    nodes.push({
      id: stageId,
      type: 'questStageNode',
      position,
      data: {
        stageId,
        title: stage.title,
        description: stage.description || '',
        isStartStage: graph.startStageId === stageId,
        completionMode: stage.completionMode || 'all',
        objectives: stage.objectives ? stage.objectives.map((o) => ({ ...o })) : [],
        failIfDeadEntityIds: stage.failIfDeadEntityIds ? [...stage.failIfDeadEntityIds] : [],
        nextStageId: stage.nextStageId ?? null,
      },
    });

    // 1. Связи от индивидуальных задач (развилки)
    (stage.objectives || []).forEach((obj) => {
      if (obj.nextStageId && graph.stages[obj.nextStageId]) {
        edges.push({
          id: `edge-${stageId}-${obj.id}-${obj.nextStageId}`,
          source: stageId,
          sourceHandle: `obj-${obj.id}`,
          target: obj.nextStageId,
          targetHandle: 'stage-in',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#2ecc71', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#2ecc71',
            width: 16,
            height: 16,
          },
        });
      }
    });

    // 2. Дефолтная связь этапа (общий выход)
    if (stage.nextStageId && graph.stages[stage.nextStageId]) {
      edges.push({
        id: `edge-${stageId}-default-${stage.nextStageId}`,
        source: stageId,
        sourceHandle: 'stage-default-out',
        target: stage.nextStageId,
        targetHandle: 'stage-in',
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#f1c40f', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#f1c40f',
          width: 16,
          height: 16,
        },
      });
    }
  });

  return { nodes, edges };
}

export function flowToQuestGraph(
  id: string,
  title: string,
  description: string,
  startStageId: string,
  nodes: Node<QuestNodeData>[],
  edges: Edge[],
  existingGraph?: QuestGraph
): QuestGraph {
  // Карта связей по конкретным портам: "sourceId:sourceHandle" -> targetId
  const edgeMap = new Map<string, string>();
  for (const e of edges) {
    if (e.source && e.sourceHandle && e.target) {
      edgeMap.set(`${e.source}:${e.sourceHandle}`, e.target);
    }
  }

  const stages: Record<string, QuestStage> = {};

  for (const fNode of nodes) {
    const data = fNode.data;
    const stageId = fNode.id;
    const prevStage = existingGraph?.stages[stageId];

    // Привязываем целевые этапы к задачам
    const objectives: QuestObjective[] = (data.objectives || []).map((obj) => {
      const targetFromEdge = edgeMap.get(`${stageId}:obj-${obj.id}`) ?? null;
      return {
        ...obj,
        isOptional: Boolean(obj.isOptional),
        isHidden: Boolean(obj.isHidden),
        nextStageId: targetFromEdge,
      };
    });

    const defaultNextStageId = edgeMap.get(`${stageId}:stage-default-out`) ?? null;

    stages[stageId] = {
      id: stageId,
      title: data.title || 'Новый этап',
      description: data.description || '',
      completionMode: data.completionMode || 'all',
      objectives,
      failIfDeadEntityIds: data.failIfDeadEntityIds || [],
      nextStageId: defaultNextStageId,
      onEnterActions: prevStage?.onEnterActions,
      onCompleteActions: prevStage?.onCompleteActions,
      onFailActions: prevStage?.onFailActions,
      editorPosition: {
        x: Math.round(fNode.position.x),
        y: Math.round(fNode.position.y),
      },
    };
  }

  let validStart = startStageId;
  if (!stages[validStart]) {
    validStart = Object.keys(stages)[0] || 'stage_start';
  }

  return {
    id,
    title,
    description,
    category: existingGraph?.category || 'side',
    isRepeatable: existingGraph?.isRepeatable ?? false,
    startStageId: validStart,
    stages,
  };
}
