import json
import logging
from typing import Optional, List, Dict, Any
from google import genai
from google.genai import types
from .config import GCP_PROJECT, GCP_LOCATION, PRIMARY_MODEL, FALLBACK_MODELS
from .schemas import (
    AcademicCurriculum,
    QuestionDecompositionResult,
    SubtopicExpansionResult,
    QuizBatchResult,
    InquiryAnswerResult,
    SmartSubtopicExpansionResult,
    SmartQuestionDecompositionResult,
)

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO)

def get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=GCP_PROJECT,
        location=GCP_LOCATION
    )

def resolve_thinking_config(task_type: str, difficulty: str) -> types.ThinkingConfig:
    """
    Dynamically tunes thinking depth based on cognitive difficulty and task requirements.
    """
    diff = (difficulty or "intermediate").lower()
    
    if task_type in ["decompose_question", "frontier_proof"]:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH)
    elif diff == "expert":
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH)
    elif diff == "advanced" and task_type in ["quiz_generation"]:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH)
    elif diff == "intermediate" and task_type != "curriculum":
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MEDIUM)
    else:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)

def call_model_with_fallback(
    prompt: str,
    response_schema: Any = None,
    task_type: str = "general",
    difficulty: str = "intermediate"
) -> str:
    """
    Invokes primary model (gemini-3.8-flash) with adaptive thinking,
    falling back to gemini-3.7-flash or gemini-3.5-flash upon rate limits.
    """
    client = get_client()
    thinking_cfg = resolve_thinking_config(task_type, difficulty)
    
    models_to_try = [PRIMARY_MODEL] + [m for m in FALLBACK_MODELS if m != PRIMARY_MODEL]
    last_error = None

    for model_name in models_to_try:
        try:
            logger.info(f"Calling Vertex AI: model={model_name}, task={task_type}, diff={difficulty}")
            config = types.GenerateContentConfig(
                thinking_config=thinking_cfg
            )
            if response_schema is not None:
                config.response_mime_type = "application/json"
                config.response_schema = response_schema

            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            if response.text:
                return response.text
        except Exception as e:
            last_error = e
            logger.warning(f"Error calling {model_name}: {e}. Trying fallback if available...")
            continue

    raise RuntimeError(f"All Gemini models exhausted. Last error: {last_error}")

def generate_curriculum(
    topic: str,
    difficulty: str = "intermediate",
    focus_area: Optional[str] = None
) -> AcademicCurriculum:
    focus_clause = f" Specific focus: {focus_area}." if focus_area else ""
    prompt = f"""You are a distinguished academic curriculum designer and polymath scholar.
Design an exhaustive, interconnected knowledge graph ontology for mastering: "{topic}".
Difficulty level: {difficulty.upper()}.{focus_clause}

Requirements:
1. Define 8 to 14 essential academic concepts spanning:
   - Foundational prerequisite disciplines (layer_level: -1, node_type: 'prerequisite'). These should be what one must know BEFORE this topic.
   - The Root Anchor Topic (layer_level: 0, node_type: 'concept').
   - Core Theoretical Pillars and Fundamental Mechanisms (layer_level: 1, node_type: 'concept').
   - Advanced Sub-Disciplines, Modern Research Frontiers, or Specialized Applications (layer_level: 2, node_type: 'subtopic').
2. Interconnect them with directed relational edges:
   - Prerequisites pointing to what they enable ('prerequisite_for')
   - Core pillars linking to subtopics ('subtopic_of')
   - Cross-domain interactions ('related_to')
3. In 'initial_markdown_note', provide a concise 2-3 sentence overview and key intuition or core formula ($...$). Keep it brief for rapid graph generation.
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=AcademicCurriculum,
        task_type="curriculum",
        difficulty=difficulty
    )
    return AcademicCurriculum.model_validate_json(raw_json)

def decompose_question_to_topics(
    question: str,
    context: str = "",
    difficulty: str = "intermediate",
    existing_context: Optional[str] = None
) -> SmartQuestionDecompositionResult:
    """
    Decomposes an academic inquiry/question into foundational underlying topics that affect it.
    Uses HIGH thinking to rigorously identify the underlying scientific/theoretical principles.
    Aware of pre-existing graph nodes to prevent duplicate nodes.
    """
    context_clause = f"\n\n{existing_context}\n" if existing_context else ""
    instructions_clause = """
Instructions:
1. Awareness of Pre-Existing Nodes: If any governing principle, foundational law, or underlying topic is already represented in the pre-existing nodes list above, DO NOT invent a duplicate node. Instead, reference its ID/ID-prefix in 'connect_to_existing' (e.g. relation_type='affects' or 'governs', direction='existing_to_parent').
2. New Concepts: For foundational topics that do not yet exist in the graph, define them in 'new_nodes' (2 to 4 distinct topics).
3. Cross-Links: For any newly created topic in 'new_nodes', you may link it to other relevant pre-existing nodes via 'new_node_existing_links'.
""" if existing_context else """
Task:
Identify 3 to 5 foundational academic topics, governing laws, or theoretical principles that DIRECTLY AFFECT or UNDERPIN this question in 'new_nodes'.
"""
    prompt = f"""You are an elite epistemologist and academic researcher.
Analyze the following deep research question or inquiry:
Question: "{question}"
Context: "{context}"
Difficulty: {difficulty.upper()}{context_clause}
{instructions_clause}

For each underlying topic in 'new_nodes':
- Give a precise academic title
- Specify relationship ('affects', 'prerequisite_for', or 'governs')
- Academic domain
- A crisp summary
- A rigorous explanation of how this topic specifically influences or answers the question.
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=SmartQuestionDecompositionResult,
        task_type="decompose_question",
        difficulty="expert" # force high thinking for epistemological decomposition
    )
    return SmartQuestionDecompositionResult.model_validate_json(raw_json)

def expand_concept_subtopics(
    concept_title: str,
    concept_summary: str = "",
    difficulty: str = "intermediate",
    existing_context: Optional[str] = None
) -> SmartSubtopicExpansionResult:
    """
    Branches off specialized subtopics or advanced frontiers directly emerging from the concept.
    Aware of pre-existing graph nodes to link instead of duplicating.
    """
    context_clause = f"\n\n{existing_context}\n" if existing_context else ""
    instructions_clause = """
Instructions:
1. Awareness of Pre-Existing Nodes: If any subtopic, prerequisite, or related concept is already represented in the pre-existing graph nodes list above, DO NOT invent a duplicate node. Instead, reference it in 'connect_to_existing' specifying its ID/ID-prefix, relationship ('subtopic_of', 'related_to', 'prerequisite_for'), and direction.
2. New Concepts: Only define genuinely novel, unrepresented concepts in 'new_nodes' (typically 2 to 4 distinct concepts).
3. Cross-Links: For any newly created node in 'new_nodes', you may link it to other relevant pre-existing nodes via 'new_node_existing_links'.
""" if existing_context else """
Provide 3 to 5 distinct, academically rigorous subtopics with domain, summary, and relation to parent in 'new_nodes'.
"""
    prompt = f"""You are a senior academic specialist and knowledge graph architect.
Branch off specialized subtopics or advanced frontiers directly emerging from the concept: "{concept_title}".
Summary: "{concept_summary}"
Difficulty Level: {difficulty.upper()}{context_clause}
{instructions_clause}
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=SmartSubtopicExpansionResult,
        task_type="subtopics",
        difficulty=difficulty
    )
    return SmartSubtopicExpansionResult.model_validate_json(raw_json)

def generate_concept_quizzes(
    concept_title: str,
    concept_summary: str = "",
    count: int = 3,
    difficulty: str = "intermediate"
) -> QuizBatchResult:
    prompt = f"""You are a university professor designing conceptual examination questions for: "{concept_title}".
Context / Summary: "{concept_summary}"
Target Difficulty: {difficulty.upper()} (Beginner = basic intuition; Intermediate = undergraduate mechanics; Advanced = graduate analysis & proofs; Expert = research/Olympiad edge cases and multi-step reasoning).
Number of questions: {count}.

Requirements:
- Questions must test deep conceptual understanding, causal relationships, or subtle boundary conditions — NOT trivia or memorization.
- Provide 4 viable multiple choice options (exactly one definitively correct).
- Detailed academic explanation demonstrating why the correct option is true and what fallacy renders the distractors false.
- Identify the 'conceptual_trap' or common misconception.
- Mathematical rigor: Format all mathematical formulas, physical quantities, variables, exponents, subscripts, and Greek symbols using standard LaTeX enclosed in single dollar signs (e.g. $v^2$, $\\rho$, $a_n = \\frac{{v^2}}{{\\rho}}$) or double dollar signs for display equations (e.g. $$a_n = \\frac{{v^2}}{{\\rho}}$$).
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=QuizBatchResult,
        task_type="quiz_generation",
        difficulty=difficulty
    )
    return QuizBatchResult.model_validate_json(raw_json)

def answer_socratic_inquiry(
    concept_title: str,
    question: str,
    context: str = "",
    difficulty: str = "intermediate"
) -> InquiryAnswerResult:
    prompt = f"""You are a master Socratic scholar and tutor.
Concept: "{concept_title}"
Inquiry / Question: "{question}"
Academic Context: "{context}"
Difficulty: {difficulty.upper()}

Provide:
1. 'answer_markdown': A lucid, rigorous academic response formatted in Obsidian-style Markdown. Include LaTeX math expressions where relevant (using $...$ or $$...$$), conceptual diagrams or steps, and Obsidian callouts (> [!NOTE], > [!TIP], > [!THEOREM]).
2. 'key_takeaways': 3 crisp bullet takeaways.
3. 'follow_up_inquiries': 2-3 provocative questions for deeper study.
4. 'mathematical_formulation': Key mathematical equation or governing formula if applicable.
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=InquiryAnswerResult,
        task_type="inquiry",
        difficulty=difficulty
    )
    return InquiryAnswerResult.model_validate_json(raw_json)

def synthesize_obsidian_study_note(
    concept_title: str,
    summary: str = "",
    difficulty: str = "intermediate"
) -> str:
    prompt = f"""Write an exhaustive, high-end Obsidian academic study note for: "{concept_title}".
Summary: "{summary}"
Difficulty: {difficulty.upper()}

Formatting Rules:
- Output pure Obsidian-compatible Markdown.
- Include YAML frontmatter at top:
---
title: "{concept_title}"
difficulty: "{difficulty}"
tags: [knowledge-graph, academia, study-note]
---
- Use clean headings (## Definition & Motivation, ## Governing Principles, ## Mathematical Formalism, ## Edge Cases & Counterexamples, ## Real-World Applications).
- Include rich LaTeX formulas ($...$ inline, $$...$$ display).
- Use Obsidian callouts:
> [!THEOREM] Core Theorem
> [!NOTE] Crucial Insight
> [!WARNING] Common Misconception
- Cross-reference related concepts using [[Double Bracket Wikilinks]].
"""
    note = call_model_with_fallback(
        prompt=prompt,
        response_schema=None,
        task_type="study_note",
        difficulty=difficulty
    )
    return note
