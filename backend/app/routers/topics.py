import io
import json
import uuid
import zipfile
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse

from ..database import (
    get_connection,
    now_iso,
    list_topics,
    get_topic,
    get_node,
    get_full_graph,
    delete_topic,
    export_topic_as_json,
    import_topic_from_json,
    sync_topic_wikilinks,
    calculate_shortest_path,
    get_due_reviews,
    deep_search_topic,
    auto_organize_topic_graph,
    weave_nodes_and_edges,
)
from ..schemas import (
    TopicGenerateRequest,
    NodeResponse,
    ShortestPathResponse,
    DeepSearchResult,
    SyncWikilinksResponse,
    CommunityGroupResponse,
    GraphWeaveRequest,
)
from .. import ai_service
from .. import context_engine

logger = logging.getLogger("topics_router")
router = APIRouter(tags=["Topics"])


@router.get("/api/topics")
def get_topics():
    return list_topics()


@router.get("/api/topics/{topic_id}")
def get_topic_graph(topic_id: str):
    graph = get_full_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic not found")
    return graph


@router.delete("/api/topics/{topic_id}")
def remove_topic(topic_id: str):
    success = delete_topic(topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"message": "Topic deleted successfully"}


@router.post("/api/topics/generate")
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


@router.get("/api/topics/{topic_id}/communities", response_model=CommunityGroupResponse)
def get_topic_communities_endpoint(topic_id: str):
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    communities = context_engine.compute_graph_communities(topic_id)
    return {
        "topic_id": topic_id,
        "communities": communities
    }


@router.get("/api/topics/{topic_id}/export/obsidian")
def export_obsidian_vault(topic_id: str):
    graph = get_full_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic = graph["topic"]
    nodes = graph["nodes"]
    edges = graph["edges"]

    node_map = {n["id"]: n for n in nodes}

    outgoing = {}
    incoming = {}
    for e in edges:
        s = e["source_id"]
        t = e["target_id"]
        outgoing.setdefault(s, []).append((t, e.get("relation_type"), e.get("label")))
        incoming.setdefault(t, []).append((s, e.get("relation_type"), e.get("label")))

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
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

        for n in nodes:
            title_sanitized = n["title"].replace("/", "-").replace("\\", "-")
            md_body = n.get("content") or f"## Summary\n\n{n.get('summary') or ''}\n"

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


@router.post("/api/topics/{topic_id}/sync-wikilinks", response_model=SyncWikilinksResponse)
def sync_wikilinks_endpoint(topic_id: str):
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    count = sync_topic_wikilinks(topic_id)
    return {
        "topic_id": topic_id,
        "added_edges_count": count,
        "message": f"Successfully synced {count} wikilink edges"
    }


@router.get("/api/topics/{topic_id}/path", response_model=ShortestPathResponse)
def get_shortest_path_endpoint(
    topic_id: str,
    source_node: Optional[str] = Query(default=None),
    target_node: Optional[str] = Query(default=None),
    source_node_id: Optional[str] = Query(default=None),
    target_node_id: Optional[str] = Query(default=None),
):
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    src = source_node or source_node_id
    tgt = target_node or target_node_id
    if not src or not tgt:
        raise HTTPException(status_code=400, detail="Both source_node and target_node query parameters are required")
    src_node = get_node(src)
    tgt_node = get_node(tgt)
    if not src_node or src_node["topic_id"] != topic_id:
        raise HTTPException(status_code=404, detail="Source node not found in topic")
    if not tgt_node or tgt_node["topic_id"] != topic_id:
        raise HTTPException(status_code=404, detail="Target node not found in topic")
    return calculate_shortest_path(topic_id, src, tgt)


@router.get("/api/topics/{topic_id}/review-queue", response_model=List[NodeResponse])
def get_review_queue_endpoint(topic_id: str):
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    due_nodes = get_due_reviews(topic_id)
    return due_nodes


@router.get("/api/topics/{topic_id}/search", response_model=List[DeepSearchResult])
def search_topic_endpoint(topic_id: str, q: str = Query(..., min_length=1)):
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    results = deep_search_topic(topic_id, q)
    return results


@router.get("/api/topics/{topic_id}/export/json")
def export_topic_json_endpoint(topic_id: str):
    exported = export_topic_as_json(topic_id)
    if not exported:
        raise HTTPException(status_code=404, detail="Topic not found")
    return exported


@router.post("/api/topics/import/json")
def import_topic_json_endpoint(data: Dict[str, Any] = Body(...)):
    if not data or not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload for import")
    new_topic_id = import_topic_from_json(data)
    return {
        "success": True,
        "topic_id": new_topic_id,
        "full_graph": get_full_graph(new_topic_id)
    }


@router.post("/api/topics/{topic_id}/weave")
def weave_concept_endpoint(topic_id: str, req: GraphWeaveRequest):
    """
    Smart auto-docking and graph weaving:
    Takes any prompt, concept, inquiry, or theorem, determines optimal anchor point(s),
    generates the node and optional bridging chain if the leap is large, attaches
    it into the graph with clean geometry, and returns the updated graph and focus IDs.
    """
    topic = get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    graph = get_full_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic graph not found")

    try:
        weave_result = ai_service.weave_concept_into_graph(
            topic_title=topic["title"],
            existing_nodes=graph.get("nodes", []),
            prompt_text=req.prompt,
            target_type=req.target_type or "auto",
            difficulty=req.difficulty or "intermediate",
        )

        full_graph, primary_node_id, created_node_ids = weave_nodes_and_edges(
            topic_id=topic_id,
            nodes_data=[n.model_dump() for n in weave_result.nodes_to_create],
            edges_data=[e.model_dump() for e in weave_result.edges_to_create],
            anchor_ids=weave_result.anchor_node_ids,
        )

        return {
            "success": True,
            "topic_id": topic_id,
            "rationale": weave_result.rationale,
            "primary_node_id": primary_node_id,
            "created_node_ids": created_node_ids,
            "anchor_node_ids": weave_result.anchor_node_ids,
            "full_graph": full_graph,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in weave_concept_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to weave concept into graph: {str(e)}")


@router.post("/api/topics/{topic_id}/auto-organize")
def auto_organize_topic(topic_id: str):
    """
    Recalculates a tidy, collision-free, hierarchical layout across the entire topic canvas.
    """
    graph = auto_organize_topic_graph(topic_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {
        "success": True,
        "topic_id": topic_id,
        "nodes_updated": len(graph.get("nodes", [])),
        "full_graph": graph,
    }
