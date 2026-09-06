import logging
from typing import List
from fastapi import APIRouter, HTTPException, Query, Body, Response

from ..database import (
    get_node,
    get_visualizations_for_node,
    get_visualization_by_id,
    save_visualizations_for_node,
    create_visualization,
    update_visualization,
    delete_visualization,
)
from ..schemas import (
    VisualizationResponse,
    VisualizationGenerateRequest,
    VisualizationCreateRequest,
    VisualizationUpdateRequest,
    VisualizationSuggestionResponse,
)
from .. import ai_service

logger = logging.getLogger("visualizations_router")
router = APIRouter(tags=["Visualizations"])


@router.get("/api/nodes/{node_id}/visualizations/suggest", response_model=VisualizationSuggestionResponse)
def get_visualization_suggestions_endpoint(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    diff = node.get("difficulty") or "intermediate"
    suggestions = ai_service.suggest_node_visualizations(
        concept_title=node["title"],
        summary=node.get("summary") or "",
        content=node.get("content") or "",
        node_type=node.get("node_type") or "concept",
        difficulty=diff,
    )
    return VisualizationSuggestionResponse(
        node_id=node_id,
        concept_title=node["title"],
        suggestions=suggestions,
    )


@router.get("/api/nodes/{node_id}/visualizations", response_model=List[VisualizationResponse])
def get_node_visualizations(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return get_visualizations_for_node(node_id)


@router.post("/api/nodes/{node_id}/visualizations/generate", response_model=List[VisualizationResponse])
def generate_node_visualizations_endpoint(
    node_id: str,
    req: VisualizationGenerateRequest = Body(default=VisualizationGenerateRequest())
):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # If existing visualizations are present and force_refresh is not requested, return existing
    if not req.force_refresh and (not req.visualization_type or req.visualization_type == "auto"):
        existing = get_visualizations_for_node(node_id)
        if existing:
            return existing

    diff = req.difficulty or node.get("difficulty") or "intermediate"
    try:
        vis_batch = ai_service.generate_node_visualizations(
            concept_title=node["title"],
            summary=node.get("summary") or "",
            content=node.get("content") or "",
            difficulty=diff,
            visualization_type=req.visualization_type or "auto",
            custom_prompt=req.custom_prompt,
        )

        saved = save_visualizations_for_node(
            node_id=node_id,
            topic_id=node["topic_id"],
            visualizations_data=[v.model_dump() for v in vis_batch.visualizations]
        )
        return saved
    except Exception as e:
        logger.error(f"Failed to generate visualizations for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate visualizations: {str(e)}")


@router.post("/api/nodes/{node_id}/visualizations", response_model=VisualizationResponse)
def create_node_visualization_endpoint(
    node_id: str,
    payload: VisualizationCreateRequest
):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Visualization code cannot be empty")

    created = create_visualization(
        node_id=node_id,
        topic_id=node["topic_id"],
        data=payload.model_dump()
    )
    return created


@router.get("/api/visualizations/{vis_id}", response_model=VisualizationResponse)
def get_single_visualization(vis_id: str):
    vis = get_visualization_by_id(vis_id)
    if not vis:
        raise HTTPException(status_code=404, detail="Visualization not found")
    return vis


@router.put("/api/visualizations/{vis_id}", response_model=VisualizationResponse)
def update_single_visualization(vis_id: str, payload: VisualizationUpdateRequest):
    vis = get_visualization_by_id(vis_id)
    if not vis:
        raise HTTPException(status_code=404, detail="Visualization not found")

    updated = update_visualization(
        vis_id=vis_id,
        title=payload.title,
        code=payload.code,
        description=payload.description,
        explanation=payload.explanation,
        visualization_type=payload.visualization_type,
        metadata=payload.metadata
    )
    return updated


@router.delete("/api/visualizations/{vis_id}")
def delete_single_visualization(vis_id: str):
    deleted = delete_visualization(vis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Visualization not found")
    return {"deleted": True, "id": vis_id}


@router.get("/api/visualizations/{vis_id}/export")
def export_visualization(vis_id: str, format: str = Query("html", enum=["html", "markdown", "raw"])):
    vis = get_visualization_by_id(vis_id)
    if not vis:
        raise HTTPException(status_code=404, detail="Visualization not found")

    is_html = vis.get("format") == "html" or "<!DOCTYPE html>" in (vis.get("code") or "")

    if format == "html" or (format == "raw" and is_html):
        return Response(
            content=vis["code"],
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename=\"{vis_id}.html\""}
        )
    elif format == "raw":
        return Response(
            content=vis["code"],
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename=\"{vis_id}.txt\""}
        )

    code_fence = "html" if is_html else "mermaid"
    md_content = f"""# {vis["title"]}

*{vis.get("description") or ""}*

```{code_fence}
{vis["code"]}
```

## Pedagogical Insights
{vis.get("explanation") or ""}
"""
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=\"{vis_id}.md\""}
    )
