"""Loom backend API tests: auth, discoveries, library, collections, search."""
import os
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://media-vault-api.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# 1x1 png (base64)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
)


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def user(s):
    """Register a fresh test user and return {token, user, email}."""
    email = f"test_{uuid.uuid4().hex[:10]}@gmail.com"
    password = "secret123"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST User"})
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user" in data
    return {"token": data["session_token"], "user": data["user"], "email": email, "password": password}


@pytest.fixture(scope="session")
def auth_headers(user):
    return {"Authorization": f"Bearer {user['token']}", "Content-Type": "application/json"}


# ----- HEALTH -----
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("service") == "loom"

    def test_health(self, s):
        r = s.get(f"{API}/health")
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ----- AUTH -----
class TestAuth:
    def test_register_invalid_email_domain(self, s):
        r = s.post(f"{API}/auth/register", json={"email": "foo@bar.test", "password": "secret123"})
        # email-validator rejects .test TLD
        assert r.status_code in (400, 422), r.text

    def test_register_duplicate(self, s, user):
        r = s.post(f"{API}/auth/register", json={"email": user["email"], "password": "secret123"})
        assert r.status_code == 400

    def test_login_success(self, s, user):
        r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": user["password"]})
        assert r.status_code == 200
        assert "session_token" in r.json()

    def test_login_wrong_password(self, s, user):
        r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": "wrongwrong"})
        assert r.status_code == 401

    def test_me_without_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, s, auth_headers, user):
        r = s.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == user["email"]

    def test_logout(self, s, user):
        # login separately so we don't kill the shared session
        r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": user["password"]})
        assert r.status_code == 200
        tk = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tk}"}
        rl = s.post(f"{API}/auth/logout", headers=h)
        assert rl.status_code == 200
        # subsequent /auth/me on that token should now 401
        r2 = s.get(f"{API}/auth/me", headers=h)
        assert r2.status_code == 401


# ----- DISCOVERIES -----
class TestDiscoveries:
    def test_create_text_discovery(self, s, auth_headers):
        payload = {"kind": "text", "text": "Just watched Inception (2010). Mind blown by the dream layers."}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "text"
        assert "discovery_id" in data
        assert isinstance(data.get("detections"), list)
        pytest.discovery_id = data["discovery_id"]
        pytest.detections = data["detections"]

    def test_create_url_discovery(self, s, auth_headers):
        payload = {"kind": "url", "url": "https://www.tiktok.com/@user/video/1234567890"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "url"
        assert data["source_url"] == payload["url"]

    def test_create_screenshot_discovery(self, s, auth_headers):
        payload = {"kind": "screenshot", "image_base64": TINY_PNG_B64, "image_mime": "image/png"}
        r = s.post(f"{API}/discoveries", json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["kind"] == "screenshot"

    def test_list_discoveries(self, s, auth_headers):
        r = s.get(f"{API}/discoveries", headers=auth_headers)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1

    def test_create_discovery_requires_auth(self, s):
        r = s.post(f"{API}/discoveries", json={"kind": "text", "text": "x"})
        assert r.status_code == 401


# ----- LIBRARY -----
class TestLibrary:
    def _pick_detection(self):
        det = getattr(pytest, "detections", None)
        if not det:
            pytest.skip("No detections available from text discovery")
        return det[0]

    def test_save_and_dedupe(self, s, auth_headers):
        det = self._pick_detection()
        body = {"tmdb_id": det["tmdb_id"], "media_type": det["media_type"], "title": det["title"]}
        r1 = s.post(f"{API}/library", json=body, headers=auth_headers)
        assert r1.status_code == 200, r1.text
        e1 = r1.json()
        assert e1["tmdb_id"] == det["tmdb_id"]
        assert e1["watch_status"] == "want_to_watch"
        pytest.entry_id = e1["entry_id"]
        # dedupe: second save returns same entry_id
        r2 = s.post(f"{API}/library", json=body, headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json()["entry_id"] == e1["entry_id"]

    def test_list_library(self, s, auth_headers):
        r = s.get(f"{API}/library", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_list_library_filter_media_type(self, s, auth_headers):
        r = s.get(f"{API}/library?media_type=movie", headers=auth_headers)
        assert r.status_code == 200
        for it in r.json():
            assert it["media_type"] == "movie"

    def test_patch_library(self, s, auth_headers):
        eid = getattr(pytest, "entry_id", None)
        assert eid, "no entry_id"
        body = {"watch_status": "watched", "user_rating": 8.5, "user_note": "Great film"}
        r = s.patch(f"{API}/library/{eid}", json=body, headers=auth_headers)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["watch_status"] == "watched"
        assert got["user_rating"] == 8.5
        assert got["user_note"] == "Great film"
        # verify persisted
        r2 = s.get(f"{API}/library/{eid}", headers=auth_headers)
        assert r2.status_code == 200 and r2.json()["watch_status"] == "watched"

    def test_list_library_filter_watch_status(self, s, auth_headers):
        r = s.get(f"{API}/library?watch_status=watched", headers=auth_headers)
        assert r.status_code == 200
        for it in r.json():
            assert it["watch_status"] == "watched"

    def test_delete_library(self, s, auth_headers):
        # save a second entry then delete it to keep at least one for search test
        body = {"tmdb_id": 999001, "media_type": "movie", "title": "TEST Temp Movie"}
        r = s.post(f"{API}/library", json=body, headers=auth_headers)
        assert r.status_code == 200
        eid = r.json()["entry_id"]
        rd = s.delete(f"{API}/library/{eid}", headers=auth_headers)
        assert rd.status_code == 200
        rg = s.get(f"{API}/library/{eid}", headers=auth_headers)
        assert rg.status_code == 404


# ----- COLLECTIONS -----
class TestCollections:
    def test_create_and_list(self, s, auth_headers):
        r = s.post(f"{API}/collections", json={"name": "TEST My List", "description": "Test"}, headers=auth_headers)
        assert r.status_code == 200
        cid = r.json()["collection_id"]
        pytest.collection_id = cid
        rl = s.get(f"{API}/collections", headers=auth_headers)
        assert rl.status_code == 200
        assert any(c["collection_id"] == cid for c in rl.json())

    def test_add_remove_items(self, s, auth_headers):
        cid = getattr(pytest, "collection_id", None)
        eid = getattr(pytest, "entry_id", None)
        assert cid and eid
        ra = s.post(f"{API}/collections/{cid}/items", json={"entry_id": eid}, headers=auth_headers)
        assert ra.status_code == 200
        rr = s.delete(f"{API}/collections/{cid}/items/{eid}", headers=auth_headers)
        assert rr.status_code == 200


# ----- SEARCH -----
class TestSearch:
    def test_semantic_search(self, s, auth_headers):
        r = s.post(f"{API}/search", json={"query": "mind-bending sci-fi movie"}, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["query"] == "mind-bending sci-fi movie"
        assert isinstance(body["results"], list)
