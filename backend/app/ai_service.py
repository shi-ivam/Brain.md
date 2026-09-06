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
    SuggestedResourcesResult,
    SlideDeckResult,
    EdgeBridgeResult,
    GraphWeaveResult,
    VisualizationItem,
    VisualizationBatchResult,
    VisualizationSuggestionItem,
    VisualizationSuggestionBatch,
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
- Start the markdown body immediately after the frontmatter with the note title: # {concept_title}
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

def suggest_resources_for_concept(
    concept_title: str,
    concept_summary: str = "",
    difficulty: str = "intermediate"
) -> SuggestedResourcesResult:
    prompt = f"""You are a world-class academic researcher, university professor, and learning curator.
Concept: "{concept_title}"
Summary / Context: "{concept_summary}"
Target Difficulty: {difficulty.upper()}

Curate 4 to 6 top-tier, authoritative learning resources specifically for mastering this concept.
Include:
1. Outstanding YouTube video lectures or visual explainers (e.g. from 3Blue1Brown, MIT OpenCourseWare, Stanford Online, Veritasium, Steve Brunton, Michael Penn, Khan Academy, or authoritative domain channels).
   - If exact YouTube video ID is not certain, provide a clean YouTube search query link: e.g. https://www.youtube.com/results?search_query=3blue1brown+brownian+motion
2. Authoritative University Lecture Notes or Reference PDFs (e.g. from MIT OCW, Stanford, Berkeley, Harvard, arXiv, or seminal open papers).
3. Interactive articles, documentation, or cheat sheets (e.g. Distill, Wikipedia, Brilliant, Stanford Encyclopedia of Philosophy).

For each item, specify:
- title: Clean, informative title
- resource_type: 'youtube', 'pdf', or 'url'
- url: Valid web URL (or YouTube search link)
- notes: Why this resource is exceptional and what specific intuition or rigor it imparts
- author: Creator, lecturer, or university institution
"""
    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=SuggestedResourcesResult,
        task_type="resources",
        difficulty=difficulty
    )
    return SuggestedResourcesResult.model_validate_json(raw_json)

def generate_study_slides(
    concept_title: str,
    summary: str = "",
    content: str = "",
    difficulty: str = "intermediate"
) -> SlideDeckResult:
    context_text = f"Summary: {summary}\n" if summary else ""
    if content and len(content) > 30:
        clean_content = content[:1500].strip()
        context_text += f"Existing Note Excerpt:\n{clean_content}\n"

    prompt = f"""You are an elite university professor, distinguished researcher, and master pedagogical communicator.
Create a comprehensive, visually organized, high-yield academic study slide deck for mastering: "{concept_title}".
Difficulty Level: {difficulty.upper()}
{context_text}

Design a sequence of 6 to 8 structured slides:
1. Title Slide: A compelling presentation title, subtitle indicating domain, and 2-3 overarching objectives.
2. Intuitive & Physical Foundation: Real-world physical intuition, geometric visualization, or foundational motivation.
3. Rigorous Mathematical Formulation / Governing Laws: Exact definitions, state variables, and clean LaTeX formulas ($...$ for inline, $$...$$ for display).
4. Core Dynamics & Step-by-Step Mechanisms: How the process or concept unfolds mechanistically or analytically.
5. Real-World Applications & Scientific Frontiers: Contemporary cutting-edge applications in engineering, computer science, physics, economics, or biology.
6. Common Pitfalls & Counter-Intuitive Truths: Classic student misconceptions, boundary edge cases, or false assumptions to avoid.
7. High-Yield Summary & Active Recall Check: 3 vital takeaways, plus a provocative self-test question in 'quick_check' with a concise solution hint.

Slide Requirements:
- title: Crisp, active header (e.g., 'Governing Stochastic Differential Equation', not just 'Math').
- slide_type: One of 'title', 'concept', 'math', 'mechanism', 'applications', 'pitfalls', 'summary'.
- bullets: 3 to 5 concise, impactful bullet points. Use standard LaTeX for equations ($...$).
- formula: Provide the single most important LaTeX equation for math/mechanism slides (or null if not applicable).
- callout: An optional Obsidian-style callout (e.g. 'THEOREM: Continuous but nowhere differentiable paths' or 'WARNING: Increments must be independent').
- speaker_notes: Exhaustive, high-depth explanatory lecture narration (2-4 rich sentences) explaining the slide's nuance for independent study.
- quick_check: Conceptual active-recall question (especially on summary/pitfalls slide).
"""

    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=SlideDeckResult,
        task_type="general",
        difficulty=difficulty
    )
    return SlideDeckResult.model_validate_json(raw_json)

def bridge_edge_transition(
    source_node: Dict[str, Any],
    target_node: Dict[str, Any],
    bridge_count: int = 2,
    difficulty: str = "intermediate",
    focus_note: str = ""
) -> EdgeBridgeResult:
    count = max(1, min(3, bridge_count))
    user_context = f"\nUser Note on Difficult Leap: '{focus_note}'" if focus_note else ""

    prompt = f"""You are a master academic polymath, curriculum designer, and expert university tutor.
The user is studying a knowledge graph and finds the direct conceptual transition between these two connected concepts too steep, abstract, or difficult to bridge:

Preceding Source Concept: "{source_node.get('title')}"
- Summary: "{source_node.get('summary') or ''}"
- Type: {source_node.get('node_type')}

Target Following Concept: "{target_node.get('title')}"
- Summary: "{target_node.get('summary') or ''}"
- Type: {target_node.get('node_type')}
{user_context}

Difficulty Level: {difficulty.upper()}

Your Mission:
Diagnose the cognitive leap and design exactly {count} progressive intermediate stepping-stone concept(s) to place sequentially between Source and Target:
Source ➔ [Bridge 1] ➔ ... ➔ [Bridge {count}] ➔ Target

Requirements:
1. 'explanation_of_gap': A concise pedagogical diagnosis explaining why moving directly from Source to Target causes confusion, and what missing intuitions or foundations bridge them.
2. 'bridge_nodes': A list of exactly {count} distinct, rigorously defined concepts ordered sequentially from Source toward Target.
   - For each bridge node:
     - 'title': Clean, distinct concept title (not identical to source or target).
     - 'node_type': 'concept', 'subtopic', or 'prerequisite'.
     - 'summary': 2-3 sentence explanation explaining the intuition, mechanism, or formal definition of this stepping stone.
     - 'relation_from_prev': relation from preceding node to this node (e.g. 'subtopic_of', 'prerequisite_for', 'affects', 'develops_into').
     - 'label_from_prev': brief edge label (e.g. 'foundational to', 'motivates', 'formalizes').
     - 'speaker_note': brief study note explaining how this concept specifically softens the intellectual jump.
3. 'relation_to_target': Relation from the last bridge node to Target Concept (e.g. 'prerequisite_for', 'subtopic_of', 'formalizes').
4. 'label_to_target': Brief label for the final edge into Target Concept.
"""

    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=EdgeBridgeResult,
        task_type="frontier_proof",
        difficulty=difficulty
    )
    return EdgeBridgeResult.model_validate_json(raw_json)


def weave_concept_into_graph(
    topic_title: str,
    existing_nodes: List[Dict[str, Any]],
    prompt_text: str,
    target_type: str = "auto",
    difficulty: str = "intermediate"
) -> GraphWeaveResult:
    nodes_summary_lines = []
    for n in existing_nodes[:35]:
        nodes_summary_lines.append(f"- [{n['id'][:8]}] '{n['title']}' ({n.get('node_type', 'concept')}): {(n.get('summary') or '')[:100]}")
    existing_nodes_context = "\n".join(nodes_summary_lines)

    type_directive = f"Target Node Type: {target_type.upper()}." if target_type != "auto" else "Auto-classify whether the user prompt represents a question, concept, prerequisite, or subtopic."

    prompt = f"""You are an autonomous knowledge graph architect and academic curriculum director.
Topic Curriculum: "{topic_title}"
User Inquiry or Concept to Ingest: "{prompt_text}"
{type_directive}
Difficulty Level: {difficulty.upper()}

Current Knowledge Graph Nodes:
{existing_nodes_context}

Your Goal:
Ingest the user's inquiry/concept and seamlessly weave it into the most appropriate location in the existing graph ontology.
Determine:
1. Best Anchor Concept(s): Select 1 or 2 existing node IDs (e.g. 8-char prefixes from above) that are conceptually closest to this topic.
2. Cognitive Leap Evaluation:
   - If the user's prompt directly connects to an anchor: create just the primary node ('is_primary_target': True) and connect it.
   - If there is a noticeable prerequisite or conceptual gap between the anchor and the user's prompt: create 1 or 2 intermediate stepping-stone nodes ('is_primary_target': False) that build up to the user's primary node!
3. 'rationale': Clear academic explanation of where this concept was docked and why any connecting stepping stones were added.
4. 'nodes_to_create': List of nodes to create (always include the user's primary concept with is_primary_target=True, plus any intermediate nodes).
5. 'edges_to_create': Directed edges linking existing anchors to the new nodes and/or between new nodes.
"""

    raw_json = call_model_with_fallback(
        prompt=prompt,
        response_schema=GraphWeaveResult,
        task_type="general",
        difficulty=difficulty
    )
    return GraphWeaveResult.model_validate_json(raw_json)



# ==================== Design Tokens for Visualizations ====================

OBSIDIAN_DESIGN_TOKENS_CSS = """
:root {
  --bg-primary: #161618;
  --bg-card: #222226;
  --bg-card-hover: #29292e;
  --bg-input: #1f1f23;
  --border-subtle: #2b2b32;
  --border-active: #3e3e4a;
  --border-highlight: rgba(139, 123, 245, 0.4);
  --text-primary: #ededec;
  --text-secondary: #9c9ca3;
  --text-muted: #64646c;
  --accent: #8b7bf5;
  --accent-cyan: #38bdf8;
  --accent-emerald: #10b981;
  --accent-amber: #f59e0b;
  --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Geist Mono', 'SF Mono', Menlo, Consolas, monospace;
}
"""


def clean_mermaid_code(code: str) -> str:
    """Sanitizes raw Mermaid markup generated by AI."""
    if not code:
        return ""
    c = code.strip()
    if c.startswith("```"):
        lines = c.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        c = "\n".join(lines).strip()
    return c


def clean_html_code(code: str) -> str:
    """Sanitizes raw HTML output from AI, stripping markdown fences."""
    if not code:
        return ""
    c = code.strip()
    if c.startswith("```html") or c.startswith("```xml"):
        c = c.split("\n", 1)[1] if "\n" in c else ""
    elif c.startswith("```"):
        c = c.split("\n", 1)[1] if "\n" in c else ""
    if c.endswith("```"):
        c = c.rsplit("```", 1)[0]
    return c.strip()


def build_fallback_simulation_html(
    concept_title: str,
    summary: str = "",
    custom_prompt: Optional[str] = None
) -> str:
    """
    Builds a self-contained, responsive, animated HTML5 canvas simulation
    incorporating Brain.md's Obsidian dark theme design tokens and interactive controls.
    Strictly zero emojis.
    """
    safe_title = (concept_title or "Concept").replace('"', "'")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{safe_title} Simulation</title>
<style>
  {OBSIDIAN_DESIGN_TOKENS_CSS}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-sans);
    overflow: hidden;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    user-select: none;
  }}
  header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-card);
    flex-shrink: 0;
  }}
  .title-group {{ display: flex; align-items: center; gap: 10px; }}
  .title {{ font-size: 13.5px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }}
  .status-pill {{
    font-size: 10.5px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(16, 185, 129, 0.12);
    color: var(--accent-emerald);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }}
  .readout {{ font-size: 11.5px; font-family: var(--font-mono); color: var(--text-muted); }}
  .readout span {{ color: var(--accent-cyan); }}

  #canvas-container {{
    flex: 1;
    position: relative;
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }}
  canvas {{
    display: block;
    width: 100%;
    height: 100%;
  }}

  footer {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 16px;
    background: var(--bg-card);
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
    flex-shrink: 0;
  }}
  .control-group {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
  button {{
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--font-sans);
    transition: all 0.15s ease;
  }}
  button:hover {{
    border-color: var(--border-active);
    background: #282830;
  }}
  .btn-primary {{
    background: rgba(139, 123, 245, 0.15);
    border-color: var(--accent);
    color: var(--text-primary);
  }}
  .btn-primary:hover {{ background: rgba(139, 123, 245, 0.25); }}
  .slider-item {{ display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }}
  input[type=range] {{
    -webkit-appearance: none;
    background: var(--bg-input);
    height: 4px;
    border-radius: 2px;
    outline: none;
    accent-color: var(--accent);
    width: 90px;
  }}
  .val-badge {{ font-family: var(--font-mono); color: var(--accent-cyan); font-size: 11px; min-width: 32px; }}
</style>
</head>
<body>
<header>
  <div class="title-group">
    <div class="title">{safe_title}</div>
    <div class="status-pill" id="statusPill">ACTIVE</div>
  </div>
  <div class="readout">PHASE: <span id="phaseVal">0.00 rad</span> | NODES: <span id="nodesVal">28</span> | ENERGY: <span id="energyVal">1.00</span></div>
</header>
<div id="canvas-container">
  <canvas id="simCanvas"></canvas>
</div>
<footer>
  <div class="control-group">
    <button id="playBtn" class="btn-primary">Pause</button>
    <button id="resetBtn">Reset</button>
  </div>
  <div class="control-group">
    <div class="slider-item">
      <span>Speed</span>
      <input type="range" id="speedSlider" min="0.2" max="3.0" step="0.1" value="1.0">
      <span class="val-badge" id="speedBadge">1.0x</span>
    </div>
    <div class="slider-item">
      <span>Harmonics</span>
      <input type="range" id="modeSlider" min="1" max="8" step="1" value="3">
      <span class="val-badge" id="modeBadge">3</span>
    </div>
    <div class="slider-item">
      <span>Coupling</span>
      <input type="range" id="couplingSlider" min="0" max="100" step="5" value="50">
      <span class="val-badge" id="couplingBadge">0.50</span>
    </div>
  </div>
</footer>

<script>
(function() {{
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');
  const container = document.getElementById('canvas-container');
  const playBtn = document.getElementById('playBtn');
  const resetBtn = document.getElementById('resetBtn');
  const speedSlider = document.getElementById('speedSlider');
  const modeSlider = document.getElementById('modeSlider');
  const couplingSlider = document.getElementById('couplingSlider');
  const speedBadge = document.getElementById('speedBadge');
  const modeBadge = document.getElementById('modeBadge');
  const couplingBadge = document.getElementById('couplingBadge');
  const phaseVal = document.getElementById('phaseVal');
  const energyVal = document.getElementById('energyVal');

  let width = 600, height = 400;
  let running = true;
  let time = 0;
  let speed = 1.0;
  let mode = 3;
  let coupling = 0.5;
  let mouse = {{ x: -1000, y: -1000 }};

  const NUM_NODES = 28;
  let nodes = [];

  function initNodes() {{
    nodes = [];
    for (let i = 0; i < NUM_NODES; i++) {{
      const angle = (i / NUM_NODES) * Math.PI * 2;
      nodes.push({{
        baseAngle: angle,
        radiusOffset: (i % 2 === 0 ? 30 : -20),
        freq: 0.5 + (i % 4) * 0.3,
        phase: (i / NUM_NODES) * Math.PI,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0
      }});
    }}
  }}

  function resize() {{
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = rect.width || 600;
    height = rect.height || 400;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
  }}
  window.addEventListener('resize', resize);
  resize();
  initNodes();

  container.addEventListener('mousemove', (e) => {{
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }});
  container.addEventListener('mouseleave', () => {{
    mouse.x = -1000;
    mouse.y = -1000;
  }});
  container.addEventListener('click', (e) => {{
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    for (let n of nodes) {{
      const dx = n.x - clickX;
      const dy = n.y - clickY;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 180) {{
        n.vx += (dx / dist) * 12;
        n.vy += (dy / dist) * 12;
      }}
    }}
  }});

  speedSlider.addEventListener('input', (e) => {{
    speed = parseFloat(e.target.value);
    speedBadge.textContent = speed.toFixed(1) + 'x';
  }});
  modeSlider.addEventListener('input', (e) => {{
    mode = parseInt(e.target.value, 10);
    modeBadge.textContent = mode;
  }});
  couplingSlider.addEventListener('input', (e) => {{
    coupling = parseFloat(e.target.value) / 100;
    couplingBadge.textContent = coupling.toFixed(2);
  }});

  playBtn.addEventListener('click', () => {{
    running = !running;
    playBtn.textContent = running ? 'Pause' : 'Resume';
    playBtn.className = running ? 'btn-primary' : '';
    document.getElementById('statusPill').textContent = running ? 'ACTIVE' : 'PAUSED';
    document.getElementById('statusPill').style.color = running ? 'var(--accent-emerald)' : 'var(--text-muted)';
  }});
  resetBtn.addEventListener('click', () => {{
    time = 0;
    initNodes();
  }});

  function animate() {{
    if (running) {{
      time += 0.02 * speed;
    }}

    ctx.fillStyle = '#161618';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.32;

    // Orbital reference tracks
    ctx.strokeStyle = 'rgba(43, 43, 50, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(43, 43, 50, 0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.6, 0, Math.PI * 2);
    ctx.arc(cx, cy, baseRadius * 1.35, 0, Math.PI * 2);
    ctx.stroke();

    // Update nodes
    for (let i = 0; i < nodes.length; i++) {{
      const n = nodes[i];
      const harmonic = Math.sin(time * n.freq * mode + n.phase);
      const r = baseRadius + n.radiusOffset + harmonic * (30 * coupling);
      const targetX = cx + Math.cos(n.baseAngle + time * 0.25 * speed) * r;
      const targetY = cy + Math.sin(n.baseAngle + time * 0.25 * speed) * r;

      n.vx += (targetX - n.x) * 0.08;
      n.vy += (targetY - n.y) * 0.08;
      n.vx *= 0.86;
      n.vy *= 0.86;

      const mdx = n.x - mouse.x;
      const mdy = n.y - mouse.y;
      const mdist = Math.hypot(mdx, mdy);
      if (mdist < 100) {{
        const force = (100 - mdist) * 0.04;
        n.vx += (mdx / mdist) * force;
        n.vy += (mdy / mdist) * force;
      }}

      n.x += n.vx;
      n.y += n.vy;
    }}

    // Dynamic field vectors
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {{
      for (let j = i + 1; j < nodes.length; j++) {{
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < 110) {{
          const alpha = (1 - dist / 110) * 0.5 * coupling;
          ctx.strokeStyle = `rgba(139, 123, 245, ${{alpha}})`;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }}
      }}
    }}

    // Core emitter
    const corePulse = Math.sin(time * 2) * 4;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.arc(cx, cy, 18 + corePulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {{
      const n = nodes[i];
      const isAlt = i % 2 === 0;

      ctx.fillStyle = isAlt ? 'rgba(139, 123, 245, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isAlt ? '#8b7bf5' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }}

    const curPhase = (time % (Math.PI * 2)).toFixed(2);
    phaseVal.textContent = curPhase + ' rad';
    const totalKinetic = nodes.reduce((acc, n) => acc + (n.vx*n.vx + n.vy*n.vy), 0);
    energyVal.textContent = (1.0 + totalKinetic * 0.05).toFixed(2);

    requestAnimationFrame(animate);
  }}

  requestAnimationFrame(animate);
}})();
</script>
</body>
</html>"""


def build_fallback_suggestions(
    concept_title: str,
    summary: str = "",
    node_type: str = "concept"
) -> List[VisualizationSuggestionItem]:
    """Generates personalized domain-tailored suggestions when offline. Strictly zero emojis."""
    title_lower = (concept_title or "").lower()
    summary_lower = (summary or "").lower()
    combined = f"{title_lower} {summary_lower}"

    if any(k in combined for k in ["quantum", "qubit", "shor", "grover", "bell", "entangle", "clifford", "unitary"]):
        return [
            VisualizationSuggestionItem(
                id="state_vector_bloch",
                title="State Vector & Phase Dynamics Simulator",
                description="Interactive Bloch-sphere and phase evolution showing superposition vectors and unitary rotations.",
                category="simulation",
                prompt=f"Create an interactive 3D/2D quantum phase and state vector simulator for '{concept_title}' with rotation controls, phase angle sliders, and probability amplitude readouts."
            ),
            VisualizationSuggestionItem(
                id="interference_wave_packet",
                title="Quantum Wave Packet & Interference Lab",
                description="Real-time wave function evolution demonstrating destructive and constructive interference patterns.",
                category="interactive_lab",
                prompt=f"Create an interactive wave packet simulation for '{concept_title}' showing wave function interference, potential barrier tunneling or phase shift, with wavelength and frequency sliders."
            ),
            VisualizationSuggestionItem(
                id="circuit_evolution_stepper",
                title="Multi-State Gate Sequence & Entanglement Runner",
                description="Interactive step-by-step state transition runner tracking computational basis state vectors.",
                category="state_machine",
                prompt=f"Create an interactive step-by-step state runner for '{concept_title}' illustrating state progression across transformation steps, with step forward/backward buttons and state probabilities."
            ),
        ]
    elif any(k in combined for k in ["matrix", "linear", "vector", "eigen", "space", "algebra", "hilbert", "transform", "dimension"]):
        return [
            VisualizationSuggestionItem(
                id="eigen_vector_grid_warp",
                title="Linear Transformation & Eigenvector Grid Warp",
                description="Interactive coordinate grid showing how transformation matrices stretch, rotate, and preserve eigenvectors.",
                category="simulation",
                prompt=f"Create an interactive 2D linear transformation visualizer for '{concept_title}' with matrix element sliders (a, b, c, d), an animated warped coordinate grid, and real-time eigenvector tracking."
            ),
            VisualizationSuggestionItem(
                id="inner_product_projection",
                title="Orthogonal Projection & Subspace Decomposition",
                description="Interactive vector projection lab demonstrating orthogonal complements, Gram-Schmidt steps, and inner products.",
                category="interactive_lab",
                prompt=f"Create an interactive vector projection and inner product lab for '{concept_title}' with draggable vectors, projection shadow visualization, and calculated inner product angle."
            ),
            VisualizationSuggestionItem(
                id="svd_dimension_reduction",
                title="Singular Value Decomposition Geometric Morph",
                description="Continuous morphing of geometric shapes under rotation, singular scaling, and reflection.",
                category="simulation",
                prompt=f"Create an interactive SVD geometric morph visualizer for '{concept_title}' demonstrating the action of U, Sigma, and V* on a unit circle with interactive singular value sliders."
            ),
        ]
    elif any(k in combined for k in ["algorithm", "complexity", "graph", "tree", "sort", "search", "turing", "automata", "p vs np"]):
        return [
            VisualizationSuggestionItem(
                id="algorithm_state_stepper",
                title="Dynamic Execution Flow & State Stepper",
                description="Step-by-step animated execution flow showing pointer movements, state transitions, and memory updates.",
                category="state_machine",
                prompt=f"Create an interactive step-by-step algorithmic state machine for '{concept_title}' with step/play/pause controls, data structure animation, and computational complexity readouts."
            ),
            VisualizationSuggestionItem(
                id="complexity_scaling_frontier",
                title="Asymptotic Scaling & Resource Frontier",
                description="Interactive comparative growth curves simulating execution time and memory limits under scaling input sizes.",
                category="interactive_lab",
                prompt=f"Create an interactive computational resource scaling graph for '{concept_title}' showing time/space growth curves with interactive input size (N) slider and threshold markers."
            ),
            VisualizationSuggestionItem(
                id="search_space_traversal",
                title="State Space & Graph Traversal Simulator",
                description="Animated traversal over problem nodes showing branch pruning, heuristic frontiers, and optimal paths.",
                category="simulation",
                prompt=f"Create an animated graph/state space traversal simulation for '{concept_title}' with heuristic weight sliders, visited node heatmaps, and path reconstruction."
            ),
        ]
    elif any(k in combined for k in ["physics", "particle", "gravity", "wave", "mechanics", "thermo", "energy", "force", "field"]):
        return [
            VisualizationSuggestionItem(
                id="field_lines_potential",
                title="Dynamic Vector Field & Potential Well Lab",
                description="Interactive 2D vector field simulator showing potential contours, field lines, and test particle trajectories.",
                category="simulation",
                prompt=f"Create an interactive potential well and vector field simulation for '{concept_title}' with draggable source charges/masses, field line density sliders, and moving test particles."
            ),
            VisualizationSuggestionItem(
                id="harmonic_oscillator_phase",
                title="Harmonic Phase Space & Orbit Trajectory",
                description="Real-time phase space plot (x vs p) demonstrating oscillatory cycles, damping dissipation, and resonances.",
                category="phase_explorer",
                prompt=f"Create an interactive phase-space trajectory simulation for '{concept_title}' showing position vs momentum orbits, damping coefficient slider, and driving frequency resonance."
            ),
            VisualizationSuggestionItem(
                id="conservation_flux_simulator",
                title="Flux Transport & Boundary Conservation",
                description="Animated particle flux and conservation law simulator tracking energy and mass conservation across boundaries.",
                category="interactive_lab",
                prompt=f"Create an animated conservation law flux visualizer for '{concept_title}' with boundary inflow/outflow controls and real-time accumulated quantity counters."
            ),
        ]
    else:
        return [
            VisualizationSuggestionItem(
                id="dynamic_parameter_orbit",
                title=f"{concept_title}: Dynamic Parameter Space & Phase Orbit",
                description="Interactive multi-variable simulation demonstrating governing relationships and equilibrium convergence.",
                category="simulation",
                prompt=f"Create an interactive animated parameter space simulation for '{concept_title}' with dynamic sliders, continuous state animation, and equilibrium convergence indicators."
            ),
            VisualizationSuggestionItem(
                id="causal_flow_particles",
                title=f"{concept_title}: Causal Mechanism & Flow Simulator",
                description="Animated network flow showing signals, inputs, transformations, and output feedback loops.",
                category="interactive_lab",
                prompt=f"Create an interactive causal flow simulation for '{concept_title}' showing animated pulses traversing nodes, with transmission rate and latency sliders."
            ),
            VisualizationSuggestionItem(
                id="state_transition_machine",
                title=f"{concept_title}: Interactive State Transition Machine",
                description="Interactive state engine illustrating lifecycle conditions, threshold triggers, and boundary states.",
                category="state_machine",
                prompt=f"Create an interactive state machine for '{concept_title}' with interactive state switching, transition condition guards, and live state inspection readouts."
            ),
        ]


def suggest_node_visualizations(
    concept_title: str,
    summary: str = "",
    content: str = "",
    node_type: str = "concept",
    difficulty: str = "intermediate"
) -> List[VisualizationSuggestionItem]:
    """
    Suggests 3 to 4 personalized interactive simulation topics tailored to the node.
    Strictly zero emojis.
    """
    context_text = f"Summary: {summary}\n" if summary else ""
    if content and len(content) > 30:
        context_text += f"Study Note Excerpt: {content[:400].strip()}\n"

    prompt = f"""You are a scientific computing visualization architect and interactive software designer.
Propose 3 to 4 hyper-specific, interactive, animated webpage visualization topics to master the concept: "{concept_title}".
Difficulty Level: {difficulty.upper()}
{context_text}

Requirements:
1. Each suggestion must describe an interactive, animated HTML5 canvas or SVG simulation with moving parts (e.g. particle systems, phase vector orbits, parameter sliders, wave propagation, algorithmic state transitions).
2. 'title': Short, elegant, minimalist title for the simulation. ABSOLUTELY NO EMOJIS!
3. 'description': 1 concise sentence describing what the interactive simulation demonstrates.
4. 'category': One of 'simulation', 'interactive_lab', 'phase_explorer', 'state_machine'.
5. 'prompt': Detailed prompt instructions to generate this exact interactive HTML5 canvas/SVG simulation.
6. STRICT ZERO-EMOJIS RULE: Never use emojis in any title, description, category, or prompt. Keep everything minimalist and elegant.
"""

    try:
        raw_json = call_model_with_fallback(
            prompt=prompt,
            response_schema=VisualizationSuggestionBatch,
            task_type="general",
            difficulty=difficulty
        )
        batch = VisualizationSuggestionBatch.model_validate_json(raw_json)
        if batch.suggestions and len(batch.suggestions) > 0:
            return batch.suggestions
        return build_fallback_suggestions(concept_title, summary, node_type)
    except Exception as e:
        logger.warning(f"Could not fetch AI visualization suggestions ({e}). Using robust fallback.")
        return build_fallback_suggestions(concept_title, summary, node_type)


def build_fallback_visualizations(
    concept_title: str,
    summary: str = "",
    visualization_type: str = "simulation",
    custom_prompt: Optional[str] = None
) -> VisualizationBatchResult:
    """
    Generates structured, valid fallback visualizations.
    Produces interactive HTML5 webpage simulations by default, or Mermaid if explicitly requested.
    """
    vt = (visualization_type or "simulation").lower()

    if vt in ["mermaid", "flowchart", "mindmap"]:
        safe_title = (concept_title or "Concept").replace('"', "'")
        flow_code = f"""flowchart TD
    A["{safe_title}"] --> B["Foundational Assumptions & Principles"]
    B --> C["Operational Dynamics & Transformations"]
    C --> D["Observable Outputs & State Transitions"]
    D --> E["Applications & Boundary Regimes"]
    style A fill:#231d36,stroke:#bfa4f8,stroke-width:2px,color:#ededec
    style B fill:#1e293b,stroke:#38bdf8,stroke-width:1.5px,color:#ededec
    style C fill:#1e1b4b,stroke:#818cf8,stroke-width:1.5px,color:#ededec
    style D fill:#14532d,stroke:#4ade80,stroke-width:1.5px,color:#ededec
    style E fill:#451a03,stroke:#fbbf24,stroke-width:1.5px,color:#ededec"""

        return VisualizationBatchResult(
            concept_title=concept_title,
            visualizations=[
                VisualizationItem(
                    title=f"{concept_title}: Mechanism Pipeline",
                    visualization_type="flowchart",
                    code=flow_code,
                    description=f"Directed step-by-step causal mechanism for {concept_title}.",
                    explanation=f"Systematic mechanism tracing foundational principles to boundary conditions.",
                    format="mermaid"
                )
            ]
        )

    # Default: Interactive HTML5 Simulation
    html_code = build_fallback_simulation_html(concept_title, summary, custom_prompt)
    return VisualizationBatchResult(
        concept_title=concept_title,
        visualizations=[
            VisualizationItem(
                title=f"{concept_title}: Interactive Dynamics Simulation",
                visualization_type="simulation",
                code=html_code,
                description=f"Interactive animated HTML5 simulation exploring parameter spaces and real-time state dynamics for {concept_title}.",
                explanation=f"Self-contained simulation with continuous animation loop, dynamic moving elements, parameter sliders, and real-time state metric readouts matching Obsidian theme tokens.",
                format="html"
            )
        ]
    )


def generate_node_visualizations(
    concept_title: str,
    summary: str = "",
    content: str = "",
    difficulty: str = "intermediate",
    visualization_type: str = "simulation",
    custom_prompt: Optional[str] = None
) -> VisualizationBatchResult:
    """
    Generates a fully self-contained, interactive HTML5 webpage visualization
    with proper animations, moving parts, interactive sliders/controls, and Obsidian design tokens.
    Falls back gracefully if AI is unavailable. Strictly zero emojis.
    """
    context_text = f"Summary: {summary}\n" if summary else ""
    if content and len(content) > 30:
        clean_content = content[:1200].strip()
        context_text += f"Note Excerpt:\n{clean_content}\n"

    custom_clause = f"\nSpecific Simulation Focus / User Request: {custom_prompt}\n" if custom_prompt else ""

    vt = (visualization_type or "simulation").lower()
    is_mermaid_requested = vt in ["mermaid", "flowchart", "mindmap"] or (custom_prompt and "mermaid" in custom_prompt.lower())

    if is_mermaid_requested:
        prompt = f"""You are a scientific visualizer and technical diagram architect.
Design a clear, pedagogical Mermaid.js diagram to master the concept: "{concept_title}".
Difficulty Level: {difficulty.upper()}
{context_text}{custom_clause}
Return valid Mermaid code without markdown backticks. STRICT ZERO-EMOJIS RULE.
"""
    else:
        prompt = f"""You are an elite computational visualization engineer and interactive scientific software architect.
Generate a complete, self-contained, interactive HTML5 webpage visualization to deeply illustrate the concept: "{concept_title}".
Difficulty Level: {difficulty.upper()}
{context_text}{custom_clause}

CRITICAL TECHNICAL REQUIREMENTS:
1. Return a single, 100% self-contained, valid HTML document starting with `<!DOCTYPE html><html lang="en">` and ending with `</html>`.
2. NO EXTERNAL CDNs or third-party libraries. Use pure vanilla HTML5 Canvas (2D or WebGL), dynamic SVG, and pure JavaScript.
3. Proper Animations & Moving Parts:
   - Must have continuous, silky-smooth motion via a `requestAnimationFrame` animation loop (e.g. particle flows, rotating state vectors, harmonic wave oscillations, phase space trajectories, recursive tree growths).
   - Moving elements must faithfully model the mathematical or physical principles of "{concept_title}".
4. Interactive Controls Bar:
   - Include minimalist controls:
     * Play / Pause button
     * Reset button
     * 2 to 3 dynamic parameter sliders with live value readouts (e.g. Speed, Frequency, Coupling, Phase, Threshold, Damping)
     * Real-time metric readout panel showing calculated physical/mathematical parameters on hover or update.
5. Strict Obsidian Theme Design Tokens:
   Use the following CSS design tokens directly in `<style>`:
{OBSIDIAN_DESIGN_TOKENS_CSS}
   - The body background MUST be var(--bg-primary, #161618).
   - Text colors MUST use var(--text-primary, #ededec), var(--text-secondary, #9c9ca3), var(--text-muted, #64646c).
   - Controls, buttons, and sliders MUST use var(--bg-card, #222226), var(--border-subtle, #2b2b32), and var(--accent, #8b7bf5) / var(--accent-cyan, #38bdf8).
   - Sliders must have minimalist styling with sleek track and accent thumb.
6. STRICT ZERO-EMOJIS RULE:
   - NEVER use emojis in the title, buttons, UI labels, readouts, or JavaScript alerts.
   - Use clean, professional typography and minimalist text labels.
7. Responsive Full-Height Viewport:
   - The document MUST stretch to fill 100% of its container:
     html, body {{ width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-primary); }}
   - The canvas container element MUST have `flex: 1; min-height: 0; width: 100%; position: relative; overflow: hidden;`.
   - The canvas element MUST have `display: block; width: 100%; height: 100%;`.
   - Include a resize event listener (`window.addEventListener('resize', ...)`) to dynamically update canvas dimensions to fill container space.
8. Return raw HTML in the 'code' property without markdown code fences.
"""

    try:
        raw_json = call_model_with_fallback(
            prompt=prompt,
            response_schema=VisualizationBatchResult,
            task_type="general",
            difficulty=difficulty
        )
        batch = VisualizationBatchResult.model_validate_json(raw_json)
        cleaned_items = []
        for v in batch.visualizations:
            if v.format == "mermaid":
                clean_code = clean_mermaid_code(v.code)
            else:
                clean_code = clean_html_code(v.code)
            if clean_code:
                v.code = clean_code
                cleaned_items.append(v)
        if cleaned_items:
            batch.visualizations = cleaned_items
            return batch
        else:
            return build_fallback_visualizations(concept_title, summary, visualization_type, custom_prompt)
    except Exception as e:
        logger.warning(f"Could not generate interactive visualization via Gemini ({e}). Using robust fallback.")
        return build_fallback_visualizations(concept_title, summary, visualization_type, custom_prompt)



