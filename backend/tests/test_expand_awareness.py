import unittest
import uuid
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import init_db, get_connection, delete_topic, now_iso
from backend.app.schemas import (
    SmartSubtopicExpansionResult,
    SubtopicNodeItem,
    ExistingNodeLink,
    NewNodeExistingLink,
    SmartQuestionDecompositionResult,
    DecomposedTopicItem,
)

class ExpandAwarenessIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.topic_id = f"test-exp-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, description, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (self.topic_id, "Deep Learning Topic", "Testing expand awareness", "intermediate", now_iso(), now_iso())
            )
        conn.close()

    def tearDown(self):
        delete_topic(self.topic_id)

    def _create_node(self, title, summary="", node_type="concept"):
        res = self.client.post("/api/nodes", json={
            "topic_id": self.topic_id,
            "title": title,
            "node_type": node_type,
            "summary": summary
        })
        self.assertEqual(res.status_code, 200)
        return res.json()["id"]

    def test_expand_connects_to_existing_node_and_creates_new(self):
        parent_id = self._create_node("Gradient Descent", "Optimization algorithm")
        existing_loss_id = self._create_node("Loss Functions", "Error measurement")

        # Mock AI returning connection to existing_loss_id + 1 new node + cross-link
        mock_ai_result = SmartSubtopicExpansionResult(
            parent_concept="Gradient Descent",
            connect_to_existing=[
                ExistingNodeLink(
                    existing_node_id=existing_loss_id[:8],
                    relation_type="prerequisite_for",
                    label="Minimizes objective",
                    direction="existing_to_parent"
                )
            ],
            new_nodes=[
                SubtopicNodeItem(
                    title="Learning Rate Schedules",
                    academic_domain="Machine Learning",
                    summary="Step size decay policies",
                    relation_to_parent="tunes_step_size"
                )
            ],
            new_node_existing_links=[
                NewNodeExistingLink(
                    new_node_title="Learning Rate Schedules",
                    existing_node_id=existing_loss_id[:8],
                    relation_type="calibrates",
                    label="Calibrates convergence on loss"
                )
            ]
        )

        with patch("backend.app.ai_service.expand_concept_subtopics", return_value=mock_ai_result):
            res = self.client.post(f"/api/nodes/{parent_id}/expand", json={
                "expansion_type": "subtopics",
                "difficulty": "intermediate"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()

            # Verify response message indicates re-use
            self.assertIn("connected 1 pre-existing nodes", data["message"])
            self.assertEqual(len(data["nodes"]), 1)
            self.assertEqual(data["nodes"][0]["title"], "Learning Rate Schedules")

            # Verify full graph
            full_graph = data["full_graph"]
            # Total nodes should be 3: Gradient Descent, Loss Functions, Learning Rate Schedules
            self.assertEqual(len(full_graph["nodes"]), 3)
            node_titles = [n["title"] for n in full_graph["nodes"]]
            self.assertIn("Loss Functions", node_titles)
            self.assertIn("Learning Rate Schedules", node_titles)
            # Ensure Loss Functions was NOT duplicated
            self.assertEqual(node_titles.count("Loss Functions"), 1)

            # Check edges:
            # 1. existing_loss_id -> parent_id (direction='existing_to_parent')
            # 2. parent_id -> new node
            # 3. new node -> existing_loss_id (cross-link)
            edges = full_graph["edges"]
            edge_pairs = [(e["source_id"], e["target_id"]) for e in edges]
            self.assertIn((existing_loss_id, parent_id), edge_pairs)

    def test_deduplication_guard_intercepts_redundant_proposed_node(self):
        parent_id = self._create_node("Deep Learning", "Neural networks")
        existing_backprop_id = self._create_node("Backpropagation", "Chain rule gradient calculation")

        # AI proposes "Backpropagation Algorithm" (which matches existing "Backpropagation")
        mock_ai_result = SmartSubtopicExpansionResult(
            parent_concept="Deep Learning",
            connect_to_existing=[],
            new_nodes=[
                SubtopicNodeItem(
                    title="Backpropagation Algorithm", # Should be intercepted as duplicate!
                    academic_domain="Machine Learning",
                    summary="Gradient calculation",
                    relation_to_parent="core_mechanism"
                )
            ],
            new_node_existing_links=[]
        )

        with patch("backend.app.ai_service.expand_concept_subtopics", return_value=mock_ai_result):
            res = self.client.post(f"/api/nodes/{parent_id}/expand", json={
                "expansion_type": "subtopics"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()

            # 0 new nodes created, 1 reused
            self.assertEqual(len(data["nodes"]), 0)
            self.assertEqual(len(data["reused_nodes"]), 1)
            self.assertEqual(data["reused_nodes"][0]["id"], existing_backprop_id)

            # Node count remained 2
            graph = data["full_graph"]
            self.assertEqual(len(graph["nodes"]), 2)
            # Edge created from parent to existing Backpropagation
            edge_pairs = [(e["source_id"], e["target_id"]) for e in graph["edges"]]
            self.assertIn((parent_id, existing_backprop_id), edge_pairs)

    def test_communities_endpoint(self):
        n1 = self._create_node("A")
        n2 = self._create_node("B")
        self.client.post("/api/edges", json={
            "topic_id": self.topic_id,
            "source_id": n1,
            "target_id": n2
        })

        res = self.client.get(f"/api/topics/{self.topic_id}/communities")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["topic_id"], self.topic_id)
        self.assertGreaterEqual(len(data["communities"]), 1)
        self.assertEqual(data["communities"][0]["node_count"], 2)

if __name__ == "__main__":
    unittest.main()
