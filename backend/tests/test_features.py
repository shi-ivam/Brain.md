import unittest
import uuid
import json
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    delete_topic,
    now_iso,
)

class FeatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.topic_id = f"test-feat-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, description, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (self.topic_id, "Feature Test Topic", "Testing deep linked features", "intermediate", now_iso(), now_iso())
            )
        conn.close()

    def tearDown(self):
        delete_topic(self.topic_id)

    def _create_node(self, title, content="", summary="", node_type="concept", pos_x=100.0, pos_y=100.0):
        res = self.client.post("/api/nodes", json={
            "topic_id": self.topic_id,
            "title": title,
            "node_type": node_type,
            "summary": summary,
            "content": content,
            "pos_x": pos_x,
            "pos_y": pos_y
        })
        self.assertEqual(res.status_code, 200)
        return res.json()["id"]

    def _create_edge(self, source_id, target_id, relation_type="related_to", edge_type="relates_to", label=""):
        res = self.client.post("/api/edges", json={
            "topic_id": self.topic_id,
            "source_id": source_id,
            "target_id": target_id,
            "relation_type": relation_type,
            "edge_type": edge_type,
            "label": label
        })
        self.assertEqual(res.status_code, 200)
        return res.json()["id"]

    def test_schema_migration_columns(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(nodes)")
        node_cols = {r["name"] for r in cursor.fetchall()}
        for col in ["mastery_score", "review_interval", "ease_factor", "review_due", "review_count", "portal_topic_id"]:
            self.assertIn(col, node_cols)

        cursor.execute("PRAGMA table_info(edges)")
        edge_cols = {r["name"] for r in cursor.fetchall()}
        for col in ["edge_type", "label"]:
            self.assertIn(col, edge_cols)
        conn.close()

    def test_sync_wikilinks(self):
        node1_id = self._create_node("Quantum Mechanics", content="Core principles of physics.")
        node2_id = self._create_node("Wavefunction", content="Refer to [[Quantum Mechanics#Postulates|QM]] and [[Entropy]].")
        node3_id = self._create_node("Entropy", content="Statistical physics concept.")

        res = self.client.post(f"/api/topics/{self.topic_id}/sync-wikilinks")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["added_edges_count"], 2)

        # Idempotency check
        res2 = self.client.post(f"/api/topics/{self.topic_id}/sync-wikilinks")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["added_edges_count"], 0)

        # Verify edge attributes
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        wiki_edges = [e for e in graph["edges"] if e.get("edge_type") == "wikilink"]
        self.assertEqual(len(wiki_edges), 2)
        target_ids = {e["target_id"] for e in wiki_edges}
        self.assertEqual(target_ids, {node1_id, node3_id})

    def test_unlinked_mentions(self):
        node_a = self._create_node("General Relativity", content="Theory of gravitation.")
        node_b = self._create_node("Gravitational Waves", content="Predicted by General Relativity in 1916.")
        node_c = self._create_node("Spacetime Curvature", content="Governed by General Relativity.")

        # Create edge connecting node_a and node_c only
        self._create_edge(node_a, node_c, relation_type="related_to")

        # Query unlinked mentions for node_a
        res = self.client.get(f"/api/nodes/{node_a}/mentions")
        self.assertEqual(res.status_code, 200)
        mentions = res.json()

        # Node B should be in mentions (contains 'General Relativity' and not connected)
        mention_node_ids = [m["node_id"] for m in mentions]
        self.assertIn(node_b, mention_node_ids)
        # Node C should NOT be in mentions (already connected)
        self.assertNotIn(node_c, mention_node_ids)
        # Node A should NOT mention itself
        self.assertNotIn(node_a, mention_node_ids)

        # Check snippet
        b_mention = next(m for m in mentions if m["node_id"] == node_b)
        self.assertIn("General Relativity", b_mention["snippet"])

    def test_shortest_path(self):
        n1 = self._create_node("N1")
        n2 = self._create_node("N2")
        n3 = self._create_node("N3")
        n4 = self._create_node("N4")
        n_dis = self._create_node("Isolated")

        e1 = self._create_edge(n1, n2)
        e2 = self._create_edge(n2, n3)
        e3 = self._create_edge(n3, n4)

        # Path between N1 and N4
        res = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={n1}&target_node={n4}")
        self.assertEqual(res.status_code, 200)
        path = res.json()
        self.assertTrue(path["found"])
        self.assertEqual(path["path_length"], 3)
        self.assertEqual(path["node_ids"], [n1, n2, n3, n4])
        self.assertEqual(path["edge_ids"], [e1, e2, e3])

        # Self path
        res_self = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={n1}&target_node={n1}")
        self.assertEqual(res_self.status_code, 200)
        self.assertTrue(res_self.json()["found"])
        self.assertEqual(res_self.json()["path_length"], 0)
        self.assertEqual(res_self.json()["node_ids"], [n1])

        # Disconnected path
        res_dis = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={n1}&target_node={n_dis}")
        self.assertEqual(res_dis.status_code, 200)
        self.assertFalse(res_dis.json()["found"])
        self.assertEqual(res_dis.json()["path_length"], 0)
        self.assertEqual(res_dis.json()["node_ids"], [])

    def test_spaced_repetition_review(self):
        nid = self._create_node("Spaced Repetition Concept")

        # Review 1: Good (rating=3)
        res1 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 3})
        self.assertEqual(res1.status_code, 200)
        d1 = res1.json()
        self.assertEqual(d1["review_interval"], 1)
        self.assertEqual(d1["repetitions"], 1)
        self.assertGreater(d1["mastery_score"], 0)
        self.assertEqual(d1["review_count"], 1)

        # Review 2: Easy (rating=4)
        res2 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 4})
        self.assertEqual(res2.status_code, 200)
        d2 = res2.json()
        self.assertEqual(d2["review_interval"], 6)
        self.assertEqual(d2["repetitions"], 2)
        self.assertGreater(d2["ease_factor"], d1["ease_factor"])
        self.assertEqual(d2["review_count"], 2)

        # Review 3: Again (rating=1)
        res3 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 1})
        self.assertEqual(res3.status_code, 200)
        d3 = res3.json()
        self.assertEqual(d3["review_interval"], 1)
        self.assertEqual(d3["repetitions"], 0)
        self.assertLess(d3["mastery_score"], d2["mastery_score"])
        self.assertEqual(d3["review_count"], 3)

        # Invalid rating
        res_bad = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 5})
        self.assertIn(res_bad.status_code, [400, 422])

    def test_review_queue(self):
        nid1 = self._create_node("Past Due Concept")
        nid2 = self._create_node("Future Mastered Concept")

        # Force nid1 to be due
        conn = get_connection()
        past_date = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        future_date = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
        with conn:
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 30 WHERE id = ?", (past_date, nid1))
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 100 WHERE id = ?", (future_date, nid2))
        conn.close()

        res = self.client.get(f"/api/topics/{self.topic_id}/review-queue")
        self.assertEqual(res.status_code, 200)
        queue = res.json()
        queue_ids = [n["id"] for n in queue]
        self.assertIn(nid1, queue_ids)
        self.assertNotIn(nid2, queue_ids)

    def test_link_portal_topic(self):
        portal_target_id = f"test-portal-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (portal_target_id, "Portal Destination Topic", "intermediate", now_iso(), now_iso())
            )
        conn.close()

        nid = self._create_node("Portal Node")
        res = self.client.post(f"/api/nodes/{nid}/link-topic", json={"portal_topic_id": portal_target_id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["portal_topic_id"], portal_target_id)

        # Verify in full graph
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        node = next(n for n in graph["nodes"] if n["id"] == nid)
        self.assertEqual(node.get("portal_topic_id"), portal_target_id)

        delete_topic(portal_target_id)

    def test_deep_search(self):
        n1 = self._create_node("Topology and Manifolds", content="Differential geometry foundations.")
        
        # Add an inquiry
        conn = get_connection()
        inq_id = str(uuid.uuid4())
        quiz_id = str(uuid.uuid4())
        now = now_iso()
        with conn:
            conn.execute(
                "INSERT INTO inquiries (id, node_id, topic_id, question, answer, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (inq_id, n1, self.topic_id, "What is a Riemann Surface?", "A 1D complex manifold.", "advanced", now)
            )
            conn.execute(
                "INSERT INTO quizzes (id, node_id, topic_id, question, options_json, correct_index, explanation, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (quiz_id, n1, self.topic_id, "Which topological invariant is Euler characteristic?", json.dumps(["Chi", "Pi", "Phi", "Rho"]), 0, "Euler characteristic is denoted by Chi.", "intermediate", now)
            )
        conn.close()

        # Title search
        res_title = self.client.get(f"/api/topics/{self.topic_id}/search?q=Topology")
        self.assertEqual(res_title.status_code, 200)
        hits_title = res_title.json()
        self.assertTrue(any(h["hit_type"] == "title" and "Topology" in h["title"] for h in hits_title))

        # Content search
        res_content = self.client.get(f"/api/topics/{self.topic_id}/search?q=geometry")
        self.assertEqual(res_content.status_code, 200)
        hits_content = res_content.json()
        self.assertTrue(any(h["hit_type"] == "content" for h in hits_content))

        # Inquiry search
        res_inq = self.client.get(f"/api/topics/{self.topic_id}/search?q=Riemann")
        self.assertEqual(res_inq.status_code, 200)
        hits_inq = res_inq.json()
        self.assertTrue(any(h["hit_type"] == "inquiry" for h in hits_inq))

        # Quiz search
        res_quiz = self.client.get(f"/api/topics/{self.topic_id}/search?q=Euler")
        self.assertEqual(res_quiz.status_code, 200)
        hits_quiz = res_quiz.json()
        self.assertTrue(any(h["hit_type"] == "quiz" for h in hits_quiz))

    def test_export_and_import_json(self):
        n1 = self._create_node("Export Node 1", content="First note")
        n2 = self._create_node("Export Node 2", content="Second note")
        self._create_edge(n1, n2, relation_type="subtopic_of", edge_type="subtopic_of", label="Child")

        # Export
        res_exp = self.client.get(f"/api/topics/{self.topic_id}/export/json")
        self.assertEqual(res_exp.status_code, 200)
        exported_data = res_exp.json()
        self.assertIn("topic", exported_data)
        self.assertIn("nodes", exported_data)
        self.assertIn("edges", exported_data)
        self.assertEqual(len(exported_data["nodes"]), 2)
        self.assertEqual(len(exported_data["edges"]), 1)

        # Import
        res_imp = self.client.post("/api/topics/import/json", json=exported_data)
        self.assertEqual(res_imp.status_code, 200)
        imp_data = res_imp.json()
        new_topic_id = imp_data["topic_id"]
        self.assertNotEqual(new_topic_id, self.topic_id)

        # Verify imported topic
        imp_graph = self.client.get(f"/api/topics/{new_topic_id}").json()
        self.assertEqual(len(imp_graph["nodes"]), 2)
        self.assertEqual(len(imp_graph["edges"]), 1)

        # Clean up imported topic
        delete_topic(new_topic_id)

    def test_update_edge(self):
        n1 = self._create_node("Edge Source")
        n2 = self._create_node("Edge Target")
        edge_id = self._create_edge(n1, n2, relation_type="related_to", edge_type="relates_to", label="Original")

        res = self.client.put(f"/api/edges/{edge_id}", json={
            "edge_type": "prerequisite_for",
            "label": "Essential Foundation",
            "relation_type": "prerequisite_for"
        })
        self.assertEqual(res.status_code, 200)
        updated = res.json()
        self.assertEqual(updated["edge_type"], "prerequisite_for")
        self.assertEqual(updated["label"], "Essential Foundation")

        # Verify edge in graph
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        edge = next(e for e in graph["edges"] if e["id"] == edge_id)
        self.assertEqual(edge["edge_type"], "prerequisite_for")
        self.assertEqual(edge["label"], "Essential Foundation")

if __name__ == '__main__':
    unittest.main()
