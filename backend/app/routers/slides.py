import io
import re
import logging
from fastapi import APIRouter, HTTPException, Query, Body, Response
from fastapi.responses import StreamingResponse

from ..database import get_node, get_slides_for_node, save_slides_for_node
from ..schemas import SlideDeckResponse, SlideGenerateRequest
from ..slides_export import build_pptx_deck, build_html_presentation
from .. import ai_service

logger = logging.getLogger("slides_router")
router = APIRouter(tags=["Slides"])


@router.get("/api/nodes/{node_id}/slides", response_model=SlideDeckResponse)
def get_node_slides(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    deck = get_slides_for_node(node_id)
    if not deck or not deck.get("slides"):
        raise HTTPException(status_code=404, detail="Slides not yet generated for this node")
    return deck


@router.post("/api/nodes/{node_id}/slides/generate", response_model=SlideDeckResponse)
def generate_node_slides(node_id: str, req: SlideGenerateRequest = Body(default=SlideGenerateRequest())):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if not req.force_refresh:
        existing = get_slides_for_node(node_id)
        if existing and existing.get("slides"):
            return existing

    diff = req.difficulty or node.get("difficulty") or "intermediate"
    try:
        deck_result = ai_service.generate_study_slides(
            concept_title=node["title"],
            summary=node.get("summary") or "",
            content=node.get("content") or "",
            difficulty=diff
        )
        saved = save_slides_for_node(
            node_id=node_id,
            topic_id=node["topic_id"],
            deck_title=deck_result.deck_title,
            slides_data=[s.model_dump() for s in deck_result.slides]
        )
        return saved
    except Exception as e:
        logger.error(f"Failed to generate study slides for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate study slides: {str(e)}")


@router.get("/api/nodes/{node_id}/slides/download")
def download_node_slides(node_id: str, format: str = Query("pptx", enum=["pptx", "html"])):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    deck = get_slides_for_node(node_id)
    if not deck or not deck.get("slides"):
        diff = node.get("difficulty") or "intermediate"
        try:
            deck_result = ai_service.generate_study_slides(
                concept_title=node["title"],
                summary=node.get("summary") or "",
                content=node.get("content") or "",
                difficulty=diff
            )
            deck = save_slides_for_node(
                node_id=node_id,
                topic_id=node["topic_id"],
                deck_title=deck_result.deck_title,
                slides_data=[s.model_dump() for s in deck_result.slides]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate slides: {str(e)}")

    safe_title = re.sub(r"[^\w\-_.]", "_", node["title"]).strip("_") or "slides"
    deck_title = deck.get("deck_title") or f"{node['title']} - Study Slides"
    slides_data = deck.get("slides", [])

    if format == "pptx":
        pptx_bytes = build_pptx_deck(deck_title, slides_data)
        filename = f"{safe_title}_slides.pptx"
        return StreamingResponse(
            io.BytesIO(pptx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    else:
        html_content = build_html_presentation(deck_title, slides_data)
        filename = f"{safe_title}_slides.html"
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
