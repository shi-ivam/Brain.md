import unittest
import uuid
import json
import os
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    delete_topic,
    now_iso,
    get_full_graph,
)
from backend.app.config import UPLOADS_DIR

class ResourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.topic_id = f"test-res-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, description, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (self.topic_id, "Resource Test Topic", "Testing resource attachments", "intermediate", now_iso(), now_iso())
            )
        conn.close()

    def tearDown(self):
        delete_topic(self.topic_id)

    def _create_node(self, title="Brownian Motion"):
        res = self.client.post("/api/nodes", json={
            "topic_id": self.topic_id,
            "title": title,
            "node_type": "concept",
            "summary": "Random motion of microscopic particles suspended in fluid",
            "content": "# Brownian Motion\n\nStudy note content here.",
            "pos_x": 200.0,
            "pos_y": 200.0,
        })
        self.assertEqual(res.status_code, 200)
        return res.json()["id"]

    def test_create_and_list_youtube_resource(self):
        node_id = self._create_node("Stochastic Calculus")
        yt_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m30s"
        
        # Create resource
        res = self.client.post(f"/api/nodes/{node_id}/resources", json={
            "title": "3Blue1Brown - Brownian Motion",
            "url": yt_url,
            "resource_type": "youtube",
            "notes": "Watch chapters 1 through 3 for physical intuition."
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["node_id"], node_id)
        self.assertEqual(data["resource_type"], "youtube")
        self.assertIn("dQw4w9WgXcQ", data["thumbnail_url"])
        self.assertEqual(data["metadata"].get("videoId"), "dQw4w9WgXcQ")
        self.assertEqual(data["metadata"].get("start_seconds"), 150)

        # List resources
        list_res = self.client.get(f"/api/nodes/{node_id}/resources")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], data["id"])

        # Check full graph
        graph_res = self.client.get(f"/api/topics/{self.topic_id}")
        self.assertEqual(graph_res.status_code, 200)
        graph_data = graph_res.json()
        self.assertIn("resources", graph_data)
        self.assertEqual(len(graph_data["resources"]), 1)
        self.assertEqual(graph_data["resources"][0]["title"], "3Blue1Brown - Brownian Motion")

    def test_upload_and_serve_pdf_resource(self):
        node_id = self._create_node("Measure Theory")
        fake_pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n50\n%%EOF"
        
        # Upload PDF
        res = self.client.post(
            f"/api/nodes/{node_id}/resources/upload",
            files={"file": ("lecture4_notes.pdf", fake_pdf_content, "application/pdf")},
            data={"title": "MIT 18.100A Lecture Notes", "notes": "Covers sigma-algebras and Lebesgue measure."}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["resource_type"], "pdf")
        self.assertEqual(data["title"], "MIT 18.100A Lecture Notes")
        self.assertEqual(data["file_size"], len(fake_pdf_content))
        self.assertTrue(data["url"].startswith("/api/resources/files/"))

        # Verify file download/inline serving
        filename = data["url"].split("/")[-1]
        file_res = self.client.get(f"/api/resources/files/{filename}")
        self.assertEqual(file_res.status_code, 200)
        self.assertEqual(file_res.headers["content-type"], "application/pdf")
        self.assertIn("inline", file_res.headers.get("content-disposition", ""))
        self.assertEqual(file_res.content, fake_pdf_content)

        # Cleanup via delete resource
        del_res = self.client.delete(f"/api/resources/{data['id']}")
        self.assertEqual(del_res.status_code, 200)
        # Verify physical file was removed
        file_path = os.path.join(str(UPLOADS_DIR), filename)
        self.assertFalse(os.path.exists(file_path))

    def test_update_resource(self):
        node_id = self._create_node("Thermodynamics")
        res = self.client.post(f"/api/nodes/{node_id}/resources", json={
            "title": "Stanford Lecture 1",
            "url": "https://stanford.edu/class/lecture1.pdf",
            "resource_type": "pdf"
        })
        self.assertEqual(res.status_code, 200)
        res_id = res.json()["id"]

        # Update
        update_res = self.client.put(f"/api/resources/{res_id}", json={
            "title": "Stanford Statistical Mechanics Notes",
            "notes": "Highly recommended for understanding partition functions."
        })
        self.assertEqual(update_res.status_code, 200)
        updated = update_res.json()
        self.assertEqual(updated["title"], "Stanford Statistical Mechanics Notes")
        self.assertIn("partition functions", updated["notes"])

    def test_cascade_delete_topic_cleans_resources_and_files(self):
        node_id = self._create_node("Quantum Physics")
        dummy_content = b"%PDF-1.4 dummy pdf"
        upload_res = self.client.post(
            f"/api/nodes/{node_id}/resources/upload",
            files={"file": ("quantum_notes.pdf", dummy_content, "application/pdf")},
            data={"title": "Quantum Physics PDF"}
        )
        self.assertEqual(upload_res.status_code, 200)
        filename = upload_res.json()["url"].split("/")[-1]
        file_path = os.path.join(str(UPLOADS_DIR), filename)
        self.assertTrue(os.path.exists(file_path))

        # Delete topic
        del_topic_res = self.client.delete(f"/api/topics/{self.topic_id}")
        self.assertEqual(del_topic_res.status_code, 200)

        # Confirm file was purged
        self.assertFalse(os.path.exists(file_path))
