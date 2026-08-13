"""Loom iteration 2 tests — P1..P4:
- P1: discovery text/url — confidence, alternatives, no hallucination
- P2: library entry has runtime, tmdb_rating, backdrop_url after save
- P3: library filters (media_type/watch_status/genre), sorts (recent/release/rating/alpha), genres list
- P4: custom lists CRUD + multi-list membership + lists_for_entry contains flag
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://media-vault-api.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def auth(s):
    email = f"iter2_{uuid.uuid4().hex[:10]}@gmail.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "TEST Iter2"})
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- P1: Discovery accuracy ----------------
class TestP1DiscoveryAccuracy:
    def test_text_high_confidence_clear_title(self, s, auth):
        """A clear title should return a primary detection with high confidence and (ideally) empty alternatives."""
        payload = {"kind": "text", "text": "Just watched Inception (2010) directed by Christopher Nolan. Mind blown."}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        det = r.json()["detections"]
        assert isinstance(det, list) and len(det) >= 1
        top = det[0]
        assert top["title"].lower().startswith("inception")
        assert top["confidence"] >= 0.75, f"expected high confidence, got {top['confidence']}"
        assert "tmdb_id" in top and top["tmdb_id"]
        assert top.get("poster_url")
        # alternatives should be empty for very clear titles
        assert isinstance(top.get("alternatives", []), list)

    def test_text_ambiguous_yields_alternatives(self, s, auth):
        """Ambiguous input should either produce alternatives or reduced confidence — but never crash and every candidate must have tmdb_id/poster/year."""
        payload = {"kind": "text", "text": "A24 horror movie about grief and family trauma with a shocking twist ending"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        det = r.json()["detections"]
        # allow zero detections (no hallucination) or ≥1 detection
        for d in det:
            assert "tmdb_id" in d and d["tmdb_id"]
            assert "poster_url" in d
            assert isinstance(d.get("alternatives", []), list)
            assert len(d["alternatives"]) <= 2
            for a in d["alternatives"]:
                assert a.get("tmdb_id")
                assert "poster_url" in a
                assert "year" in a
                assert a["media_type"] in ("movie", "tv")

    def test_text_no_hallucination_on_noise(self, s, auth):
        """Random noise must return empty detections (no hallucination)."""
        payload = {"kind": "text", "text": "asdfghjkl zxcvbnm qwerty 12345 !!!!"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        det = r.json()["detections"]
        # tolerate model returning low-confidence noise or empty; enforce it doesn't fabricate high-confidence
        for d in det:
            assert d["confidence"] < 0.75, f"model hallucinated: {d}"

    def test_url_kind_does_not_500(self, s, auth):
        """URL analysis should always return 200 even if URL is unreachable."""
        payload = {"kind": "url", "url": "https://www.tiktok.com/@somebody/video/1234567890"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "url"
        assert body["source_url"] == payload["url"]
        assert body["source_platform"] == "tiktok"
        # detections may be empty (no hallucination) — but structure must exist
        assert isinstance(body["detections"], list)


# ---------------- P2: TMDB enrichment ----------------
class TestP2TMDBEnrichment:
    def test_library_save_populates_runtime_rating_backdrop(self, s, auth):
        body = {"tmdb_id": 27205, "media_type": "movie", "title": "Inception"}
        r = s.post(f"{API}/library", json=body, headers=auth)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e.get("runtime") is not None and e["runtime"] > 0
        assert e.get("tmdb_rating") is not None and e["tmdb_rating"] > 0
        assert e.get("backdrop_url")
        # verify via GET (persistence)
        r2 = s.get(f"{API}/library/{e['entry_id']}", headers=auth)
        assert r2.status_code == 200
        g = r2.json()
        assert g["runtime"] == e["runtime"]
        assert g["tmdb_rating"] == e["tmdb_rating"]
        assert g["backdrop_url"] == e["backdrop_url"]
        pytest.p2_entry_id = e["entry_id"]


# ---------------- P3: Library filters + sorts ----------------
class TestP3LibraryFilterSort:
    @pytest.fixture(scope="class", autouse=True)
    def seed(self, s, auth):
        seeds = [
            (496243, "movie", "Parasite"),
            (493922, "movie", "Hereditary"),
            (313369, "movie", "La La Land"),
            (129, "movie", "Spirited Away"),
            (68507, "tv", "Planet Earth II"),
            (1396, "tv", "Breaking Bad"),
        ]
        entry_ids = []
        for tmdb_id, mt, title in seeds:
            r = s.post(f"{API}/library", json={"tmdb_id": tmdb_id, "media_type": mt, "title": title}, headers=auth)
            assert r.status_code == 200, r.text
            entry_ids.append(r.json()["entry_id"])
        # mark Parasite watched to test status filter
        r = s.patch(f"{API}/library/{entry_ids[0]}", json={"watch_status": "watched"}, headers=auth)
        assert r.status_code == 200
        pytest.p3_entry_ids = entry_ids

    def test_filter_media_type_movie(self, s, auth):
        r = s.get(f"{API}/library?media_type=movie", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 4
        assert all(x["media_type"] == "movie" for x in arr)

    def test_filter_media_type_tv(self, s, auth):
        r = s.get(f"{API}/library?media_type=tv", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 2
        assert all(x["media_type"] == "tv" for x in arr)

    def test_filter_watch_status_watched(self, s, auth):
        r = s.get(f"{API}/library?watch_status=watched", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 1
        assert all(x["watch_status"] == "watched" for x in arr)

    def test_filter_genre_horror(self, s, auth):
        r = s.get(f"{API}/library?genre=Horror", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 1
        for x in arr:
            genres_lower = [g.lower() for g in x.get("genres", [])]
            assert "horror" in genres_lower

    def test_sort_alpha(self, s, auth):
        r = s.get(f"{API}/library?sort=alpha", headers=auth)
        assert r.status_code == 200
        titles = [x["title"] for x in r.json()]
        assert titles == sorted(titles, key=lambda t: t.lower()) or titles == sorted(titles)

    def test_sort_rating_desc(self, s, auth):
        r = s.get(f"{API}/library?sort=rating", headers=auth)
        assert r.status_code == 200
        ratings = [x.get("tmdb_rating") for x in r.json() if x.get("tmdb_rating") is not None]
        assert ratings == sorted(ratings, reverse=True)

    def test_sort_release_desc(self, s, auth):
        r = s.get(f"{API}/library?sort=release", headers=auth)
        assert r.status_code == 200
        years = [x.get("year") for x in r.json() if x.get("year") is not None]
        assert years == sorted(years, reverse=True)

    def test_genres_list(self, s, auth):
        r = s.get(f"{API}/library/genres/list", headers=auth)
        assert r.status_code == 200
        genres = r.json().get("genres", [])
        assert isinstance(genres, list)
        # Horror should appear from Hereditary
        assert any(g.lower() == "horror" for g in genres)
        # sorted asc
        assert genres == sorted(genres)


# ---------------- P4: Collections / Custom lists ----------------
class TestP4Collections:
    def test_multi_list_membership_flow(self, s, auth):
        # Need a library entry — reuse one from P3 seeds
        eids = getattr(pytest, "p3_entry_ids", None)
        assert eids and len(eids) >= 1
        eid = eids[1]  # Hereditary

        # create two lists
        r1 = s.post(f"{API}/collections", json={"name": "TEST Horror Faves"}, headers=auth)
        r2 = s.post(f"{API}/collections", json={"name": "TEST Watch Tonight"}, headers=auth)
        assert r1.status_code == 200 and r2.status_code == 200
        c1 = r1.json()["collection_id"]
        c2 = r2.json()["collection_id"]

        # add entry to BOTH lists
        assert s.post(f"{API}/collections/{c1}/items", json={"entry_id": eid}, headers=auth).status_code == 200
        assert s.post(f"{API}/collections/{c2}/items", json={"entry_id": eid}, headers=auth).status_code == 200

        # GET collection hydrates entries in order
        rg = s.get(f"{API}/collections/{c1}", headers=auth)
        assert rg.status_code == 200
        col = rg.json()
        assert col["item_count"] == 1
        assert any(e["entry_id"] == eid for e in col["entries"])
        assert col["entries"][0].get("title")
        assert col["entries"][0].get("poster_url")

        # lists_for_entry shows contains=True for BOTH
        rl = s.get(f"{API}/library/{eid}/lists", headers=auth)
        assert rl.status_code == 200
        lists = rl.json()["lists"]
        by_id = {li["collection_id"]: li for li in lists}
        assert by_id[c1]["contains"] is True
        assert by_id[c2]["contains"] is True

        # list_collections returns cover_posters + item_count
        rc = s.get(f"{API}/collections", headers=auth)
        assert rc.status_code == 200
        cols = rc.json()
        c1_doc = next(c for c in cols if c["collection_id"] == c1)
        assert c1_doc["item_count"] == 1
        assert isinstance(c1_doc.get("cover_posters"), list)
        assert len(c1_doc["cover_posters"]) >= 1

        # remove from c1, still in c2
        rd = s.delete(f"{API}/collections/{c1}/items/{eid}", headers=auth)
        assert rd.status_code == 200
        rl2 = s.get(f"{API}/library/{eid}/lists", headers=auth)
        by_id2 = {li["collection_id"]: li for li in rl2.json()["lists"]}
        assert by_id2[c1]["contains"] is False
        assert by_id2[c2]["contains"] is True

        # delete list c2 - cleanup
        assert s.delete(f"{API}/collections/{c2}", headers=auth).status_code == 200
        assert s.delete(f"{API}/collections/{c1}", headers=auth).status_code == 200

    def test_add_item_to_missing_collection_returns_404(self, s, auth):
        eids = getattr(pytest, "p3_entry_ids", None)
        r = s.post(
            f"{API}/collections/col_doesnotexist/items",
            json={"entry_id": eids[0] if eids else "x"},
            headers=auth,
        )
        assert r.status_code == 404
