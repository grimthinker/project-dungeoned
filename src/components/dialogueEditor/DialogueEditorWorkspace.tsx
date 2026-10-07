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

import {
  DialogueGraph,
  DialogueChoice,
  DialogueAction,
  DialogueCondition,
} from '../../dialogue/types';
import {
  dialogueGraphToFlow,
  flowToDialogueGraph,
  DialogueNodeData,
} from '../../dialogue/dialogueFlowAdapter';
import {
  getDialogueGraph,
  getAllDialogues,
  updateDialogue,
  createEmptyDialogue,
  deleteDialogue,
  exportDialogueToJson,
  importDialogueFromJson,
} from '../../dialogue/dialogueRegistry';
import { DialogueNodeComponent } from './DialogueNodeComponent';
import { DialogueBranchNodeComponent } from './DialogueBranchNodeComponent';
import { DialogueEditorTopBar } from './DialogueEditorTopBar';
import { RuleEditorModal } from '../gameplayEditor/RuleEditorModal';

const nodeTypes = {
  dialogueNode: DialogueNodeComponent,
  branchNode: DialogueBranchNodeComponent,
};

interface InnerWorkspaceProps {
  initialDialogueId: string;
  onClose: () => void;
}

interface ModalTargetState {
  type: 'choice' | 'node' | 'branchCase';
  nodeId: string;
  choiceId?: string;
  caseId?: string;
  title: string;
  conditions: DialogueCondition[];
  actions: DialogueAction[];
}

const InnerDialogueEditorWorkspace: React.FC<InnerWorkspaceProps> = ({
  initialDialogueId,
  onClose,
}) => {
  const [currentId, setCurrentId] = useState<string>(initialDialogueId);
  const [dialogueTitle, setDialogueTitle] = useState<string>('');
  const [startNodeId, setStartNodeId] = useState<string>('node_start');

  const [nodes, setNodes] = useState<Node<DialogueNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [activeModalTarget, setActiveModalTarget] = useState<ModalTargetState | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);

  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  const loadGraphIntoWorkspace = useCallback(
    (graph: DialogueGraph) => {
      setCurrentId(graph.id);
      setDialogueTitle(graph.title);
      setStartNodeId(graph.startNodeId);

      const { nodes: flowNodes, edges: flowEdges } = dialogueGraphToFlow(graph);
      setNodes(flowNodes);
      setEdges(flowEdges);

      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 250 });
      }, 50);
    },
    [reactFlowInstance]
  );

  useEffect(() => {
    const graph = getDialogueGraph(currentId) || getDialogueGraph('default_npc_dialogue');
    if (graph) {
      loadGraphIntoWorkspace(graph);
    }
  }, [currentId, loadGraphIntoWorkspace]);

  const saveCurrentGraph = useCallback(
    (
      newNodes: Node<DialogueNodeData>[],
      newEdges: Edge[],
      overrideTitle?: string,
      overrideStartNodeId?: string
    ) => {
      const titleToUse = overrideTitle ?? dialogueTitle;
      const startNodeToUse = overrideStartNodeId ?? startNodeId;

      const graph = flowToDialogueGraph(currentId, titleToUse, startNodeToUse, newNodes, newEdges);
      updateDialogue(currentId, graph);
    },
    [currentId, dialogueTitle, startNodeId]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<DialogueNodeData>>[]) => {
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

        const removedEdges = eds.filter((oldE) => !next.some((newE) => newE.id === oldE.id));
        if (removedEdges.length > 0) {
          setNodes((nds) => {
            let updatedNds = [...nds];
            for (const remEdge of removedEdges) {
              const srcId = remEdge.source;
              const handle = remEdge.sourceHandle;

              updatedNds = updatedNds.map((n) => {
                if (n.id !== srcId) return n;
                if (n.data.nodeType === 'branch' || n.type === 'branchNode') {
                  if (handle === 'default-case') {
                    return { ...n, data: { ...n.data, defaultTargetNodeId: null } };
                  }
                  const cases = (n.data.branchCases || []).map((c) =>
                    c.id === handle ? { ...c, targetNodeId: null } : c
                  );
                  return { ...n, data: { ...n.data, branchCases: cases } };
                } else {
                  const choices = (n.data.choices || []).map((c) =>
                    c.id === handle ? { ...c, targetNodeId: null } : c
                  );
                  return { ...n, data: { ...n.data, choices } };
                }
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
        const isBranchSource =
          connection.sourceHandle?.startsWith('case_') ||
          connection.sourceHandle === 'default-case';
        const strokeColor =
          connection.sourceHandle === 'default-case'
            ? '#f39c12'
            : isBranchSource
              ? '#9b59b6'
              : '#3498db';

        const next = addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            style: { stroke: strokeColor, strokeWidth: 2 },
          },
          filtered
        );

        setNodes((nds) => {
          const nextNodes = nds.map((n) => {
            if (n.id !== sourceId) return n;
            if (n.data.nodeType === 'branch' || n.type === 'branchNode') {
              if (handle === 'default-case') {
                return { ...n, data: { ...n.data, defaultTargetNodeId: targetId } };
              }
              const cases = (n.data.branchCases || []).map((c) =>
                c.id === handle ? { ...c, targetNodeId: targetId } : c
              );
              return { ...n, data: { ...n.data, branchCases: cases } };
            } else {
              const choices = (n.data.choices || []).map((c) =>
                c.id === handle ? { ...c, targetNodeId: targetId } : c
              );
              return { ...n, data: { ...n.data, choices } };
            }
          });
          saveCurrentGraph(nextNodes, next);
          return nextNodes;
        });

        return next;
      });
    },
    [saveCurrentGraph]
  );

  const handleUpdateNodeText = useCallback(
    (nodeId: string, text: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, text } } : n));
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleUpdateSpeakerName = useCallback(
    (nodeId: string, speakerName: string) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, speakerName } } : n
        );
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleSetStartNode = useCallback(
    (nodeId: string) => {
      setStartNodeId(nodeId);
      setNodes((nds) => {
        const next = nds.map((n) => ({
          ...n,
          data: { ...n.data, isStartNode: n.id === nodeId },
        }));
        saveCurrentGraph(next, edges, undefined, nodeId);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        let nextStartId = startNodeId;
        if (startNodeId === nodeId && nextNodes.length > 0) {
          nextStartId = nextNodes[0].id;
          nextNodes[0].data.isStartNode = true;
          setStartNodeId(nextStartId);
        }

        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          saveCurrentGraph(nextNodes, nextEdges, undefined, nextStartId);
          return nextEdges;
        });

        return nextNodes;
      });
    },
    [startNodeId, saveCurrentGraph]
  );

  const handleAddChoice = useCallback(
    (nodeId: string) => {
      const choiceId = `choice_${Date.now().toString(36).substring(2, 6)}`;
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentChoices = n.data.choices || [];
          return {
            ...n,
            data: {
              ...n.data,
              choices: [
                ...currentChoices,
                { id: choiceId, text: 'Продолжить...', targetNodeId: null },
              ],
            },
          };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleUpdateChoiceText = useCallback(
    (nodeId: string, choiceId: string, text: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const choices = (n.data.choices || []).map((c) =>
            c.id === choiceId ? { ...c, text } : c
          );
          return { ...n, data: { ...n.data, choices } };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleDeleteChoice = useCallback(
    (nodeId: string, choiceId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const choices = (n.data.choices || []).filter((c) => c.id !== choiceId);
          return { ...n, data: { ...n.data, choices } };
        });

        setEdges((eds) => {
          const nextEdges = eds.filter(
            (e) => !(e.source === nodeId && e.sourceHandle === choiceId)
          );
          saveCurrentGraph(nextNodes, nextEdges);
          return nextEdges;
        });

        return nextNodes;
      });
    },
    [saveCurrentGraph]
  );

  const handleOpenChoiceSettings = useCallback(
    (nodeId: string, choiceId: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) return;
      const targetChoice = targetNode.data.choices?.find((c) => c.id === choiceId);
      if (!targetChoice) return;

      setActiveModalTarget({
        type: 'choice',
        nodeId,
        choiceId,
        title: `Настройка ответа: "${targetChoice.text}"`,
        conditions: targetChoice.conditions ? [...targetChoice.conditions] : [],
        actions: targetChoice.actions ? [...targetChoice.actions] : [],
      });
    },
    [nodes]
  );

  const handleOpenNodeActions = useCallback(
    (nodeId: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) return;

      setActiveModalTarget({
        type: 'node',
        nodeId,
        title: `Экшены при входе в узел [${nodeId}]`,
        conditions: [],
        actions: targetNode.data.onEnterActions ? [...targetNode.data.onEnterActions] : [],
      });
    },
    [nodes]
  );

  const handleUpdateBranchName = useCallback(
    (nodeId: string, name: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, name } } : n));
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleAddBranchCase = useCallback(
    (nodeId: string) => {
      const caseId = `case_${Date.now().toString(36).substring(2, 6)}`;
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentCases = n.data.branchCases || [];
          return {
            ...n,
            data: {
              ...n.data,
              branchCases: [
                ...currentCases,
                {
                  id: caseId,
                  name: `Ветка ${currentCases.length + 1}`,
                  conditions: [],
                  targetNodeId: null,
                },
              ],
            },
          };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleUpdateBranchCaseName = useCallback(
    (nodeId: string, caseId: string, name: string) => {
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const cases = (n.data.branchCases || []).map((c) =>
            c.id === caseId ? { ...c, name } : c
          );
          return { ...n, data: { ...n.data, branchCases: cases } };
        });
        saveCurrentGraph(next, edges);
        return next;
      });
    },
    [edges, saveCurrentGraph]
  );

  const handleDeleteBranchCase = useCallback(
    (nodeId: string, caseId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.map((n) => {
          if (n.id !== nodeId) return n;
          const cases = (n.data.branchCases || []).filter((c) => c.id !== caseId);
          return { ...n, data: { ...n.data, branchCases: cases } };
        });

        setEdges((eds) => {
          const nextEdges = eds.filter((e) => !(e.source === nodeId && e.sourceHandle === caseId));
          saveCurrentGraph(nextNodes, nextEdges);
          return nextEdges;
        });

        return nextNodes;
      });
    },
    [saveCurrentGraph]
  );

  const handleOpenBranchCaseConditions = useCallback(
    (nodeId: string, caseId: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) return;
      const targetCase = targetNode.data.branchCases?.find((c) => c.id === caseId);
      if (!targetCase) return;

      setActiveModalTarget({
        type: 'branchCase',
        nodeId,
        caseId,
        title: `Условия ветвления: "${targetCase.name || caseId}"`,
        conditions: targetCase.conditions ? [...targetCase.conditions] : [],
        actions: [],
      });
    },
    [nodes]
  );

  const handleSaveModalRules = useCallback(
    (conditions: DialogueCondition[], actions: DialogueAction[]) => {
      if (!activeModalTarget) return;

      if (activeModalTarget.type === 'choice') {
        const { nodeId, choiceId } = activeModalTarget;
        setNodes((nds) => {
          const next = nds.map((n) => {
            if (n.id !== nodeId) return n;
            const choices = (n.data.choices || []).map((c) =>
              c.id === choiceId ? { ...c, conditions, actions } : c
            );
            return { ...n, data: { ...n.data, choices } };
          });
          saveCurrentGraph(next, edges);
          return next;
        });
      } else if (activeModalTarget.type === 'branchCase') {
        const { nodeId, caseId } = activeModalTarget;
        setNodes((nds) => {
          const next = nds.map((n) => {
            if (n.id !== nodeId) return n;
            const cases = (n.data.branchCases || []).map((c) =>
              c.id === caseId ? { ...c, conditions } : c
            );
            return { ...n, data: { ...n.data, branchCases: cases } };
          });
          saveCurrentGraph(next, edges);
          return next;
        });
      } else {
        const { nodeId } = activeModalTarget;
        setNodes((nds) => {
          const next = nds.map((n) => {
            if (n.id !== nodeId) return n;
            return {
              ...n,
              data: { ...n.data, onEnterActions: actions },
            };
          });
          saveCurrentGraph(next, edges);
          return next;
        });
      }
    },
    [activeModalTarget, edges, saveCurrentGraph]
  );

  const enhancedNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isStartNode: n.id === startNodeId,
        onUpdateText: (t: string) => handleUpdateNodeText(n.id, t),
        onUpdateSpeakerName: (name: string) => handleUpdateSpeakerName(n.id, name),
        onSetStartNode: () => handleSetStartNode(n.id),
        onDeleteNode: () => handleDeleteNode(n.id),
        onAddChoice: () => handleAddChoice(n.id),
        onUpdateChoiceText: (cId: string, text: string) => handleUpdateChoiceText(n.id, cId, text),
        onDeleteChoice: (cId: string) => handleDeleteChoice(n.id, cId),
        onOpenChoiceSettings: (cId: string) => handleOpenChoiceSettings(n.id, cId),
        onOpenNodeActions: () => handleOpenNodeActions(n.id),
        onUpdateBranchName: (name: string) => handleUpdateBranchName(n.id, name),
        onAddBranchCase: () => handleAddBranchCase(n.id),
        onUpdateBranchCaseName: (cId: string, name: string) =>
          handleUpdateBranchCaseName(n.id, cId, name),
        onDeleteBranchCase: (cId: string) => handleDeleteBranchCase(n.id, cId),
        onOpenBranchCaseConditions: (cId: string) => handleOpenBranchCaseConditions(n.id, cId),
      },
    }));
  }, [
    nodes,
    startNodeId,
    handleUpdateNodeText,
    handleUpdateSpeakerName,
    handleSetStartNode,
    handleDeleteNode,
    handleAddChoice,
    handleUpdateChoiceText,
    handleDeleteChoice,
    handleOpenChoiceSettings,
    handleOpenNodeActions,
    handleUpdateBranchName,
    handleAddBranchCase,
    handleUpdateBranchCaseName,
    handleDeleteBranchCase,
    handleOpenBranchCaseConditions,
  ]);

  const handleAddTextNode = useCallback(
    (pos?: { x: number; y: number }) => {
      const position =
        pos ||
        reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2 - 160,
          y: window.innerHeight / 2 - 100,
        });

      const newNodeId = `node_${Date.now().toString(36).substring(2, 6)}`;
      const newNode: Node<DialogueNodeData> = {
        id: newNodeId,
        type: 'dialogueNode',
        position,
        data: {
          nodeId: newNodeId,
          nodeType: 'text',
          speaker: 'npc',
          text: 'Новая реплика',
          isStartNode: nodes.length === 0,
          choices: [
            {
              id: `choice_${Date.now().toString(36).substring(2, 6)}`,
              text: 'Ответ...',
              targetNodeId: null,
            },
          ],
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

  const handleAddBranchNode = useCallback(
    (pos?: { x: number; y: number }) => {
      const position =
        pos ||
        reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2 - 160,
          y: window.innerHeight / 2 - 100,
        });

      const newBranchId = `branch_${Date.now().toString(36).substring(2, 6)}`;
      const newCaseId = `case_${Date.now().toString(36).substring(2, 6)}`;
      const newNode: Node<DialogueNodeData> = {
        id: newBranchId,
        type: 'branchNode',
        position,
        data: {
          nodeId: newBranchId,
          nodeType: 'branch',
          name: 'Ветвление',
          isStartNode: nodes.length === 0,
          branchCases: [
            {
              id: newCaseId,
              name: 'Ветка 1',
              conditions: [],
              targetNodeId: null,
            },
          ],
          defaultTargetNodeId: null,
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

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowPos: position,
      });
    },
    [reactFlowInstance]
  );

  const handleCreateDialogue = useCallback(() => {
    const newGraph = createEmptyDialogue();
    loadGraphIntoWorkspace(newGraph);
  }, [loadGraphIntoWorkspace]);

  const handleUpdateTitle = useCallback(
    (title: string) => {
      setDialogueTitle(title);
      saveCurrentGraph(nodes, edges, title);
    },
    [nodes, edges, saveCurrentGraph]
  );

  const handleExport = useCallback(() => {
    try {
      const jsonStr = exportDialogueToJson(currentId);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dialogue_${currentId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Ошибка экспорта: ${(err as Error).message}`);
    }
  }, [currentId]);

  const handleImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const imported = importDialogueFromJson(content);
          loadGraphIntoWorkspace(imported);
        } catch (err) {
          alert(`Ошибка импорта JSON: ${(err as Error).message}`);
        }
      };
      reader.readAsText(file);
    },
    [loadGraphIntoWorkspace]
  );

  const handleDeleteCurrentDialogue = useCallback(() => {
    if (confirm(`Удалить диалог "${dialogueTitle}" (${currentId})?`)) {
      if (deleteDialogue(currentId)) {
        const remaining = getAllDialogues();
        if (remaining.length > 0) {
          const next = getDialogueGraph(remaining[0].id);
          if (next) loadGraphIntoWorkspace(next);
        } else {
          handleCreateDialogue();
        }
      } else {
        alert('Нельзя удалить системный встроенный диалог.');
      }
    }
  }, [dialogueTitle, currentId, loadGraphIntoWorkspace, handleCreateDialogue]);

  const currentGraphData = useMemo<DialogueGraph>(() => {
    return {
      id: currentId,
      title: dialogueTitle,
      startNodeId,
      nodes: {},
    };
  }, [currentId, dialogueTitle, startNodeId]);

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
      <DialogueEditorTopBar
        currentDialogue={currentGraphData}
        allDialogues={getAllDialogues()}
        onSelectDialogue={setCurrentId}
        onCreateDialogue={handleCreateDialogue}
        onAddTextNode={() => handleAddTextNode()}
        onAddBranchNode={() => handleAddBranchNode()}
        onUpdateTitle={handleUpdateTitle}
        onExport={handleExport}
        onImport={handleImport}
        onDelete={handleDeleteCurrentDialogue}
        onClose={onClose}
      />

      <div style={{ flex: 1, position: 'relative' }} onClick={() => setContextMenu(null)}>
        <ReactFlow
          nodes={enhancedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
          colorMode="dark"
          fitView
          minZoom={0.2}
          maxZoom={2.0}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#3498db', strokeWidth: 2 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333333" />
          <Controls
            position="bottom-left"
            style={{ backgroundColor: '#222', borderColor: '#444' }}
          />
          <MiniMap
            position="bottom-right"
            nodeColor="#3498db"
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{
              backgroundColor: '#181818',
              border: '1px solid #333',
              borderRadius: 4,
            }}
          />
        </ReactFlow>

        {contextMenu && (
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: '#202020',
              border: '1px solid #444',
              borderRadius: 6,
              padding: 4,
              zIndex: 10000,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                handleAddTextNode(contextMenu.flowPos);
                setContextMenu(null);
              }}
              style={{
                backgroundColor: 'transparent',
                color: '#ecf0f1',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2c3e50')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span>💬</span>
              <span>Добавить реплику</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleAddBranchNode(contextMenu.flowPos);
                setContextMenu(null);
              }}
              style={{
                backgroundColor: 'transparent',
                color: '#ecf0f1',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#8e44ad')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span>🔀</span>
              <span>Добавить ветвление (Branch)</span>
            </button>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            backdropFilter: 'blur(6px)',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '4px 10px',
            color: '#888',
            fontSize: 11,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ПКМ по пустому месту — добавить узел / ветвление • ⚙️ — настроить условия и действия
        </div>
      </div>

      {activeModalTarget && (
        <RuleEditorModal
          isOpen={true}
          title={activeModalTarget.title}
          conditions={activeModalTarget.conditions}
          actions={activeModalTarget.actions}
          onSave={handleSaveModalRules}
          onClose={() => setActiveModalTarget(null)}
        />
      )}
    </div>
  );
};

export const DialogueEditorWorkspace: React.FC<InnerWorkspaceProps> = (props) => {
  return (
    <ReactFlowProvider>
      <InnerDialogueEditorWorkspace {...props} />
    </ReactFlowProvider>
  );
};
