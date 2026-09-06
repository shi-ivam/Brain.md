import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Ribbon } from './components/Ribbon';
import { SpotlightSearch } from './components/SpotlightSearch';
import { KnowledgeGraphCanvas, KnowledgeGraphCanvasHandle } from './components/Graph/KnowledgeGraphCanvas';
import { GraphControls } from './components/Graph/GraphControls';
import { RightInspector } from './components/Inspector/RightInspector';
import { VaultDrawer } from './components/VaultDrawer';
import { ReviewDrawer } from './components/ReviewDrawer';
import { Breadcrumbs, BreadcrumbItem } from './components/Breadcrumbs';
import { parseUrlHash, updateUrlHash, copyDeepLinkToClipboard } from './utils/urlRouter';
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
} from './services/api';

export const App: React.FC = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'notes' | 'questions' | 'quiz' | 'connections'>('notes');
  const [targetSection, setTargetSection] = useState<string | undefined>(undefined);

  // Navigation history for Breadcrumbs
  const [history, setHistory] = useState<BreadcrumbItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Graph state
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
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const [dueReviewCount, setDueReviewCount] = useState<number>(0);
  const [communities, setCommunities] = useState<CommunityGroupInfo[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null);
  const [isAutoOrganizing, setIsAutoOrganizing] = useState<boolean>(false);

  const handleSelectNode = useCallback(
    (
      n: GraphNode | null,
      tab?: 'notes' | 'questions' | 'quiz' | 'connections',
      section?: string
    ) => {
      setSelectedNode(n);
      const chosenTab = tab || inspectorTab;
      if (tab) {
        setInspectorTab(tab);
      }
      setTargetSection(section);

      if (n) {
        setHistory((prev) => {
          const nextItem: BreadcrumbItem = {
            id: n.id,
            title: n.title,
            node_type: n.node_type,
            mastery_score: n.mastery_score,
          };
          const upToCurrent = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
          if (upToCurrent.length > 0 && upToCurrent[upToCurrent.length - 1].id === n.id) {
            return upToCurrent;
          }
          return [...upToCurrent, nextItem];
        });
        setHistoryIndex((prev) => (prev >= 0 ? prev + 1 : 0));

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
    [activeTopicId, historyIndex, inspectorTab]
  );

  const handleHistoryBack = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const item = history[targetIdx];
      const n = graphData?.nodes.find((node) => node.id === item.id) || null;
      setSelectedNode(n);
      setHistoryIndex(targetIdx);
      updateUrlHash({
        topicId: activeTopicId || undefined,
        nodeId: n?.id,
        tab: inspectorTab,
      });
    } else if (historyIndex === 0) {
      setSelectedNode(null);
      setHistoryIndex(-1);
      updateUrlHash({
        topicId: activeTopicId || undefined,
      });
    }
  }, [history, historyIndex, graphData, activeTopicId, inspectorTab]);

  const handleHistoryForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIdx = historyIndex + 1;
      const item = history[targetIdx];
      const n = graphData?.nodes.find((node) => node.id === item.id) || null;
      setSelectedNode(n);
      setHistoryIndex(targetIdx);
      updateUrlHash({
        topicId: activeTopicId || undefined,
        nodeId: n?.id,
        tab: inspectorTab,
      });
    }
  }, [history, historyIndex, graphData, activeTopicId, inspectorTab]);

  const handleNavigateHistory = useCallback(
    (idx: number) => {
      if (idx >= 0 && idx < history.length) {
        const item = history[idx];
        const n = graphData?.nodes.find((node) => node.id === item.id) || null;
        setSelectedNode(n);
        setHistoryIndex(idx);
        updateUrlHash({
          topicId: activeTopicId || undefined,
          nodeId: n?.id,
          tab: inspectorTab,
        });
      }
    },
    [history, graphData, activeTopicId, inspectorTab]
  );

  const handleCopyDeepLink = useCallback(async () => {
    const success = await copyDeepLinkToClipboard({
      topicId: activeTopicId || undefined,
      nodeId: selectedNode?.id,
      tab: inspectorTab,
      section: targetSection,
    });
    if (success) {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    }
  }, [activeTopicId, selectedNode, inspectorTab, targetSection]);

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
      initialTab?: 'notes' | 'questions' | 'quiz' | 'connections',
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

        if (nodeToSelect) {
          setHistory([
            {
              id: nodeToSelect.id,
              title: nodeToSelect.title,
              node_type: nodeToSelect.node_type,
              mastery_score: nodeToSelect.mastery_score,
            },
          ]);
          setHistoryIndex(0);
        } else {
          setHistory([]);
          setHistoryIndex(-1);
        }

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
    [inspectorTab, refreshReviewDueCount]
  );

  // Load topics from SQLite on initial mount and check URL hash
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

  // Listen to external hash changes (e.g. browser back/forward or deep links)
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
      setHistory((prev) => prev.filter((item) => item.id !== nodeId));
      setHistoryIndex((prev) => Math.max(-1, prev - 1));
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
          handleSelectNode(newNode, 'questions');
        }
      }
    } catch (err) {
      console.error('Failed to detach quiz question to node:', err);
    }
  }, [handleSelectNode]);

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

  const handleFindShortestPath = useCallback(async (sourceId: string, targetId: string) => {
    if (!activeTopicId) return;
    try {
      const res = await findShortestPath(activeTopicId, sourceId, targetId);
      setShortestPathResult(res);
    } catch (err) {
      console.error('Failed to find shortest path:', err);
    }
  }, [activeTopicId]);

  const handleClearShortestPath = useCallback(() => {
    setShortestPathResult(null);
  }, []);

  const handleTopicImported = useCallback(async (importedTopicId: string) => {
    await loadTopics();
    await loadGraph(importedTopicId);
  }, [loadTopics, loadGraph]);

  const handleSelectEdge = useCallback((edge: GraphEdge) => {
    if (!graphData) return;
    const target = graphData.nodes.find((n) => n.id === edge.target_id);
    if (target) {
      handleSelectNode(target, 'connections');
    }
  }, [graphData, handleSelectNode]);

  const handleToggleDone = useCallback(async (node: GraphNode) => {
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
  }, [selectedNode]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isSpotlightOpen) setIsSpotlightOpen(false);
        else if (isVaultOpen) setIsVaultOpen(false);
        else if (selectedNode) {
          setSelectedNode(null);
          setHistoryIndex(-1);
          updateUrlHash({ topicId: activeTopicId || undefined });
        }
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
  }, [isSpotlightOpen, isVaultOpen, selectedNode, handleDeleteNode, activeTopicId]);

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
        setHistory([]);
        setHistoryIndex(-1);
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
    action: 'add_question' | 'add_note' | 'generate_quiz' | 'expand_subtopics' | 'decompose_question' | 'subquestions' | 'tested_concepts',
    node: GraphNode
  ) => {
    handleSelectNode(node);

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
                onCopyLink={handleCopyDeepLink}
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
            />

            {/* Interactive 2D Canvas Engine */}
            <KnowledgeGraphCanvas
              ref={canvasRef}
              nodes={graphData.nodes}
              edges={graphData.edges}
              layoutMode={layoutMode}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(n) => {
                handleSelectNode(n);
              }}
              onToggleDone={handleToggleDone}
              onOpenAction={handleOpenAction}
              difficulty={difficulty}
              searchFilter={searchFilter}
              activeFilters={activeFilters}
              onDeleteNode={handleDeleteNode}
              onNodePositionChange={handleNodePositionChange}
              onSynthesizeNote={(n) => {
                handleSelectNode(n, 'notes');
              }}
              onDecomposeQuestion={async (nodeId) => {
                const targetNode = graphData.nodes.find((n) => n.id === nodeId);
                if (targetNode) {
                  await handleOpenAction('decompose_question', targetNode);
                }
              }}
              onOpenQuiz={(n) => {
                handleSelectNode(n, 'quiz');
              }}
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
              activeTopicId={activeTopicId}
              activeTopicTitle={graphData?.topic.title}
              onSelectNode={(nodeId, targetTab) => {
                const n = graphData?.nodes.find((node) => node.id === nodeId);
                if (n) {
                  handleSelectNode(n, targetTab);
                }
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
          difficulty={difficulty}
          initialTab={inspectorTab}
          targetSection={targetSection}
          onToggleDone={handleToggleDone}
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
              activeTopicId={activeTopicId}
              activeTopicTitle={graphData?.topic.title}
              onSelectNode={(nodeId, targetTab) => {
                const n = graphData?.nodes.find((node) => node.id === nodeId);
                if (n) {
                  handleSelectNode(n, targetTab);
                }
              }}
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
        onTopicImported={handleTopicImported}
        onClose={() => setIsVaultOpen(false)}
        onNewTopic={() => {
          setIsVaultOpen(false);
          setIsSpotlightOpen(true);
        }}
      />

      {/* Spaced Repetition Review Deck */}
      <ReviewDrawer
        isOpen={isReviewDrawerOpen}
        topicId={activeTopicId || undefined}
        topicTitle={graphData?.topic.title}
        onClose={() => {
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
      />
    </div>
  );
};
