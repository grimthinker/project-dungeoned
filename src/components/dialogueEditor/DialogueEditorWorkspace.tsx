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

import { DialogueGraph, DialogueChoice, DialogueAction } from '../../dialogue/types';
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
import { DialogueEditorTopBar } from './DialogueEditorTopBar';

const nodeTypes = {
  dialogueNode: DialogueNodeComponent,
};

interface InnerWorkspaceProps {
  initialDialogueId: string;
  onClose: () => void;
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

  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  // Синхронизация графа из реестра
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

  // Сохранение изменений в реестр диалогов
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
        saveCurrentGraph(nodes, next);
        return next;
      });
    },
    [nodes, saveCurrentGraph]
  );

  // Соединение портов: гарантируем не более одной исходящей стрелки от одного варианта ответа
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)
        );
        const next = addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#3498db', strokeWidth: 2 },
          },
          filtered
        );
        saveCurrentGraph(nodes, next);
        return next;
      });
    },
    [nodes, saveCurrentGraph]
  );

  // Коллбэки управления узлами
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

  // Обогащаем data узлов коллбэками
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
  ]);

  // Создание новой реплики в произвольной точке клика
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = `node_${Date.now().toString(36).substring(2, 6)}`;
      const newNode: Node<DialogueNodeData> = {
        id: newNodeId,
        type: 'dialogueNode',
        position,
        data: {
          nodeId: newNodeId,
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

  // Верхняя панель: действия
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
        onUpdateTitle={handleUpdateTitle}
        onExport={handleExport}
        onImport={handleImport}
        onDelete={handleDeleteCurrentDialogue}
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
          ПКМ по пустому месту — добавить узел • Тяните точку ответа для соединения
        </div>
      </div>
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
