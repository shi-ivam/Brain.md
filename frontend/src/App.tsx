import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Ribbon } from './components/Ribbon';
import { SpotlightSearch } from './components/SpotlightSearch';
import { KnowledgeGraphCanvas, KnowledgeGraphCanvasHandle } from './components/Graph/KnowledgeGraphCanvas';
import { GraphControls } from './components/Graph/GraphControls';
import { RightInspector } from './components/Inspector/RightInspector';
import { Breadcrumbs } from './components/Breadcrumbs';
import { AppModals } from './components/AppModals';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { parseUrlHash, updateUrlHash } from './utils/urlRouter';
import {
  KnowledgeGraphData,
  Topic,
  GraphNode,
  GraphEdge,
  DifficultyLevel,
  LayoutMode,
  NodeType,
  ShortestPathResult,
  CommunityGroupInfo,
  GraphWeaveResponse,
  InspectorTab,
  NodeVisualization,
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
  findShortestPath,
  fetchReviewQueue,
  fetchTopicCommunities,
  toggleNodeDone,
  autoOrganizeTopic,
  bridgeEdgeTransition,
  insertNodeOnEdge,
  deleteEdge,
  updateEdge,
} from './services/api';

export const App: React.FC = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('notes');
  const [targetSection, setTargetSection] = useState<string | undefined>(undefined);

  // Modals & Drawers state
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const [isWeaveModalOpen, setIsWeaveModalOpen] = useState(false);
  const [weaveInitialPrompt, setWeaveInitialPrompt] = useState<string>('');
  const [slidesModalNode, setSlidesModalNode] = useState<GraphNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Graph display state
  const canvasRef = useRef<KnowledgeGraphCanvasHandle | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dag');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<NodeType>>(
    new Set(['concept', 'prerequisite', 'subtopic', 'question', 'quiz', 'note'])
  );

  // Advanced features state
  const [lensMode, setLensMode] = useState<'all' | '1-hop' | '2-hop'>('all');
  const [colorMode, setColorMode] = useState<'default' | 'heatmap'>('default');
  const [shortestPathResult, setShortestPathResult] = useState<ShortestPathResult | null>(null);
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [dueReviewCount, setDueReviewCount] = useState<number>(0);
  const [communities, setCommunities] = useState<CommunityGroupInfo[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null);
  const [isAutoOrganizing, setIsAutoOrganizing] = useState<boolean>(false);

  // Navigation History hook
  const {
    history,
    historyIndex,
    isLinkCopied,
    setHistoryIndex,
    pushHistory,
    resetHistory,
    removeNodeFromHistory,
    handleHistoryBack,
    handleHistoryForward,
    handleNavigateHistory,
    handleCopyDeepLink,
  } = useNavigationHistory(
    activeTopicId,
    graphData,
    inspectorTab,
    targetSection,
    setSelectedNode
  );

  const handleSelectNode = useCallback(
    (
      n: GraphNode | null,
      tab?: InspectorTab,
      section?: string
    ) => {
      setSelectedNode(n);
      const chosenTab = tab || inspectorTab;
      if (tab) {
        setInspectorTab(tab);
      }
      setTargetSection(section);

      if (n) {
        pushHistory(n);
        updateUrlHash({
          topicId: activeTopicId || undefined,
          nodeId: n.id,
          tab: chosenTab,
          section,
        });
      } else {
        updateUrlHash({
          topicId: activeTopicId || undefined,
        });
      }
    },
    [activeTopicId, inspectorTab, pushHistory]
  );

  const refreshReviewDueCount = useCallback(async (topicId: string) => {
    try {
      const res = await fetchReviewQueue(topicId);
      setDueReviewCount(res.due_nodes?.length || 0);
    } catch (err) {
      console.error('Failed to fetch review due count:', err);
    }
  }, []);

  const loadGraph = useCallback(
    async (
      topicId: string,
      initialNodeId?: string,
      initialTab?: InspectorTab,
      initialSection?: string
    ) => {
      setIsLoading(true);
      try {
        const data = await fetchTopicGraph(topicId);
        setGraphData(data);
        setActiveTopicId(topicId);
        setDifficulty(data.topic.difficulty || 'intermediate');

        let nodeToSelect: GraphNode | null = null;
        if (initialNodeId) {
          nodeToSelect = data.nodes.find((n) => n.id === initialNodeId) || null;
        }
        setSelectedNode(nodeToSelect);
        if (initialTab) setInspectorTab(initialTab);
        if (initialSection) setTargetSection(initialSection);

        resetHistory(nodeToSelect);

        updateUrlHash(
          {
            topicId,
            nodeId: nodeToSelect?.id,
            tab: initialTab || (nodeToSelect ? inspectorTab : undefined),
            section: initialSection,
          },
          true
        );
        refreshReviewDueCount(topicId);
        setShortestPathResult(null);
        fetchTopicCommunities(topicId)
          .then((res) => setCommunities(res.communities))
          .catch(() => setCommunities([]));
        setSelectedCommunityId(null);
        setTimeout(() => {
          canvasRef.current?.fitGraph();
        }, 120);
      } catch (err) {
        console.error('Failed to load topic graph:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [inspectorTab, refreshReviewDueCount, resetHistory]
  );

  const loadTopics = useCallback(async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);

      const hashState = parseUrlHash();
      if (hashState.topicId) {
        loadGraph(hashState.topicId, hashState.nodeId, hashState.tab, hashState.section);
      } else if (data.length > 0 && !activeTopicId) {
        loadGraph(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  }, [activeTopicId, loadGraph]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // URL Hash change listener
  useEffect(() => {
    const handleHashChange = () => {
      const state = parseUrlHash();
      if (state.topicId && state.topicId !== activeTopicId) {
        loadGraph(state.topicId, state.nodeId, state.tab, state.section);
        return;
      }
      if (state.nodeId) {
        if (state.nodeId !== selectedNode?.id && graphData) {
          const targetNode = graphData.nodes.find((n) => n.id === state.nodeId);
          if (targetNode) {
            setSelectedNode(targetNode);
            if (state.tab) setInspectorTab(state.tab);
            if (state.section) setTargetSection(state.section);
          }
        }
      } else if (selectedNode) {
        setSelectedNode(null);
      }
      if (state.tab && state.tab !== inspectorTab) {
        setInspectorTab(state.tab);
      }
      if (state.section && state.section !== targetSection) {
        setTargetSection(state.section);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTopicId, selectedNode, graphData, inspectorTab, targetSection, loadGraph]);

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
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
        removeNodeFromHistory(nodeId);
      } catch (err) {
        console.error('Failed to delete node:', err);
      }
    },
    [removeNodeFromHistory]
  );

  // Global Keyboard Shortcuts hook
  useKeyboardShortcuts({
    isSpotlightOpen,
    isVaultOpen,
    hasSelectedNode: !!selectedNode,
    onToggleSpotlight: () => setIsSpotlightOpen((prev) => !prev),
    onCloseSpotlight: () => setIsSpotlightOpen(false),
    onCloseVault: () => setIsVaultOpen(false),
    onClearSelection: () => {
      setSelectedNode(null);
      setHistoryIndex(-1);
      updateUrlHash({ topicId: activeTopicId || undefined });
    },
    onDeleteSelectedNode: selectedNode ? () => handleDeleteNode(selectedNode.id) : undefined,
  });

  const handleDetachQuiz = useCallback(
    async (quizId: string) => {
      try {
        const res = await detachQuizToNode(quizId);
        if (res.full_graph) {
          setGraphData(res.full_graph);
          const newNode = res.full_graph.nodes.find((n) => n.id === res.new_node_id);
          if (newNode) {
            handleSelectNode(newNode, 'questions');
          }
        }
      } catch (err) {
        console.error('Failed to detach quiz question to node:', err);
      }
    },
    [handleSelectNode]
  );

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

  const handleFindShortestPath = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!activeTopicId) return;
      try {
        const res = await findShortestPath(activeTopicId, sourceId, targetId);
        setShortestPathResult(res);
      } catch (err) {
        console.error('Failed to find shortest path:', err);
      }
    },
    [activeTopicId]
  );

  const handleClearShortestPath = useCallback(() => {
    setShortestPathResult(null);
  }, []);

  const handleTopicImported = useCallback(
    async (importedTopicId: string) => {
      await loadTopics();
      await loadGraph(importedTopicId);
    },
    [loadTopics, loadGraph]
  );

  const handleSelectEdge = useCallback(
    (edge: GraphEdge) => {
      if (!graphData) return;
      const target = graphData.nodes.find((n) => n.id === edge.target_id);
      if (target) {
        handleSelectNode(target, 'connections');
      }
    },
    [graphData, handleSelectNode]
  );

  const handleToggleDone = useCallback(
    async (node: GraphNode) => {
      try {
        const updated = await toggleNodeDone(node.id);
        setGraphData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === node.id ? { ...n, is_done: updated.is_done } : n)),
          };
        });
        if (selectedNode && selectedNode.id === node.id) {
          setSelectedNode((prev) => (prev ? { ...prev, is_done: updated.is_done } : null));
        }
      } catch (err) {
        console.error('Failed to toggle node done status:', err);
      }
    },
    [selectedNode]
  );

  const handleAutoOrganize = useCallback(async () => {
    if (!activeTopicId || isAutoOrganizing) return;
    setIsAutoOrganizing(true);
    try {
      const res = await autoOrganizeTopic(activeTopicId);
      if (res.full_graph) {
        setLayoutMode('dag');
        setGraphData(res.full_graph);
        if (selectedNode) {
          const fresh = res.full_graph.nodes.find((n) => n.id === selectedNode.id);
          if (fresh) setSelectedNode(fresh);
        }
        setTimeout(() => {
          canvasRef.current?.fitGraph();
        }, 120);
      }
    } catch (err) {
      console.error('Failed to auto-organize topic graph:', err);
    } finally {
      setIsAutoOrganizing(false);
    }
  }, [activeTopicId, isAutoOrganizing, selectedNode]);

  const handleCreateTopic = async (topicQuery: string, chosenDifficulty: DifficultyLevel) => {
    setIsLoading(true);
    try {
      const data = await generateTopic(topicQuery, chosenDifficulty);
      setGraphData(data);
      setActiveTopicId(data.topic.id);
      setDifficulty(chosenDifficulty);
      setIsSpotlightOpen(false);
      await loadTopics();
      const rootNode = data.nodes.find((n) => n.node_type === 'concept');
      if (rootNode) {
        handleSelectNode(rootNode);
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
        resetHistory(null);
        updateUrlHash({});
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
    action:
      | 'add_question'
      | 'add_note'
      | 'generate_quiz'
      | 'expand_subtopics'
      | 'decompose_question'
      | 'subquestions'
      | 'tested_concepts'
      | 'attach_resource'
      | 'generate_visualizations',
    node: GraphNode
  ) => {
    handleSelectNode(node);

    if (action === 'add_question') {
      setInspectorTab('questions');
    } else if (action === 'add_note') {
      setInspectorTab('notes');
    } else if (action === 'generate_quiz') {
      setInspectorTab('quiz');
    } else if (action === 'attach_resource') {
      setInspectorTab('resources');
    } else if (action === 'generate_visualizations') {
      setInspectorTab('visualizations');
    } else if (action === 'expand_subtopics') {
      setIsLoading(true);
      try {
        const res = await expandNode(node.id, 'subtopics', difficulty);
        setGraphData(res.full_graph);
        fetchTopicCommunities(node.topic_id).then((c) => setCommunities(c.communities)).catch(() => {});
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
        fetchTopicCommunities(node.topic_id).then((c) => setCommunities(c.communities)).catch(() => {});
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
        fetchTopicCommunities(node.topic_id).then((c) => setCommunities(c.communities)).catch(() => {});
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
        fetchTopicCommunities(node.topic_id).then((c) => setCommunities(c.communities)).catch(() => {});
      } catch (err) {
        console.error('Failed to branch tested concepts:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleBridgeEdge = async (
    edgeId: string,
    bridgeCount: number,
    bridgeDiff: DifficultyLevel,
    focusNote?: string
  ) => {
    setIsLoading(true);
    try {
      const res = await bridgeEdgeTransition(edgeId, {
        bridge_count: bridgeCount,
        difficulty: bridgeDiff,
        focus_note: focusNote,
      });
      setGraphData(res.full_graph);
      if (res.created_node_ids && res.created_node_ids.length > 0) {
        const firstNode = res.full_graph.nodes.find((n) => n.id === res.created_node_ids[0]);
        if (firstNode) handleSelectNode(firstNode, 'notes');
      }
      if (activeTopicId) {
        fetchTopicCommunities(activeTopicId).then((c) => setCommunities(c.communities)).catch(() => {});
      }
    } catch (err: any) {
      console.error('Failed to bridge edge:', err);
      alert(err.message || 'Failed to bridge edge transition');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertNodeOnEdge = async (
    edgeId: string,
    title: string,
    nodeType: string,
    summary?: string,
    relSourceToNew?: string,
    relNewToTarget?: string,
    lblSourceToNew?: string,
    lblNewToTarget?: string
  ) => {
    setIsLoading(true);
    try {
      const res = await insertNodeOnEdge(edgeId, {
        title,
        node_type: nodeType,
        summary,
        relation_source_to_new: relSourceToNew,
        relation_new_to_target: relNewToTarget,
        label_source_to_new: lblSourceToNew,
        label_new_to_target: lblNewToTarget,
      });
      setGraphData(res.full_graph);
      const newNode = res.full_graph.nodes.find((n) => n.id === res.new_node_id);
      if (newNode) handleSelectNode(newNode, 'notes');
      if (activeTopicId) {
        fetchTopicCommunities(activeTopicId).then((c) => setCommunities(c.communities)).catch(() => {});
      }
    } catch (err: any) {
      console.error('Failed to insert node on edge:', err);
      alert(err.message || 'Failed to insert node on edge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    setIsLoading(true);
    try {
      await deleteEdge(edgeId);
      if (activeTopicId) {
        const fresh = await fetchTopicGraph(activeTopicId);
        setGraphData(fresh);
        fetchTopicCommunities(activeTopicId).then((c) => setCommunities(c.communities)).catch(() => {});
      }
    } catch (err: any) {
      console.error('Failed to delete edge:', err);
      alert(err.message || 'Failed to delete edge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateEdge = async (edgeId: string, relationType: string, label: string) => {
    setIsLoading(true);
    try {
      await updateEdge(edgeId, {
        relation_type: relationType,
        edge_type: relationType,
        label,
      });
      if (activeTopicId) {
        const fresh = await fetchTopicGraph(activeTopicId);
        setGraphData(fresh);
      }
    } catch (err: any) {
      console.error('Failed to update edge:', err);
      alert(err.message || 'Failed to update edge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWeaveSuccess = (res: GraphWeaveResponse) => {
    setGraphData(res.full_graph);
    const targetNode = res.full_graph.nodes.find((n) => n.id === res.primary_node_id);
    if (targetNode) {
      handleSelectNode(targetNode, 'notes');
    }
    if (activeTopicId) {
      fetchTopicCommunities(activeTopicId).then((c) => setCommunities(c.communities)).catch(() => {});
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
          setLayoutMode((m) => (m === 'dag' ? 'force' : 'dag'));
          setTimeout(() => setLayoutMode((m) => (m === 'force' ? 'dag' : 'force')), 50);
        }}
        onExportVault={handleExportVault}
        onOpenReviewQueue={() => setIsReviewDrawerOpen(true)}
        dueReviewCount={dueReviewCount}
        activeTopicTitle={graphData?.topic.title}
        hasActiveTopic={!!graphData}
        onOpenWeave={() => {
          setWeaveInitialPrompt('');
          setIsWeaveModalOpen(true);
        }}
      />

      {/* Main Canvas Area */}
      <main style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {graphData && graphData.nodes.length > 0 ? (
          <>
            {/* Top Interactive Breadcrumbs Navigation */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '20px',
                zIndex: 25,
                pointerEvents: 'auto',
              }}
            >
              <Breadcrumbs
                topicTitle={graphData.topic.title}
                history={history}
                currentIndex={historyIndex}
                onNavigateHistory={handleNavigateHistory}
                onBack={handleHistoryBack}
                onForward={handleHistoryForward}
                canGoBack={historyIndex > 0}
                canGoForward={historyIndex < history.length - 1}
                currentNode={selectedNode}
                onSelectTopic={() => {
                  setSelectedNode(null);
                  setHistoryIndex(-1);
                  updateUrlHash({ topicId: activeTopicId || undefined });
                }}
                onCopyLink={() => handleCopyDeepLink(selectedNode?.id)}
                linkCopied={isLinkCopied}
              />
            </div>

            {/* Obsidian Graph Controls (Top Right) */}
            <GraphControls
              layoutMode={layoutMode}
              onToggleLayout={setLayoutMode}
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
              onResetView={() => canvasRef.current?.fitGraph()}
              searchFilter={searchFilter}
              onSearchFilterChange={setSearchFilter}
              activeFilters={activeFilters}
              onToggleFilter={handleToggleFilter}
              lensMode={lensMode}
              onLensModeChange={setLensMode}
              colorMode={colorMode}
              onColorModeToggle={() => setColorMode((c) => (c === 'default' ? 'heatmap' : 'default'))}
              nodes={graphData.nodes}
              onFindShortestPath={handleFindShortestPath}
              onClearShortestPath={handleClearShortestPath}
              shortestPathActive={!!shortestPathResult && shortestPathResult.found}
              showMiniMap={showMiniMap}
              onToggleMiniMap={() => setShowMiniMap((prev) => !prev)}
              communities={communities}
              selectedCommunityId={selectedCommunityId}
              onSelectCommunity={setSelectedCommunityId}
              onAutoOrganize={handleAutoOrganize}
              isAutoOrganizing={isAutoOrganizing}
              onOpenWeave={() => {
                setWeaveInitialPrompt('');
                setIsWeaveModalOpen(true);
              }}
            />

            {/* Interactive 2D Canvas Engine */}
            <KnowledgeGraphCanvas
              ref={canvasRef}
              nodes={graphData.nodes}
              edges={graphData.edges}
              layoutMode={layoutMode}
              selectedNodeId={selectedNode?.id}
              onSelectNode={handleSelectNode}
              onToggleDone={handleToggleDone}
              onOpenAction={handleOpenAction}
              difficulty={difficulty}
              searchFilter={searchFilter}
              activeFilters={activeFilters}
              onDeleteNode={handleDeleteNode}
              onNodePositionChange={handleNodePositionChange}
              onSynthesizeNote={(n) => handleSelectNode(n, 'notes')}
              onDecomposeQuestion={async (nodeId) => {
                const targetNode = graphData.nodes.find((n) => n.id === nodeId);
                if (targetNode) {
                  await handleOpenAction('decompose_question', targetNode);
                }
              }}
              onOpenQuiz={(n) => handleSelectNode(n, 'quiz')}
              resources={graphData.resources || []}
              onOpenResources={(n) => handleSelectNode(n, 'resources')}
              onOpenVisualizations={(n) => handleSelectNode(n, 'visualizations')}
              onOpenSlides={(n) => setSlidesModalNode(n)}
              lensMode={lensMode}
              shortestPath={shortestPathResult}
              colorMode={colorMode}
              showMiniMap={showMiniMap}
              onSelectEdge={handleSelectEdge}
              selectedCommunityNodeIds={
                selectedCommunityId !== null && selectedCommunityId !== undefined
                  ? new Set(communities.find((c) => c.community_id === selectedCommunityId)?.node_ids || [])
                  : null
              }
              onBridgeEdge={handleBridgeEdge}
              onInsertNodeOnEdge={handleInsertNodeOnEdge}
              onDeleteEdge={handleDeleteEdge}
              onUpdateEdge={handleUpdateEdge}
            />
          </>
        ) : (
          /* Empty State */
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
              activeTopicId={activeTopicId}
              activeTopicTitle={graphData?.topic.title}
              onSelectNode={(nodeId, targetTab) => {
                const n = graphData?.nodes.find((node) => node.id === nodeId);
                if (n) {
                  handleSelectNode(n, targetTab);
                }
              }}
              onOpenWeave={(q) => {
                setWeaveInitialPrompt(q);
                setIsWeaveModalOpen(true);
              }}
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
          resources={graphData.resources || []}
          visualizations={graphData.visualizations || []}
          difficulty={difficulty}
          initialTab={inspectorTab}
          targetSection={targetSection}
          onToggleDone={handleToggleDone}
          onResourceAdded={(newRes) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              const currentRes = prev.resources || [];
              return {
                ...prev,
                resources: [...currentRes, newRes],
              };
            });
          }}
          onResourceDeleted={(resId) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                resources: (prev.resources || []).filter((r) => r.id !== resId),
              };
            });
          }}
          onVisualizationAdded={(newVis) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              const currentVis = prev.visualizations || [];
              const exists = currentVis.some((v) => v.id === newVis.id);
              return {
                ...prev,
                visualizations: exists
                  ? currentVis.map((v) => (v.id === newVis.id ? newVis : v))
                  : [...currentVis, newVis],
              };
            });
          }}
          onVisualizationUpdated={(updatedVis) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              const currentVis = prev.visualizations || [];
              return {
                ...prev,
                visualizations: currentVis.map((v) => (v.id === updatedVis.id ? updatedVis : v)),
              };
            });
          }}
          onVisualizationDeleted={(visId) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              const currentVis = prev.visualizations || [];
              return {
                ...prev,
                visualizations: currentVis.filter((v) => v.id !== visId),
              };
            });
          }}
          onClose={() => {
            setSelectedNode(null);
            setHistoryIndex(-1);
            updateUrlHash({ topicId: activeTopicId || undefined });
          }}
          onTabChange={(tab) => {
            setInspectorTab(tab);
            updateUrlHash(
              {
                topicId: activeTopicId || undefined,
                nodeId: selectedNode.id,
                tab,
                section: targetSection,
              },
              true
            );
          }}
          onNodeUpdated={(nodeId, newContent) => {
            setGraphData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, content: newContent } : n)),
              };
            });
          }}
          onGraphUpdated={(fullGraph) => {
            setGraphData(fullGraph);
            if (activeTopicId) refreshReviewDueCount(activeTopicId);
          }}
          onInquiryAdded={(newInquiry, updatedGraph) => {
            if (updatedGraph) {
              setGraphData(updatedGraph);
              if (activeTopicId) refreshReviewDueCount(activeTopicId);
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
              if (activeTopicId) refreshReviewDueCount(activeTopicId);
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
            if (activeTopicId) refreshReviewDueCount(activeTopicId);
          }}
          onSelectNode={(n) => handleSelectNode(n)}
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

      {/* Global Modals, Drawers, and Overlays */}
      <AppModals
        isSpotlightOpen={isSpotlightOpen}
        onCloseSpotlight={() => setIsSpotlightOpen(false)}
        isLoading={isLoading}
        activeTopicId={activeTopicId}
        graphData={graphData}
        handleCreateTopic={handleCreateTopic}
        handleSelectNode={handleSelectNode}
        onOpenWeaveWithPrompt={(q) => {
          setWeaveInitialPrompt(q);
          setIsWeaveModalOpen(true);
        }}
        isVaultOpen={isVaultOpen}
        topics={topics}
        loadGraph={loadGraph}
        handleDeleteTopic={handleDeleteTopic}
        handleTopicImported={handleTopicImported}
        onCloseVault={() => setIsVaultOpen(false)}
        onOpenSpotlightFromVault={() => {
          setIsVaultOpen(false);
          setIsSpotlightOpen(true);
        }}
        isReviewDrawerOpen={isReviewDrawerOpen}
        onCloseReviewDrawer={() => {
          setIsReviewDrawerOpen(false);
          if (activeTopicId) refreshReviewDueCount(activeTopicId);
        }}
        onReviewCompleted={(fullGraph) => {
          setGraphData(fullGraph);
          if (activeTopicId) refreshReviewDueCount(activeTopicId);
        }}
        onUpdateNodeMastery={(nodeId, masteryScore) => {
          setGraphData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              nodes: prev.nodes.map((n) =>
                n.id === nodeId ? { ...n, mastery_score: masteryScore } : n
              ),
            };
          });
        }}
        slidesModalNode={slidesModalNode}
        difficulty={difficulty}
        onCloseSlides={() => setSlidesModalNode(null)}
        isWeaveModalOpen={isWeaveModalOpen}
        weaveInitialPrompt={weaveInitialPrompt}
        onCloseWeave={() => setIsWeaveModalOpen(false)}
        onWeaveSuccess={handleWeaveSuccess}
      />
    </div>
  );
};
