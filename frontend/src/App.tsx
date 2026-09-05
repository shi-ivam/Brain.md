import React, { useState, useEffect, useCallback } from 'react';
import { Ribbon } from './components/Ribbon';
import { SpotlightSearch } from './components/SpotlightSearch';
import { KnowledgeGraphCanvas } from './components/Graph/KnowledgeGraphCanvas';
import { GraphControls } from './components/Graph/GraphControls';
import { RightInspector } from './components/Inspector/RightInspector';
import { VaultDrawer } from './components/VaultDrawer';
import {
  KnowledgeGraphData,
  Topic,
  GraphNode,
  DifficultyLevel,
  LayoutMode,
  NodeType,
  Quiz,
  Inquiry,
} from './types';
import {
  fetchTopics,
  fetchTopicGraph,
  generateTopic,
  deleteTopic,
  expandNode,
  exportObsidianVaultUrl,
  deleteNode,
  detachQuizToNode,
  updateNodePosition,
} from './services/api';

export const App: React.FC = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'notes' | 'questions' | 'quiz' | 'connections'>('notes');

  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Graph state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dag');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<NodeType>>(
    new Set(['concept', 'prerequisite', 'subtopic', 'question', 'quiz', 'note'])
  );

  // Load topics from SQLite on initial mount
  const loadTopics = useCallback(async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);
      if (data.length > 0 && !activeTopicId) {
        // Load the most recently updated topic
        loadGraph(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  }, [activeTopicId]);

  useEffect(() => {
    loadTopics();
  }, []);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    try {
      const res = await deleteNode(nodeId);
      if (res.full_graph) {
        setGraphData(res.full_graph);
      } else {
        setGraphData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: prev.nodes.filter((n) => n.id !== nodeId),
            edges: prev.edges.filter((e) => e.source_id !== nodeId && e.target_id !== nodeId),
            quizzes: prev.quizzes.filter((q) => q.node_id !== nodeId),
            inquiries: prev.inquiries.filter((inq) => inq.node_id !== nodeId),
          };
        });
      }
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
    } catch (err) {
      console.error('Failed to delete node:', err);
    }
  }, []);

  const handleDetachQuiz = useCallback(async (quizId: string) => {
    try {
      const res = await detachQuizToNode(quizId);
      if (res.full_graph) {
        setGraphData(res.full_graph);
        const newNode = res.full_graph.nodes.find((n) => n.id === res.new_node_id);
        if (newNode) {
          setSelectedNode(newNode);
          setInspectorTab('questions');
        }
      }
    } catch (err) {
      console.error('Failed to detach quiz question to node:', err);
    }
  }, []);

  const handleNodePositionChange = useCallback(async (nodeId: string, posX: number, posY: number) => {
    setGraphData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, pos_x: posX, pos_y: posY } : n)),
      };
    });
    try {
      await updateNodePosition(nodeId, posX, posY);
    } catch (err) {
      console.error('Failed to persist node position:', err);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isSpotlightOpen) setIsSpotlightOpen(false);
        else if (isVaultOpen) setIsVaultOpen(false);
        else if (selectedNode) setSelectedNode(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && !isEditable && selectedNode) {
          e.preventDefault();
          handleDeleteNode(selectedNode.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSpotlightOpen, isVaultOpen, selectedNode, handleDeleteNode]);

  const loadGraph = async (topicId: string) => {
    setIsLoading(true);
    try {
      const data = await fetchTopicGraph(topicId);
      setGraphData(data);
      setActiveTopicId(topicId);
      setDifficulty(data.topic.difficulty || 'intermediate');
      setSelectedNode(null);
    } catch (err) {
      console.error('Failed to load topic graph:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTopic = async (topicQuery: string, chosenDifficulty: DifficultyLevel) => {
    setIsLoading(true);
    try {
      const data = await generateTopic(topicQuery, chosenDifficulty);
      setGraphData(data);
      setActiveTopicId(data.topic.id);
      setDifficulty(chosenDifficulty);
      setIsSpotlightOpen(false);
      await loadTopics();
      // Select the root node if available
      const rootNode = data.nodes.find((n) => n.node_type === 'concept');
      if (rootNode) {
        setSelectedNode(rootNode);
      }
    } catch (err) {
      console.error('Error generating topic:', err);
      alert(`Error generating knowledge graph: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    try {
      await deleteTopic(topicId);
      if (activeTopicId === topicId) {
        setGraphData(null);
        setActiveTopicId(null);
        setSelectedNode(null);
      }
      await loadTopics();
    } catch (err) {
      console.error('Failed to delete topic:', err);
    }
  };

  const handleExportVault = () => {
    if (!activeTopicId) return;
    window.location.href = exportObsidianVaultUrl(activeTopicId);
  };

  // Node '+' popover actions
  const handleOpenAction = async (
    action: 'add_question' | 'add_note' | 'generate_quiz' | 'expand_subtopics' | 'decompose_question' | 'subquestions' | 'tested_concepts',
    node: GraphNode
  ) => {
    setSelectedNode(node);

    if (action === 'add_question') {
      setInspectorTab('questions');
    } else if (action === 'add_note') {
      setInspectorTab('notes');
    } else if (action === 'generate_quiz') {
      setInspectorTab('quiz');
    } else if (action === 'expand_subtopics') {
      setIsLoading(true);
      try {
        const res = await expandNode(node.id, 'subtopics', difficulty);
        setGraphData(res.full_graph);
      } catch (err) {
        console.error('Failed to expand subtopics:', err);
      } finally {
        setIsLoading(false);
      }
    } else if (action === 'decompose_question') {
      setIsLoading(true);
      try {
        const res = await expandNode(node.id, 'topics_affecting_question', difficulty);
        setGraphData(res.full_graph);
      } catch (err) {
        console.error('Failed to decompose question:', err);
      } finally {
        setIsLoading(false);
      }
    } else if (action === 'subquestions') {
      setIsLoading(true);
      try {
        const res = await expandNode(node.id, 'subquestions', difficulty);
        setGraphData(res.full_graph);
      } catch (err) {
        console.error('Failed to branch subquestions:', err);
      } finally {
        setIsLoading(false);
      }
    } else if (action === 'tested_concepts') {
      setIsLoading(true);
      try {
        const res = await expandNode(node.id, 'tested_concepts', difficulty);
        setGraphData(res.full_graph);
      } catch (err) {
        console.error('Failed to branch tested concepts:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleToggleFilter = (type: NodeType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left Slim Obsidian Ribbon */}
      <Ribbon
        onOpenVault={() => setIsVaultOpen(true)}
        onOpenSpotlight={() => setIsSpotlightOpen(true)}
        onFitGraph={() => {
          // Trigger layout fit by toggling mode or reset
          setLayoutMode((m) => (m === 'dag' ? 'force' : 'dag'));
          setTimeout(() => setLayoutMode((m) => (m === 'force' ? 'dag' : 'force')), 50);
        }}
        onExportVault={handleExportVault}
        activeTopicTitle={graphData?.topic.title}
        hasActiveTopic={!!graphData}
      />

      {/* Main Canvas Area */}
      <main style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {graphData && graphData.nodes.length > 0 ? (
          <>
            {/* Top Graph Title & Breadcrumb */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '20px',
                zIndex: 25,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {graphData.topic.title}
              </span>
            </div>

            {/* Obsidian Graph Controls (Top Right) */}
            <GraphControls
              layoutMode={layoutMode}
              onToggleLayout={setLayoutMode}
              onZoomIn={() => {}}
              onZoomOut={() => {}}
              onResetView={() => {}}
              searchFilter={searchFilter}
              onSearchFilterChange={setSearchFilter}
              activeFilters={activeFilters}
              onToggleFilter={handleToggleFilter}
            />

            {/* Interactive 2D Canvas Engine */}
            <KnowledgeGraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              layoutMode={layoutMode}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(n) => {
                setSelectedNode(n);
              }}
              onOpenAction={handleOpenAction}
              difficulty={difficulty}
              searchFilter={searchFilter}
              activeFilters={activeFilters}
              onDeleteNode={handleDeleteNode}
              onNodePositionChange={handleNodePositionChange}
              onSynthesizeNote={(n) => {
                setSelectedNode(n);
                setInspectorTab('notes');
              }}
              onDecomposeQuestion={async (nodeId) => {
                const targetNode = graphData.nodes.find((n) => n.id === nodeId);
                if (targetNode) {
                  await handleOpenAction('decompose_question', targetNode);
                }
              }}
              onOpenQuiz={(n) => {
                setSelectedNode(n);
                setInspectorTab('quiz');
              }}
            />
          </>
        ) : (
          /* Empty State: Prompt in the exact middle */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              padding: '24px',
            }}
          >
            <SpotlightSearch
              onSearch={handleCreateTopic}
              isLoading={isLoading}
            />
          </div>
        )}
      </main>

      {/* Right Slide-over Inspector Panel */}
      {selectedNode && graphData && (
        <RightInspector
          node={selectedNode}
          nodes={graphData.nodes}
          edges={graphData.edges}
          quizzes={graphData.quizzes}
          inquiries={graphData.inquiries}
          difficulty={difficulty}
          initialTab={inspectorTab}
          onClose={() => setSelectedNode(null)}
          onNodeUpdated={(nodeId, newContent) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, content: newContent } : n)),
              };
            });
          }}
          onInquiryAdded={(newInquiry, updatedGraph) => {
            if (updatedGraph) {
              setGraphData(updatedGraph);
            } else {
              setGraphData((prev) => {
                if (!prev) return prev;
                return { ...prev, inquiries: [...prev.inquiries, newInquiry] };
              });
            }
          }}
          onQuizzesGenerated={(newQuizzes, updatedGraph) => {
            if (updatedGraph) {
              setGraphData(updatedGraph);
            } else {
              setGraphData((prev) => {
                if (!prev) return prev;
                return { ...prev, quizzes: [...prev.quizzes, ...newQuizzes] };
              });
            }
          }}
          onQuizAnswered={(quizId, selectedOption, isCorrect) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                quizzes: prev.quizzes.map((q) =>
                  q.id === quizId ? { ...q, user_answer: selectedOption, is_correct: isCorrect } : q
                ),
              };
            });
          }}
          onSelectNode={(n) => setSelectedNode(n)}
          onDecomposeQuestion={async (questionNodeId) => {
            setIsLoading(true);
            try {
              const res = await expandNode(questionNodeId, 'topics_affecting_question', difficulty);
              setGraphData(res.full_graph);
            } finally {
              setIsLoading(false);
            }
          }}
          onDeleteNode={handleDeleteNode}
          onDetachQuiz={handleDetachQuiz}
        />
      )}

      {/* Spotlight Overlay Modal (when toggled via Cmd/Ctrl+K or Ribbon) */}
      {isSpotlightOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setIsSpotlightOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SpotlightSearch
              onSearch={handleCreateTopic}
              isLoading={isLoading}
              onClose={() => setIsSpotlightOpen(false)}
              isOverlay={true}
            />
          </div>
        </div>
      )}

      {/* Vault Manager Drawer */}
      <VaultDrawer
        isOpen={isVaultOpen}
        topics={topics}
        activeTopicId={activeTopicId || undefined}
        onSelectTopic={loadGraph}
        onDeleteTopic={handleDeleteTopic}
        onExportTopic={(id) => {
          window.location.href = exportObsidianVaultUrl(id);
        }}
        onClose={() => setIsVaultOpen(false)}
        onNewTopic={() => {
          setIsVaultOpen(false);
          setIsSpotlightOpen(true);
        }}
      />
    </div>
  );
};
