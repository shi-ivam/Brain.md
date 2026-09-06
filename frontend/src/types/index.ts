export type NodeType = 'concept' | 'subtopic' | 'prerequisite' | 'question' | 'note' | 'quiz';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type LayoutMode = 'dag' | 'force';

export interface Topic {
  id: string;
  title: string;
  description?: string;
  difficulty: DifficultyLevel;
  root_node_id?: string;
  created_at: string;
  updated_at: string;
  node_count?: number;
  edge_count?: number;
}

export interface GraphNode {
  id: string;
  topic_id: string;
  parent_node_id?: string;
  title: string;
  node_type: NodeType;
  summary?: string;
  content?: string;
  difficulty?: DifficultyLevel;
  metadata?: Record<string, any>;
  pos_x?: number;
  pos_y?: number;
  created_at: string;
  updated_at: string;
  mastery_score?: number;
  review_interval?: number;
  ease_factor?: number;
  review_due?: string;
  review_count?: number;
  portal_topic_id?: string;
  tags?: string[];
  // Simulation runtime properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  hovered?: boolean;
  selected?: boolean;
}

export interface GraphEdge {
  id: string;
  topic_id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_type?: string;
  label?: string;
  created_at: string;
}

export interface Quiz {
  id: string;
  node_id: string;
  topic_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  conceptual_trap?: string;
  difficulty: DifficultyLevel;
  user_answer?: number | null;
  is_correct?: boolean | null;
  created_at: string;
}

export interface Inquiry {
  id: string;
  node_id: string;
  topic_id: string;
  question: string;
  answer: string;
  difficulty: DifficultyLevel;
  created_at: string;
}

export interface KnowledgeGraphData {
  topic: Topic;
  nodes: GraphNode[];
  edges: GraphEdge[];
  quizzes: Quiz[];
  inquiries: Inquiry[];
}

export interface UnlinkedMention {
  node_id: string;
  title: string;
  snippet: string;
}

export interface ShortestPathResult {
  source_node_id: string;
  target_node_id: string;
  path_length: number;
  node_ids: string[];
  edge_ids: string[];
  found: boolean;
}

export interface DeepSearchHit {
  hit_type: 'title' | 'content' | 'inquiry' | 'quiz' | 'tag';
  node_id: string;
  node_title: string;
  snippet: string;
  matched_text: string;
  target_tab?: 'notes' | 'questions' | 'quiz' | 'connections';
}

export interface DeepSearchResponse {
  query: string;
  total_hits: number;
  hits: DeepSearchHit[];
}

export interface ReviewQueueResponse {
  due_count: number;
  due_nodes: GraphNode[];
}

export interface DeepLinkState {
  topicId?: string;
  nodeId?: string;
  tab?: 'notes' | 'questions' | 'quiz' | 'connections';
  section?: string;
  highlight?: string;
}

