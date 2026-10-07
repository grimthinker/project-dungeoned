import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { QuestGraph, QuestStage, QuestObjective } from '../../quest/types';
import { questGraphToFlow, flowToQuestGraph, QuestNodeData } from '../../quest/questFlowAdapter';
import {
  getQuestGraph,
  getAllQuests,
  updateQuest,
  createEmptyQuest,
  deleteQuest,
  exportQuestToJson,
  importQuestFromJson,
} from '../../quest/questRegistry';
import { QuestStageNodeComponent } from './QuestStageNodeComponent';
import { QuestEditorTopBar } from './QuestEditorTopBar';
import { RuleEditorModal } from '../gameplayEditor/RuleEditorModal';

const nodeTypes = {
  questStageNode: QuestStageNodeComponent,
};

interface QuestEditorWorkspaceProps {
  initialQuestId: string;
  onClose: () => void;
}

const InnerQuestEditorWorkspace: React.FC<QuestEditorWorkspaceProps> = ({
  initialQuestId,
  onClose,
}) => {
  const [currentId, setCurrentId] = useState<string>(initialQuestId);
  const [questTitle, setQuestTitle] = useState<string>('');
  const [questDescription, setQuestDescription] = useState<string>('');
  const [startStageId, setStartStageId] = useState<string>('stage_start');

  const [nodes, setNodes] = useState<Node<QuestNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [activeModalStageId, setActiveModalStageId] = useState<string | null>(null);

  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  const loadGraphIntoWorkspace = useCallback(
    (graph: QuestGraph) => {
      setCurrentId(graph.id);
      setQuestTitle(graph.title);
      setQuestDescription(graph.description || '');
      setStartStageId(graph.startStageId);

      const { nodes: flowNodes, edges: flowEdges } = questGraphToFlow(graph);
      setNodes(flowNodes);
      setEdges(flowEdges);

      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 250 });
      }, 50);
    },
    [reactFlowInstance]
  );

  useEffect(() => {
    const graph = getQuestGraph(currentId) || getQuestGraph('fetch_dog_quest');
    if (graph) {
      loadGraphIntoWorkspace(graph);
    }
  }, [currentId, loadGraphIntoWorkspace]);

  const saveCurrentGraph = useCallback(
    (
      newNodes: Node<QuestNodeData>[],
      newEdges: Edge[],
      overrideTitle?: string,
      overrideStartId?: string
    ) => {
      const existing = getQuestGraph(currentId);
      const graph = flowToQuestGraph(
        currentId,
        overrideTitle ?? questTitle,
        questDescription,
        overrideStartId ?? startStageId,
        newNodes,
        newEdges,
        existing
      );
      updateQuest(currentId, graph);
    },
    [currentId, questTitle, questDescription, startStageId]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<QuestNodeData>>[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);

        // При удалении стрелок мгновенно сбрасываем nextStageId у соответствующих нод/задач
        const removedEdges = eds.filter((oldE) => !next.some((newE) => newE.id === oldE.id));
        if (removedEdges.length > 0) {
          setNodes((nds) => {
            let updatedNds = [...nds];
            for (const remEdge of removedEdges) {
              const srcId = remEdge.source;
              const handle = remEdge.sourceHandle;

              updatedNds = updatedNds.map((n) => {
                if (n.id !== srcId) return n;
                if (handle === 'stage-default-out') {
                  return { ...n, data: { ...n.data, nextStageId: null } };
                }
                if (handle?.startsWith('obj-')) {
                  const objId = handle.replace('obj-', '');
                  const objectives = n.data.objectives.map((o) =>
                    o.id === objId ? { ...o, nextStageId: null } : o
                  );
                  return { ...n, data: { ...n.data, objectives } };
                }
                return n;
              });
            }
            saveCurrentGraph(updatedNds, next);
            return updatedNds;
          });
        } else {
          saveCurrentGraph(nodes, next);
        }

        return next;
      });
    },
    [nodes, saveCurrentGraph]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const targetId = connection.target;
      const sourceId = connection.source;
      const handle = connection.sourceHandle;

      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)
        );
        const isObjEdge = connection.sourceHandle?.startsWith('obj-');
        const next = addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            style: {
              stroke: isObjEdge ? '#2ecc71' : '#f1c40f',
              strokeWidth: 2,
            },
          },
          filtered
        );

        // Мгновенно обновляем стейт nodes для синхронной перерисовки текста ➔ целевой ноды
        setNodes((nds) => {
          const nextNodes = nds.map((n) => {
            if (n.id !== sourceId) return n;
            if (handle === 'stage-default-out') {
              return { ...n, data: { ...n.data, nextStageId: targetId } };
            }
            if (handle?.startsWith('obj-')) {
              const objId = handle.replace('obj-', '');
              const objectives = n.data.objectives.map((o) =>
                o.id === objId ? { ...o, nextStageId: targetId } : o
              );
              return { ...n, data: { ...n.data, objectives } };
            }
            return n;
          });

          saveCurrentGraph(nextNodes, next);
          return nextNodes;
        });

        return next;
      });
    },
    [saveCurrentGraph]
  );

  const handleUpdateNode = useCallback(
    (stageId: string, patch: Partial<QuestNodeData>) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === stageId ? { ...n, data: { ...n.data, ...patch } } : n
        );
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleAddObjective = useCallback(
    (stageId: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== stageId) return n;
          const newObj: QuestObjective = {
            id: `obj_${Date.now().toString(36).substring(2, 6)}`,
            type: 'reach_zone',
            title: 'Новая задача',
            requiredCount: 1,
            currentCount: 0,
          };
          return {
            ...n,
            data: { ...n.data, objectives: [...n.data.objectives, newObj] },
          };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleUpdateObjective = useCallback(
    (stageId: string, objId: string, patch: Partial<QuestObjective>) => {
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== stageId) return n;
          const objectives = n.data.objectives.map((o) =>
            o.id === objId ? { ...o, ...patch } : o
          );
          return { ...n, data: { ...n.data, objectives } };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleDeleteObjective = useCallback(
    (stageId: string, objId: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== stageId) return n;
          const objectives = n.data.objectives.filter((o) => o.id !== objId);
          return { ...n, data: { ...n.data, objectives } };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleSetStartStage = useCallback(
    (stageId: string) => {
      setStartStageId(stageId);
      setNodes((nds) => {
        const next = nds.map((n) => ({
          ...n,
          data: { ...n.data, isStartStage: n.id === stageId },
        }));
        saveCurrentGraph(next, edges, undefined, stageId);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleDeleteStage = useCallback(
    (stageId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== stageId);
        let nextStart = startStageId;
        if (startStageId === stageId && nextNodes.length > 0) {
          nextStart = nextNodes[0].id;
          nextNodes[0].data.isStartStage = true;
          setStartStageId(nextStart);
        }

        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== stageId && e.target !== stageId);
          saveCurrentGraph(nextNodes, nextEdges, undefined, nextStart);
          return nextEdges;
        });

        return nextNodes;
      });
    },
    [startStageId, saveCurrentGraph]
  );

  const enhancedNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isStartStage: n.id === startStageId,
        onUpdateTitle: (t: string) => handleUpdateNode(n.id, { title: t }),
        onUpdateDescription: (d: string) => handleUpdateNode(n.id, { description: d }),
        onUpdateCompletionMode: (m: any) => handleUpdateNode(n.id, { completionMode: m }),
        onSetStartStage: () => handleSetStartStage(n.id),
        onDeleteStage: () => handleDeleteStage(n.id),
        onAddObjective: () => handleAddObjective(n.id),
        onUpdateObjective: (oId: string, p: any) => handleUpdateObjective(n.id, oId, p),
        onDeleteObjective: (oId: string) => handleDeleteObjective(n.id, oId),
        onOpenRules: () => setActiveModalStageId(n.id),
      },
    }));
  }, [
    nodes,
    startStageId,
    handleUpdateNode,
    handleSetStartStage,
    handleDeleteStage,
    handleAddObjective,
    handleUpdateObjective,
    handleDeleteObjective,
  ]);

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newStageId = `stage_${Date.now().toString(36).substring(2, 6)}`;
      const newNode: Node<QuestNodeData> = {
        id: newStageId,
        type: 'questStageNode',
        position,
        data: {
          stageId: newStageId,
          title: 'Новый этап',
          description: '',
          isStartStage: nodes.length === 0,
          completionMode: 'all',
          objectives: [
            {
              id: `obj_${Date.now().toString(36).substring(2, 6)}`,
              type: 'reach_zone',
              title: 'Достичь цели',
              requiredCount: 1,
              currentCount: 0,
            },
          ],
          failIfDeadEntityIds: [],
          nextStageId: null,
        },
      };

      setNodes((nds) => {
        const next = [...nds, newNode];
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [nodes.length, reactFlowInstance, saveCurrentGraph, edges]
  );

  const currentGraphData = useMemo<QuestGraph>(() => {
    return {
      id: currentId,
      title: questTitle,
      description: questDescription,
      startStageId,
      stages: {},
    };
  }, [currentId, questTitle, questDescription, startStageId]);

  return (
    <div
      ref={reactFlowWrapper}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#121212',
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
      }}
    >
      <QuestEditorTopBar
        currentQuest={currentGraphData}
        allQuests={getAllQuests()}
        onSelectQuest={setCurrentId}
        onCreateQuest={() => {
          const newQ = createEmptyQuest();
          loadGraphIntoWorkspace(newQ);
        }}
        onUpdateTitle={(t) => {
          setQuestTitle(t);
          saveCurrentGraph(nodes, edges, t);
        }}
        onUpdateDescription={setQuestDescription}
        onToggleRepeatable={(r) => {
          const g = getQuestGraph(currentId);
          if (g) {
            g.isRepeatable = r;
            updateQuest(currentId, g);
          }
        }}
        onExport={() => {
          try {
            const jsonStr = exportQuestToJson(currentId);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quest_${currentId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            alert(`Ошибка экспорта: ${(err as Error).message}`);
          }
        }}
        onImport={(file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const q = importQuestFromJson(e.target?.result as string);
              loadGraphIntoWorkspace(q);
            } catch (err) {
              alert(`Ошибка импорта: ${(err as Error).message}`);
            }
          };
          reader.readAsText(file);
        }}
        onDelete={() => {
          if (confirm(`Удалить квест "${questTitle}" (${currentId})?`)) {
            if (deleteQuest(currentId)) {
              const remaining = getAllQuests();
              if (remaining.length > 0) {
                const nextQ = getQuestGraph(remaining[0].id);
                if (nextQ) loadGraphIntoWorkspace(nextQ);
              }
            } else {
              alert('Нельзя удалить системный квест.');
            }
          }
        }}
        onClose={onClose}
      />

      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={enhancedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneContextMenu={handlePaneContextMenu}
          colorMode="dark"
          fitView
          minZoom={0.2}
          maxZoom={2.0}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333333" />
          <Controls
            position="bottom-left"
            style={{ backgroundColor: '#222', borderColor: '#444' }}
          />
          <MiniMap
            position="bottom-right"
            nodeColor="#f1c40f"
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{ backgroundColor: '#181818', border: '1px solid #333' }}
          />
        </ReactFlow>

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '4px 10px',
            color: '#888',
            fontSize: 11,
            pointerEvents: 'none',
          }}
        >
          ПКМ по пустому месту — добавить этап • Перетаскивание связи — задать следующий этап
        </div>
      </div>

      {activeModalStageId && (
        <RuleEditorModal
          isOpen={true}
          title={`Настройки этапа: "${activeModalStageId}"`}
          subtitle="Критерии провала этапа и награды при успешном завершении"
          tabTitles={{
            conditions: '🔒 Условия провала (Fail Conditions)',
            actions: '🎁 Награды и Экшены этапа (Actions)',
          }}
          conditions={getQuestGraph(currentId)?.stages[activeModalStageId]?.failConditions || []}
          actions={getQuestGraph(currentId)?.stages[activeModalStageId]?.onCompleteActions || []}
          onSave={(conditions, actions) => {
            const g = getQuestGraph(currentId);
            if (g && g.stages[activeModalStageId]) {
              g.stages[activeModalStageId].onCompleteActions = actions;
              updateQuest(currentId, g);
            }
          }}
          onClose={() => setActiveModalStageId(null)}
        />
      )}
    </div>
  );
};

export const QuestEditorWorkspace: React.FC<QuestEditorWorkspaceProps> = (props) => {
  return (
    <ReactFlowProvider>
      <InnerQuestEditorWorkspace {...props} />
    </ReactFlowProvider>
  );
};
