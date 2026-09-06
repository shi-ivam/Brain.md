import unittest
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    save_slides_for_node,
    get_slides_for_node,
    delete_slides_for_node,
)
from backend.app.slides_export import build_pptx_deck, build_html_presentation
from backend.app.schemas import SlideDeckResult, SlideItem

client = TestClient(app)

class TestSlides(unittest.TestCase):
    def setUp(self):
        init_db()
        self.conn = get_connection()
        # Create test topic and node
        self.topic_id = "test-topic-slides-123"
        self.node_id = "test-node-slides-456"
        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
            self.conn.execute(
                "INSERT INTO topics (id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (self.topic_id, "Test Slides Topic", "advanced", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )
            self.conn.execute(
                "INSERT INTO nodes (id, topic_id, title, node_type, summary, content, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (self.node_id, self.topic_id, "Stochastic Calculus", "concept", "Test summary", "# Note content", "advanced", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )

    def tearDown(self):
        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
        self.conn.close()

    def test_database_slides_crud(self):
        slides_data = [
            {
                "title": "Slide 1",
                "slide_type": "title",
                "subtitle": "Overview",
                "bullets": ["Point A", "Point B"],
                "speaker_notes": "Note 1",
            },
            {
                "title": "Slide 2",
                "slide_type": "math",
                "bullets": ["Point C"],
                "formula": "d X = a dt + b dW",
                "callout": "Theorem 1",
                "speaker_notes": "Note 2",
                "quick_check": "Check 1",
            }
        ]

        # Save
        saved = save_slides_for_node(self.node_id, self.topic_id, "Stochastic Calculus Deck", slides_data)
        self.assertIsNotNone(saved)
        self.assertEqual(saved["deck_title"], "Stochastic Calculus Deck")
        self.assertEqual(len(saved["slides"]), 2)

        # Get
        fetched = get_slides_for_node(self.node_id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["deck_title"], "Stochastic Calculus Deck")
        self.assertEqual(len(fetched["slides"]), 2)
        self.assertEqual(fetched["slides"][1]["formula"], "d X = a dt + b dW")

        # Delete
        deleted = delete_slides_for_node(self.node_id)
        self.assertTrue(deleted)
        self.assertIsNone(get_slides_for_node(self.node_id))

    def test_pptx_and_html_generation(self):
        sample_slides = [
            {
                "title": "Foundations",
                "slide_type": "concept",
                "subtitle": "Physical intuition",
                "bullets": ["Continuous paths", "Gaussian distribution", "Markov property"],
                "formula": "E[X_t] = 0",
                "callout": "Key property: Martingale",
                "speaker_notes": "Explain why the expected value is zero over all time.",
                "quick_check": "Why is it nowhere differentiable?",
            }
        ]

        pptx_bytes = build_pptx_deck("Foundations of Stochastic Calculus", sample_slides)
        self.assertGreater(len(pptx_bytes), 5000)
        # Verify PK zip header of .pptx
        self.assertTrue(pptx_bytes.startswith(b"PK"))

        html_str = build_html_presentation("Foundations of Stochastic Calculus", sample_slides)
        self.assertIn("<!DOCTYPE html>", html_str)
        self.assertIn("Foundations of Stochastic Calculus", html_str)
        self.assertIn("Continuous paths", html_str)
        self.assertIn("E[X_t] = 0", html_str)

    def test_api_endpoints_flow(self):
        # 1. 404 when slides not yet generated
        res = client.get(f"/api/nodes/{self.node_id}/slides")
        self.assertEqual(res.status_code, 404)

        # 2. Mock AI generation
        mock_deck = SlideDeckResult(
            concept_title="Stochastic Calculus",
            deck_title="Stochastic Calculus Mastery",
            slides=[
                SlideItem(
                    title="Introduction",
                    slide_type="title",
                    subtitle="Overview",
                    bullets=["Point 1", "Point 2"],
                    speaker_notes="Introductory speaker notes",
                )
            ]
        )

        with patch("backend.app.ai_service.generate_study_slides", return_value=mock_deck):
            post_res = client.post(f"/api/nodes/{self.node_id}/slides/generate", json={"force_refresh": True})
            self.assertEqual(post_res.status_code, 200)
            data = post_res.json()
            self.assertEqual(data["deck_title"], "Stochastic Calculus Mastery")
            self.assertEqual(len(data["slides"]), 1)

        # 3. GET slides returns the cached deck
        get_res = client.get(f"/api/nodes/{self.node_id}/slides")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["deck_title"], "Stochastic Calculus Mastery")

        # 4. Download PPTX
        dl_pptx = client.get(f"/api/nodes/{self.node_id}/slides/download?format=pptx")
        self.assertEqual(dl_pptx.status_code, 200)
        self.assertEqual(
            dl_pptx.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
        self.assertIn("attachment; filename=", dl_pptx.headers["content-disposition"])
        self.assertTrue(dl_pptx.content.startswith(b"PK"))

        # 5. Download HTML
        dl_html = client.get(f"/api/nodes/{self.node_id}/slides/download?format=html")
        self.assertEqual(dl_html.status_code, 200)
        self.assertEqual(dl_html.headers["content-type"], "text/html; charset=utf-8")
        self.assertIn("<!DOCTYPE html>", dl_html.text)
        self.assertIn("Stochastic Calculus Mastery", dl_html.text)

if __name__ == "__main__":
    unittest.main()
