import unittest
import uuid
import json
import io
import zipfile
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import (
    init_db,
    get_connection,
    delete_topic,
    now_iso,
    sync_topic_wikilinks,
    find_unlinked_mentions,
    calculate_shortest_path,
    record_spaced_repetition_review,
    get_due_reviews,
    deep_search_topic,
    export_topic_as_json,
    import_topic_from_json,
    update_edge,
    update_node_portal,
)

class DeepLinkedBackendVerificationTests(unittest.TestCase):
    """
    Comprehensive Backend Verification Suite for Brain.md deep-linked features.
    Rigorously verifies backend implementation across 11 categories:
    1. Schema & Migration Idempotency
    2. Spaced Repetition (SM-2) Logic
    3. Review Queue Endpoint
    4. Wikilink Extraction & Edge Sync
    5. Unlinked Mentions
    6. Shortest Path Knowledge Trail
    7. Cross-Topic Portal Links
    8. Deep Content Full-Text Search
    9. Edge Update Endpoint
    10. JSON Topic Export & Import
    11. Obsidian Zip Export
    """

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.created_topic_ids = []
        self.topic_id = self._create_topic("Deep Linked Verification Topic")

    def tearDown(self):
        for tid in self.created_topic_ids:
            try:
                delete_topic(tid)
            except Exception:
                pass

    def _create_topic(self, title: str, description: str = "Test Description", difficulty: str = "intermediate") -> str:
        tid = f"test-verify-{uuid.uuid4().hex[:8]}"
        conn = get_connection()
        with conn:
            conn.execute(
                "INSERT INTO topics (id, title, description, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (tid, title, description, difficulty, now_iso(), now_iso())
            )
        conn.close()
        self.created_topic_ids.append(tid)
        return tid

    def _create_node(self, title: str, content: str = "", summary: str = "", node_type: str = "concept",
                     pos_x: float = 100.0, pos_y: float = 100.0, difficulty: str = "intermediate",
                     topic_id: str = None, portal_topic_id: str = None) -> str:
        tid = topic_id or self.topic_id
        res = self.client.post("/api/nodes", json={
            "topic_id": tid,
            "title": title,
            "node_type": node_type,
            "summary": summary,
            "content": content,
            "difficulty": difficulty,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "portal_topic_id": portal_topic_id
        })
        self.assertEqual(res.status_code, 200, f"Failed to create node: {res.text}")
        return res.json()["id"]

    def _create_edge(self, source_id: str, target_id: str, relation_type: str = "related_to",
                     edge_type: str = "relates_to", label: str = "", topic_id: str = None) -> str:
        tid = topic_id or self.topic_id
        res = self.client.post("/api/edges", json={
            "topic_id": tid,
            "source_id": source_id,
            "target_id": target_id,
            "relation_type": relation_type,
            "edge_type": edge_type,
            "label": label
        })
        self.assertEqual(res.status_code, 200, f"Failed to create edge: {res.text}")
        return res.json()["id"]

    # =========================================================================
    # 1. Schema & Migration Idempotency
    # =========================================================================
    def test_01_schema_migration_idempotency_and_defaults(self):
        """
        Verify init_db() safely handles all new columns:
        - nodes: mastery_score, review_interval, ease_factor, review_due, review_count, portal_topic_id
        - edges: edge_type, label
        Also verifies repeated execution is completely idempotent and sets column defaults.
        """
        # Execute init_db multiple times consecutively to assert idempotency
        init_db()
        init_db()

        conn = get_connection()
        cursor = conn.cursor()

        # Check nodes columns
        cursor.execute("PRAGMA table_info(nodes)")
        node_cols = {r["name"]: r for r in cursor.fetchall()}
        required_node_cols = [
            "mastery_score", "review_interval", "ease_factor",
            "review_due", "review_count", "portal_topic_id"
        ]
        for col in required_node_cols:
            self.assertIn(col, node_cols, f"Column '{col}' missing from nodes table")

        # Check edges columns
        cursor.execute("PRAGMA table_info(edges)")
        edge_cols = {r["name"]: r for r in cursor.fetchall()}
        required_edge_cols = ["edge_type", "label"]
        for col in required_edge_cols:
            self.assertIn(col, edge_cols, f"Column '{col}' missing from edges table")

        # Check indices existence
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        index_names = {r["name"] for r in cursor.fetchall()}
        for idx in ["idx_nodes_review_due", "idx_nodes_portal", "idx_edges_edge_type"]:
            self.assertIn(idx, index_names, f"Index '{idx}' missing from database")

        conn.close()

        # Check that creating a new node defaults spaced repetition and portal values properly
        nid = self._create_node("Default Props Concept")
        node_res = self.client.get(f"/api/topics/{self.topic_id}").json()
        target = next(n for n in node_res["nodes"] if n["id"] == nid)
        self.assertEqual(target["mastery_score"], 0)
        self.assertEqual(target["review_interval"], 1)
        self.assertAlmostEqual(target["ease_factor"], 2.5, places=2)
        self.assertEqual(target["review_count"], 0)
        self.assertIsNone(target["portal_topic_id"])
        self.assertIsNotNone(target["review_due"])

    # =========================================================================
    # 2. Spaced Repetition (SM-2) Logic
    # =========================================================================
    def test_02_sm2_spaced_repetition_progression_and_bounds(self):
        """
        Verify SM-2 algorithm:
        - Ratings: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
        - Interval progression and ease factor formula
        - Mastery score update and decay
        - Next review due date calculation
        - Validation and bounds checking on POST /api/nodes/{node_id}/review
        """
        nid = self._create_node("SM-2 Mastery Subject")

        # Initial review 1: Rating 3 (Good)
        # Expected: repetitions=1, interval=1, ease_factor=2.5 + (0.1 - 1*(0.08+0.02)) = 2.5
        # mastery_score = int((1 / 5.0) * 70 + (2.5 / 2.5) * 30) = 14 + 30 = 44
        res1 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 3})
        self.assertEqual(res1.status_code, 200)
        d1 = res1.json()
        self.assertEqual(d1["node_id"], nid)
        self.assertEqual(d1["review_interval"], 1)
        self.assertEqual(d1["repetitions"], 1)
        self.assertAlmostEqual(d1["ease_factor"], 2.5, places=2)
        self.assertEqual(d1["mastery_score"], 44)
        self.assertEqual(d1["review_count"], 1)

        # Check review_due is ~ 1 day in future
        due_dt1 = datetime.fromisoformat(d1["review_due"])
        expected_min_1 = datetime.now(timezone.utc) + timedelta(hours=23)
        expected_max_1 = datetime.now(timezone.utc) + timedelta(hours=25)
        self.assertTrue(expected_min_1 <= due_dt1 <= expected_max_1)

        # Review 2: Rating 4 (Easy)
        # Expected: repetitions=2, interval=6, ease_factor = 2.5 + (0.1 - 0) = 2.6
        # mastery_score = int((2 / 5.0) * 70 + (2.6 / 2.5) * 30) = 28 + 31.2 = 59
        res2 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 4})
        self.assertEqual(res2.status_code, 200)
        d2 = res2.json()
        self.assertEqual(d2["review_interval"], 6)
        self.assertEqual(d2["repetitions"], 2)
        self.assertAlmostEqual(d2["ease_factor"], 2.6, places=2)
        self.assertEqual(d2["mastery_score"], 59)
        self.assertEqual(d2["review_count"], 2)

        due_dt2 = datetime.fromisoformat(d2["review_due"])
        expected_min_2 = datetime.now(timezone.utc) + timedelta(days=5, hours=23)
        expected_max_2 = datetime.now(timezone.utc) + timedelta(days=6, hours=1)
        self.assertTrue(expected_min_2 <= due_dt2 <= expected_max_2)

        # Review 3: Rating 4 (Easy)
        # Expected: repetitions=3, interval = round(6 * 2.6) = 16, ease_factor = 2.6 + 0.1 = 2.7
        res3 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 4})
        self.assertEqual(res3.status_code, 200)
        d3 = res3.json()
        self.assertEqual(d3["review_interval"], 16)
        self.assertEqual(d3["repetitions"], 3)
        self.assertAlmostEqual(d3["ease_factor"], 2.7, places=2)
        self.assertEqual(d3["review_count"], 3)
        self.assertGreater(d3["mastery_score"], d2["mastery_score"])

        # Review 4: Rating 2 (Hard)
        # rating < 3: repetitions reset to 0, interval reset to 1
        # ease_factor decreases: 2.7 + (0.1 - 2 * (0.08 + 0.04)) = 2.7 + 0.1 - 0.24 = 2.56
        # mastery_score drops by 20
        res4 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 2})
        self.assertEqual(res4.status_code, 200)
        d4 = res4.json()
        self.assertEqual(d4["review_interval"], 1)
        self.assertEqual(d4["repetitions"], 0)
        self.assertAlmostEqual(d4["ease_factor"], 2.56, places=2)
        self.assertEqual(d4["mastery_score"], d3["mastery_score"] - 20)
        self.assertEqual(d4["review_count"], 4)

        # Review 5: Rating 1 (Again)
        # rating < 3: repetitions reset to 0, interval reset to 1
        # ease_factor decreases: 2.56 + (0.1 - 3 * (0.08 + 0.06)) = 2.56 + 0.1 - 0.42 = 2.24
        # mastery_score drops by 20
        res5 = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 1})
        self.assertEqual(res5.status_code, 200)
        d5 = res5.json()
        self.assertEqual(d5["review_interval"], 1)
        self.assertEqual(d5["repetitions"], 0)
        self.assertAlmostEqual(d5["ease_factor"], 2.24, places=2)
        self.assertEqual(d5["mastery_score"], max(0, d4["mastery_score"] - 20))
        self.assertEqual(d5["review_count"], 5)

        # Ease factor lower bound clamp test (cannot drop below 1.3)
        for _ in range(10):
            res_decay = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 1})
            self.assertEqual(res_decay.status_code, 200)
        decayed = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 1}).json()
        self.assertAlmostEqual(decayed["ease_factor"], 1.3, places=2)
        self.assertEqual(decayed["mastery_score"], 0)

        # Validation tests
        # Rating 0 (invalid)
        res_low = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 0})
        self.assertIn(res_low.status_code, [400, 422])

        # Rating 5 (invalid)
        res_high = self.client.post(f"/api/nodes/{nid}/review", json={"rating": 5})
        self.assertIn(res_high.status_code, [400, 422])

        # Non-existent node (404)
        res_404 = self.client.post(f"/api/nodes/{uuid.uuid4()}/review", json={"rating": 3})
        self.assertEqual(res_404.status_code, 404)

    # =========================================================================
    # 3. Review Queue Endpoint
    # =========================================================================
    def test_03_review_queue_filtering_and_urgency_ordering(self):
        """
        Verify GET /api/topics/{topic_id}/review-queue:
        - Returns nodes where review_due <= now OR mastery_score < 100
        - Excludes nodes where review_due > now AND mastery_score == 100
        - Returns ordered by review_due ASC (due urgency)
        - Respects topic isolation
        """
        now = datetime.now(timezone.utc)
        past_2_days = (now - timedelta(days=2)).isoformat()
        past_1_hour = (now - timedelta(hours=1)).isoformat()
        future_5_days = (now + timedelta(days=5)).isoformat()
        future_20_days = (now + timedelta(days=20)).isoformat()

        # Node 1: Most overdue, low mastery
        n1 = self._create_node("Node Most Overdue")
        # Node 2: Recently overdue, medium mastery
        n2 = self._create_node("Node Recently Overdue")
        # Node 3: Future due date, but unmastered (< 100) -> must be in queue
        n3 = self._create_node("Node Future Due Unmastered")
        # Node 4: Future due date, 100% mastered -> must NOT be in queue
        n4 = self._create_node("Node Fully Mastered Future")

        # Other topic node to test isolation
        other_topic = self._create_topic("Other Isolation Topic")
        n_other = self._create_node("Other Topic Overdue Node", topic_id=other_topic)

        conn = get_connection()
        with conn:
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 30 WHERE id = ?", (past_2_days, n1))
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 60 WHERE id = ?", (past_1_hour, n2))
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 70 WHERE id = ?", (future_5_days, n3))
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 100 WHERE id = ?", (future_20_days, n4))
            conn.execute("UPDATE nodes SET review_due = ?, mastery_score = 20 WHERE id = ?", (past_2_days, n_other))
        conn.close()

        res = self.client.get(f"/api/topics/{self.topic_id}/review-queue")
        self.assertEqual(res.status_code, 200)
        queue = res.json()
        queue_ids = [n["id"] for n in queue]

        # n1, n2, n3 should be included
        self.assertIn(n1, queue_ids)
        self.assertIn(n2, queue_ids)
        self.assertIn(n3, queue_ids)

        # n4 (mastered and future) must be excluded
        self.assertNotIn(n4, queue_ids)

        # n_other (different topic) must be excluded
        self.assertNotIn(n_other, queue_ids)

        # Verify ordering: n1 (past 2 days) comes before n2 (past 1 hour), which comes before n3 (future 5 days)
        idx_n1 = queue_ids.index(n1)
        idx_n2 = queue_ids.index(n2)
        idx_n3 = queue_ids.index(n3)
        self.assertLess(idx_n1, idx_n2, "Most urgent overdue item must appear before less urgent item")
        self.assertLess(idx_n2, idx_n3, "Overdue item must appear before future item")

        # Test non-existent topic returns 404
        res_404 = self.client.get(f"/api/topics/{uuid.uuid4()}/review-queue")
        self.assertEqual(res_404.status_code, 404)

    # =========================================================================
    # 4. Wikilink Extraction & Edge Sync
    # =========================================================================
    def test_04_wikilink_extraction_types_and_edge_sync(self):
        """
        Verify sync_topic_wikilinks(topic_id) & POST /api/topics/{topic_id}/sync-wikilinks:
        - Standard links: [[Target]]
        - Alias links: [[Target|Alias]]
        - Section links: [[Target#Section]]
        - Combined links: [[Target#Section|Alias]]
        - Case-insensitivity
        - Self-link avoidance (no self-loops)
        - Non-existent target safety
        - Idempotent edge creation without duplication
        """
        target_a = self._create_node("Special Relativity")
        target_b = self._create_node("Quantum Electrodynamics")
        target_c = self._create_node("Thermodynamic Entropy")

        content = (
            "Comparing theories:\n"
            "- See standard: [[Special Relativity]]\n"
            "- See alias: [[Quantum Electrodynamics|QED]]\n"
            "- See section: [[Thermodynamic Entropy#Second Law]]\n"
            "- See section+alias: [[Special Relativity#Postulates|SR Postulates]]\n"
            "- See case-insensitive: [[quantum electrodynamics]]\n"
            "- Self link to avoid: [[Grand Unified Theory]]\n"
            "- Missing target to safely skip: [[NonExistentConceptX]]\n"
        )
        source_id = self._create_node("Grand Unified Theory", content=content)

        # Initial sync
        res = self.client.post(f"/api/topics/{self.topic_id}/sync-wikilinks")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Should add edges to target_a, target_b, target_c (total 3 unique directed edges from source_id)
        self.assertEqual(data["added_edges_count"], 3)

        # Verify edge attributes in the graph
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        wiki_edges = [e for e in graph["edges"] if e.get("edge_type") == "wikilink"]
        self.assertEqual(len(wiki_edges), 3)

        for edge in wiki_edges:
            self.assertEqual(edge["source_id"], source_id)
            self.assertEqual(edge["relation_type"], "wikilink")
            self.assertEqual(edge["label"], "wikilink")

        targets_found = {e["target_id"] for e in wiki_edges}
        self.assertEqual(targets_found, {target_a, target_b, target_c})

        # Ensure no self-loop edge was created
        self.assertNotIn(source_id, targets_found)

        # Idempotency verification: calling sync again must add 0 edges
        res_repeat = self.client.post(f"/api/topics/{self.topic_id}/sync-wikilinks")
        self.assertEqual(res_repeat.status_code, 200)
        self.assertEqual(res_repeat.json()["added_edges_count"], 0)

        # Graph should still have exactly 3 edges
        graph2 = self.client.get(f"/api/topics/{self.topic_id}").json()
        self.assertEqual(len([e for e in graph2["edges"] if e.get("edge_type") == "wikilink"]), 3)

        # Non-existent topic returns 404
        res_404 = self.client.post(f"/api/topics/{uuid.uuid4()}/sync-wikilinks")
        self.assertEqual(res_404.status_code, 404)

    # =========================================================================
    # 5. Unlinked Mentions
    # =========================================================================
    def test_05_unlinked_mentions_discovery_and_exclusion(self):
        """
        Verify find_unlinked_mentions & GET /api/nodes/{node_id}/mentions:
        - Finds nodes whose content or summary mentions the target title (case-insensitive word boundary)
        - Excludes nodes that are already connected by an edge in either direction
        - Excludes the node itself (self-mention)
        - Dynamic update: connecting an unlinked mention removes it from subsequent mentions
        """
        target_id = self._create_node("Photosynthesis")

        # Unlinked mention in content
        mention_content_id = self._create_node(
            "Chloroplast",
            content="Cellular organelles responsible for photosynthesis and energy conversion."
        )

        # Unlinked mention in summary
        mention_summary_id = self._create_node(
            "Light Spectrum",
            summary="Certain wavelengths drive photosynthesis efficiently."
        )

        # Mention, but already connected by an edge
        connected_mention_id = self._create_node(
            "Calvin Cycle",
            content="Dark reactions of Photosynthesis fixing carbon."
        )
        self._create_edge(connected_mention_id, target_id, relation_type="subtopic_of")

        # Mention of target within target itself (self-mention)
        conn = get_connection()
        with conn:
            conn.execute("UPDATE nodes SET content = 'Photosynthesis is solar energy capture.' WHERE id = ?", (target_id,))
        conn.close()

        # Node that does NOT mention target
        irrelevant_id = self._create_node("Newtonian Mechanics", content="F = m * a.")

        res = self.client.get(f"/api/nodes/{target_id}/mentions")
        self.assertEqual(res.status_code, 200)
        mentions = res.json()
        mention_node_ids = [m["node_id"] for m in mentions]

        # Valid mentions present
        self.assertIn(mention_content_id, mention_node_ids)
        self.assertIn(mention_summary_id, mention_node_ids)

        # Connected node must be excluded
        self.assertNotIn(connected_mention_id, mention_node_ids)

        # Target itself must be excluded
        self.assertNotIn(target_id, mention_node_ids)

        # Irrelevant node must be excluded
        self.assertNotIn(irrelevant_id, mention_node_ids)

        # Verify snippet content
        m_item = next(m for m in mentions if m["node_id"] == mention_content_id)
        self.assertIn("photosynthesis", m_item["snippet"].lower())

        # Now link mention_content_id to target_id and verify it disappears from mentions
        self._create_edge(target_id, mention_content_id, relation_type="affects")
        res_after_link = self.client.get(f"/api/nodes/{target_id}/mentions")
        self.assertEqual(res_after_link.status_code, 200)
        mention_ids_after = [m["node_id"] for m in res_after_link.json()]
        self.assertNotIn(mention_content_id, mention_ids_after)
        self.assertIn(mention_summary_id, mention_ids_after)

        # Non-existent node returns 404
        res_404 = self.client.get(f"/api/nodes/{uuid.uuid4()}/mentions")
        self.assertEqual(res_404.status_code, 404)

    # =========================================================================
    # 6. Shortest Path Knowledge Trail
    # =========================================================================
    def test_06_shortest_path_connected_self_and_disconnected(self):
        """
        Verify calculate_shortest_path & GET /api/topics/{topic_id}/path:
        - Connected path: discovers optimal shortest hop trail
        - BFS bidirectional/undirected graph traversal
        - Self path: source == target (found=True, length=0)
        - Disconnected path: found=False, length=0
        - Parameter aliases: source_node/target_node and source_node_id/target_node_id
        - Error handling (400 for missing params, 404 for invalid node/topic)
        """
        na = self._create_node("Node A")
        nb = self._create_node("Node B")
        nc1 = self._create_node("Node C1")
        nc2 = self._create_node("Node C2")
        nd = self._create_node("Node D")
        n_iso = self._create_node("Node Isolated")

        # Long path: A -> C1 -> C2 -> D (length 3)
        self._create_edge(na, nc1)
        self._create_edge(nc1, nc2)
        self._create_edge(nc2, nd)

        # Short path: A -> B -> D (length 2)
        e_ab = self._create_edge(na, nb)
        e_bd = self._create_edge(nb, nd)

        # Query A to D: BFS should choose the shorter path [A, B, D]
        res = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={na}&target_node={nd}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["path_length"], 2)
        self.assertEqual(data["node_ids"], [na, nb, nd])
        self.assertEqual(data["edge_ids"], [e_ab, e_bd])
        self.assertEqual(len(data["nodes"]), 3)
        self.assertEqual(len(data["edges"]), 2)

        # Reverse traversal D to A (undirected trail)
        res_rev = self.client.get(f"/api/topics/{self.topic_id}/path?source_node_id={nd}&target_node_id={na}")
        self.assertEqual(res_rev.status_code, 200)
        self.assertTrue(res_rev.json()["found"])
        self.assertEqual(res_rev.json()["path_length"], 2)
        self.assertEqual(res_rev.json()["node_ids"], [nd, nb, na])

        # Self path (A to A)
        res_self = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={na}&target_node={na}")
        self.assertEqual(res_self.status_code, 200)
        data_self = res_self.json()
        self.assertTrue(data_self["found"])
        self.assertEqual(data_self["path_length"], 0)
        self.assertEqual(data_self["node_ids"], [na])
        self.assertEqual(data_self["edge_ids"], [])

        # Disconnected path (A to Isolated)
        res_dis = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={na}&target_node={n_iso}")
        self.assertEqual(res_dis.status_code, 200)
        data_dis = res_dis.json()
        self.assertFalse(data_dis["found"])
        self.assertEqual(data_dis["path_length"], 0)
        self.assertEqual(data_dis["node_ids"], [])
        self.assertEqual(data_dis["edge_ids"], [])

        # Error cases: Missing query params (400)
        res_bad_param = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={na}")
        self.assertEqual(res_bad_param.status_code, 400)

        # Node not in topic (404)
        other_topic = self._create_topic("Path Other Topic")
        other_node = self._create_node("Other Node", topic_id=other_topic)
        res_mismatch = self.client.get(f"/api/topics/{self.topic_id}/path?source_node={na}&target_node={other_node}")
        self.assertEqual(res_mismatch.status_code, 404)

        # Topic not found (404)
        res_404_topic = self.client.get(f"/api/topics/{uuid.uuid4()}/path?source_node={na}&target_node={nb}")
        self.assertEqual(res_404_topic.status_code, 404)

    # =========================================================================
    # 7. Cross-Topic Portal Links
    # =========================================================================
    def test_07_cross_topic_portal_links(self):
        """
        Verify POST /api/nodes/{node_id}/link-topic:
        - Sets portal_topic_id via JSON body
        - Sets portal_topic_id via query param
        - Clears portal link when portal_topic_id is None/null
        - Validates target topic exists (404 on invalid target)
        - Validates node exists (404 on invalid node)
        - Full graph query accurately includes portal_topic_id
        """
        portal_destination = self._create_topic("Cosmology Portal Destination")
        portal_node = self._create_node("Wormhole / Portal Node")

        # 1. Set portal via JSON payload
        res = self.client.post(f"/api/nodes/{portal_node}/link-topic", json={"portal_topic_id": portal_destination})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["portal_topic_id"], portal_destination)
        self.assertEqual(data["node"]["portal_topic_id"], portal_destination)

        # Verify in full graph
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        fetched_node = next(n for n in graph["nodes"] if n["id"] == portal_node)
        self.assertEqual(fetched_node["portal_topic_id"], portal_destination)

        # 2. Clear portal link
        res_clear = self.client.post(f"/api/nodes/{portal_node}/link-topic", json={"portal_topic_id": None})
        self.assertEqual(res_clear.status_code, 200)
        self.assertIsNone(res_clear.json()["portal_topic_id"])

        graph_cleared = self.client.get(f"/api/topics/{self.topic_id}").json()
        fetched_cleared = next(n for n in graph_cleared["nodes"] if n["id"] == portal_node)
        self.assertIsNone(fetched_cleared["portal_topic_id"])

        # 3. Set portal via query param
        res_query = self.client.post(f"/api/nodes/{portal_node}/link-topic?portal_topic_id={portal_destination}")
        self.assertEqual(res_query.status_code, 200)
        self.assertEqual(res_query.json()["portal_topic_id"], portal_destination)

        # 4. Error: Non-existent destination topic returns 404
        fake_topic_id = str(uuid.uuid4())
        res_bad_dest = self.client.post(f"/api/nodes/{portal_node}/link-topic", json={"portal_topic_id": fake_topic_id})
        self.assertEqual(res_bad_dest.status_code, 404)

        # 5. Error: Non-existent source node returns 404
        res_bad_node = self.client.post(f"/api/nodes/{uuid.uuid4()}/link-topic", json={"portal_topic_id": portal_destination})
        self.assertEqual(res_bad_node.status_code, 404)

    # =========================================================================
    # 8. Deep Content Full-Text Search
    # =========================================================================
    def test_08_deep_content_full_text_search(self):
        """
        Verify deep_search_topic & GET /api/topics/{topic_id}/search?q=...:
        Matches in:
        - Title (hit_type: 'title')
        - Content (hit_type: 'content')
        - Summary (hit_type: 'content')
        - Tags (hit_type: 'tag')
        - Inquiries question & answer (hit_type: 'inquiry')
        - Quizzes question & explanation (hit_type: 'quiz')
        Validates snippets, hit_types, scores, case-insensitivity, and 404 handling.
        """
        n_title = self._create_node("Differential Geometry Foundations")
        n_content = self._create_node("Manifold Theory", content="In Riemannian manifolds, geodesics represent shortest paths.")
        n_summary = self._create_node("Exterior Calculus", summary="Comprehensive treatment of differential forms and Stokes theorem.")

        # Add node with tags in metadata_json
        conn = get_connection()
        n_tagged = str(uuid.uuid4())
        now = now_iso()
        with conn:
            conn.execute(
                """INSERT INTO nodes (id, topic_id, title, node_type, metadata_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (n_tagged, self.topic_id, "Symplectic Forms", "concept", json.dumps({"tags": ["hamiltonian-mechanics"]}), now, now)
            )

            # Add inquiry with question and answer
            inq_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO inquiries (id, node_id, topic_id, question, answer, difficulty, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (inq_id, n_title, self.topic_id, "What is a Christoffel symbol?", "Levi-Civita connection coefficients in local coordinates.", "advanced", now)
            )

            # Add quiz with question and explanation
            quiz_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO quizzes (id, node_id, topic_id, question, options_json, correct_index, explanation, difficulty, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (quiz_id, n_title, self.topic_id, "Which tensor describes curvature?", json.dumps(["Riemann", "Ricci", "Weyl", "Metric"]), 0, "The Riemann curvature tensor measures deviation from flat space.", "advanced", now)
            )
        conn.close()

        # 1. Search Title: "Geometry"
        res_title = self.client.get(f"/api/topics/{self.topic_id}/search?q=Geometry")
        self.assertEqual(res_title.status_code, 200)
        hits = res_title.json()
        self.assertTrue(any(h["hit_type"] == "title" and h["node_id"] == n_title for h in hits))

        # 2. Search Content: "geodesics" (case-insensitive)
        res_content = self.client.get(f"/api/topics/{self.topic_id}/search?q=GEODESICS")
        self.assertEqual(res_content.status_code, 200)
        hits_c = res_content.json()
        match_c = next((h for h in hits_c if h["hit_type"] == "content" and h["node_id"] == n_content), None)
        self.assertIsNotNone(match_c)
        self.assertIn("geodesics", match_c["snippet"].lower())

        # 3. Search Summary: "differential forms"
        res_sum = self.client.get(f"/api/topics/{self.topic_id}/search?q=differential forms")
        self.assertEqual(res_sum.status_code, 200)
        hits_s = res_sum.json()
        match_s = next((h for h in hits_s if h["hit_type"] == "content" and h["node_id"] == n_summary), None)
        self.assertIsNotNone(match_s)

        # 4. Search Tag: "hamiltonian-mechanics"
        res_tag = self.client.get(f"/api/topics/{self.topic_id}/search?q=hamiltonian")
        self.assertEqual(res_tag.status_code, 200)
        hits_tag = res_tag.json()
        match_tag = next((h for h in hits_tag if h["hit_type"] == "tag" and h["node_id"] == n_tagged), None)
        self.assertIsNotNone(match_tag)

        # 5. Search Inquiry: "Christoffel" (in question) and "Levi-Civita" (in answer)
        res_inq_q = self.client.get(f"/api/topics/{self.topic_id}/search?q=Christoffel")
        self.assertEqual(res_inq_q.status_code, 200)
        self.assertTrue(any(h["hit_type"] == "inquiry" for h in res_inq_q.json()))

        res_inq_a = self.client.get(f"/api/topics/{self.topic_id}/search?q=Levi-Civita")
        self.assertEqual(res_inq_a.status_code, 200)
        self.assertTrue(any(h["hit_type"] == "inquiry" for h in res_inq_a.json()))

        # 6. Search Quiz: "curvature" (in question) and "deviation" (in explanation)
        res_quiz_q = self.client.get(f"/api/topics/{self.topic_id}/search?q=curvature")
        self.assertEqual(res_quiz_q.status_code, 200)
        self.assertTrue(any(h["hit_type"] == "quiz" for h in res_quiz_q.json()))

        res_quiz_e = self.client.get(f"/api/topics/{self.topic_id}/search?q=deviation")
        self.assertEqual(res_quiz_e.status_code, 200)
        self.assertTrue(any(h["hit_type"] == "quiz" for h in res_quiz_e.json()))

        # Non-existent topic returns 404
        res_404 = self.client.get(f"/api/topics/{uuid.uuid4()}/search?q=Geometry")
        self.assertEqual(res_404.status_code, 404)

        # Empty query validation returns 422
        res_empty = self.client.get(f"/api/topics/{self.topic_id}/search?q=")
        self.assertIn(res_empty.status_code, [400, 422])

    # =========================================================================
    # 9. Edge Update Endpoint
    # =========================================================================
    def test_09_edge_update_endpoint(self):
        """
        Verify PUT /api/edges/{edge_id}:
        - Updates edge_type, label, and relation_type
        - Verifies persistence in database and full graph payload
        - Verifies partial update fields
        - 404 on non-existent edge
        """
        n1 = self._create_node("Edge Source Node")
        n2 = self._create_node("Edge Target Node")
        edge_id = self._create_edge(n1, n2, relation_type="related_to", edge_type="relates_to", label="Initial")

        # Full update
        res = self.client.put(f"/api/edges/{edge_id}", json={
            "edge_type": "prerequisite_for",
            "label": "Strong Prerequisite",
            "relation_type": "prerequisite_for"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], edge_id)
        self.assertEqual(data["edge_type"], "prerequisite_for")
        self.assertEqual(data["label"], "Strong Prerequisite")
        self.assertEqual(data["relation_type"], "prerequisite_for")

        # Verify in full graph
        graph = self.client.get(f"/api/topics/{self.topic_id}").json()
        edge_fetched = next(e for e in graph["edges"] if e["id"] == edge_id)
        self.assertEqual(edge_fetched["edge_type"], "prerequisite_for")
        self.assertEqual(edge_fetched["label"], "Strong Prerequisite")

        # Partial update: update only label
        res_partial = self.client.put(f"/api/edges/{edge_id}", json={
            "label": "Refined Prerequisite Label"
        })
        self.assertEqual(res_partial.status_code, 200)
        data_part = res_partial.json()
        self.assertEqual(data_part["edge_type"], "prerequisite_for")
        self.assertEqual(data_part["label"], "Refined Prerequisite Label")

        # Non-existent edge returns 404
        res_404 = self.client.put(f"/api/edges/{uuid.uuid4()}", json={"label": "Invalid"})
        self.assertEqual(res_404.status_code, 404)

    # =========================================================================
    # 10. JSON Topic Export & Import
    # =========================================================================
    def test_10_json_topic_export_import_fidelity_and_remapping(self):
        """
        Verify GET /api/topics/{topic_id}/export/json & POST /api/topics/import/json:
        - Export contains complete schema: topic, nodes, edges, quizzes, inquiries, version, exported_at
        - Import creates new topic with UUID conflict remapping
        - All foreign keys (parent_node_id, edge source/target, quiz node_id, inq node_id) remapped correctly
        - Full data fidelity of nodes, edges, quizzes, and inquiries
        - 404 on export non-existent, 400 on import invalid payload
        """
        # Build comprehensive graph
        n_parent = self._create_node("Root Classical Mechanics", summary="Newtonian laws", difficulty="beginner")
        n_child = self._create_node("Lagrangian Formulation", content="L = T - V", summary="Analytical mechanics", difficulty="advanced")
        portal_dest = self._create_topic("Import Test Portal Target")
        n_portal = self._create_node("Hamiltonian Optics", portal_topic_id=portal_dest)

        edge_1 = self._create_edge(n_parent, n_child, relation_type="decomposes_into", edge_type="decomposes_into", label="Analytical step")
        edge_2 = self._create_edge(n_child, n_portal, relation_type="related_to", edge_type="wikilink", label="Wave connection")

        # Set parent_node_id on n_child
        conn = get_connection()
        now = now_iso()
        with conn:
            conn.execute("UPDATE nodes SET parent_node_id = ? WHERE id = ?", (n_parent, n_child))

            # Add quiz
            quiz_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO quizzes (id, node_id, topic_id, question, options_json, correct_index, explanation, difficulty, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (quiz_id, n_child, self.topic_id, "What is the Lagrangian?", json.dumps(["T - V", "T + V", "p * q", "H - L"]), 0, "L is kinetic minus potential energy.", "advanced", now)
            )

            # Add inquiry
            inq_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO inquiries (id, node_id, topic_id, question, answer, difficulty, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (inq_id, n_child, self.topic_id, "Why use Generalized Coordinates?", "To eliminate constraint forces effortlessly.", "advanced", now)
            )
        conn.close()

        # 1. Export topic JSON
        res_exp = self.client.get(f"/api/topics/{self.topic_id}/export/json")
        self.assertEqual(res_exp.status_code, 200)
        export_payload = res_exp.json()

        self.assertIn("topic", export_payload)
        self.assertIn("nodes", export_payload)
        self.assertIn("edges", export_payload)
        self.assertIn("quizzes", export_payload)
        self.assertIn("inquiries", export_payload)
        self.assertEqual(len(export_payload["nodes"]), 3)
        self.assertEqual(len(export_payload["edges"]), 2)
        self.assertEqual(len(export_payload["quizzes"]), 1)
        self.assertEqual(len(export_payload["inquiries"]), 1)

        # 2. Import topic JSON
        res_imp = self.client.post("/api/topics/import/json", json=export_payload)
        self.assertEqual(res_imp.status_code, 200)
        imp_result = res_imp.json()
        self.assertTrue(imp_result["success"])
        new_topic_id = imp_result["topic_id"]
        self.created_topic_ids.append(new_topic_id)
        self.assertNotEqual(new_topic_id, self.topic_id)

        # 3. Verify complete fidelity and UUID remapping
        new_graph = self.client.get(f"/api/topics/{new_topic_id}").json()
        new_nodes = new_graph["nodes"]
        new_edges = new_graph["edges"]
        new_quizzes = new_graph["quizzes"]
        new_inquiries = new_graph["inquiries"]

        self.assertEqual(len(new_nodes), 3)
        self.assertEqual(len(new_edges), 2)
        self.assertEqual(len(new_quizzes), 1)
        self.assertEqual(len(new_inquiries), 1)

        # Node IDs must be remapped (none of the old IDs should exist in new_nodes)
        old_node_ids = {n_parent, n_child, n_portal}
        new_node_ids = {n["id"] for n in new_nodes}
        self.assertEqual(len(old_node_ids.intersection(new_node_ids)), 0, "Node IDs must be remapped to new UUIDs")

        # Map by title to verify content & parent remapping
        new_nodes_by_title = {n["title"]: n for n in new_nodes}
        imp_parent = new_nodes_by_title["Root Classical Mechanics"]
        imp_child = new_nodes_by_title["Lagrangian Formulation"]
        imp_portal = new_nodes_by_title["Hamiltonian Optics"]

        self.assertEqual(imp_child["parent_node_id"], imp_parent["id"], "parent_node_id must be remapped to new parent UUID")
        self.assertEqual(imp_child["content"], "L = T - V")
        self.assertEqual(imp_child["difficulty"], "advanced")
        self.assertEqual(imp_portal["portal_topic_id"], portal_dest)

        # Edges remapping verification
        for edge in new_edges:
            self.assertEqual(edge["topic_id"], new_topic_id)
            self.assertIn(edge["source_id"], new_node_ids)
            self.assertIn(edge["target_id"], new_node_ids)

        # Verify edge 1 (parent -> child)
        e1_pair = (imp_parent["id"], imp_child["id"])
        self.assertTrue(any(e["source_id"] == e1_pair[0] and e["target_id"] == e1_pair[1] for e in new_edges))

        # Verify quiz remapped to new child node
        imp_quiz = new_quizzes[0]
        self.assertEqual(imp_quiz["node_id"], imp_child["id"], "Quiz node_id must be remapped to new child UUID")
        self.assertEqual(imp_quiz["topic_id"], new_topic_id)
        self.assertIn("Lagrangian", imp_quiz["question"])

        # Verify inquiry remapped to new child node
        imp_inq = new_inquiries[0]
        self.assertEqual(imp_inq["node_id"], imp_child["id"], "Inquiry node_id must be remapped to new child UUID")
        self.assertEqual(imp_inq["topic_id"], new_topic_id)
        self.assertIn("Generalized Coordinates", imp_inq["question"])

        # Error cases: Export non-existent topic (404)
        res_bad_exp = self.client.get(f"/api/topics/{uuid.uuid4()}/export/json")
        self.assertEqual(res_bad_exp.status_code, 404)

        # Error cases: Import empty payload (400)
        res_bad_imp = self.client.post("/api/topics/import/json", json={})
        self.assertEqual(res_bad_imp.status_code, 400)

    # =========================================================================
    # 11. Obsidian Zip Export
    # =========================================================================
    def test_11_obsidian_zip_export_structure_and_frontmatter(self):
        """
        Verify GET /api/topics/{topic_id}/export/obsidian:
        - Returns valid zip archive with application/zip Content-Type
        - Archive contains 00_Index_{title}.md and node markdown files
        - Index file contains YAML frontmatter and list of concepts
        - Node files contain YAML frontmatter (title, type, difficulty, created, tags)
        - Node files contain ## Connected Knowledge section with incoming & outgoing wikilinks
        - Title sanitization: handles slashes in titles gracefully without breaking zip hierarchy
        - 404 on non-existent topic
        """
        # Create nodes with slash in title to test sanitization
        n1 = self._create_node("Quantum / Wave Mechanics", content="Fundamental wave-particle duality.", difficulty="advanced")
        n2 = self._create_node("Schrödinger Equation", content="i hbar d/dt Psi = H Psi.", difficulty="expert")
        self._create_edge(n1, n2, relation_type="prerequisite_for", label="Mathematical Formulation")

        res = self.client.get(f"/api/topics/{self.topic_id}/export/obsidian")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "application/zip")
        self.assertIn("attachment; filename=", res.headers.get("content-disposition", ""))

        # Read zip stream
        zip_bytes = io.BytesIO(res.content)
        with zipfile.ZipFile(zip_bytes, "r") as zf:
            file_list = zf.namelist()
            self.assertGreaterEqual(len(file_list), 3)

            # Check Index file
            index_file = next((f for f in file_list if "00_Index_" in f), None)
            self.assertIsNotNone(index_file, "Obsidian zip must contain an index markdown file")

            index_content = zf.read(index_file).decode("utf-8")
            self.assertTrue(index_content.startswith("---"))
            self.assertIn("tags: [knowledge-graph, obsidian-vault]", index_content)
            self.assertIn("[[Quantum / Wave Mechanics]]", index_content)
            self.assertIn("[[Schrödinger Equation]]", index_content)

            # Check sanitized node files
            sanitized_name = "Quantum - Wave Mechanics.md"
            node_file = next((f for f in file_list if sanitized_name in f), None)
            self.assertIsNotNone(node_file, f"Sanitized note '{sanitized_name}' must exist in zip archive")

            node_content = zf.read(node_file).decode("utf-8")
            # Verify YAML frontmatter
            self.assertTrue(node_content.startswith("---"))
            self.assertIn('title: "Quantum / Wave Mechanics"', node_content)
            self.assertIn('type: "concept"', node_content)
            self.assertIn('difficulty: "advanced"', node_content)
            self.assertIn("tags: [knowledge-graph, concept]", node_content)

            # Verify connected knowledge wikilinks
            self.assertIn("## Connected Knowledge", node_content)
            self.assertIn("[[Schrödinger Equation]]", node_content)

            # Check target node file
            target_node_file = next((f for f in file_list if "Schrödinger Equation.md" in f), None)
            self.assertIsNotNone(target_node_file)
            target_content = zf.read(target_node_file).decode("utf-8")
            self.assertIn("Prerequisites & Influences", target_content)
            self.assertIn("[[Quantum / Wave Mechanics]]", target_content)

        # 404 for non-existent topic
        res_404 = self.client.get(f"/api/topics/{uuid.uuid4()}/export/obsidian")
        self.assertEqual(res_404.status_code, 404)


if __name__ == "__main__":
    unittest.main()
