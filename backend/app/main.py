import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import (
    GCP_PROJECT,
    GCP_LOCATION,
    PRIMARY_MODEL,
    FALLBACK_MODELS,
)
from .database import init_db
from .routers import (
    topics_router,
    nodes_router,
    edges_router,
    quizzes_router,
    resources_router,
    slides_router,
    visualizations_router,
)

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


# Include Modular Routers
app.include_router(topics_router)
app.include_router(nodes_router)
app.include_router(edges_router)
app.include_router(quizzes_router)
app.include_router(resources_router)
app.include_router(slides_router)
app.include_router(visualizations_router)
