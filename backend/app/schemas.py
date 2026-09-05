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

class NodeUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None

class EdgeCreate(BaseModel):
    topic_id: str
    source_id: str
    target_id: str
    relation_type: str # 'prerequisite_for', 'subtopic_of', 'affects', 'decomposes_into', 'question_for', 'note_on', 'quiz_for', 'related_to'
    label: Optional[str] = None

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
