import {
  KnowledgeGraphData,
  Topic,
  DifficultyLevel,
  Quiz,
  Inquiry,
  GraphNode,
  GraphEdge,
  UnlinkedMention,
  ShortestPathResult,
  DeepSearchHit,
  DeepSearchResponse,
  ReviewQueueResponse,
  NodeType,
  CommunityGroupResponse,
} from '../types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{ status: string; primary_model: string; gcp_location: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch health');
  return res.json();
}

export async function fetchTopics(): Promise<Topic[]> {
  const res = await fetch(`${API_BASE}/topics`);
  if (!res.ok) throw new Error('Failed to fetch topics');
  return res.json();
}

export async function fetchTopicGraph(topicId: string): Promise<KnowledgeGraphData> {
  const res = await fetch(`${API_BASE}/topics/${topicId}`);
  if (!res.ok) throw new Error('Failed to fetch topic graph');
  return res.json();
}

export async function deleteTopic(topicId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/topics/${topicId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete topic');
}

export async function generateTopic(
  topic: string,
  difficulty: DifficultyLevel = 'intermediate',
  focusArea?: string
): Promise<KnowledgeGraphData> {
  const res = await fetch(`${API_BASE}/topics/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, difficulty, focus_area: focusArea }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Generation failed' }));
    throw new Error(err.detail || 'Failed to generate topic knowledge graph');
  }
  return res.json();
}

export async function expandNode(
  nodeId: string,
  expansionType: 'subtopics' | 'topics_affecting_question' | 'tested_concepts' | 'subquestions',
  difficulty: DifficultyLevel = 'intermediate'
): Promise<{ message: string; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expansion_type: expansionType, difficulty }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Expansion failed' }));
    throw new Error(err.detail || 'Failed to expand node');
  }
  return res.json();
}

export async function askInquiry(
  nodeId: string,
  question: string,
  difficulty: DifficultyLevel = 'intermediate',
  pinToGraph: boolean = false
): Promise<{ inquiry: Inquiry; pinned_node_id?: string; full_graph?: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, difficulty, pin_to_graph: pinToGraph }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Inquiry failed' }));
    throw new Error(err.detail || 'Failed to answer inquiry');
  }
  return res.json();
}

export async function generateQuizzes(
  nodeId: string,
  difficulty: DifficultyLevel = 'intermediate',
  count: number = 3
): Promise<{ quizzes: Quiz[]; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/quizzes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, difficulty, create_graph_node: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Quiz generation failed' }));
    throw new Error(err.detail || 'Failed to generate quizzes');
  }
  return res.json();
}

export async function submitQuizAnswer(
  quizId: string,
  selectedOption: number
): Promise<{ quiz_id: string; selected_option: number; correct_index: number; is_correct: boolean; explanation: string }> {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_option: selectedOption }),
  });
  if (!res.ok) throw new Error('Failed to submit quiz answer');
  return res.json();
}

export async function saveNodeNote(
  nodeId: string,
  content: string,
  title?: string
): Promise<{ message: string; node_id: string }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title }),
  });
  if (!res.ok) throw new Error('Failed to save note');
  return res.json();
}

export async function synthesizeStudyNote(
  nodeId: string,
  difficulty?: DifficultyLevel
): Promise<{ node_id: string; content: string }> {
  const url = difficulty
    ? `${API_BASE}/nodes/${nodeId}/notes/synthesize?difficulty=${encodeURIComponent(difficulty)}`
    : `${API_BASE}/nodes/${nodeId}/notes/synthesize`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to synthesize study note');
  return res.json();
}

export function exportObsidianVaultUrl(topicId: string): string {
  return `${API_BASE}/topics/${topicId}/export/obsidian`;
}

export async function detachQuizToNode(
  quizId: string
): Promise<{ success: boolean; new_node_id: string; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}/detach-to-node`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to detach quiz to node');
  return res.json();
}

export async function deleteNode(
  nodeId: string
): Promise<{ success: boolean; deleted_node_id: string; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete node');
  return res.json();
}

export async function updateNodePosition(
  nodeId: string,
  posX: number,
  posY: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/position`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pos_x: posX, pos_y: posY }),
  });
  if (!res.ok) throw new Error('Failed to update node position');
  return res.json();
}

export async function syncWikilinks(
  topicId: string
): Promise<{ message: string; added_edges: number; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/topics/${topicId}/sync-wikilinks`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Syncing wikilinks failed' }));
    throw new Error(err.detail || 'Failed to sync wikilinks');
  }
  const data = await res.json();
  const fullGraph = await fetchTopicGraph(topicId);
  return {
    message: data.message,
    added_edges: data.added_edges_count ?? 0,
    full_graph: fullGraph,
  };
}

export async function fetchUnlinkedMentions(nodeId: string): Promise<UnlinkedMention[]> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/mentions`);
  if (!res.ok) throw new Error('Failed to fetch unlinked mentions');
  return res.json();
}

export async function findShortestPath(
  topicId: string,
  sourceNode: string,
  targetNode: string
): Promise<ShortestPathResult> {
  const params = new URLSearchParams({
    source_node: sourceNode,
    target_node: targetNode,
  });
  const res = await fetch(`${API_BASE}/topics/${topicId}/path?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to find shortest path');
  const data = await res.json();
  return {
    source_node_id: sourceNode,
    target_node_id: targetNode,
    path_length: data.path_length,
    node_ids: data.node_ids,
    edge_ids: data.edge_ids,
    found: data.found,
  };
}

export async function recordNodeReview(
  nodeId: string,
  rating: number
): Promise<{ message: string; node: GraphNode; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to record review' }));
    throw new Error(err.detail || 'Failed to record review');
  }
  const data = await res.json();
  const topicId = data.topic_id;
  if (!topicId) {
    throw new Error('Missing topic_id in review response');
  }
  const fullGraph = await fetchTopicGraph(topicId);
  const node = fullGraph.nodes.find((n) => n.id === nodeId) || ({ id: nodeId } as GraphNode);
  return {
    message: data.message || `Recorded SM-2 review (rating ${rating})`,
    node,
    full_graph: fullGraph,
  };
}

export async function fetchReviewQueue(topicId: string): Promise<ReviewQueueResponse> {
  const res = await fetch(`${API_BASE}/topics/${topicId}/review-queue`);
  if (!res.ok) throw new Error('Failed to fetch review queue');
  const dueNodes: GraphNode[] = await res.json();
  return {
    due_count: dueNodes.length,
    due_nodes: dueNodes,
  };
}

export async function linkPortalTopic(
  nodeId: string,
  targetTopicId: string
): Promise<{ message: string; node: GraphNode }> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/link-topic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portal_topic_id: targetTopicId }),
  });
  if (!res.ok) throw new Error('Failed to link portal topic');
  const data = await res.json();
  return {
    message: 'Portal topic linked successfully',
    node: data.node,
  };
}

export async function deepSearchTopic(topicId: string, query: string): Promise<DeepSearchResponse> {
  const cleanQ = query.trim();
  if (!cleanQ) {
    return { query, total_hits: 0, hits: [] };
  }
  const res = await fetch(`${API_BASE}/topics/${topicId}/search?q=${encodeURIComponent(cleanQ)}`);
  if (!res.ok) throw new Error('Failed to perform deep search');
  const results: Array<{
    node_id: string;
    title: string;
    hit_type: 'title' | 'content' | 'inquiry' | 'quiz' | 'tag';
    snippet: string;
    score?: number;
  }> = await res.json();

  const hits: DeepSearchHit[] = results.map((r) => {
    let target_tab: 'notes' | 'questions' | 'quiz' | 'connections' = 'notes';
    if (r.hit_type === 'inquiry') {
      target_tab = 'questions';
    } else if (r.hit_type === 'quiz') {
      target_tab = 'quiz';
    }

    return {
      hit_type: r.hit_type,
      node_id: r.node_id,
      node_title: r.title,
      snippet: r.snippet,
      matched_text: cleanQ,
      target_tab,
    };
  });

  return {
    query,
    total_hits: hits.length,
    hits,
  };
}

export async function exportTopicJson(topicId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/topics/${topicId}/export/json`);
  if (!res.ok) throw new Error('Failed to export topic JSON');
  return res.blob();
}

export async function importTopicJson(
  data: any
): Promise<{ message: string; topic_id: string; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/topics/import/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Import failed' }));
    throw new Error(err.detail || 'Failed to import topic JSON');
  }
  const resData = await res.json();
  return {
    message: 'Topic imported successfully',
    topic_id: resData.topic_id,
    full_graph: resData.full_graph,
  };
}

export async function updateEdge(
  edgeId: string,
  data: { edge_type?: string; label?: string; relation_type?: string }
): Promise<GraphEdge> {
  const res = await fetch(`${API_BASE}/edges/${edgeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update edge');
  return res.json();
}

export interface CreateNodeParams {
  topic_id: string;
  title: string;
  node_type: NodeType;
  summary?: string;
  content?: string;
  parent_node_id?: string;
  difficulty?: DifficultyLevel;
  pos_x?: number;
  pos_y?: number;
  portal_topic_id?: string;
}

export async function createNode(
  params: CreateNodeParams
): Promise<{ id: string; title: string; node_type: string }> {
  const res = await fetch(`${API_BASE}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create node' }));
    throw new Error(err.detail || 'Failed to create node');
  }
  return res.json();
}

export interface CreateEdgeParams {
  topic_id: string;
  source_id: string;
  target_id: string;
  relation_type?: string;
  edge_type?: string;
  label?: string;
}

export async function createEdge(
  params: CreateEdgeParams
): Promise<{ id: string; source_id: string; target_id: string; relation_type: string; edge_type?: string; label?: string }> {
  const res = await fetch(`${API_BASE}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create edge' }));
    throw new Error(err.detail || 'Failed to create edge');
  }
  return res.json();
}

export async function fetchTopicCommunities(topicId: string): Promise<CommunityGroupResponse> {
  const res = await fetch(`${API_BASE}/topics/${topicId}/communities`);
  if (!res.ok) throw new Error('Failed to fetch topic communities');
  return res.json();
}

export async function toggleNodeDone(
  nodeId: string,
  isDone?: boolean
): Promise<GraphNode> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isDone !== undefined ? { is_done: isDone } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update node status' }));
    throw new Error(err.detail || 'Failed to update node status');
  }
  return res.json();
}

export async function autoOrganizeTopic(
  topicId: string
): Promise<{ success: boolean; topic_id: string; nodes_updated: number; full_graph: KnowledgeGraphData }> {
  const res = await fetch(`${API_BASE}/topics/${topicId}/auto-organize`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to auto-organize topic graph' }));
    throw new Error(err.detail || 'Failed to auto-organize topic graph');
  }
  return res.json();
}

