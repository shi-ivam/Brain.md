import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from .config import DATABASE_PATH

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_connection()
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            difficulty TEXT DEFAULT 'intermediate',
            root_node_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL,
            parent_node_id TEXT,
            title TEXT NOT NULL,
            node_type TEXT NOT NULL, -- 'concept', 'subtopic', 'prerequisite', 'question', 'note', 'quiz'
            summary TEXT,
            content TEXT,
            difficulty TEXT DEFAULT 'intermediate',
            metadata_json TEXT DEFAULT '{}',
            pos_x REAL,
            pos_y REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS edges (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            relation_type TEXT NOT NULL, -- 'prerequisite_for', 'subtopic_of', 'affects', 'decomposes_into', 'question_for', 'note_on', 'quiz_for', 'related_to'
            label TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE,
            FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            question TEXT NOT NULL,
            options_json TEXT NOT NULL,
            correct_index INTEGER NOT NULL,
            explanation TEXT,
            difficulty TEXT DEFAULT 'intermediate',
            user_answer INTEGER,
            is_correct INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inquiries (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            difficulty TEXT DEFAULT 'intermediate',
            created_at TEXT NOT NULL,
            FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_topic ON nodes(topic_id);
        CREATE INDEX IF NOT EXISTS idx_edges_topic ON edges(topic_id);
        CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_tgt ON edges(target_id);
        CREATE INDEX IF NOT EXISTS idx_quizzes_node ON quizzes(node_id);
        CREATE INDEX IF NOT EXISTS idx_inquiries_node ON inquiries(node_id);
        """)
    conn.close()

# Helper queries
def list_topics() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.*, 
            (SELECT COUNT(*) FROM nodes WHERE topic_id = t.id) as node_count,
            (SELECT COUNT(*) FROM edges WHERE topic_id = t.id) as edge_count
        FROM topics t 
        ORDER BY updated_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_topic(topic_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM topics WHERE id = ?", (topic_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_full_graph(topic_id: str) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM topics WHERE id = ?", (topic_id,))
    topic_row = cursor.fetchone()
    if not topic_row:
        conn.close()
        return None
    
    cursor.execute("SELECT * FROM nodes WHERE topic_id = ? ORDER BY created_at ASC", (topic_id,))
    node_rows = [dict(r) for r in cursor.fetchall()]
    for n in node_rows:
        try:
            n['metadata'] = json.loads(n.get('metadata_json') or '{}')
        except Exception:
            n['metadata'] = {}

    cursor.execute("SELECT * FROM edges WHERE topic_id = ?", (topic_id,))
    edge_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM quizzes WHERE topic_id = ?", (topic_id,))
    quiz_rows = [dict(r) for r in cursor.fetchall()]
    for q in quiz_rows:
        try:
            q['options'] = json.loads(q.get('options_json') or '[]')
        except Exception:
            q['options'] = []

    cursor.execute("SELECT * FROM inquiries WHERE topic_id = ? ORDER BY created_at ASC", (topic_id,))
    inquiry_rows = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "topic": dict(topic_row),
        "nodes": node_rows,
        "edges": edge_rows,
        "quizzes": quiz_rows,
        "inquiries": inquiry_rows,
    }

def delete_topic(topic_id: str) -> bool:
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
        deleted = cursor.rowcount > 0
    conn.close()
    return deleted
