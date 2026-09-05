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
