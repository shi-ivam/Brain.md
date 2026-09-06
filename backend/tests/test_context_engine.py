import unittest
import uuid
from backend.app.database import init_db, get_connection, delete_topic, now_iso
from backend.app.context_engine import (
    normalize_title,
    calculate_title_similarity,
    get_compact_existing_context,
    check_duplicate_node,
    compute_graph_communities,
)

class ContextEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        self.topic_id = f"test-ctx-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, description, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (self.topic_id, "Linear Algebra & Calculus", "Testing context engine", "intermediate", now_iso(), now_iso())
            )
        conn.close()

    def tearDown(self):
        delete_topic(self.topic_id)

    def _add_node(self, title, node_type="concept"):
        nid = str(uuid.uuid4())
        now = now_iso()
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO nodes (id, topic_id, title, node_type, summary, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (nid, self.topic_id, title, node_type, f"Summary of {title}", "", now, now)
            )
        conn.close()
        return nid

    def _add_edge(self, s, t, rel="related_to"):
        eid = str(uuid.uuid4())
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (eid, self.topic_id, s, t, rel, now_iso())
            )
        conn.close()
        return eid

    def test_normalize_title(self):
        self.assertEqual(normalize_title("The Linear Regression Model!"), "linear regression model")
        self.assertEqual(normalize_title("  A   Quantum  Decoherence: "), "quantum decoherence")

    def test_calculate_title_similarity(self):
        # Exact match
        self.assertAlmostEqual(calculate_title_similarity("Matrix Decomposition", "matrix decomposition"), 1.0)
        # Subset/rewording match
        self.assertGreaterEqual(calculate_title_similarity("Linear Regression", "Linear Regression Model"), 0.85)
        self.assertGreaterEqual(calculate_title_similarity("Gradient Descent", "Gradient Descent Optimization"), 0.85)
        # Distinct concepts
        self.assertLess(calculate_title_similarity("Quantum Superposition", "Entropy"), 0.5)

    def test_compact_context_and_token_efficiency(self):
        n1 = self._add_node("Linear Algebra")
        n2 = self._add_node("Vector Spaces")
        n3 = self._add_node("Eigenvalues and Eigenvectors")
        n4 = self._add_node("Singular Value Decomposition")
        self._add_edge(n1, n2)
        self._add_edge(n2, n3)

        compact_str, id_map = get_compact_existing_context(self.topic_id, n1, max_candidates=10)
        self.assertIn("Vector Spaces", compact_str)
        self.assertIn("PRE-EXISTING GRAPH NODES", compact_str)
        # Verify token efficiency: length should be well under 1000 characters (~150 tokens)
        self.assertLess(len(compact_str), 600)
        # Verify id_map contains full IDs and prefixes
        self.assertEqual(id_map[n2[:8].lower()], n2)
        self.assertEqual(id_map[normalize_title("Vector Spaces")], n2)

    def test_check_duplicate_node(self):
        self._add_node("Stochastic Gradient Descent")
        
        # Test exact match
        is_dup, match_id, match_title, score = check_duplicate_node(self.topic_id, "Stochastic Gradient Descent")
        self.assertTrue(is_dup)
        self.assertEqual(match_title, "Stochastic Gradient Descent")
        
        # Test reworded variation
        is_dup2, match_id2, match_title2, score2 = check_duplicate_node(self.topic_id, "Stochastic Gradient Descent Algorithm")
        self.assertTrue(is_dup2)
        self.assertEqual(match_title2, "Stochastic Gradient Descent")

        # Test completely new concept
        is_dup3, _, _, score3 = check_duplicate_node(self.topic_id, "Hamiltonian Mechanics")
        self.assertFalse(is_dup3)

    def test_compute_graph_communities(self):
        n1 = self._add_node("Linear Algebra")
        n2 = self._add_node("Vector Spaces")
        n3 = self._add_node("Matrices")
        self._add_edge(n1, n2)
        self._add_edge(n2, n3)
        self._add_edge(n1, n3)

        n4 = self._add_node("Quantum Superposition")
        n5 = self._add_node("Wavefunction")
        self._add_edge(n4, n5)

        communities = compute_graph_communities(self.topic_id)
        self.assertGreaterEqual(len(communities), 1)
        all_ids = set()
        for comm in communities:
            all_ids.update(comm["node_ids"])
        self.assertEqual(all_ids, {n1, n2, n3, n4, n5})

if __name__ == "__main__":
    unittest.main()
