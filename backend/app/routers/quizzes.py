import json
import uuid
import logging
from fastapi import APIRouter, HTTPException

from ..database import get_connection, now_iso, get_full_graph
from ..schemas import QuizGenerateRequest, QuizAnswerSubmit
from .. import ai_service

logger = logging.getLogger("quizzes_router")
router = APIRouter(tags=["Quizzes"])


@router.post("/api/nodes/{node_id}/quizzes/generate")
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


@router.post("/api/quizzes/{quiz_id}/answer")
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


@router.post("/api/quizzes/{quiz_id}/detach-to-node")
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

        cursor.execute("UPDATE quizzes SET node_id = ? WHERE id = ?", (new_node_id, quiz_id))

    conn.close()
    return {
        "success": True,
        "new_node_id": new_node_id,
        "full_graph": get_full_graph(topic_id)
    }
