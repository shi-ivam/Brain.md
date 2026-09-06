import unittest
import json
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    save_visualizations_for_node,
    get_visualizations_for_node,
    get_visualization_by_id,
    create_visualization,
    update_visualization,
    delete_visualization,
    delete_visualizations_for_node,
    get_full_graph,
)
from backend.app.schemas import VisualizationBatchResult, VisualizationItem, VisualizationSuggestionItem
from backend.app.ai_service import (
    clean_mermaid_code,
    clean_html_code,
    build_fallback_visualizations,
    generate_node_visualizations,
    suggest_node_visualizations,
)

client = TestClient(app)

class TestVisualizations(unittest.TestCase):
    def setUp(self):
        init_db()
        self.conn = get_connection()
        self.topic_id = "test-topic-vis-101"
        self.node_id = "test-node-vis-202"
        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
            self.conn.execute(
                "INSERT INTO topics (id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (self.topic_id, "Test Visualization Topic", "intermediate", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )
            self.conn.execute(
                "INSERT INTO nodes (id, topic_id, title, node_type, summary, content, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (self.node_id, self.topic_id, "Backpropagation", "concept", "Gradient computation", "# Backpropagation Notes", "intermediate", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z")
            )

    def tearDown(self):
        with self.conn:
            self.conn.execute("DELETE FROM topics WHERE id = ?", (self.topic_id,))
        self.conn.close()

    def test_clean_mermaid_and_html_code(self):
        self.assertEqual(clean_mermaid_code("```mermaid\nflowchart TD\nA-->B\n```"), "flowchart TD\nA-->B")
        self.assertEqual(clean_mermaid_code("```\nflowchart TD\nA-->B\n```"), "flowchart TD\nA-->B")
        self.assertEqual(clean_mermaid_code("flowchart TD\nA-->B"), "flowchart TD\nA-->B")
        self.assertEqual(clean_mermaid_code(""), "")
        self.assertEqual(clean_html_code("```html\n<!DOCTYPE html><html><body>Test</body></html>\n```"), "<!DOCTYPE html><html><body>Test</body></html>")

    def test_fallback_visualizations(self):
        sim_batch = build_fallback_visualizations("Backpropagation", "Gradient descent algorithm", "simulation")
        self.assertEqual(sim_batch.concept_title, "Backpropagation")
        self.assertEqual(len(sim_batch.visualizations), 1)
        self.assertEqual(sim_batch.visualizations[0].visualization_type, "simulation")
        self.assertEqual(sim_batch.visualizations[0].format, "html")
        self.assertIn("<!DOCTYPE html>", sim_batch.visualizations[0].code)
        self.assertIn("canvas", sim_batch.visualizations[0].code)

        flow_batch = build_fallback_visualizations("Backpropagation", "Gradient descent algorithm", "flowchart")
        self.assertEqual(len(flow_batch.visualizations), 1)
        self.assertEqual(flow_batch.visualizations[0].visualization_type, "flowchart")
        self.assertEqual(flow_batch.visualizations[0].format, "mermaid")

    def test_database_crud(self):
        data = [
            {
                "title": "Dataflow Graph",
                "visualization_type": "flowchart",
                "code": "flowchart TD\nA-->B",
                "description": "Forward pass",
                "explanation": "Explains forward pass",
            },
            {
                "title": "Taxonomy Mindmap",
                "visualization_type": "mindmap",
                "code": "mindmap\n  root((Root))",
                "description": "Hierarchical view",
                "explanation": "Explains taxonomy",
            }
        ]
        saved = save_visualizations_for_node(self.node_id, self.topic_id, data)
        self.assertEqual(len(saved), 2)
        vis1_id = saved[0]["id"]

        fetched = get_visualizations_for_node(self.node_id)
        self.assertEqual(len(fetched), 2)

        single = get_visualization_by_id(vis1_id)
        self.assertIsNotNone(single)
        self.assertEqual(single["title"], "Dataflow Graph")

        # Update
        updated = update_visualization(vis1_id, title="Updated Dataflow Graph", code="flowchart LR\nA-->B")
        self.assertEqual(updated["title"], "Updated Dataflow Graph")
        self.assertEqual(updated["code"], "flowchart LR\nA-->B")

        # Create single
        new_item = create_visualization(self.node_id, self.topic_id, {
            "title": "State Lifecycle",
            "visualization_type": "state",
            "code": "stateDiagram-v2\n[*]-->Ready",
        })
        self.assertEqual(new_item["visualization_type"], "state")

        # Verify get_full_graph includes visualizations
        fg = get_full_graph(self.topic_id)
        self.assertIn("visualizations", fg)
        self.assertEqual(len(fg["visualizations"]), 3)

        # Delete single
        del_res = delete_visualization(vis1_id)
        self.assertTrue(del_res)
        self.assertIsNone(get_visualization_by_id(vis1_id))

        # Delete all for node
        del_all = delete_visualizations_for_node(self.node_id)
        self.assertTrue(del_all)
        self.assertEqual(len(get_visualizations_for_node(self.node_id)), 0)

    def test_api_endpoints_flow(self):
        # 1. Initially empty
        res = client.get(f"/api/nodes/{self.node_id}/visualizations")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])

        # 2. Mock AI generation
        mock_result = VisualizationBatchResult(
            concept_title="Backpropagation",
            visualizations=[
                VisualizationItem(
                    title="Gradient Flowchart",
                    visualization_type="flowchart",
                    code="flowchart TD\nA-->B",
                    description="Calculates gradients",
                    explanation="Chain rule details",
                    format="mermaid"
                )
            ]
        )

        with patch("backend.app.ai_service.generate_node_visualizations", return_value=mock_result):
            post_res = client.post(
                f"/api/nodes/{self.node_id}/visualizations/generate",
                json={"force_refresh": True, "visualization_type": "flowchart"}
            )
            self.assertEqual(post_res.status_code, 200)
            vis_list = post_res.json()
            self.assertEqual(len(vis_list), 1)
            vis_id = vis_list[0]["id"]
            self.assertEqual(vis_list[0]["title"], "Gradient Flowchart")

        # 3. GET single visualization
        get_res = client.get(f"/api/visualizations/{vis_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["title"], "Gradient Flowchart")

        # 4. PUT update visualization
        put_res = client.put(f"/api/visualizations/{vis_id}", json={
            "title": "Custom Gradient Flow",
            "code": "flowchart LR\nX-->Y"
        })
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.json()["title"], "Custom Gradient Flow")

        # 5. Export endpoint (markdown & raw)
        exp_md = client.get(f"/api/visualizations/{vis_id}/export?format=markdown")
        self.assertEqual(exp_md.status_code, 200)
        self.assertIn("```mermaid", exp_md.text)
        self.assertIn("Custom Gradient Flow", exp_md.text)

        exp_raw = client.get(f"/api/visualizations/{vis_id}/export?format=raw")
        self.assertEqual(exp_raw.status_code, 200)
        self.assertEqual(exp_raw.text, "flowchart LR\nX-->Y")

        # 6. Manual creation
        man_res = client.post(f"/api/nodes/{self.node_id}/visualizations", json={
            "title": "Manual Sequence Diagram",
            "visualization_type": "sequence",
            "code": "sequenceDiagram\nAlice->>Bob: Hello",
            "description": "Handcrafted diagram"
        })
        self.assertEqual(man_res.status_code, 200)
        man_id = man_res.json()["id"]

        # 7. DELETE single visualization
        del_res = client.delete(f"/api/visualizations/{vis_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["deleted"])

        # 8. 404 on deleted
        get_deleted = client.get(f"/api/visualizations/{vis_id}")
        self.assertEqual(get_deleted.status_code, 404)

    def test_suggestions_endpoint(self):
        res = client.get(f"/api/nodes/{self.node_id}/visualizations/suggest")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["node_id"], self.node_id)
        self.assertIn("suggestions", data)
        self.assertGreaterEqual(len(data["suggestions"]), 2)
        first = data["suggestions"][0]
        self.assertIn("title", first)
        self.assertIn("description", first)
        self.assertIn("prompt", first)

    def test_html_simulation_export(self):
        # Create an interactive html simulation
        man_res = client.post(f"/api/nodes/{self.node_id}/visualizations", json={
            "title": "Interactive Gradient Descent Lab",
            "visualization_type": "simulation",
            "format": "html",
            "code": "<!DOCTYPE html><html><body><canvas id='c'></canvas></body></html>",
            "description": "2D contour gradient simulation"
        })
        self.assertEqual(man_res.status_code, 200)
        vis_id = man_res.json()["id"]

        # Export as html
        exp_html = client.get(f"/api/visualizations/{vis_id}/export?format=html")
        self.assertEqual(exp_html.status_code, 200)
        self.assertEqual(exp_html.headers["content-type"], "text/html; charset=utf-8")
        self.assertIn("<!DOCTYPE html>", exp_html.text)

if __name__ == "__main__":
    unittest.main()
