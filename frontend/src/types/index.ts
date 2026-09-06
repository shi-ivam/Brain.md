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
  is_done?: boolean;
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

export type ResourceType = 'youtube' | 'pdf' | 'url' | 'other';

export interface NodeResource {
  id: string;
  node_id: string;
  topic_id: string;
  title: string;
  resource_type: ResourceType;
  url: string;
  file_path?: string;
  file_size?: number;
  thumbnail_url?: string;
  notes?: string;
  metadata?: {
    videoId?: string;
    start_seconds?: number;
    embed_url?: string;
    duration?: string;
    author?: string;
    original_filename?: string;
    content_type?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at?: string;
}

export type VisualizationType = 'simulation' | 'interactive_lab' | 'phase_explorer' | 'state_machine' | 'flowchart' | 'mindmap' | 'sequence' | 'state' | 'architecture' | 'custom';

export interface VisualizationSuggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  prompt: string;
}

export interface VisualizationSuggestionResponse {
  node_id: string;
  concept_title: string;
  suggestions: VisualizationSuggestion[];
}

export interface NodeVisualization {
  id: string;
  node_id: string;
  topic_id: string;
  title: string;
  visualization_type: VisualizationType | string;
  code: string;
  description?: string;
  explanation?: string;
  format?: 'html' | 'mermaid' | 'svg' | string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface VisualizationGenerateRequest {
  visualization_type?: string;
  custom_prompt?: string;
  difficulty?: DifficultyLevel;
  force_refresh?: boolean;
}

export type InspectorTab = 'notes' | 'visualizations' | 'questions' | 'quiz' | 'connections' | 'resources';

export interface KnowledgeGraphData {
  topic: Topic;
  nodes: GraphNode[];
  edges: GraphEdge[];
  quizzes: Quiz[];
  inquiries: Inquiry[];
  resources?: NodeResource[];
  visualizations?: NodeVisualization[];
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
  target_tab?: InspectorTab;
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
  tab?: InspectorTab;
  section?: string;
  highlight?: string;
}

export interface CommunityGroupInfo {
  community_id: number;
  label: string;
  representative_node_id: string;
  node_count: number;
  node_ids: string[];
}

export interface CommunityGroupResponse {
  topic_id: string;
  communities: CommunityGroupInfo[];
}

export type SlideType = 'title' | 'concept' | 'math' | 'mechanism' | 'applications' | 'pitfalls' | 'summary';

export interface SlideItem {
  title: string;
  slide_type: SlideType;
  subtitle?: string;
  bullets: string[];
  callout?: string;
  formula?: string;
  speaker_notes: string;
  quick_check?: string;
}

export interface SlideDeck {
  id?: string;
  node_id: string;
  topic_id: string;
  deck_title: string;
  slides: SlideItem[];
  created_at?: string;
  updated_at?: string;
}

export interface BridgeEdgeRequest {
  bridge_count?: number;
  difficulty?: DifficultyLevel;
  focus_note?: string;
}

export interface BridgeEdgeResponse {
  success: boolean;
  explanation_of_gap: string;
  created_node_ids: string[];
  full_graph: KnowledgeGraphData;
}

export interface ManualInsertNodeOnEdgeRequest {
  title: string;
  node_type?: string;
  summary?: string;
  relation_source_to_new?: string;
  relation_new_to_target?: string;
  label_source_to_new?: string;
  label_new_to_target?: string;
}

export interface ManualInsertNodeOnEdgeResponse {
  success: boolean;
  new_node_id: string;
  full_graph: KnowledgeGraphData;
}

export interface GraphWeaveRequest {
  prompt: string;
  target_type?: 'auto' | 'question' | 'concept' | 'prerequisite' | 'subtopic';
  difficulty?: DifficultyLevel;
}

export interface GraphWeaveResponse {
  success: boolean;
  topic_id: string;
  rationale: string;
  primary_node_id: string;
  created_node_ids: string[];
  anchor_node_ids: string[];
  full_graph: KnowledgeGraphData;
}


