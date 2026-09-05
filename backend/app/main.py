import os
import io
import zipfile
import json
import uuid
import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import (
    GCP_PROJECT,
    GCP_LOCATION,
    PRIMARY_MODEL,
    FALLBACK_MODELS,
    CORS_ORIGINS,
)
from .database import (
    init_db,
    get_connection,
    list_topics,
    get_topic,
    get_full_graph,
    delete_topic,
    now_iso,
)
from .schemas import (
    TopicGenerateRequest,
    TopicResponse,
    NodeCreate,
    NodeUpdate,
    EdgeCreate,
    NodeExpandRequest,
    QuestionAskRequest,
    QuizGenerateRequest,
    QuizAnswerSubmit,
    NoteSaveRequest,
    NodePositionUpdate,
)
from . import ai_service

logger = logging.getLogger("main")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Knowledge Graph Learning System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    logger.info(f"Initialized SQLite database. GCP Project={GCP_PROJECT}, Model={PRIMARY_MODEL}")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "gcp_project": GCP_PROJECT,
        "gcp_location": GCP_LOCATION,
        "primary_model": PRIMARY_MODEL,
        "fallback_models": FALLBACK_MODELS,
    }

@app.get("/api/topics")
def get_topics():
    return list_topics()

@app.get("/api/topics/{topic_id}")
def get_topic_graph(topic_id: str):
    graph = get_full_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic not found")
    return graph

@app.delete("/api/topics/{topic_id}")
def remove_topic(topic_id: str):
    success = delete_topic(topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"message": "Topic deleted successfully"}

@app.post("/api/topics/generate")
def generate_topic_knowledge_graph(req: TopicGenerateRequest):
    topic_clean = req.topic.strip()
    if not topic_clean:
        raise HTTPException(status_code=400, detail="Topic query cannot be empty")

    logger.info(f"Generating knowledge graph for: '{topic_clean}' with difficulty '{req.difficulty}'")
    curriculum = ai_service.generate_curriculum(
        topic=topic_clean,
        difficulty=req.difficulty or "intermediate",
        focus_area=req.focus_area
    )

    topic_id = str(uuid.uuid4())
    now = now_iso()
    
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO topics (id, title, description, difficulty, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (topic_id, curriculum.topic_title, curriculum.topic_description, req.difficulty, now, now)
        )

        key_to_node_id = {}
        root_node_id = None

        # Position mapping for Left-to-Right Academic DAG
        # Layer -1: Prerequisite column (x ~ 80)
        # Layer 0: Root topic (x ~ 300)
        # Layer 1: Core pillars (x ~ 550)
        # Layer 2: Advanced applications (x ~ 800)
        layer_counts = {-1: 0, 0: 0, 1: 0, 2: 0}

        for item in curriculum.nodes:
            layer = item.layer_level
            if layer not in layer_counts:
                layer = 1
            idx = layer_counts[layer]
            layer_counts[layer] += 1

            if layer == -1:
                pos_x = 90
                pos_y = 120 + idx * 110
            elif layer == 0:
                pos_x = 320
                pos_y = 280 + idx * 120
            elif layer == 1:
                pos_x = 580
                pos_y = 90 + idx * 105
            else:
                pos_x = 840
                pos_y = 90 + idx * 100

            node_id = str(uuid.uuid4())
            key_to_node_id[item.id_key] = node_id

            if layer == 0 or (root_node_id is None and item.node_type == "concept"):
                root_node_id = node_id

            metadata = {
                "academic_domain": item.academic_domain,
                "layer_level": item.layer_level,
                "original_key": item.id_key,
            }

            cursor.execute(
                """INSERT INTO nodes (id, topic_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    node_id,
                    topic_id,
                    item.title,
                    item.node_type,
                    item.summary,
                    item.initial_markdown_note,
                    req.difficulty,
                    json.dumps(metadata),
                    pos_x,
                    pos_y,
                    now,
                    now
                )
            )

        if root_node_id:
            cursor.execute("UPDATE topics SET root_node_id = ? WHERE id = ?", (root_node_id, topic_id))

        # Insert edges
        for edge in curriculum.edges:
            src_id = key_to_node_id.get(edge.source_key)
            tgt_id = key_to_node_id.get(edge.target_key)
            if src_id and tgt_id:
                edge_id = str(uuid.uuid4())
                cursor.execute(
                    """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (edge_id, topic_id, src_id, tgt_id, edge.relation_type, edge.label, now)
                )

    conn.close()
    return get_full_graph(topic_id)

@app.post("/api/nodes/{node_id}/expand")
def expand_node(node_id: str, req: NodeExpandRequest):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    node_row = cursor.fetchone()
    if not node_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")
    
    node = dict(node_row)
    topic_id = node["topic_id"]
    difficulty = req.difficulty or node.get("difficulty") or "intermediate"
    now = now_iso()
    created_nodes = []
    created_edges = []

    # Calculate position offsets around parent node
    parent_x = node.get("pos_x") or 400
    parent_y = node.get("pos_y") or 300

    if req.expansion_type == "topics_affecting_question" or node["node_type"] == "question":
        # Deep Question Decomposition: Find underlying theories/topics affecting this question
        logger.info(f"Decomposing question '{node['title']}' using HIGH thinking")
        decomp = ai_service.decompose_question_to_topics(
            question=node["title"],
            context=node.get("summary") or node.get("content") or "",
            difficulty=difficulty
        )

        with conn:
            for i, topic_item in enumerate(decomp.underlying_topics):
                new_id = str(uuid.uuid4())
                new_x = parent_x + 220
                new_y = parent_y - 120 + i * 95
                meta = {
                    "academic_domain": topic_item.academic_domain,
                    "relation_reason": topic_item.explanation_of_influence,
                    "decomp_from_question": node_id
                }
                content = f"## Influence on Inquiry\n\n{topic_item.explanation_of_influence}\n\n## Overview\n\n{topic_item.summary}"
                cursor.execute(
                    """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (new_id, topic_id, node_id, topic_item.title, "concept", topic_item.summary, content, difficulty, json.dumps(meta), new_x, new_y, now, now)
                )
                edge_id = str(uuid.uuid4())
                cursor.execute(
                    """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (edge_id, topic_id, new_id, node_id, topic_item.relation, f"Underpins Question ({topic_item.relation})", now)
                )
                created_nodes.append({"id": new_id, "title": topic_item.title, "node_type": "concept"})
                created_edges.append({"id": edge_id, "source_id": new_id, "target_id": node_id})

    elif req.expansion_type == "subquestions":
        # Branch sub-questions
        logger.info(f"Branching subquestions for '{node['title']}'")
        res = ai_service.answer_socratic_inquiry(
            concept_title=node["title"],
            question="What are the essential unresolved sub-questions and investigative frontiers?",
            context=node.get("summary") or "",
            difficulty=difficulty
        )
        with conn:
            for i, q_text in enumerate(res.follow_up_inquiries):
                new_id = str(uuid.uuid4())
                new_x = parent_x + 230
                new_y = parent_y - 80 + i * 90
                cursor.execute(
                    """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (new_id, topic_id, node_id, q_text, "question", "Follow-up investigative inquiry", "", difficulty, json.dumps({}), new_x, new_y, now, now)
                )
                edge_id = str(uuid.uuid4())
                cursor.execute(
                    """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (edge_id, topic_id, node_id, new_id, "question_for", "Explores question", now)
                )
                created_nodes.append({"id": new_id, "title": q_text, "node_type": "question"})
                created_edges.append({"id": edge_id, "source_id": node_id, "target_id": new_id})

    else:
        # Standard Concept Subtopics expansion
        logger.info(f"Expanding subtopics for '{node['title']}'")
        expansion = ai_service.expand_concept_subtopics(
            concept_title=node["title"],
            concept_summary=node.get("summary") or "",
            difficulty=difficulty
        )
        with conn:
            for i, item in enumerate(expansion.subtopics):
                new_id = str(uuid.uuid4())
                new_x = parent_x + 240
                new_y = parent_y - 100 + i * 100
                meta = {
                    "academic_domain": item.academic_domain,
                    "relation_to_parent": item.relation_to_parent
                }
                cursor.execute(
                    """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (new_id, topic_id, node_id, item.title, "subtopic", item.summary, "", difficulty, json.dumps(meta), new_x, new_y, now, now)
                )
                edge_id = str(uuid.uuid4())
                cursor.execute(
                    """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (edge_id, topic_id, node_id, new_id, "subtopic_of", item.relation_to_parent, now)
                )
                created_nodes.append({"id": new_id, "title": item.title, "node_type": "subtopic"})
                created_edges.append({"id": edge_id, "source_id": node_id, "target_id": new_id})

    conn.close()
    return {
        "message": f"Created {len(created_nodes)} new nodes and {len(created_edges)} edges",
        "nodes": created_nodes,
        "edges": created_edges,
        "full_graph": get_full_graph(topic_id)
    }

@app.post("/api/nodes/{node_id}/inquiries")
def ask_node_inquiry(node_id: str, req: QuestionAskRequest):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    node_row = cursor.fetchone()
    if not node_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")
    
    node = dict(node_row)
    topic_id = node["topic_id"]
    difficulty = req.difficulty or node.get("difficulty") or "intermediate"

    res = ai_service.answer_socratic_inquiry(
        concept_title=node["title"],
        question=req.question,
        context=node.get("summary") or node.get("content") or "",
        difficulty=difficulty
    )

    inquiry_id = str(uuid.uuid4())
    now = now_iso()
    
    with conn:
        cursor.execute(
            """INSERT INTO inquiries (id, node_id, topic_id, question, answer, difficulty, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (inquiry_id, node_id, topic_id, req.question, res.answer_markdown, difficulty, now)
        )

        created_node_id = None
        if req.pin_to_graph:
            created_node_id = str(uuid.uuid4())
            parent_x = node.get("pos_x") or 400
            parent_y = node.get("pos_y") or 300
            new_x = parent_x + 180
            new_y = parent_y + 110
            cursor.execute(
                """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (created_node_id, topic_id, node_id, req.question, "question", "Inquiry question", res.answer_markdown, difficulty, json.dumps({}), new_x, new_y, now, now)
            )
            edge_id = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (edge_id, topic_id, node_id, created_node_id, "question_for", "Inquiry on", now)
            )

    conn.close()
    return {
        "inquiry": {
            "id": inquiry_id,
            "node_id": node_id,
            "question": req.question,
            "answer": res.answer_markdown,
            "key_takeaways": res.key_takeaways,
            "follow_up_inquiries": res.follow_up_inquiries,
            "mathematical_formulation": res.mathematical_formulation,
            "difficulty": difficulty,
        },
        "pinned_node_id": created_node_id,
        "full_graph": get_full_graph(topic_id) if req.pin_to_graph else None
    }

@app.post("/api/nodes/{node_id}/quizzes/generate")
def generate_quizzes_for_node(node_id: str, req: QuizGenerateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    node_row = cursor.fetchone()
    if not node_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")
    
    node = dict(node_row)
    topic_id = node["topic_id"]
    difficulty = req.difficulty or node.get("difficulty") or "intermediate"
    
    batch = ai_service.generate_concept_quizzes(
        concept_title=node["title"],
        concept_summary=node.get("summary") or "",
        count=req.count or 3,
        difficulty=difficulty
    )

    created_quizzes = []
    now = now_iso()
    with conn:
        for q in batch.quizzes:
            q_id = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO quizzes (id, node_id, topic_id, question, options_json, correct_index, explanation, difficulty, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    q_id,
                    node_id,
                    topic_id,
                    q.question,
                    json.dumps(q.options),
                    q.correct_index,
                    q.explanation,
                    difficulty,
                    now
                )
            )
            created_quizzes.append({
                "id": q_id,
                "node_id": node_id,
                "question": q.question,
                "options": q.options,
                "correct_index": q.correct_index,
                "explanation": q.explanation,
                "conceptual_trap": q.conceptual_trap,
                "difficulty": difficulty,
                "user_answer": None,
                "is_correct": None,
            })

        if req.create_graph_node:
            quiz_node_id = str(uuid.uuid4())
            parent_x = node.get("pos_x") or 400
            parent_y = node.get("pos_y") or 300
            cursor.execute(
                """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    quiz_node_id,
                    topic_id,
                    node_id,
                    f"Quiz: {node['title']}",
                    "quiz",
                    f"{len(batch.quizzes)} conceptual challenges",
                    f"Interactive quiz covering {node['title']}",
                    difficulty,
                    json.dumps({"quiz_count": len(batch.quizzes)}),
                    parent_x + 190,
                    parent_y - 90,
                    now,
                    now
                )
            )
            edge_id = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (edge_id, topic_id, node_id, quiz_node_id, "quiz_for", "Tests concept", now)
            )
            # Reassign created quizzes to this quiz graph node so clicking it displays the quizzes immediately
            for q_item in created_quizzes:
                cursor.execute("UPDATE quizzes SET node_id = ? WHERE id = ?", (quiz_node_id, q_item["id"]))
                q_item["node_id"] = quiz_node_id

    conn.close()
    return {
        "quizzes": created_quizzes,
        "full_graph": get_full_graph(topic_id)
    }

@app.post("/api/quizzes/{quiz_id}/answer")
def submit_quiz_answer(quiz_id: str, req: QuizAnswerSubmit):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    quiz = dict(row)
    is_correct = 1 if req.selected_option == quiz["correct_index"] else 0
    with conn:
        cursor.execute(
            "UPDATE quizzes SET user_answer = ?, is_correct = ? WHERE id = ?",
            (req.selected_option, is_correct, quiz_id)
        )
    conn.close()
    return {
        "quiz_id": quiz_id,
        "selected_option": req.selected_option,
        "correct_index": quiz["correct_index"],
        "is_correct": bool(is_correct),
        "explanation": quiz["explanation"],
    }

@app.post("/api/quizzes/{quiz_id}/detach-to-node")
def detach_quiz_to_node(quiz_id: str):
    """
    Detaches a specific quiz question from a quiz into its own dedicated Question node
    in the knowledge graph, allowing it to be investigated and recursively decomposed.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,))
    q_row = cursor.fetchone()
    if not q_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz question not found")

    quiz = dict(q_row)
    topic_id = quiz["topic_id"]
    current_node_id = quiz["node_id"]

    cursor.execute("SELECT * FROM nodes WHERE id = ?", (current_node_id,))
    parent_row = cursor.fetchone()
    parent_x = (dict(parent_row).get("pos_x") or 400) if parent_row else 400
    parent_y = (dict(parent_row).get("pos_y") or 300) if parent_row else 300

    now = now_iso()
    new_node_id = str(uuid.uuid4())

    try:
        options = json.loads(quiz.get("options_json") or "[]")
    except Exception:
        options = []

    markdown_content = f"### Conceptual Challenge\n\n{quiz['question']}\n\n"
    if options:
        markdown_content += "**Options**:\n"
        for idx, opt in enumerate(options):
            marker = "**(Correct)** " if idx == quiz["correct_index"] else ""
            markdown_content += f"- {chr(65+idx)}. {marker}{opt}\n"
        markdown_content += f"\n> [!NOTE]\n> **Explanation**: {quiz['explanation']}\n"

    clean_title = quiz["question"].strip()
    if len(clean_title) > 55:
        clean_title = clean_title[:52] + "..."

    with conn:
        cursor.execute(
            """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                new_node_id,
                topic_id,
                current_node_id,
                clean_title,
                "question",
                quiz["question"],
                markdown_content,
                quiz["difficulty"],
                json.dumps({"origin": "quiz_extract", "original_quiz_id": quiz_id}),
                parent_x + 180,
                parent_y + 60,
                now,
                now
            )
        )

        edge_id = str(uuid.uuid4())
        cursor.execute(
            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (edge_id, topic_id, current_node_id, new_node_id, "derived_question", "Extracted question", now)
        )

        # Reassign this quiz question's node_id to the new question node
        cursor.execute("UPDATE quizzes SET node_id = ? WHERE id = ?", (new_node_id, quiz_id))

    conn.close()
    return {
        "success": True,
        "new_node_id": new_node_id,
        "full_graph": get_full_graph(topic_id)
    }

@app.delete("/api/nodes/{node_id}")
def delete_node_from_graph(node_id: str):
    """
    Deletes a node and cascades cleanup across edges, quizzes, and inquiries.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")

    topic_id = dict(row)["topic_id"]

    with conn:
        cursor.execute("DELETE FROM edges WHERE source_id = ? OR target_id = ?", (node_id, node_id))
        cursor.execute("DELETE FROM quizzes WHERE node_id = ?", (node_id,))
        cursor.execute("DELETE FROM inquiries WHERE node_id = ?", (node_id,))
        cursor.execute("DELETE FROM nodes WHERE id = ?", (node_id,))

    conn.close()
    return {
        "success": True,
        "deleted_node_id": node_id,
        "full_graph": get_full_graph(topic_id)
    }

@app.patch("/api/nodes/{node_id}/position")
def update_node_position_route(node_id: str, req: NodePositionUpdate):
    """
    Persists updated node position when dragged freely on the canvas without snapping.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM nodes WHERE id = ?", (node_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")

    now = now_iso()
    with conn:
        cursor.execute(
            "UPDATE nodes SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?",
            (req.pos_x, req.pos_y, now, node_id)
        )
    conn.close()
    return {"success": True}

@app.post("/api/nodes/{node_id}/notes")
def save_node_note(node_id: str, req: NoteSaveRequest):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")
    
    node = dict(row)
    now = now_iso()
    with conn:
        cursor.execute(
            """UPDATE nodes 
               SET content = ?, title = COALESCE(?, title), updated_at = ?
               WHERE id = ?""",
            (req.content, req.title, now, node_id)
        )
    conn.close()
    return {"message": "Note saved", "node_id": node_id}

@app.post("/api/nodes/{node_id}/notes/synthesize")
def synthesize_full_study_note(node_id: str, difficulty: Optional[str] = Query(default=None)):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")
    
    node = dict(row)
    diff = difficulty or node.get("difficulty") or "intermediate"
    synthesized_md = ai_service.synthesize_obsidian_study_note(
        concept_title=node["title"],
        summary=node.get("summary") or "",
        difficulty=diff
    )
    now = now_iso()
    with conn:
        cursor.execute(
            "UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?",
            (synthesized_md, now, node_id)
        )
    conn.close()
    return {"node_id": node_id, "content": synthesized_md}

@app.post("/api/nodes")
def create_custom_node(req: NodeCreate):
    conn = get_connection()
    cursor = conn.cursor()
    node_id = str(uuid.uuid4())
    now = now_iso()
    with conn:
        cursor.execute(
            """INSERT INTO nodes (id, topic_id, parent_node_id, title, node_type, summary, content, difficulty, metadata_json, pos_x, pos_y, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                node_id,
                req.topic_id,
                req.parent_node_id,
                req.title,
                req.node_type,
                req.summary or "",
                req.content or "",
                req.difficulty or "intermediate",
                json.dumps({}),
                req.pos_x or 400,
                req.pos_y or 300,
                now,
                now
            )
        )
    conn.close()
    return {"id": node_id, "title": req.title, "node_type": req.node_type}

@app.post("/api/edges")
def create_custom_edge(req: EdgeCreate):
    conn = get_connection()
    cursor = conn.cursor()
    edge_id = str(uuid.uuid4())
    now = now_iso()
    with conn:
        cursor.execute(
            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (edge_id, req.topic_id, req.source_id, req.target_id, req.relation_type, req.label, now)
        )
    conn.close()
    return {"id": edge_id, "source_id": req.source_id, "target_id": req.target_id}

@app.get("/api/topics/{topic_id}/export/obsidian")
def export_obsidian_vault(topic_id: str):
    graph = get_full_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    topic = graph["topic"]
    nodes = graph["nodes"]
    edges = graph["edges"]
    quizzes = graph.get("quizzes", [])

    # Map node id to title for wikilinks
    node_map = {n["id"]: n for n in nodes}
    
    # Build incoming/outgoing edges per node
    outgoing = {}
    incoming = {}
    for e in edges:
        s = e["source_id"]
        t = e["target_id"]
        outgoing.setdefault(s, []).append((t, e.get("relation_type"), e.get("label")))
        incoming.setdefault(t, []).append((s, e.get("relation_type"), e.get("label")))

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 1. README index
        readme_content = f"""---
title: "{topic['title']}"
tags: [knowledge-graph, obsidian-vault]
created: "{topic['created_at']}"
---

# {topic['title']}

{topic.get('description') or ''}

## Academic Knowledge Graph

### Core Concepts & Pillars
"""
        for n in nodes:
            readme_content += f"- [[{n['title']}]] — *{n['node_type']}* ({n.get('difficulty') or 'intermediate'})\n"

        zip_file.writestr(f"{topic['title']}/00_Index_{topic['title']}.md", readme_content)

        # 2. Individual node notes with Wikilinks
        for n in nodes:
            title_sanitized = n["title"].replace("/", "-").replace("\\", "-")
            md_body = n.get("content") or f"## Summary\n\n{n.get('summary') or ''}\n"

            # Append wikilinks
            out_links = outgoing.get(n["id"], [])
            in_links = incoming.get(n["id"], [])
            
            links_section = "\n\n## Connected Knowledge\n\n"
            if in_links:
                links_section += "### Prerequisites & Influences\n"
                for s_id, rel, lbl in in_links:
                    src_node = node_map.get(s_id)
                    if src_node:
                        links_section += f"- [[{src_node['title']}]] ({lbl or rel})\n"
            if out_links:
                links_section += "\n### Leads Into / Branches\n"
                for t_id, rel, lbl in out_links:
                    tgt_node = node_map.get(t_id)
                    if tgt_node:
                        links_section += f"- [[{tgt_node['title']}]] ({lbl or rel})\n"

            file_content = f"""---
title: "{n['title']}"
type: "{n['node_type']}"
difficulty: "{n.get('difficulty') or 'intermediate'}"
created: "{n['created_at']}"
tags: [knowledge-graph, {n['node_type']}]
---

# {n['title']}

{md_body}
{links_section}
"""
            zip_file.writestr(f"{topic['title']}/{title_sanitized}.md", file_content)

    zip_buffer.seek(0)
    filename = f"obsidian_vault_{topic['title'].lower().replace(' ', '_')}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
