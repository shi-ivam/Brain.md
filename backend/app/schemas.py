from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# API Request/Response Schemas
class TopicGenerateRequest(BaseModel):
    topic: str
    difficulty: Optional[str] = "intermediate" # 'beginner', 'intermediate', 'advanced', 'expert'
    focus_area: Optional[str] = None

class TopicResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    difficulty: Optional[str] = "intermediate"
    root_node_id: Optional[str] = None
    created_at: str
    updated_at: str
    node_count: Optional[int] = 0
    edge_count: Optional[int] = 0

class NodeResponse(BaseModel):
    id: str
    topic_id: str
    title: str
    node_type: str
    summary: Optional[str] = ""
    content: Optional[str] = ""
    parent_node_id: Optional[str] = None
    difficulty: Optional[str] = "intermediate"
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    created_at: str
    updated_at: str
    mastery_score: Optional[int] = 0
    review_interval: Optional[int] = 1
    ease_factor: Optional[float] = 2.5
    review_due: Optional[str] = None
    review_count: Optional[int] = 0
    portal_topic_id: Optional[str] = None
    is_done: Optional[bool] = False
    metadata: Optional[Dict[str, Any]] = None

class EdgeResponse(BaseModel):
    id: str
    topic_id: str
    source_id: str
    target_id: str
    relation_type: Optional[str] = "related_to"
    edge_type: Optional[str] = "relates_to"
    label: Optional[str] = ""
    created_at: str

class NodeCreate(BaseModel):
    topic_id: str
    title: str
    node_type: str # 'concept', 'subtopic', 'prerequisite', 'question', 'note', 'quiz'
    summary: Optional[str] = ""
    content: Optional[str] = ""
    parent_node_id: Optional[str] = None
    difficulty: Optional[str] = "intermediate"
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    portal_topic_id: Optional[str] = None
    is_done: Optional[bool] = False

class NodeUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    portal_topic_id: Optional[str] = None
    difficulty: Optional[str] = None
    is_done: Optional[bool] = None

class NodeDoneRequest(BaseModel):
    is_done: Optional[bool] = None

class AutoOrganizeResponse(BaseModel):
    topic_id: str
    nodes_updated: int
    graph: Dict[str, Any]

class EdgeCreate(BaseModel):
    topic_id: str
    source_id: str
    target_id: str
    relation_type: Optional[str] = "related_to"
    edge_type: Optional[str] = "relates_to"
    label: Optional[str] = ""

class EdgeUpdateRequest(BaseModel):
    edge_type: Optional[str] = None
    label: Optional[str] = None
    relation_type: Optional[str] = None

class ReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=4, description="SM-2 rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)")

class ReviewResponse(BaseModel):
    node_id: str
    mastery_score: int
    review_interval: int
    ease_factor: float
    review_due: str
    review_count: int
    repetitions: Optional[int] = 0
    message: Optional[str] = None
    topic_id: Optional[str] = None

class ShortestPathResponse(BaseModel):
    found: bool
    path_length: int
    node_ids: List[str]
    edge_ids: List[str]
    nodes: Optional[List[Dict[str, Any]]] = []
    edges: Optional[List[Dict[str, Any]]] = []

class UnlinkedMention(BaseModel):
    node_id: str
    title: str
    snippet: str
    context: Optional[str] = None
    node_type: Optional[str] = None
    summary: Optional[str] = None

class DeepSearchResult(BaseModel):
    node_id: str
    title: str
    hit_type: str # 'title', 'content', 'inquiry', 'quiz', 'tag'
    snippet: str
    score: Optional[float] = 1.0

class TopicImportRequest(BaseModel):
    topic: Optional[Dict[str, Any]] = None
    nodes: Optional[List[Dict[str, Any]]] = []
    edges: Optional[List[Dict[str, Any]]] = []
    quizzes: Optional[List[Dict[str, Any]]] = []
    inquiries: Optional[List[Dict[str, Any]]] = []
    version: Optional[str] = None
    exported_at: Optional[str] = None

class LinkTopicRequest(BaseModel):
    portal_topic_id: Optional[str] = None

class SyncWikilinksResponse(BaseModel):
    topic_id: str
    added_edges_count: int
    message: str

class NodeExpandRequest(BaseModel):
    expansion_type: Optional[str] = "subtopics" # 'subtopics', 'topics_affecting_question', 'tested_concepts', 'subquestions'
    difficulty: Optional[str] = "intermediate"

class QuestionAskRequest(BaseModel):
    question: str
    difficulty: Optional[str] = "intermediate"
    pin_to_graph: Optional[bool] = False

class QuizGenerateRequest(BaseModel):
    count: Optional[int] = 3
    difficulty: Optional[str] = "intermediate"
    create_graph_node: Optional[bool] = True

class QuizAnswerSubmit(BaseModel):
    selected_option: int

class NoteSaveRequest(BaseModel):
    content: str
    title: Optional[str] = None

class NodePositionUpdate(BaseModel):
    pos_x: float
    pos_y: float

# Structured Output Schemas for Gemini AI
class ConceptNodeItem(BaseModel):
    id_key: str = Field(description="Unique key like 'root', 'pre1', 'sub1', 'sub2'")
    title: str = Field(description="Clear academic title of the concept")
    node_type: str = Field(description="One of: 'prerequisite', 'concept', 'subtopic'")
    academic_domain: str = Field(description="Academic discipline e.g. 'Pure Mathematics', 'Quantum Physics'")
    summary: str = Field(description="Concise 1-2 sentence academic summary")
    initial_markdown_note: Optional[str] = Field(default="", description="Concise 1-2 paragraph overview and key formula or intuition")
    layer_level: int = Field(description="-1 for prerequisite, 0 for root topic, 1 for core pillar, 2 for advanced topic")

class CurriculumEdgeItem(BaseModel):
    source_key: str = Field(description="Source id_key")
    target_key: str = Field(description="Target id_key")
    relation_type: str = Field(description="'prerequisite_for', 'subtopic_of', or 'related_to'")
    label: str = Field(description="Brief relation descriptor e.g. 'Foundational to', 'Core mechanism of'")

class AcademicCurriculum(BaseModel):
    topic_title: str
    topic_description: str
    primary_domain: str
    nodes: List[ConceptNodeItem]
    edges: List[CurriculumEdgeItem]

class DecomposedTopicItem(BaseModel):
    title: str = Field(description="Specific foundational academic concept or theory affecting this question")
    relation: str = Field(description="'affects', 'prerequisite_for', or 'governs'")
    academic_domain: str = Field(description="Field of study")
    summary: str = Field(description="Summary of the topic")
    explanation_of_influence: str = Field(description="Rigorous explanation of how this topic specifically determines or impacts the question")

class QuestionDecompositionResult(BaseModel):
    question: str
    core_paradox_or_challenge: str
    underlying_topics: List[DecomposedTopicItem]

class QuizItemResult(BaseModel):
    question: str
    options: List[str] = Field(description="4 distinct answer options")
    correct_index: int = Field(description="0-indexed correct option (0, 1, 2, or 3)")
    explanation: str = Field(description="Comprehensive conceptual explanation of why the correct answer is right and others are incorrect")
    conceptual_trap: str = Field(description="The common misconception or cognitive pitfall this question tests")

class QuizBatchResult(BaseModel):
    quizzes: List[QuizItemResult]

class SubtopicNodeItem(BaseModel):
    title: str
    academic_domain: str
    summary: str
    relation_to_parent: str

class SubtopicExpansionResult(BaseModel):
    parent_concept: str
    subtopics: List[SubtopicNodeItem]

class InquiryAnswerResult(BaseModel):
    answer_markdown: str
    key_takeaways: List[str]
    follow_up_inquiries: List[str]
    mathematical_formulation: Optional[str] = None

# Smart Context-Aware Graph Schemas
class ExistingNodeLink(BaseModel):
    existing_node_id: str = Field(description="The ID or 8-character ID prefix of the pre-existing node to connect to")
    relation_type: str = Field(default="related_to", description="Relation type: 'subtopic_of', 'prerequisite_for', 'affects', 'governs', 'related_to'")
    label: str = Field(default="", description="Brief edge label describing the connection")
    direction: str = Field(default="parent_to_existing", description="'parent_to_existing' (current node -> existing node) or 'existing_to_parent' (existing node -> current node)")

class NewNodeExistingLink(BaseModel):
    new_node_title: str = Field(description="Title of the new node being linked")
    existing_node_id: str = Field(description="ID or 8-character ID prefix of pre-existing node to link with")
    relation_type: str = Field(default="related_to", description="Relation type e.g. 'related_to', 'subtopic_of', 'prerequisite_for'")
    label: str = Field(default="", description="Brief edge label")

class SmartSubtopicExpansionResult(BaseModel):
    parent_concept: str
    connect_to_existing: List[ExistingNodeLink] = Field(default_factory=list, description="Connections to pre-existing nodes that already cover relevant subtopics/prerequisites")
    new_nodes: List[SubtopicNodeItem] = Field(default_factory=list, description="Genuinely new subtopic nodes to create")
    new_node_existing_links: List[NewNodeExistingLink] = Field(default_factory=list, description="Cross-links from newly created subtopics to other pre-existing nodes")

class SmartQuestionDecompositionResult(BaseModel):
    question: str
    core_paradox_or_challenge: str
    connect_to_existing: List[ExistingNodeLink] = Field(default_factory=list, description="Pre-existing foundational topics in the graph that already govern or affect this question")
    new_nodes: List[DecomposedTopicItem] = Field(default_factory=list, description="Genuinely new foundational topics to create")
    new_node_existing_links: List[NewNodeExistingLink] = Field(default_factory=list, description="Cross-links from new topics to other pre-existing nodes")

class CommunityGroupInfo(BaseModel):
    community_id: int
    label: str
    representative_node_id: str
    node_count: int
    node_ids: List[str]

class CommunityGroupResponse(BaseModel):
    topic_id: str
    communities: List[CommunityGroupInfo]
