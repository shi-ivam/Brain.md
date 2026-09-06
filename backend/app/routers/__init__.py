from .topics import router as topics_router
from .nodes import router as nodes_router
from .edges import router as edges_router
from .quizzes import router as quizzes_router
from .resources import router as resources_router
from .slides import router as slides_router
from .visualizations import router as visualizations_router

__all__ = [
    "topics_router",
    "nodes_router",
    "edges_router",
    "quizzes_router",
    "resources_router",
    "slides_router",
    "visualizations_router",
]
