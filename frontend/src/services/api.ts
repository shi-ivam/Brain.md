import { KnowledgeGraphData, Topic, DifficultyLevel, Quiz, Inquiry, GraphNode } from '../types';

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
