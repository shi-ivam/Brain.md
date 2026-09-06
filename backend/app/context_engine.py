import re
import difflib
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
import networkx as nx
from .database import get_connection

logger = logging.getLogger("context_engine")

def normalize_title(title: str) -> str:
    """
    Normalizes a concept title for comparison:
    lowercased, stripped of punctuation, excess whitespace, and leading English articles.
    """
    if not title:
        return ""
    text = title.lower().strip()
    # Strip leading common articles
    text = re.sub(r'^(the|a|an)\s+', '', text)
    # Replace punctuation and symbols with single space
    text = re.sub(r'[^\w\s]', ' ', text)
    # Collapse multiple whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

GENERIC_ACADEMIC_MODIFIERS = {
    'algorithm', 'algorithms', 'method', 'methods', 'model', 'models',
    'theory', 'theories', 'concept', 'concepts', 'law', 'laws',
    'principle', 'principles', 'process', 'processes', 'technique', 'techniques',
    'framework', 'frameworks', 'approach', 'approaches', 'system', 'systems',
    'analysis', 'equation', 'equations', 'rule', 'rules', 'formula', 'formulas'
}

def calculate_title_similarity(title_a: str, title_b: str) -> float:
    """
    Calculates composite lexical similarity between two concept titles:
    Combines exact match, SequenceMatcher ratio, token set overlap, and generic modifier filtering.
    """
    norm_a = normalize_title(title_a)
    norm_b = normalize_title(title_b)

    if not norm_a or not norm_b:
        return 0.0

    if norm_a == norm_b:
        return 1.0

    # Token overlap analysis
    tokens_a = set(norm_a.split())
    tokens_b = set(norm_b.split())
    
    if tokens_a == tokens_b:
        return 1.0

    # If one title is entirely contained in the other
    if tokens_a.issubset(tokens_b) or tokens_b.issubset(tokens_a):
        diff = (tokens_a | tokens_b) - (tokens_a & tokens_b)
        if diff.issubset(GENERIC_ACADEMIC_MODIFIERS):
            return 0.95

        shorter_len = min(len(tokens_a), len(tokens_b))
        longer_len = max(len(tokens_a), len(tokens_b))
        if shorter_len >= 2 and (shorter_len / longer_len) >= 0.65:
            return 0.92

    # Jaccard index
    intersection = tokens_a.intersection(tokens_b)
    union = tokens_a.union(tokens_b)
    jaccard = len(intersection) / max(1, len(union))

    # Levenshtein/Ratcliff-Obershelp sequence ratio
    seq_ratio = difflib.SequenceMatcher(None, norm_a, norm_b).ratio()

    # Weighted composite score
    composite = max(seq_ratio, (0.6 * jaccard + 0.4 * seq_ratio))
    return composite

def get_compact_existing_context(
    topic_id: str,
    current_node_id: Optional[str] = None,
    max_candidates: int = 14
) -> Tuple[str, Dict[str, str]]:
    """
    Intelligently selects a compact pool of candidate existing nodes for Gemini prompt context.
    Prioritizes:
    1. Direct 1-hop and 2-hop topological neighbors of current_node_id
    2. Topic root node and high-degree hub nodes
    3. Lexically related concepts
    
    Returns:
    - compact_context_str: Formatted string consuming only ~80-140 tokens.
    - id_lookup_map: Mapping of short IDs and normalized titles to actual UUIDs.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, node_type, summary, parent_node_id FROM nodes WHERE topic_id = ?", (topic_id,))
    node_rows = [dict(r) for r in cursor.fetchall()]

    if not node_rows:
        conn.close()
        return "", {}

    node_map = {n["id"]: n for n in node_rows}
    id_lookup_map: Dict[str, str] = {}

    # Register all full IDs, short prefixes, and titles
    for n in node_rows:
        full_id = n["id"]
        short_id = full_id[:8]
        id_lookup_map[short_id.lower()] = full_id
        id_lookup_map[full_id.lower()] = full_id
        id_lookup_map[normalize_title(n["title"])] = full_id

    # Fetch edges to construct topological proximity
    cursor.execute("SELECT source_id, target_id FROM edges WHERE topic_id = ?", (topic_id,))
    edge_rows = cursor.fetchall()
    conn.close()

    adj: Dict[str, Set[str]] = {n["id"]: set() for n in node_rows}
    for e in edge_rows:
        s, t = e["source_id"], e["target_id"]
        if s in adj and t in adj:
            adj[s].add(t)
            adj[t].add(s)

    current_node = node_map.get(current_node_id) if current_node_id else None

    # Score each other node for relevance
    scored_candidates: List[Tuple[float, Dict[str, Any]]] = []
    current_title_tokens = set(normalize_title(current_node["title"]).split()) if current_node else set()

    for nid, node in node_map.items():
        if current_node_id and nid == current_node_id:
            continue  # Do not include self in candidate list

        score = 0.0
        degree = len(adj.get(nid, set()))

        # Topological proximity
        if current_node_id:
            if nid in adj.get(current_node_id, set()):
                score += 50.0  # 1-hop neighbor
            else:
                # 2-hop check
                two_hop = any(hop in adj.get(current_node_id, set()) for hop in adj.get(nid, set()))
                if two_hop:
                    score += 30.0

            if node.get("parent_node_id") == current_node_id or (current_node and current_node.get("parent_node_id") == nid):
                score += 40.0

        # High-degree hub bonus
        score += min(15.0, degree * 3.0)

        # Lexical keyword overlap with current node
        other_tokens = set(normalize_title(node["title"]).split())
        overlap = len(current_title_tokens.intersection(other_tokens))
        score += overlap * 10.0

        scored_candidates.append((score, node))

    # Sort descending by relevance score
    scored_candidates.sort(key=lambda x: x[0], reverse=True)
    selected_nodes = [node for _, node in scored_candidates[:max_candidates]]

    if not selected_nodes:
        return "", id_lookup_map

    lines = [
        "PRE-EXISTING GRAPH NODES (Connect to these existing concepts if relevant; do NOT recreate redundant duplicates):"
    ]
    for n in selected_nodes:
        short_id = n["id"][:8]
        lines.append(f"- [ID: {short_id}] '{n['title']}' ({n['node_type']})")

    compact_context_str = "\n".join(lines)
    return compact_context_str, id_lookup_map

def check_duplicate_node(
    topic_id: str,
    proposed_title: str,
    threshold: float = 0.85
) -> Tuple[bool, Optional[str], Optional[str], float]:
    """
    Checks if a proposed title matches any pre-existing node in the topic.
    Returns:
    (is_duplicate, matched_node_id, matched_node_title, similarity_score)
    """
    clean_proposed = proposed_title.strip()
    if not clean_proposed:
        return False, None, None, 0.0

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM nodes WHERE topic_id = ?", (topic_id,))
    rows = cursor.fetchall()
    conn.close()

    best_sim = 0.0
    best_match_id = None
    best_match_title = None

    for r in rows:
        existing_id = r["id"]
        existing_title = r["title"]
        sim = calculate_title_similarity(clean_proposed, existing_title)
        if sim > best_sim:
            best_sim = sim
            best_match_id = existing_id
            best_match_title = existing_title

    if best_sim >= threshold and best_match_id:
        logger.info(
            f"Deduplicated concept: '{proposed_title}' matched existing '{best_match_title}' (sim={best_sim:.2f})"
        )
        return True, best_match_id, best_match_title, best_sim

    return False, None, None, best_sim

def compute_graph_communities(topic_id: str) -> List[Dict[str, Any]]:
    """
    Computes modularity-based communities (thematic clusters) using NetworkX.
    Runs in <2ms with zero neural model downloads or storage overhead.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, node_type FROM nodes WHERE topic_id = ?", (topic_id,))
    node_rows = [dict(r) for r in cursor.fetchall()]

    if not node_rows:
        conn.close()
        return []

    cursor.execute("SELECT source_id, target_id FROM edges WHERE topic_id = ?", (topic_id,))
    edge_rows = cursor.fetchall()
    conn.close()

    node_map = {n["id"]: n for n in node_rows}
    G = nx.Graph()

    for n in node_rows:
        G.add_node(n["id"], title=n["title"], node_type=n["node_type"])

    for e in edge_rows:
        G.add_edge(e["source_id"], e["target_id"])

    if len(node_rows) <= 3:
        return [{
            "community_id": 0,
            "label": node_rows[0]["title"],
            "representative_node_id": node_rows[0]["id"],
            "node_count": len(node_rows),
            "node_ids": [n["id"] for n in node_rows]
        }]

    # Run greedy modularity community detection
    try:
        communities = list(nx.algorithms.community.greedy_modularity_communities(G))
    except Exception as ex:
        logger.warning(f"Modularity community detection fallback: {ex}")
        communities = [set(G.nodes())]

    result = []
    for idx, comm in enumerate(communities):
        comm_nodes = list(comm)
        # Find most connected node in this community as anchor
        best_anchor = max(comm_nodes, key=lambda nid: G.degree(nid) if nid in G else 0)
        anchor_node = node_map.get(best_anchor, {"title": f"Module {idx+1}"})
        
        result.append({
            "community_id": idx,
            "label": anchor_node["title"],
            "representative_node_id": best_anchor,
            "node_count": len(comm_nodes),
            "node_ids": comm_nodes
        })

    return result
