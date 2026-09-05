import unittest
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import init_db, get_connection, delete_topic

class BackendApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["primary_model"], "gemini-3.8-flash")
        self.assertEqual(data["gcp_location"], "global")

    def test_database_initialization_and_topics(self):
        res = self.client.get("/api/topics")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_create_and_query_custom_nodes(self):
        topic_id = f"test-topic-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (topic_id, "Test Topic", "intermediate", "2026-09-05T00:00:00Z", "2026-09-05T00:00:00Z")
            )
        conn.close()

        # Create node
        res = self.client.post("/api/nodes", json={
            "topic_id": topic_id,
            "title": "Quantum Superposition",
            "node_type": "concept",
            "summary": "Core state property",
            "difficulty": "advanced"
        })
        self.assertEqual(res.status_code, 200)
        node_id = res.json()["id"]

        # Query topic graph
        res_graph = self.client.get(f"/api/topics/{topic_id}")
        self.assertEqual(res_graph.status_code, 200)
        graph = res_graph.json()
        self.assertEqual(len(graph["nodes"]), 1)
        self.assertEqual(graph["nodes"][0]["title"], "Quantum Superposition")

        # Export to obsidian zip
        res_export = self.client.get(f"/api/topics/{topic_id}/export/obsidian")
        self.assertEqual(res_export.status_code, 200)
        self.assertEqual(res_export.headers["content-type"], "application/zip")

        # Clean up
        delete_topic(topic_id)

if __name__ == "__main__":
    unittest.main()
