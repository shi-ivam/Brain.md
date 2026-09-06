import { useState, useCallback } from 'react';
import { BreadcrumbItem } from '../components/Breadcrumbs';
import { GraphNode, KnowledgeGraphData, InspectorTab } from '../types';
import { updateUrlHash, copyDeepLinkToClipboard } from '../utils/urlRouter';

export const useNavigationHistory = (
  activeTopicId: string | null,
  graphData: KnowledgeGraphData | null,
  inspectorTab: InspectorTab,
  targetSection: string | undefined,
  setSelectedNode: (node: GraphNode | null) => void
) => {
  const [history, setHistory] = useState<BreadcrumbItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const pushHistory = useCallback(
    (node: GraphNode) => {
      setHistory((prev) => {
        const nextItem: BreadcrumbItem = {
          id: node.id,
          title: node.title,
          node_type: node.node_type,
          mastery_score: node.mastery_score,
        };
        const upToCurrent = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
        if (upToCurrent.length > 0 && upToCurrent[upToCurrent.length - 1].id === node.id) {
          return upToCurrent;
        }
        return [...upToCurrent, nextItem];
      });
      setHistoryIndex((prev) => (prev >= 0 ? prev + 1 : 0));
    },
    [historyIndex]
  );

  const resetHistory = useCallback((initialNode?: GraphNode | null) => {
    if (initialNode) {
      setHistory([
        {
          id: initialNode.id,
          title: initialNode.title,
          node_type: initialNode.node_type,
          mastery_score: initialNode.mastery_score,
        },
      ]);
      setHistoryIndex(0);
    } else {
      setHistory([]);
      setHistoryIndex(-1);
    }
  }, []);

  const removeNodeFromHistory = useCallback((nodeId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== nodeId));
    setHistoryIndex((prev) => Math.max(-1, prev - 1));
  }, []);

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
  }, [history, historyIndex, graphData, activeTopicId, inspectorTab, setSelectedNode]);

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
  }, [history, historyIndex, graphData, activeTopicId, inspectorTab, setSelectedNode]);

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
    [history, graphData, activeTopicId, inspectorTab, setSelectedNode]
  );

  const handleCopyDeepLink = useCallback(async (selectedNodeId?: string) => {
    const success = await copyDeepLinkToClipboard({
      topicId: activeTopicId || undefined,
      nodeId: selectedNodeId,
      tab: inspectorTab,
      section: targetSection,
    });
    if (success) {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    }
  }, [activeTopicId, inspectorTab, targetSection]);

  return {
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
  };
};
