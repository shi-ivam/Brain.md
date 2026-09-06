import {
  GraphNode,
  GraphEdge,
  LayoutMode,
  NodeType,
  DifficultyLevel,
  ShortestPathResult,
  NodeResource,
} from '../../../types';

export interface KnowledgeGraphCanvasHandle {
  fitGraph: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface KnowledgeGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  resources?: NodeResource[];
  layoutMode: LayoutMode;
  selectedNodeId?: string;
  onSelectNode: (node: GraphNode) => void;
  onOpenAction: (
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
  ) => void;
  difficulty: DifficultyLevel;
  searchFilter: string;
  activeFilters: Set<NodeType>;
  onDeleteNode?: (nodeId: string) => void;
  onNodePositionChange?: (nodeId: string, posX: number, posY: number) => void;
  onSynthesizeNote?: (node: GraphNode) => void;
  onDecomposeQuestion?: (nodeId: string) => void;
  onOpenQuiz?: (node: GraphNode) => void;
  onOpenResources?: (node: GraphNode) => void;
  onOpenVisualizations?: (node: GraphNode) => void;
  onOpenSlides?: (node: GraphNode) => void;
  onToggleDone?: (node: GraphNode) => void;
  lensMode?: 'all' | '1-hop' | '2-hop';
  shortestPath?: ShortestPathResult | null;
  colorMode?: 'default' | 'heatmap';
  showMiniMap?: boolean;
  onSelectEdge?: (edge: GraphEdge) => void;
  selectedCommunityNodeIds?: Set<string> | null;
  onBridgeEdge?: (edgeId: string, bridgeCount: number, difficulty: DifficultyLevel, focusNote?: string) => Promise<void>;
  onInsertNodeOnEdge?: (
    edgeId: string,
    title: string,
    nodeType: string,
    summary?: string,
    relSourceToNew?: string,
    relNewToTarget?: string,
    lblSourceToNew?: string,
    lblNewToTarget?: string
  ) => Promise<void>;
  onDeleteEdge?: (edgeId: string) => Promise<void>;
  onUpdateEdge?: (edgeId: string, relationType: string, label: string) => Promise<void>;
}

export interface TransformState {
  x: number;
  y: number;
  k: number;
}

export const COLOR_MAP: Record<NodeType, { fill: string; glow: string; text: string }> = {
  concept: { fill: '#bfa4f8', glow: 'rgba(191, 164, 248, 0.4)', text: '#e5d9fd' },
  prerequisite: { fill: '#f87171', glow: 'rgba(248, 113, 113, 0.4)', text: '#fca5a5' },
  subtopic: { fill: '#a8a8b3', glow: 'rgba(168, 168, 179, 0.3)', text: '#d1d1d8' },
  question: { fill: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.4)', text: '#bae6fd' },
  quiz: { fill: '#fde047', glow: 'rgba(253, 224, 71, 0.4)', text: '#fef08a' },
  note: { fill: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.4)', text: '#a7f3d0' },
};

export const getHeatmapColor = (score: number) => {
  if (score === 0) return { fill: '#7f1d1d', glow: 'rgba(127, 29, 29, 0.6)', text: '#fca5a5' };
  if (score <= 30) return { fill: '#b45309', glow: 'rgba(180, 83, 9, 0.6)', text: '#fde047' };
  if (score <= 70) return { fill: '#0284c7', glow: 'rgba(2, 132, 199, 0.6)', text: '#bae6fd' };
  return { fill: '#059669', glow: 'rgba(5, 150, 105, 0.6)', text: '#a7f3d0' };
};
