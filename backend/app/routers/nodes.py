import json
import uuid
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from ..database import (
    get_connection,
    now_iso,
    get_node,
    get_topic,
    get_full_graph,
    edge_exists,
    find_unlinked_mentions,
    record_spaced_repetition_review,
    update_node_portal,
    toggle_node_done,
)
from ..schemas import (
    NodeCreate,
    NodeResponse,
    NodePositionUpdate,
    NoteSaveRequest,
    NodeExpandRequest,
    QuestionAskRequest,
    ReviewRequest,
    ReviewResponse,
    UnlinkedMention,
    LinkTopicRequest,
    NodeDoneRequest,
)
from .. import ai_service
from .. import context_engine

logger = logging.getLogger("nodes_router")
router = APIRouter(tags=["Nodes"])


@router.post("/api/nodes/{node_id}/expand")
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
    reused_nodes = []
    created_edges = []

    parent_x = node.get("pos_x") or 400
    parent_y = node.get("pos_y") or 300

    compact_ctx, id_lookup = context_engine.get_compact_existing_context(topic_id, node_id, max_candidates=14)

    def resolve_existing_id(raw_id: str) -> Optional[str]:
        if not raw_id:
            return None
        clean = raw_id.strip().lower()
        if clean in id_lookup:
            return id_lookup[clean]
        if len(clean) >= 8 and clean[:8] in id_lookup:
            return id_lookup[clean[:8]]
        norm = context_engine.normalize_title(clean)
        if norm in id_lookup:
            return id_lookup[norm]
        return None

    if req.expansion_type == "topics_affecting_question" or node["node_type"] == "question":
        logger.info(f"Decomposing question '{node['title']}' with pre-existing node awareness")
        decomp = ai_service.decompose_question_to_topics(
            question=node["title"],
            context=node.get("summary") or node.get("content") or "",
            difficulty=difficulty,
            existing_context=compact_ctx
        )

        with conn:
            for conn_item in getattr(decomp, "connect_to_existing", []):
                target_id = resolve_existing_id(conn_item.existing_node_id)
                if target_id and target_id != node_id:
                    rel_type = conn_item.relation_type or "affects"
                    lbl = conn_item.label or f"Underpins Question ({rel_type})"
                    src, tgt = (target_id, node_id) if conn_item.direction == "existing_to_parent" else (node_id, target_id)
                    if not edge_exists(topic_id, src, tgt, rel_type):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, src, tgt, rel_type, lbl, now)
                        )
                        created_edges.append({"id": edge_id, "source_id": src, "target_id": tgt, "relation_type": rel_type})
                    reused_nodes.append({"id": target_id, "relation_type": rel_type, "label": lbl})

            new_title_to_id = {}
            for i, topic_item in enumerate(getattr(decomp, "new_nodes", [])):
                is_dup, dup_id, dup_title, _ = context_engine.check_duplicate_node(topic_id, topic_item.title)
                if is_dup and dup_id and dup_id != node_id:
                    rel = topic_item.relation or "affects"
                    if not edge_exists(topic_id, dup_id, node_id, rel):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, dup_id, node_id, rel, f"Underpins Question ({rel})", now)
                        )
                        created_edges.append({"id": edge_id, "source_id": dup_id, "target_id": node_id})
                    reused_nodes.append({"id": dup_id, "title": dup_title, "matched_from": topic_item.title})
                    new_title_to_id[context_engine.normalize_title(topic_item.title)] = dup_id
                else:
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
                    new_title_to_id[context_engine.normalize_title(topic_item.title)] = new_id

            for link_item in getattr(decomp, "new_node_existing_links", []):
                new_nid = new_title_to_id.get(context_engine.normalize_title(link_item.new_node_title))
                ext_nid = resolve_existing_id(link_item.existing_node_id)
                if new_nid and ext_nid and new_nid != ext_nid:
                    rel = link_item.relation_type or "related_to"
                    if not edge_exists(topic_id, new_nid, ext_nid, rel):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, new_nid, ext_nid, rel, link_item.label or rel, now)
                        )
                        created_edges.append({"id": edge_id, "source_id": new_nid, "target_id": ext_nid})

    elif req.expansion_type == "subquestions":
        logger.info(f"Branching subquestions for '{node['title']}'")
        res = ai_service.answer_socratic_inquiry(
            concept_title=node["title"],
            question="What are the essential unresolved sub-questions and investigative frontiers?",
            context=node.get("summary") or "",
            difficulty=difficulty
        )
        with conn:
            for i, q_text in enumerate(res.follow_up_inquiries):
                is_dup, dup_id, dup_title, _ = context_engine.check_duplicate_node(topic_id, q_text)
                if is_dup and dup_id and dup_id != node_id:
                    if not edge_exists(topic_id, node_id, dup_id, "question_for"):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, node_id, dup_id, "question_for", "Explores question", now)
                        )
                        created_edges.append({"id": edge_id, "source_id": node_id, "target_id": dup_id})
                    reused_nodes.append({"id": dup_id, "title": dup_title, "matched_from": q_text})
                else:
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
        logger.info(f"Expanding subtopics for '{node['title']}' with pre-existing node awareness")
        expansion = ai_service.expand_concept_subtopics(
            concept_title=node["title"],
            concept_summary=node.get("summary") or "",
            difficulty=difficulty,
            existing_context=compact_ctx
        )
        with conn:
            for conn_item in getattr(expansion, "connect_to_existing", []):
                target_id = resolve_existing_id(conn_item.existing_node_id)
                if target_id and target_id != node_id:
                    rel_type = conn_item.relation_type or "subtopic_of"
                    lbl = conn_item.label or rel_type
                    src, tgt = (node_id, target_id) if conn_item.direction == "parent_to_existing" else (target_id, node_id)
                    if not edge_exists(topic_id, src, tgt, rel_type):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, src, tgt, rel_type, lbl, now)
                        )
                        created_edges.append({"id": edge_id, "source_id": src, "target_id": tgt, "relation_type": rel_type})
                    reused_nodes.append({"id": target_id, "relation_type": rel_type, "label": lbl})

            new_title_to_id = {}
            for i, item in enumerate(getattr(expansion, "new_nodes", [])):
                is_dup, dup_id, dup_title, _ = context_engine.check_duplicate_node(topic_id, item.title)
                if is_dup and dup_id and dup_id != node_id:
                    if not edge_exists(topic_id, node_id, dup_id, "subtopic_of"):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, node_id, dup_id, "subtopic_of", item.relation_to_parent or "subtopic_of", now)
                        )
                        created_edges.append({"id": edge_id, "source_id": node_id, "target_id": dup_id})
                    reused_nodes.append({"id": dup_id, "title": dup_title, "matched_from": item.title})
                    new_title_to_id[context_engine.normalize_title(item.title)] = dup_id
                else:
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
                    new_title_to_id[context_engine.normalize_title(item.title)] = new_id

            for link_item in getattr(expansion, "new_node_existing_links", []):
                new_nid = new_title_to_id.get(context_engine.normalize_title(link_item.new_node_title))
                ext_nid = resolve_existing_id(link_item.existing_node_id)
                if new_nid and ext_nid and new_nid != ext_nid:
                    rel = link_item.relation_type or "related_to"
                    if not edge_exists(topic_id, new_nid, ext_nid, rel):
                        edge_id = str(uuid.uuid4())
                        cursor.execute(
                            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, label, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (edge_id, topic_id, new_nid, ext_nid, rel, link_item.label or rel, now)
                        )
                        created_edges.append({"id": edge_id, "source_id": new_nid, "target_id": ext_nid})

    conn.close()
    return {
        "message": f"Created {len(created_nodes)} new nodes, connected {len(reused_nodes)} pre-existing nodes, created {len(created_edges)} edges",
        "nodes": created_nodes,
        "reused_nodes": reused_nodes,
        "edges": created_edges,
        "full_graph": get_full_graph(topic_id)
    }


@router.post("/api/nodes/{node_id}/inquiries")
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


@router.delete("/api/nodes/{node_id}")
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


@router.patch("/api/nodes/{node_id}/position")
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


@router.post("/api/nodes/{node_id}/notes")
def save_node_note(node_id: str, req: NoteSaveRequest):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Node not found")

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


@router.post("/api/nodes/{node_id}/notes/synthesize")
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


@router.post("/api/nodes")
def create_custom_node(req: NodeCreate):
    conn = get_connection()
    cursor = conn.cursor()
    node_id = str(uuid.uuid4())
    now = now_iso()
    portal_id = getattr(req, "portal_topic_id", None)
    is_done_val = 1 if getattr(req, "is_done", False) else 0
    with conn:
        cursor.execute(
            """INSERT INTO nodes (
                id, topic_id, parent_node_id, title, node_type, summary, content, difficulty,
                metadata_json, pos_x, pos_y, created_at, updated_at, mastery_score,
                review_interval, ease_factor, review_due, review_count, portal_topic_id, is_done
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 2.5, ?, 0, ?, ?)""",
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
                now,
                now,
                portal_id,
                is_done_val
            )
        )
    conn.close()
    return {"id": node_id, "title": req.title, "node_type": req.node_type, "is_done": bool(is_done_val)}


@router.get("/api/nodes/{node_id}/mentions", response_model=List[UnlinkedMention])
def get_node_mentions(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    mentions = find_unlinked_mentions(node["topic_id"], node_id)
    return mentions


@router.post("/api/nodes/{node_id}/review", response_model=ReviewResponse)
def review_node_endpoint(node_id: str, req: ReviewRequest):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    try:
        updated = record_spaced_repetition_review(node_id, req.rating)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Node not found")
    return {
        "node_id": node_id,
        "topic_id": node["topic_id"],
        "mastery_score": updated["mastery_score"],
        "review_interval": updated["review_interval"],
        "ease_factor": updated["ease_factor"],
        "review_due": updated["review_due"],
        "review_count": updated["review_count"],
        "repetitions": updated.get("metadata", {}).get("repetitions", 0),
        "message": f"Recorded SM-2 review (rating {req.rating}). Next review due in {updated['review_interval']} day(s)."
    }


@router.post("/api/nodes/{node_id}/link-topic")
def link_node_topic_endpoint(
    node_id: str,
    req: Optional[LinkTopicRequest] = None,
    portal_topic_id: Optional[str] = Query(default=None)
):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    target_portal_id = req.portal_topic_id if (req and req.portal_topic_id is not None) else portal_topic_id
    if target_portal_id:
        target_topic = get_topic(target_portal_id)
        if not target_topic:
            raise HTTPException(status_code=404, detail="Target portal topic not found")
    updated = update_node_portal(node_id, target_portal_id)
    return {
        "success": True,
        "node_id": node_id,
        "portal_topic_id": target_portal_id,
        "node": updated
    }


@router.post("/api/nodes/{node_id}/done", response_model=NodeResponse)
def mark_node_done(node_id: str, req: Optional[NodeDoneRequest] = None):
    """
    Toggles or sets the completion status (is_done) of a node.
    If no body or is_done is null, it flips the current state.
    """
    explicit_val = req.is_done if req else None
    updated = toggle_node_done(node_id, is_done=explicit_val)
    if not updated:
        raise HTTPException(status_code=404, detail="Node not found")
    return updated
