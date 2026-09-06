import sqlite3
import json
import uuid
import re
import collections
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
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
            mastery_score INTEGER DEFAULT 0,
            review_interval INTEGER DEFAULT 1,
            ease_factor REAL DEFAULT 2.5,
            review_due TEXT,
            review_count INTEGER DEFAULT 0,
            portal_topic_id TEXT DEFAULT NULL,
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS edges (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            relation_type TEXT NOT NULL, -- 'prerequisite_for', 'subtopic_of', 'affects', 'decomposes_into', 'question_for', 'note_on', 'quiz_for', 'related_to', 'wikilink'
            edge_type TEXT DEFAULT 'relates_to',
            label TEXT DEFAULT '',
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

        # Safe table migration with PRAGMA table_info checks
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(nodes)")
        node_cols = {row["name"] for row in cursor.fetchall()}

        node_migrations = [
            ("mastery_score", "INTEGER DEFAULT 0"),
            ("review_interval", "INTEGER DEFAULT 1"),
            ("ease_factor", "REAL DEFAULT 2.5"),
            ("review_due", "TEXT"),
            ("review_count", "INTEGER DEFAULT 0"),
            ("portal_topic_id", "TEXT DEFAULT NULL"),
        ]
        for col_name, col_def in node_migrations:
            if col_name not in node_cols:
                cursor.execute(f"ALTER TABLE nodes ADD COLUMN {col_name} {col_def}")

        cursor.execute("PRAGMA table_info(edges)")
        edge_cols = {row["name"] for row in cursor.fetchall()}

        edge_migrations = [
            ("edge_type", "TEXT DEFAULT 'relates_to'"),
            ("label", "TEXT DEFAULT ''"),
        ]
        for col_name, col_def in edge_migrations:
            if col_name not in edge_cols:
                cursor.execute(f"ALTER TABLE edges ADD COLUMN {col_name} {col_def}")

        now_str = now_iso()
        cursor.execute("UPDATE nodes SET review_due = ? WHERE review_due IS NULL", (now_str,))
        cursor.execute("UPDATE nodes SET mastery_score = 0 WHERE mastery_score IS NULL")
        cursor.execute("UPDATE nodes SET review_interval = 1 WHERE review_interval IS NULL")
        cursor.execute("UPDATE nodes SET ease_factor = 2.5 WHERE ease_factor IS NULL")
        cursor.execute("UPDATE nodes SET review_count = 0 WHERE review_count IS NULL")
        cursor.execute("UPDATE edges SET edge_type = COALESCE(NULLIF(relation_type, ''), 'relates_to') WHERE edge_type IS NULL OR edge_type = ''")
        cursor.execute("UPDATE edges SET label = '' WHERE label IS NULL")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_nodes_review_due ON nodes(review_due)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_nodes_portal ON nodes(portal_topic_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_edge_type ON edges(edge_type)")

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

def get_node(node_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    res = dict(row)
    try:
        res["metadata"] = json.loads(res.get("metadata_json") or "{}")
    except Exception:
        res["metadata"] = {}
    return res

def get_edge(edge_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM edges WHERE id = ?", (edge_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def sync_topic_wikilinks(topic_id: str) -> int:
    """
    Regex search for [[...]] across all node content in the topic, extracting target titles
    (stripping #section and |alias), finding corresponding node by title in the same topic,
    and creating directed edges with edge_type='wikilink' if not already existing.
    Returns count of added edges.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, content FROM nodes WHERE topic_id = ?", (topic_id,))
    nodes = cursor.fetchall()
    
    title_to_id = {}
    for n in nodes:
        t_clean = n["title"].strip().lower()
        title_to_id[t_clean] = n["id"]
        
    cursor.execute("SELECT source_id, target_id FROM edges WHERE topic_id = ?", (topic_id,))
    existing_edges = set((r["source_id"], r["target_id"]) for r in cursor.fetchall())
    
    wiki_pattern = re.compile(r'\[\[(.*?)\]\]')
    added_count = 0
    now = now_iso()
    
    with conn:
        for n in nodes:
            src_id = n["id"]
            content = n["content"] or ""
            matches = wiki_pattern.findall(content)
            for m in matches:
                target_raw = m.split('|')[0].split('#')[0].strip()
                if not target_raw:
                    continue
                target_id = title_to_id.get(target_raw.lower())
                if not target_id or target_id == src_id:
                    continue
                
                if (src_id, target_id) not in existing_edges:
                    edge_id = str(uuid.uuid4())
                    cursor.execute(
                        """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, edge_type, label, created_at)
                           VALUES (?, ?, ?, ?, 'wikilink', 'wikilink', 'wikilink', ?)""",
                        (edge_id, topic_id, src_id, target_id, now)
                    )
                    existing_edges.add((src_id, target_id))
                    added_count += 1
    conn.close()
    return added_count

def find_unlinked_mentions(topic_id: str, node_id: str) -> List[Dict[str, Any]]:
    """
    Finds other nodes in the same topic whose content or summary contains the node's title
    (case-insensitive word boundary), but do not yet have an edge connecting them.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    target_row = cursor.fetchone()
    if not target_row:
        conn.close()
        return []
    
    target_node = dict(target_row)
    target_title = target_node["title"].strip()
    if not target_title:
        conn.close()
        return []
        
    # Get all nodes connected to node_id by any edge
    cursor.execute(
        """SELECT source_id, target_id FROM edges 
           WHERE topic_id = ? AND (source_id = ? OR target_id = ?)""",
        (topic_id, node_id, node_id)
    )
    connected_ids = {node_id}
    for r in cursor.fetchall():
        connected_ids.add(r["source_id"])
        connected_ids.add(r["target_id"])
        
    cursor.execute("SELECT * FROM nodes WHERE topic_id = ?", (topic_id,))
    other_nodes = [dict(r) for r in cursor.fetchall() if r["id"] not in connected_ids]
    conn.close()
    
    pattern = re.compile(rf'\b{re.escape(target_title)}\b', re.IGNORECASE)
    unlinked = []
    
    for other in other_nodes:
        content = other.get("content") or ""
        summary = other.get("summary") or ""
        
        m_content = pattern.search(content)
        m_summary = pattern.search(summary)
        
        if m_content or m_summary:
            text = content if m_content else summary
            match = m_content if m_content else m_summary
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(text) else ""
            snippet = prefix + text[start:end].strip() + suffix
            
            unlinked.append({
                "node_id": other["id"],
                "title": other["title"],
                "snippet": snippet,
                "context": snippet,
                "node_type": other.get("node_type"),
                "summary": other.get("summary"),
            })
            
    return unlinked

def calculate_shortest_path(topic_id: str, source_node_id: str, target_node_id: str) -> Dict[str, Any]:
    """
    BFS search on topic edges, returning the ordered list of node IDs and edge IDs
    representing the shortest knowledge trail.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE topic_id = ?", (topic_id,))
    nodes = {r["id"]: dict(r) for r in cursor.fetchall()}
    
    for n in nodes.values():
        try:
            n['metadata'] = json.loads(n.get('metadata_json') or '{}')
        except Exception:
            n['metadata'] = {}
            
    if source_node_id not in nodes or target_node_id not in nodes:
        conn.close()
        return {
            "found": False,
            "path_length": 0,
            "node_ids": [],
            "edge_ids": [],
            "nodes": [],
            "edges": []
        }
        
    if source_node_id == target_node_id:
        conn.close()
        return {
            "found": True,
            "path_length": 0,
            "node_ids": [source_node_id],
            "edge_ids": [],
            "nodes": [nodes[source_node_id]],
            "edges": []
        }
        
    cursor.execute("SELECT * FROM edges WHERE topic_id = ?", (topic_id,))
    edges = {r["id"]: dict(r) for r in cursor.fetchall()}
    conn.close()
    
    adj = collections.defaultdict(list)
    for eid, edge in edges.items():
        s = edge["source_id"]
        t = edge["target_id"]
        adj[s].append((t, eid))
        adj[t].append((s, eid))
        
    queue = collections.deque([source_node_id])
    visited = {source_node_id}
    parent = {}  # child_id: (parent_id, edge_id)
    found = False
    
    while queue:
        curr = queue.popleft()
        if curr == target_node_id:
            found = True
            break
        for nxt, eid in adj[curr]:
            if nxt not in visited:
                visited.add(nxt)
                parent[nxt] = (curr, eid)
                queue.append(nxt)
                
    if not found:
        return {
            "found": False,
            "path_length": 0,
            "node_ids": [],
            "edge_ids": [],
            "nodes": [],
            "edges": []
        }
        
    curr = target_node_id
    path_nodes = []
    path_edges = []
    while curr != source_node_id:
        path_nodes.append(curr)
        p_node, eid = parent[curr]
        path_edges.append(eid)
        curr = p_node
    path_nodes.append(source_node_id)
    path_nodes.reverse()
    path_edges.reverse()
    
    return {
        "found": True,
        "path_length": len(path_edges),
        "node_ids": path_nodes,
        "edge_ids": path_edges,
        "nodes": [nodes[nid] for nid in path_nodes],
        "edges": [edges[eid] for eid in path_edges]
    }

def record_spaced_repetition_review(node_id: str, rating: int) -> Optional[Dict[str, Any]]:
    """
    Implements SuperMemo-2 (SM-2) algorithm.
    rating: 1 (Again / Complete Blackout), 2 (Hard), 3 (Good), 4 (Easy).
    """
    if rating < 1 or rating > 4:
        raise ValueError("Rating must be between 1 and 4")
        
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    node = dict(row)
    try:
        meta = json.loads(node.get("metadata_json") or "{}")
    except Exception:
        meta = {}
        
    repetitions = meta.get("repetitions", 0)
    interval = node.get("review_interval") or 1
    ease_factor = float(node.get("ease_factor") if node.get("ease_factor") is not None else 2.5)
    mastery_score = int(node.get("mastery_score") or 0)
    review_count = int(node.get("review_count") or 0) + 1
    
    if rating < 3:
        repetitions = 0
        interval = 1
    else:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
        
    new_ease_factor = max(1.3, ease_factor + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)))
    
    if rating >= 3:
        new_mastery_score = min(100, int((repetitions / 5.0) * 70 + (new_ease_factor / 2.5) * 30))
    else:
        new_mastery_score = max(0, mastery_score - 20)
        
    now_dt = datetime.now(timezone.utc)
    next_review_due = (now_dt + timedelta(days=interval)).isoformat()
    now_str = now_iso()
    
    meta["repetitions"] = repetitions
    meta_json = json.dumps(meta)
    
    with conn:
        cursor.execute(
            """UPDATE nodes 
               SET mastery_score = ?,
                   review_interval = ?,
                   ease_factor = ?,
                   review_due = ?,
                   review_count = ?,
                   metadata_json = ?,
                   updated_at = ?
               WHERE id = ?""",
            (new_mastery_score, interval, new_ease_factor, next_review_due, review_count, meta_json, now_str, node_id)
        )
        cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        updated_row = cursor.fetchone()
        
    conn.close()
    if not updated_row:
        return None
    res = dict(updated_row)
    try:
        res["metadata"] = json.loads(res.get("metadata_json") or "{}")
    except Exception:
        res["metadata"] = {}
    return res

def get_due_reviews(topic_id: str) -> List[Dict[str, Any]]:
    """
    Query nodes where review_due <= datetime.now().isoformat() or mastery_score < 100,
    ordered by review_due ASC.
    """
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """SELECT * FROM nodes 
           WHERE topic_id = ? AND (review_due IS NULL OR review_due <= ? OR mastery_score < 100)
           ORDER BY review_due ASC""",
        (topic_id, now_str)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    for r in rows:
        try:
            r['metadata'] = json.loads(r.get('metadata_json') or '{}')
        except Exception:
            r['metadata'] = {}
    conn.close()
    return rows

def _extract_snippet(text: str, query: str, window: int = 60) -> str:
    if not text:
        return ""
    idx = text.lower().find(query.lower())
    if idx == -1:
        snippet = text[:window * 2].strip()
        return snippet + ("..." if len(text) > len(snippet) else "")
    start = max(0, idx - window)
    end = min(len(text), idx + len(query) + window)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix

def deep_search_topic(topic_id: str, query: str) -> List[Dict[str, Any]]:
    """
    Searches node title, content, summary, tags, inquiries (question, answer),
    and quizzes (question, explanation).
    Returns hits with context snippets and hit_type ('title', 'content', 'inquiry', 'quiz', 'tag').
    """
    q = query.strip()
    if not q:
        return []
    q_lower = q.lower()
    
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM nodes WHERE topic_id = ?", (topic_id,))
    node_rows = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM inquiries WHERE topic_id = ?", (topic_id,))
    inq_rows = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM quizzes WHERE topic_id = ?", (topic_id,))
    quiz_rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    
    results = []
    
    for n in node_rows:
        title = n["title"] or ""
        content = n.get("content") or ""
        summary = n.get("summary") or ""
        
        try:
            meta = json.loads(n.get("metadata_json") or "{}")
        except Exception:
            meta = {}
            
        # Title hit
        if q_lower in title.lower():
            results.append({
                "node_id": n["id"],
                "title": title,
                "hit_type": "title",
                "snippet": title,
                "score": 1.0
            })
            
        # Content / summary hit
        if q_lower in content.lower():
            results.append({
                "node_id": n["id"],
                "title": title,
                "hit_type": "content",
                "snippet": _extract_snippet(content, q),
                "score": 0.8
            })
        elif q_lower in summary.lower():
            results.append({
                "node_id": n["id"],
                "title": title,
                "hit_type": "content",
                "snippet": _extract_snippet(summary, q),
                "score": 0.7
            })
            
        # Tag hit
        tags = meta.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        tag_match = False
        matching_tag = ""
        for tag in tags:
            if isinstance(tag, str) and q_lower in tag.lower():
                tag_match = True
                matching_tag = tag
                break
        if not tag_match and (f"#{q_lower}" in content.lower() or "tags:" in content.lower()):
            tag_match = True
            matching_tag = q
        if tag_match:
            results.append({
                "node_id": n["id"],
                "title": title,
                "hit_type": "tag",
                "snippet": f"Tag: #{matching_tag}",
                "score": 0.9
            })
            
    # Inquiry hits
    for inq in inq_rows:
        q_text = inq.get("question") or ""
        ans_text = inq.get("answer") or ""
        if q_lower in q_text.lower() or q_lower in ans_text.lower():
            snippet_source = q_text if q_lower in q_text.lower() else ans_text
            results.append({
                "node_id": inq["node_id"],
                "title": q_text,
                "hit_type": "inquiry",
                "snippet": _extract_snippet(snippet_source, q),
                "score": 0.75
            })
            
    # Quiz hits
    for quiz in quiz_rows:
        q_text = quiz.get("question") or ""
        exp_text = quiz.get("explanation") or ""
        if q_lower in q_text.lower() or q_lower in exp_text.lower():
            snippet_source = q_text if q_lower in q_text.lower() else exp_text
            results.append({
                "node_id": quiz["node_id"],
                "title": q_text,
                "hit_type": "quiz",
                "snippet": _extract_snippet(snippet_source, q),
                "score": 0.75
            })
            
    return results

def export_topic_as_json(topic_id: str) -> Optional[Dict[str, Any]]:
    """
    Exports full topic, nodes, edges, inquiries, and quizzes as a structured dictionary.
    """
    graph = get_full_graph(topic_id)
    if not graph:
        return None
    return {
        "topic": graph["topic"],
        "nodes": graph["nodes"],
        "edges": graph["edges"],
        "quizzes": graph.get("quizzes", []),
        "inquiries": graph.get("inquiries", []),
        "version": "1.0",
        "exported_at": now_iso(),
    }

def import_topic_from_json(data: dict) -> str:
    """
    Imports a topic with its complete graph and returns the new topic_id.
    Safely remaps node IDs and foreign keys to avoid conflicts.
    """
    topic_data = data.get("topic") if isinstance(data.get("topic"), dict) else data
    title = topic_data.get("title") or "Imported Topic"
    description = topic_data.get("description") or ""
    difficulty = topic_data.get("difficulty") or "intermediate"
    new_topic_id = str(uuid.uuid4())
    now = now_iso()
    
    nodes_data = data.get("nodes") or []
    node_id_map = {}
    for n in nodes_data:
        old_id = n.get("id")
        if old_id:
            node_id_map[old_id] = str(uuid.uuid4())
            
    old_root_id = topic_data.get("root_node_id")
    new_root_id = node_id_map.get(old_root_id)
    
    conn = get_connection()
    with conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO topics (id, title, description, difficulty, root_node_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (new_topic_id, title, description, difficulty, new_root_id, now, now)
        )
        
        for n in nodes_data:
            old_id = n.get("id")
            nid = node_id_map.get(old_id, str(uuid.uuid4()))
            old_parent_id = n.get("parent_node_id")
            new_parent_id = node_id_map.get(old_parent_id)
            
            meta = n.get("metadata")
            if meta is None:
                meta_json = n.get("metadata_json") or "{}"
            else:
                meta_json = json.dumps(meta) if isinstance(meta, dict) else "{}"
                
            cursor.execute(
                """INSERT INTO nodes (
                    id, topic_id, parent_node_id, title, node_type, summary, content, difficulty,
                    metadata_json, pos_x, pos_y, created_at, updated_at, mastery_score,
                    review_interval, ease_factor, review_due, review_count, portal_topic_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    nid,
                    new_topic_id,
                    new_parent_id,
                    n.get("title") or "Untitled",
                    n.get("node_type") or "concept",
                    n.get("summary") or "",
                    n.get("content") or "",
                    n.get("difficulty") or difficulty,
                    meta_json,
                    n.get("pos_x"),
                    n.get("pos_y"),
                    n.get("created_at") or now,
                    now,
                    n.get("mastery_score", 0),
                    n.get("review_interval", 1),
                    n.get("ease_factor", 2.5),
                    n.get("review_due") or now,
                    n.get("review_count", 0),
                    n.get("portal_topic_id")
                )
            )
            
        edges_data = data.get("edges") or []
        for e in edges_data:
            old_s = e.get("source_id")
            old_t = e.get("target_id")
            new_s = node_id_map.get(old_s)
            new_t = node_id_map.get(old_t)
            if new_s and new_t:
                new_eid = str(uuid.uuid4())
                rel_type = e.get("relation_type") or e.get("edge_type") or "related_to"
                edge_type = e.get("edge_type") or rel_type
                label = e.get("label") or ""
                cursor.execute(
                    """INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, edge_type, label, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (new_eid, new_topic_id, new_s, new_t, rel_type, edge_type, label, e.get("created_at") or now)
                )
                
        quizzes_data = data.get("quizzes") or []
        for q in quizzes_data:
            old_nid = q.get("node_id")
            new_nid = node_id_map.get(old_nid)
            if new_nid:
                new_qid = str(uuid.uuid4())
                opts = q.get("options")
                opts_json = json.dumps(opts) if isinstance(opts, list) else (q.get("options_json") or "[]")
                cursor.execute(
                    """INSERT INTO quizzes (id, node_id, topic_id, question, options_json, correct_index, explanation, difficulty, user_answer, is_correct, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        new_qid,
                        new_nid,
                        new_topic_id,
                        q.get("question") or "",
                        opts_json,
                        q.get("correct_index", 0),
                        q.get("explanation") or "",
                        q.get("difficulty") or "intermediate",
                        q.get("user_answer"),
                        q.get("is_correct"),
                        q.get("created_at") or now
                    )
                )
                
        inquiries_data = data.get("inquiries") or []
        for inq in inquiries_data:
            old_nid = inq.get("node_id")
            new_nid = node_id_map.get(old_nid)
            if new_nid:
                new_inqid = str(uuid.uuid4())
                cursor.execute(
                    """INSERT INTO inquiries (id, node_id, topic_id, question, answer, difficulty, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        new_inqid,
                        new_nid,
                        new_topic_id,
                        inq.get("question") or "",
                        inq.get("answer") or "",
                        inq.get("difficulty") or "intermediate",
                        inq.get("created_at") or now
                    )
                )
                
    conn.close()
    return new_topic_id

def update_edge(edge_id: str, edge_type: Optional[str] = None, label: Optional[str] = None, relation_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Updates edge metadata.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM edges WHERE id = ?", (edge_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    current = dict(row)
    new_edge_type = edge_type if edge_type is not None else (current.get("edge_type") or current.get("relation_type") or "relates_to")
    new_label = label if label is not None else (current.get("label") or "")
    new_relation_type = relation_type if relation_type is not None else (edge_type if edge_type is not None else current.get("relation_type"))
    
    with conn:
        cursor.execute(
            """UPDATE edges 
               SET edge_type = ?, label = ?, relation_type = ?
               WHERE id = ?""",
            (new_edge_type, new_label, new_relation_type, edge_id)
        )
        cursor.execute("SELECT * FROM edges WHERE id = ?", (edge_id,))
        updated = dict(cursor.fetchone())
    conn.close()
    return updated

def update_node_portal(node_id: str, portal_topic_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Links a node to another topic as a portal.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    now = now_iso()
    with conn:
        cursor.execute("UPDATE nodes SET portal_topic_id = ?, updated_at = ? WHERE id = ?", (portal_topic_id, now, node_id))
        cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        updated = dict(cursor.fetchone())
    conn.close()
    try:
        updated["metadata"] = json.loads(updated.get("metadata_json") or "{}")
    except Exception:
        updated["metadata"] = {}
    return updated

