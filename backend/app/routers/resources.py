import os
import re
import uuid
import logging
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse, parse_qs
from fastapi import APIRouter, HTTPException, Query, Body, UploadFile, File, Form
from fastapi.responses import FileResponse

from ..config import UPLOADS_DIR
from ..database import (
    get_node,
    add_resource,
    get_resource,
    list_resources_for_node,
    delete_resource,
    update_resource,
)
from ..schemas import (
    ResourceCreate,
    ResourceUpdate,
    ResourceResponse,
    ResourceSuggestRequest,
    SuggestedResourcesResult,
)
from .. import ai_service

logger = logging.getLogger("resources_router")
router = APIRouter(tags=["Resources"])


def extract_youtube_info(url: str) -> Optional[Dict[str, Any]]:
    if not url:
        return None
    patterns = [
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            video_id = match.group(1)
            start_seconds = None
            try:
                parsed = urlparse(url)
                qs = parse_qs(parsed.query)
                if 't' in qs:
                    t_val = qs['t'][0]
                    match_time = re.match(r'(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?', t_val)
                    if match_time and any(match_time.groups()):
                        h = int(match_time.group(1) or 0)
                        m = int(match_time.group(2) or 0)
                        s = int(match_time.group(3) or 0)
                        start_seconds = h * 3600 + m * 60 + s
                    elif t_val.isdigit():
                        start_seconds = int(t_val)
            except Exception:
                pass

            return {
                "videoId": video_id,
                "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}" + (f"?start={start_seconds}" if start_seconds else ""),
                "start_seconds": start_seconds,
            }
    return None


@router.get("/api/nodes/{node_id}/resources", response_model=List[ResourceResponse])
def get_node_resources(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return list_resources_for_node(node_id)


@router.post("/api/nodes/{node_id}/resources", response_model=ResourceResponse)
def create_node_resource(node_id: str, payload: ResourceCreate):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    url = payload.url.strip()
    res_type = payload.resource_type.lower()
    thumb = payload.thumbnail_url
    meta = payload.metadata or {}

    yt_info = extract_youtube_info(url)
    if yt_info:
        res_type = "youtube"
        if not thumb:
            thumb = yt_info["thumbnail_url"]
        meta.update(yt_info)
    elif url.lower().split("?")[0].endswith(".pdf"):
        res_type = "pdf"

    title = payload.title.strip()
    if not title:
        if yt_info:
            title = f"YouTube Lecture: {node['title']}"
        elif res_type == "pdf":
            title = f"Lecture Notes: {node['title']}"
        else:
            title = f"Resource for {node['title']}"

    resource = add_resource(
        node_id=node_id,
        topic_id=node["topic_id"],
        title=title,
        resource_type=res_type,
        url=url,
        file_path=payload.file_path,
        file_size=payload.file_size,
        thumbnail_url=thumb,
        notes=payload.notes or "",
        metadata=meta
    )
    return resource


@router.post("/api/nodes/{node_id}/resources/upload", response_model=ResourceResponse)
async def upload_node_resource_file(
    node_id: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    notes: Optional[str] = Form("")
):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    raw_name = file.filename or "uploaded_resource.pdf"
    clean_name = re.sub(r'[^\w\.-]', '_', raw_name)
    file_id = uuid.uuid4().hex[:10]
    saved_filename = f"{file_id}_{clean_name}"
    save_path = UPLOADS_DIR / saved_filename

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    file_size = len(content)
    is_pdf = clean_name.lower().endswith(".pdf")
    res_type = "pdf" if is_pdf else "other"
    res_title = (title or "").strip() or raw_name
    file_url = f"/api/resources/files/{saved_filename}"

    resource = add_resource(
        node_id=node_id,
        topic_id=node["topic_id"],
        title=res_title,
        resource_type=res_type,
        url=file_url,
        file_path=str(save_path),
        file_size=file_size,
        notes=notes or "",
        metadata={"original_filename": raw_name, "content_type": file.content_type}
    )
    return resource


@router.get("/api/resources/{resource_id}", response_model=ResourceResponse)
def get_single_resource(resource_id: str):
    res = get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    return res


@router.put("/api/resources/{resource_id}", response_model=ResourceResponse)
def update_single_resource(resource_id: str, payload: ResourceUpdate):
    res = update_resource(
        resource_id=resource_id,
        title=payload.title,
        notes=payload.notes,
        metadata=payload.metadata
    )
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    return res


@router.delete("/api/resources/{resource_id}")
def delete_single_resource(resource_id: str):
    success = delete_resource(resource_id)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"success": True, "id": resource_id}


@router.get("/api/resources/files/{filename}")
def get_uploaded_file(filename: str):
    clean_name = os.path.basename(filename)
    file_path = UPLOADS_DIR / clean_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "application/pdf" if clean_name.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename=\"{clean_name}\""}
    )


@router.post("/api/nodes/{node_id}/resources/suggest", response_model=SuggestedResourcesResult)
def suggest_resources_for_node(node_id: str, req: ResourceSuggestRequest = Body(default=ResourceSuggestRequest())):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    diff = req.difficulty or node.get("difficulty") or "intermediate"
    try:
        suggestions = ai_service.suggest_resources_for_concept(
            concept_title=node["title"],
            concept_summary=node.get("summary") or node.get("content") or "",
            difficulty=diff
        )
        return suggestions
    except Exception as e:
        logger.error(f"Failed to suggest resources for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate resource suggestions: {str(e)}")
