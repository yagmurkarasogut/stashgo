"""
Iteration 10 — Stash Go rename + AI discovery endpoint tests.
Covers:
- POST /api/ai/discover: identify, recommend (EN + TR), empty query 400
- Results NOT limited to user's library, NOT auto-saved
- After saving to library, re-query marks item saved=true with entry_id
- Regression: auth (register/login/me), discoveries text, library filters/sort, search
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def account():
    ts = int(time.time())
    email = f"tester+{ts}_{uuid.uuid4().hex[:6]}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "123456", "name": "Iter10"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["session_token"], "user": body["user"]}


@pytest.fixture
def auth_headers(account):
    return {"Authorization": f"Bearer {account['token']}", "Content-Type": "application/json"}


# ---------- auth regression ----------
class TestAuthRegression:
    def test_login_success(self, account):
        r = requests.post(f"{API}/auth/login", json={"email": account["email"], "password": "123456"}, timeout=15)
        assert r.status_code == 200
        assert "session_token" in r.json()

    def test_me(self, auth_headers, account):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == account["email"]
        assert data.get("role") == "user"

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ---------- /api/ai/discover ----------
class TestAiDiscover:
    def test_empty_query_400(self, auth_headers):
        r = requests.post(f"{API}/ai/discover", json={"query": ""}, headers=auth_headers, timeout=30)
        assert r.status_code == 400

    def test_empty_whitespace_400(self, auth_headers):
        r = requests.post(f"{API}/ai/discover", json={"query": "   "}, headers=auth_headers, timeout=30)
        assert r.status_code == 400

    def test_unauth(self):
        r = requests.post(f"{API}/ai/discover", json={"query": "any"}, timeout=15)
        assert r.status_code == 401

    def test_identify_train_clue(self, auth_headers):
        r = requests.post(
            f"{API}/ai/discover",
            json={"query": "a movie where a woman meets a man on a train"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("intent") in ("identify", "recommend")
        assert "message" in data
        results = data.get("results", [])
        assert isinstance(results, list) and len(results) >= 1, f"expected some results, got {data}"
        # Each result has required fields with real TMDB backing
        for c in results:
            for k in ("tmdb_id", "media_type", "title", "poster_url", "reason", "saved"):
                assert k in c, f"missing key {k} in {c}"
            assert c["media_type"] in ("movie", "tv")
            assert isinstance(c["tmdb_id"], int) and c["tmdb_id"] > 0, "expect real (positive) tmdb id"
            assert c["saved"] is False, "fresh account -> nothing saved"

    def test_recommend_english(self, auth_headers):
        r = requests.post(
            f"{API}/ai/discover",
            json={"query": "90 minutes suspenseful but not too dark"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data.get("results", [])) >= 2
        # message should be non-empty and English-ish (has ASCII letters)
        assert data.get("message"), "message required"

    def test_recommend_turkish_titles_untranslated(self, auth_headers):
        r = requests.post(
            f"{API}/ai/discover",
            json={"query": "90 dakikam var, gerilim ama cok agir olmasin"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        results = data.get("results", [])
        assert len(results) >= 2
        # Titles should be original (TMDB canonical) — not machine-translated.
        # Heuristic: at least one title should contain plain ASCII (English/original language).
        # We can't perfectly validate "not translated" without a reference, but we can assert
        # the titles look like real TMDB titles (non-empty, printable) and NOT identical to the query.
        for c in results:
            assert c["title"], "empty title"
            assert c["title"].lower() != "gerilim", "title looks translated"

    def test_results_not_autosaved_and_not_library_scoped(self, auth_headers):
        # Fresh account (no library) — should still get real recommendations
        r = requests.post(
            f"{API}/ai/discover",
            json={"query": "recommend me a Christopher Nolan sci-fi"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data.get("results", [])) >= 1, "should return results even with empty library"
        # library should still be empty
        lib = requests.get(f"{API}/library", headers=auth_headers, timeout=15).json()
        assert lib == [] or all(it.get("discovery_id") is None for it in lib), "no auto-save from /ai/discover"
        # results themselves say saved=False
        for c in data["results"]:
            assert c["saved"] is False

    def test_save_then_requery_marks_saved(self, auth_headers):
        # 1st: get recommendations for a specific clue
        clue = "recommend a Christopher Nolan sci-fi film"
        r1 = requests.post(f"{API}/ai/discover", json={"query": clue}, headers=auth_headers, timeout=90)
        assert r1.status_code == 200
        results = r1.json().get("results", [])
        assert len(results) >= 1
        target = results[0]
        assert target["saved"] is False

        # 2. save that item to library
        save_body = {"tmdb_id": target["tmdb_id"], "media_type": target["media_type"], "title": target["title"]}
        r2 = requests.post(f"{API}/library", json=save_body, headers=auth_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        entry_id = r2.json()["entry_id"]

        # 3. re-query same clue -> that same tmdb_id should now be saved=True with matching entry_id
        r3 = requests.post(f"{API}/ai/discover", json={"query": clue}, headers=auth_headers, timeout=90)
        assert r3.status_code == 200
        found = None
        for c in r3.json().get("results", []):
            if c["tmdb_id"] == target["tmdb_id"] and c["media_type"] == target["media_type"]:
                found = c
                break
        # Depending on non-deterministic LLM output, the exact same title may not appear.
        # If it does, verify saved flip. If not, at least assert library-scoping via /library.
        if found:
            assert found["saved"] is True
            assert found["entry_id"] == entry_id
        else:
            # Fall back: confirm library contains the saved item
            lib = requests.get(f"{API}/library", headers=auth_headers, timeout=15).json()
            ids = [(it["tmdb_id"], it["media_type"]) for it in lib]
            assert (target["tmdb_id"], target["media_type"]) in ids


# ---------- discoveries + library + search regression ----------
class TestRegression:
    def test_discovery_text_autosave(self, auth_headers):
        r = requests.post(
            f"{API}/discoveries",
            json={"kind": "text", "text": "Just watched Inception (2010) — Christopher Nolan sci-fi about dreams"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("discovery_id")
        # detections may or may not enrich depending on TMDB — but the endpoint must succeed
        assert isinstance(data.get("detections", []), list)

    def test_library_filters_and_sort(self, auth_headers):
        for sort in ("recent", "release", "rating", "alpha"):
            r = requests.get(f"{API}/library", params={"sort": sort}, headers=auth_headers, timeout=15)
            assert r.status_code == 200, f"sort={sort} failed"
        r = requests.get(f"{API}/library", params={"media_type": "movie"}, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/library", params={"watch_status": "want_to_watch"}, headers=auth_headers, timeout=15)
        assert r.status_code == 200

    def test_search(self, auth_headers):
        r = requests.post(f"{API}/search", json={"query": "sci-fi"}, headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert "results" in r.json()
