import os
from pathlib import Path
import google.auth

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = os.environ.get("DATABASE_PATH", str(DATA_DIR / "knowledge.db"))

def get_default_project() -> str:
    env_proj = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if env_proj:
        return env_proj
    try:
        _, project = google.auth.default()
        if project:
            return project
    except Exception:
        pass
    return "velvety-carving-494308-c5"

GCP_PROJECT = get_default_project()
GCP_LOCATION = os.environ.get("GCP_LOCATION", "global")
PRIMARY_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash"]

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
