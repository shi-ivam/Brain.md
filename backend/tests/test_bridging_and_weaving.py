import unittest
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    bridge_edge,
    insert_node_between,
    weave_nodes_and_edges,
    delete_edge,
    get_edge,
    get_node,
)
from backend.app.schemas import (
    EdgeBridgeResult,
    BridgeNodeItem,
    GraphWeaveResult,
    WeaveNodeItem,
    WeaveEdgeItem,
)

client = TestClient(app)

class TestBridgingAndWeaving(unittest.TestCase):
    def setUp(self):
        init_db()
        self.conn = get_connection()
        self.topic_id = "test-topic-bw-001"
        self.node_a_id = "test-node-bw-a"
        self.node_b_id = "test-node-bw-b"
        self.edge_ab_id = "test-edge-bw-ab"

        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
            self.conn.execute(
                "INSERT INTO topics (id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (self.topic_id, "Stochastic Analysis", "advanced", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )
            self.conn.execute(
                "INSERT INTO nodes (id, topic_id, title, node_type, summary, content, difficulty, pos_x, pos_y, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (self.node_a_id, self.topic_id, "Brownian Motion", "concept", "Standard Wiener process", "# Brownian Motion", "advanced", 100.0, 200.0, "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )
            self.conn.execute(
                "INSERT INTO nodes (id, topic_id, title, node_type, summary, content, difficulty, pos_x, pos_y, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (self.node_b_id, self.topic_id, "Black-Scholes Formula", "concept", "Option pricing PDE solution", "# Black-Scholes", "advanced", 700.0, 200.0, "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )
            self.conn.execute(
                "INSERT INTO edges (id, topic_id, source_id, target_id, relation_type, edge_type, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (self.edge_ab_id, self.topic_id, self.node_a_id, self.node_b_id, "prerequisite_for", "prerequisite_for", "Foundation to pricing", "2026-09-06T00:00:00Z")
            )

    def tearDown(self):
        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
        self.conn.close()

    def test_database_delete_edge(self):
        self.assertIsNotNone(get_edge(self.edge_ab_id))
        res = delete_edge(self.edge_ab_id)
        self.assertTrue(res)
        self.assertIsNone(get_edge(self.edge_ab_id))

    def test_database_insert_node_between(self):
        graph, new_id = insert_node_between(
            edge_id=self.edge_ab_id,
            title="Ito's Lemma",
            node_type="concept",
            summary="Stochastic chain rule",
            relation_source_to_new="subtopic_of",
            relation_new_to_target="prerequisite_for",
            label_source_to_new="Extends to",
            label_new_to_target="Key derivation of"
        )
        self.assertIsNotNone(new_id)
        # Original edge deleted
        self.assertIsNone(get_edge(self.edge_ab_id))
        # New node exists
        new_node = get_node(new_id)
        self.assertIsNotNone(new_node)
        self.assertEqual(new_node["title"], "Ito's Lemma")
        # Check geometric positioning between A(100, 200) and B(700, 200)
        self.assertAlmostEqual(new_node["pos_x"], 400.0, delta=10.0)

        # Check edges
        edges = [e for e in graph["edges"] if e["source_id"] == self.node_a_id and e["target_id"] == new_id]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["label"], "Extends to")

        edges2 = [e for e in graph["edges"] if e["source_id"] == new_id and e["target_id"] == self.node_b_id]
        self.assertEqual(len(edges2), 1)
        self.assertEqual(edges2[0]["label"], "Key derivation of")

    def test_database_bridge_edge_multi(self):
        bridge_nodes_data = [
            {
                "title": "Continuous Semimartingales",
                "node_type": "concept",
                "summary": "Decomposition into bounded variation and local martingale",
                "relation_from_prev": "develops_into",
                "label_from_prev": "Generalizes to",
            },
            {
                "title": "Stochastic Integration",
                "node_type": "concept",
                "summary": "Integration with respect to Brownian motion",
                "relation_from_prev": "prerequisite_for",
                "label_from_prev": "Integration theory",
            }
        ]
        graph, created_ids = bridge_edge(
            edge_id=self.edge_ab_id,
            bridge_nodes_data=bridge_nodes_data,
            relation_to_target="prerequisite_for",
            label_to_target="Applies to"
        )
        self.assertEqual(len(created_ids), 2)
        # Original edge deleted
        self.assertIsNone(get_edge(self.edge_ab_id))

        # Check chain: A -> B1 -> B2 -> B
        b1_id, b2_id = created_ids[0], created_ids[1]
        e1 = [e for e in graph["edges"] if e["source_id"] == self.node_a_id and e["target_id"] == b1_id]
        e2 = [e for e in graph["edges"] if e["source_id"] == b1_id and e["target_id"] == b2_id]
        e3 = [e for e in graph["edges"] if e["source_id"] == b2_id and e["target_id"] == self.node_b_id]

        self.assertEqual(len(e1), 1)
        self.assertEqual(len(e2), 1)
        self.assertEqual(len(e3), 1)

    def test_database_weave_nodes_and_edges(self):
        nodes_data = [
            {
                "title": "Quadratic Variation",
                "node_type": "concept",
                "summary": "Crucial bridge concept for Ito calculus",
                "is_primary_target": False
            },
            {
                "title": "Why does dW_t * dW_t = dt?",
                "node_type": "question",
                "summary": "Fundamental inquiry into non-vanishing quadratic variation of Brownian paths",
                "is_primary_target": True
            }
        ]
        edges_data = [
            {
                "source_title": "Brownian Motion",
                "target_title": "Quadratic Variation",
                "relation_type": "subtopic_of",
                "label": "Path property"
            },
            {
                "source_title": "Quadratic Variation",
                "target_title": "Why does dW_t * dW_t = dt?",
                "relation_type": "governs",
                "label": "Answers inquiry"
            }
        ]
        graph, primary_id, created_ids = weave_nodes_and_edges(
            topic_id=self.topic_id,
            nodes_data=nodes_data,
            edges_data=edges_data,
            anchor_ids=[self.node_a_id]
        )
        self.assertEqual(len(created_ids), 2)
        primary_node = get_node(primary_id)
        self.assertIsNotNone(primary_node)
        self.assertEqual(primary_node["title"], "Why does dW_t * dW_t = dt?")

    def test_api_delete_edge(self):
        resp = client.delete(f"/api/edges/{self.edge_ab_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIsNone(get_edge(self.edge_ab_id))

    def test_api_insert_node_on_edge(self):
        payload = {
            "title": "Ito's Formula",
            "node_type": "concept",
            "summary": "Calculus for stochastic processes",
            "relation_source_to_new": "subtopic_of",
            "relation_new_to_target": "prerequisite_for",
            "label_source_to_new": "Calculus",
            "label_new_to_target": "Pricing PDE"
        }
        resp = client.post(f"/api/edges/{self.edge_ab_id}/insert-node", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIn("new_node_id", data)
        self.assertIn("full_graph", data)

    @patch("backend.app.ai_service.bridge_edge_transition")
    def test_api_bridge_edge(self, mock_bridge):
        mock_bridge.return_value = EdgeBridgeResult(
            explanation_of_gap="The jump from Brownian Motion directly to Black-Scholes skips stochastic integration and Ito calculus.",
            bridge_nodes=[
                BridgeNodeItem(
                    title="Stochastic Differential Equations",
                    node_type="concept",
                    summary="Equations modeling noise-driven systems",
                    relation_from_prev="subtopic_of",
                    label_from_prev="Differential formulation",
                    speaker_note="Essential stepping stone"
                )
            ],
            relation_to_target="prerequisite_for",
            label_to_target="Used in derivation of"
        )
        payload = {
            "num_bridge_nodes": 1,
            "difficulty": "advanced",
            "focus_note": "Explain the stochastic calculus jump"
        }
        resp = client.post(f"/api/edges/{self.edge_ab_id}/bridge", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["created_node_ids"]), 1)
        self.assertIn("The jump from Brownian Motion", data["explanation_of_gap"])

    @patch("backend.app.ai_service.weave_concept_into_graph")
    def test_api_weave_concept(self, mock_weave):
        mock_weave.return_value = GraphWeaveResult(
            anchor_node_ids=[self.node_a_id],
            rationale="Connected to Brownian Motion as a core path property inquiry.",
            nodes_to_create=[
                WeaveNodeItem(
                    title="Path Regularity & Non-Differentiability",
                    node_type="concept",
                    summary="Almost all sample paths are nowhere differentiable",
                    is_primary_target=True
                )
            ],
            edges_to_create=[
                WeaveEdgeItem(
                    source_title="Brownian Motion",
                    target_title="Path Regularity & Non-Differentiability",
                    relation_type="subtopic_of",
                    label="Sample path properties"
                )
            ]
        )
        payload = {
            "prompt": "Why are Brownian paths nowhere differentiable?",
            "target_type": "auto",
            "difficulty": "advanced"
        }
        resp = client.post(f"/api/topics/{self.topic_id}/weave", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIn("primary_node_id", data)
        self.assertEqual(len(data["created_node_ids"]), 1)
        self.assertIn("Brownian Motion", data["rationale"])

if __name__ == "__main__":
    unittest.main()
