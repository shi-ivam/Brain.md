import uuid
import logging
from fastapi import APIRouter, HTTPException

from ..database import (
    get_connection,
    now_iso,
    get_edge,
    get_node,
    update_edge,
    delete_edge,
    bridge_edge,
    insert_node_between,
)
from ..schemas import (
    EdgeCreate,
    EdgeUpdateRequest,
    EdgeResponse,
    EdgeBridgeRequest,
    ManualInsertNodeOnEdgeRequest,
)
from .. import ai_service

logger = logging.getLogger("edges_router")
router = APIRouter(tags=["Edges"])


@router.post("/api/edges")
def create_custom_edge(req: EdgeCreate):
    conn = get_connection()
    cursor = conn.cursor()
    edge_id = str(uuid.uuid4())
    now = now_iso()
    rel_type = req.relation_type or req.edge_type or "related_to"
    edge_type = req.edge_type or rel_type
    label = req.label or ""
    with conn:
        cursor.execute(
            """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, edge_type, label, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (edge_id, req.topic_id, req.source_id, req.target_id, rel_type, edge_type, label, now)
        )
    conn.close()
    return {
        "id": edge_id,
        "source_id": req.source_id,
        "target_id": req.target_id,
        "relation_type": rel_type,
        "edge_type": edge_type,
        "label": label
    }


@router.put("/api/edges/{edge_id}", response_model=EdgeResponse)
def update_edge_endpoint(edge_id: str, req: EdgeUpdateRequest):
    edge = get_edge(edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    updated = update_edge(
        edge_id=edge_id,
        edge_type=req.edge_type,
        label=req.label,
        relation_type=req.relation_type
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Edge not found")
    return updated


@router.delete("/api/edges/{edge_id}")
def delete_edge_endpoint(edge_id: str):
    """
    Deletes an edge connecting two nodes.
    """
    edge = get_edge(edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    topic_id = edge["topic_id"]
    deleted = delete_edge(edge_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete edge")
    return {"success": True, "deleted_edge_id": edge_id, "topic_id": topic_id}


@router.post("/api/edges/{edge_id}/bridge")
def bridge_edge_endpoint(edge_id: str, req: EdgeBridgeRequest):
    """
    AI-assisted bridge: analyzes the conceptual gap between source and target nodes,
    synthesizes 1-3 stepping stone concepts, creates nodes along the edge trajectory,
    chains them with sequential edges, and removes the original direct edge.
    """
    edge = get_edge(edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")

    source_node = get_node(edge["source_id"])
    target_node = get_node(edge["target_id"])
    if not source_node or not target_node:
        raise HTTPException(status_code=400, detail="Source or target node not found")

    try:
        bridge_result = ai_service.bridge_edge_transition(
            source_node=source_node,
            target_node=target_node,
            bridge_count=req.bridge_count or req.num_bridge_nodes or 2,
            difficulty=req.difficulty or "intermediate",
            focus_note=req.focus_note or "",
        )

        full_graph, created_node_ids = bridge_edge(
            edge_id=edge_id,
            bridge_nodes_data=[b.model_dump() for b in bridge_result.bridge_nodes],
            relation_to_target=bridge_result.relation_to_target,
            label_to_target=bridge_result.label_to_target,
        )

        return {
            "success": True,
            "explanation_of_gap": bridge_result.explanation_of_gap,
            "created_node_ids": created_node_ids,
            "full_graph": full_graph,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bridge_edge_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to bridge edge transition: {str(e)}")


@router.post("/api/edges/{edge_id}/insert-node")
def insert_node_on_edge_endpoint(edge_id: str, req: ManualInsertNodeOnEdgeRequest):
    """
    Manually inserts an intermediate node between source and target of an edge.
    """
    edge = get_edge(edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")

    try:
        full_graph, new_node_id = insert_node_between(
            edge_id=edge_id,
            title=req.title,
            node_type=req.node_type or "concept",
            summary=req.summary or "",
            relation_source_to_new=req.relation_source_to_new or "subtopic_of",
            relation_new_to_target=req.relation_new_to_target or "prerequisite_for",
            label_source_to_new=req.label_source_to_new or "",
            label_new_to_target=req.label_new_to_target or "",
        )
        return {
            "success": True,
            "new_node_id": new_node_id,
            "full_graph": full_graph,
        }
    except Exception as e:
        logger.error(f"Error in insert_node_on_edge_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to insert node on edge: {str(e)}")
