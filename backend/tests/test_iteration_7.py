"""Loom iteration 7 — confirm deployment-readiness config edits didn't regress backend.

Scope:
  1. httpx import path — POST /api/discoveries kind=url must return 200 (no ImportError from newly-listed httpx==0.28.1) using a real YouTube link.
  2. POST /api/discoveries kind=text still auto-saves confident detections.
  3. Library entry created via discovery is enriched via TMDB (httpx in tmdb.py) — real TMDB fields (poster_url, tmdb_rating) should populate for a well-known title when TMDB_API_KEY is valid. Test is lenient: skips assert if TMDB returns no match (invalid key placeholder), but asserts the tmdb call path didn't 500.
  4. Auth regression: register/login @gmail.com.
  5. GET /api/library with filters.
  6. POST /api/search.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def auth(s):
    email = f"iter7_{uuid.uuid4().hex[:10]}@gmail.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "TEST Iter7"})
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ------------------ Auth regression ------------------
class TestAuthRegression:
    def test_register_gmail(self, s):
        email = f"iter7reg_{uuid.uuid4().hex[:8]}@gmail.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["session_token"].startswith("sess_")
        assert j.get("user", {}).get("email") == email

    def test_login_gmail(self, s):
        email = f"iter7log_{uuid.uuid4().hex[:8]}@gmail.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
        assert r.status_code == 200
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert r2.status_code == 200
        assert r2.json()["session_token"].startswith("sess_")

    def test_login_wrong_password(self, s):
        email = f"iter7wp_{uuid.uuid4().hex[:8]}@gmail.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code in (400, 401), r.text


# ------------------ httpx path — URL discovery ------------------
class TestHttpxUrlPath:
    def test_url_kind_youtube_returns_200(self, s, auth):
        """This exercises httpx AsyncClient.get() in ai_pipeline.py — must not ImportError or 500."""
        r = s.post(
            f"{API}/discoveries",
            json={"kind": "url", "url": "https://www.youtube.com/watch?v=YoHD9XEInc0"},
            headers=auth,
            timeout=120,
        )
        assert r.status_code == 200, f"URL discovery must not 500 (httpx path). Body: {r.text}"
        b = r.json()
        assert b["kind"] == "url"
        assert isinstance(b.get("detections"), list)
        # source_platform should be classified as youtube
        assert b.get("source_platform") in ("youtube", None, "generic", "web"), b.get("source_platform")

    def test_url_kind_tiktok_returns_200(self, s, auth):
        r = s.post(
            f"{API}/discoveries",
            json={"kind": "url", "url": "https://www.tiktok.com/@user/video/7000000000000000000"},
            headers=auth,
            timeout=120,
        )
        assert r.status_code == 200, r.text


# ------------------ Text discovery + TMDB enrichment ------------------
class TestTextAndTmdb:
    def test_text_autosaves_and_enriches(self, s, auth):
        payload = {"kind": "text", "text": "Just watched Interstellar (2014) — Christopher Nolan is a genius."}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        det = body["detections"]
        assert isinstance(det, list) and len(det) >= 1
        confident = [d for d in det if d.get("confidence", 0) >= 0.5]
        assert body["saved_count"] == len(confident)
        assert body["saved_count"] > 0
        entry_id = next(d["entry_id"] for d in confident)

        # Confirm entry appears in library
        rl = s.get(f"{API}/library", headers=auth)
        assert rl.status_code == 200
        lib = rl.json()
        found = next((e for e in lib if e["entry_id"] == entry_id), None)
        assert found is not None
        # If TMDB key is valid AND matched Interstellar, poster_url + tmdb_rating should be set.
        # If not, tmdb_id will be NEGATIVE (fallback). We report — not fail.
        pytest.iter7_tmdb_entry = found  # for downstream visibility

    def test_tmdb_enrichment_visible(self, s, auth):
        """Non-fatal: report whether real TMDB fields populated. Fails ONLY if the enrichment
        code path 500'd upstream (already covered above), otherwise this is informational.
        """
        entry = getattr(pytest, "iter7_tmdb_entry", None)
        if not entry:
            pytest.skip("No entry from prior test")
        # Real TMDB match → positive tmdb_id + poster + rating
        if entry.get("tmdb_id") and entry["tmdb_id"] > 0:
            assert entry.get("poster_url"), "positive tmdb_id but no poster — TMDB call likely failed silently"
            assert entry.get("tmdb_rating") is not None
        else:
            # invalid TMDB key path — acceptable per test_credentials.md note
            print(f"[INFO] TMDB fallback used (tmdb_id={entry.get('tmdb_id')}). No real enrichment.")


# ------------------ Library filters regression ------------------
class TestLibraryFilters:
    def test_library_default_200(self, s, auth):
        r = s.get(f"{API}/library", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_library_filter_media_type(self, s, auth):
        r = s.get(f"{API}/library?media_type=movie", headers=auth)
        assert r.status_code == 200
        for e in r.json():
            assert e["media_type"] == "movie"

    def test_library_filter_watch_status(self, s, auth):
        r = s.get(f"{API}/library?watch_status=want_to_watch", headers=auth)
        assert r.status_code == 200
        for e in r.json():
            assert e["watch_status"] == "want_to_watch"

    def test_library_sort_alpha(self, s, auth):
        r = s.get(f"{API}/library?sort=alpha", headers=auth)
        assert r.status_code == 200
        titles = [e["title"] for e in r.json()]
        assert titles == sorted(titles, key=lambda t: (t or "").lower())


# ------------------ Search regression ------------------
class TestSearch:
    def test_search_returns_200(self, s, auth):
        r = s.post(f"{API}/search", json={"query": "sci-fi about time and space"}, headers=auth, timeout=90)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "results" in b and isinstance(b["results"], list)
