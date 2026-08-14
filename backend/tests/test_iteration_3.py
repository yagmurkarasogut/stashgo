"""Loom iteration 3 tests — auto-save discoveries + list multi-select create/batch + search.

Notes:
- TMDB_API_KEY on file is INVALID by design — enrichment fields (poster_url, tmdb_rating,
  trailer_key, watch_providers, backdrop_url, runtime) may all be None and library entries
  use a negative fallback tmdb_id. Tests must NOT fail on those being None.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://media-vault-api.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def auth(s):
    email = f"iter3_{uuid.uuid4().hex[:10]}@gmail.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "TEST Iter3"})
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ------------- Auth basics -------------
class TestAuth:
    def test_register_rejects_bad_email(self, s):
        r = s.post(f"{API}/auth/register", json={"email": "foo@bar.test", "password": "secret123"})
        # EmailStr with email-validator now rejects .test — expect 422
        assert r.status_code in (400, 422), r.text

    def test_register_and_login_gmail(self, s):
        email = f"iter3login_{uuid.uuid4().hex[:8]}@gmail.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
        assert r.status_code == 200, r.text
        tok = r.json()["session_token"]
        assert tok.startswith("sess_")
        # login
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert r2.status_code == 200


# ------------- Auto-save behavior -------------
class TestAutoSave:
    def test_text_autosaves_confident_detections(self, s, auth):
        payload = {
            "kind": "text",
            "text": "Just watched Inception (2010) by Christopher Nolan and The Dark Knight (2008). Both amazing.",
        }
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        det = body["detections"]
        assert isinstance(det, list) and len(det) >= 1
        # saved_count should equal number of confident (>=0.5) detections
        confident = [d for d in det if d.get("confidence", 0) >= 0.5]
        assert body["saved_count"] == len(confident), f"saved_count={body['saved_count']} vs confident={len(confident)}"
        assert body["saved_count"] > 0, "expected at least one confident detection"
        for d in confident:
            assert d["saved"] is True
            assert d.get("entry_id"), "confident detection must have entry_id"
        # Grab an entry_id and verify it appears in library WITHOUT another save call
        entry_id = next(d["entry_id"] for d in confident)
        rl = s.get(f"{API}/library", headers=auth)
        assert rl.status_code == 200
        lib_ids = [x["entry_id"] for x in rl.json()]
        assert entry_id in lib_ids, "auto-saved entry must appear in /api/library"

    def test_noise_does_not_autosave(self, s, auth):
        payload = {"kind": "text", "text": "asdfghjkl zxcvbnm qwerty 12345 !!!!"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        # no high-confidence hallucination
        for d in body["detections"]:
            assert d["confidence"] < 0.75, f"hallucinated: {d}"
        # saved_count consistent with saved flags
        saved_flag_count = sum(1 for d in body["detections"] if d.get("saved"))
        assert saved_flag_count == body["saved_count"]

    def test_url_kind_does_not_500(self, s, auth):
        r = s.post(
            f"{API}/discoveries",
            json={"kind": "url", "url": "https://www.tiktok.com/@someone/video/123"},
            headers=auth,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["kind"] == "url"
        assert b["source_platform"] == "tiktok"
        assert isinstance(b["detections"], list)


# ------------- Library filters/sort still intact -------------
class TestLibraryFiltersSort:
    """These must keep working even with negative-fallback tmdb_ids and null enrichment."""

    @pytest.fixture(scope="class", autouse=True)
    def seed_via_discovery(self, s, auth):
        # trigger a discovery that auto-saves multiple titles
        s.post(
            f"{API}/discoveries",
            json={"kind": "text", "text": "Loved Parasite (2019) and Breaking Bad. Also Inception (2010)."},
            headers=auth, timeout=120,
        )
        yield

    def test_library_default(self, s, auth):
        r = s.get(f"{API}/library", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)

    def test_filter_media_type(self, s, auth):
        r = s.get(f"{API}/library?media_type=movie", headers=auth)
        assert r.status_code == 200
        for x in r.json():
            assert x["media_type"] == "movie"

    def test_filter_watch_status(self, s, auth):
        r = s.get(f"{API}/library?watch_status=want_to_watch", headers=auth)
        assert r.status_code == 200
        for x in r.json():
            assert x["watch_status"] == "want_to_watch"

    def test_sort_alpha(self, s, auth):
        r = s.get(f"{API}/library?sort=alpha", headers=auth)
        assert r.status_code == 200
        titles = [x["title"] for x in r.json()]
        assert titles == sorted(titles, key=lambda t: (t or "").lower())

    def test_sort_rating_and_release_do_not_500(self, s, auth):
        r1 = s.get(f"{API}/library?sort=rating", headers=auth)
        r2 = s.get(f"{API}/library?sort=release", headers=auth)
        assert r1.status_code == 200 and r2.status_code == 200

    def test_genres_list_endpoint(self, s, auth):
        r = s.get(f"{API}/library/genres/list", headers=auth)
        assert r.status_code == 200
        j = r.json()
        assert "genres" in j and isinstance(j["genres"], list)


# ------------- Custom lists multi-select -------------
class TestCustomListsMultiSelect:
    @pytest.fixture(scope="class")
    def seeded_entries(self, s, auth):
        # Auto-save via discovery for a known payload to obtain entry_ids
        r = s.post(
            f"{API}/discoveries",
            json={"kind": "text", "text": "Rewatching Inception (2010) and The Matrix (1999) tonight."},
            headers=auth, timeout=120,
        )
        assert r.status_code == 200, r.text
        ids = [d["entry_id"] for d in r.json()["detections"] if d.get("entry_id")]
        # If AI only detected one, fall back to whatever exists in library
        if len(ids) < 2:
            rl = s.get(f"{API}/library", headers=auth)
            ids = [x["entry_id"] for x in rl.json()][:2]
        assert len(ids) >= 2, "Need ≥2 library entries for multi-select tests"
        return ids

    def test_create_collection_prepopulated(self, s, auth, seeded_entries):
        r = s.post(
            f"{API}/collections",
            json={"name": "TEST Prepop List", "entry_ids": seeded_entries[:2]},
            headers=auth,
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["item_count"] == 2
        assert set(c["entry_ids"]) == set(seeded_entries[:2])
        pytest.iter3_col_id = c["collection_id"]

        # GET hydrates entries
        rg = s.get(f"{API}/collections/{c['collection_id']}", headers=auth)
        assert rg.status_code == 200
        col = rg.json()
        assert col["item_count"] == 2
        assert len(col["entries"]) == 2
        assert all(e.get("title") for e in col["entries"])

    def test_batch_add(self, s, auth, seeded_entries):
        # create empty list, then batch add
        r = s.post(f"{API}/collections", json={"name": "TEST Batch List", "entry_ids": []}, headers=auth)
        assert r.status_code == 200
        cid = r.json()["collection_id"]
        rb = s.post(
            f"{API}/collections/{cid}/items/batch",
            json={"entry_ids": seeded_entries[:2]},
            headers=auth,
        )
        assert rb.status_code == 200
        assert rb.json().get("added") == 2

        # GET hydrated
        rg = s.get(f"{API}/collections/{cid}", headers=auth)
        assert rg.status_code == 200
        col = rg.json()
        assert col["item_count"] == 2

        # /library/{eid}/lists returns contains=True for this list
        rl = s.get(f"{API}/library/{seeded_entries[0]}/lists", headers=auth)
        assert rl.status_code == 200
        by_id = {li["collection_id"]: li for li in rl.json()["lists"]}
        assert by_id[cid]["contains"] is True

        # DELETE collection cleanup
        rd = s.delete(f"{API}/collections/{cid}", headers=auth)
        assert rd.status_code == 200

    def test_delete_collection(self, s, auth):
        cid = getattr(pytest, "iter3_col_id", None)
        assert cid, "prepop test must run first"
        rd = s.delete(f"{API}/collections/{cid}", headers=auth)
        assert rd.status_code == 200
        # subsequent GET should 404
        rg = s.get(f"{API}/collections/{cid}", headers=auth)
        assert rg.status_code == 404


# ------------- Semantic search -------------
class TestSearch:
    def test_search_returns_200(self, s, auth):
        r = s.post(f"{API}/search", json={"query": "mind-bending sci-fi"}, headers=auth, timeout=60)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "results" in b and isinstance(b["results"], list)
