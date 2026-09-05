# Brain.md

Minimalist knowledge graph engine for conceptual synthesis, Socratic inquiry, LaTeX-rendered study notes, and active recall.

---

## Features

- **Dynamic Knowledge Canvas**: Interactive force-directed and hierarchical DAG layouts with rightward spread and unconstrained node manipulation.
- **Obsidian-Native Notes**: Markdown notes with bidirectional `[[wikilinks]]`, tags, and full KaTeX math typesetting.
- **Socratic Inquiry**: Deep conceptual exploration and follow-up inquiry synthesis powered by Gemini.
- **Active Recall & Quizzes**: Conceptual multiple-choice questions with misconception analysis, plus one-click promotion of questions to independent graph nodes.
- **Vault Export**: Export topics and notes as native Obsidian vaults (`.zip`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, HTML5 Canvas engine, KaTeX, Marked, Vite
- **Backend**: FastAPI, SQLite, Google Gemini (`gemini-3.8-flash` / fallbacks)
- **Package Manager**: pnpm

---

## Quickstart

### Prerequisites

- Python 3.11+
- Node.js 18+ & pnpm
- Google Cloud Application Default Credentials (`gcloud auth application-default login`)

### Run

```bash
# Start both backend and frontend
./run.sh
```

Or run services independently:

```bash
# Backend (:8000)
pip install -r backend/requirements.txt
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (:5173)
cd frontend
pnpm install
pnpm dev
```

---

## License

MIT
