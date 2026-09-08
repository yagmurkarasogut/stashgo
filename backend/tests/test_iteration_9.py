"""Trace iteration 9 — verify new auth flows (change-password, forgot/reset, account deletion, role)
and confirm regression on existing endpoints (register/login/me, discoveries, library, collections, search).

Notes:
- forgot-password happy path: we insert a fresh reset record directly via a known bcrypt hash so we can
  exercise reset-password success (code cannot be recovered from stored hash).
- Non-enumerating: forgot-password must return {ok:true} for both known and unknown emails.
"""
import os
import uuid
import time
import pytest
import bcrypt
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


def _register(s, email=None, password="secret123"):
    email = email or f"iter9_{uuid.uuid4().hex[:10]}@gmail.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return email, r.json()["session_token"], r.json()["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# -------- Regression: register / login / me (role) --------
class TestAuthRegression:
    def test_register_and_me_returns_role(self, s):
        email, tok, user = _register(s)
        assert user["role"] == "user"
        r = s.get(f"{API}/auth/me", headers=_hdr(tok))
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == email
        assert me["role"] == "user"

    def test_login_ok(self, s):
        email, _, _ = _register(s)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "user"

    def test_login_bad_password(self, s):
        email, _, _ = _register(s)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
        assert r.status_code == 401


# -------- Change password --------
class TestChangePassword:
    def test_wrong_current_rejected(self, s):
        email, tok, _ = _register(s)
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "WRONG", "new_password": "newSecret9"},
                   headers=_hdr(tok))
        assert r.status_code == 401, r.text

    def test_change_password_success_and_old_pw_fails(self, s):
        email, tok, _ = _register(s)
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "secret123", "new_password": "newSecret9"},
                   headers=_hdr(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["session_token"].startswith("sess_")
        new_tok = body["session_token"]

        # Old password must not log in
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert r2.status_code == 401

        # New password logs in
        r3 = s.post(f"{API}/auth/login", json={"email": email, "password": "newSecret9"})
        assert r3.status_code == 200

        # New session token is valid
        r4 = s.get(f"{API}/auth/me", headers=_hdr(new_tok))
        assert r4.status_code == 200

    def test_change_password_requires_auth(self, s):
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "x", "new_password": "abcdef"})
        assert r.status_code == 401


# -------- Forgot / Reset password --------
class TestForgotReset:
    def test_forgot_unknown_email_returns_ok(self, s):
        r = s.post(f"{API}/auth/forgot-password",
                   json={"email": f"nobody_{uuid.uuid4().hex[:8]}@gmail.com", "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_forgot_known_email_returns_ok_and_stores_record(self, s, mongo):
        email, _, user = _register(s)
        r = s.post(f"{API}/auth/forgot-password", json={"email": email, "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        rec = mongo.password_resets.find_one({"email": email})
        assert rec is not None
        assert "code_hash" in rec
        assert rec["attempts"] == 0
        # Not plaintext
        assert not rec.get("code")

    def test_reset_wrong_code_returns_400(self, s):
        email, _, _ = _register(s)
        s.post(f"{API}/auth/forgot-password", json={"email": email, "lang": "en"})
        r = s.post(f"{API}/auth/reset-password",
                   json={"email": email, "code": "000000", "new_password": "brandNew1"})
        assert r.status_code == 400, r.text

    def test_reset_too_many_attempts_returns_429(self, s, mongo):
        email, _, _ = _register(s)
        s.post(f"{API}/auth/forgot-password", json={"email": email, "lang": "en"})
        mongo.password_resets.update_one({"email": email}, {"$set": {"attempts": 5}})
        r = s.post(f"{API}/auth/reset-password",
                   json={"email": email, "code": "000000", "new_password": "brandNew1"})
        assert r.status_code == 429, r.text

    def test_reset_expired_returns_400(self, s, mongo):
        email, _, _ = _register(s)
        s.post(f"{API}/auth/forgot-password", json={"email": email, "lang": "en"})
        mongo.password_resets.update_one(
            {"email": email},
            {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}},
        )
        r = s.post(f"{API}/auth/reset-password",
                   json={"email": email, "code": "000000", "new_password": "brandNew1"})
        assert r.status_code == 400

    def test_reset_happy_path_via_direct_hash_insert(self, s, mongo):
        email, tok, user = _register(s)
        uid = user["user_id"]
        code = "123456"
        code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
        # replace any existing record
        mongo.password_resets.delete_many({"user_id": uid})
        mongo.password_resets.insert_one({
            "user_id": uid,
            "email": email,
            "code_hash": code_hash,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "attempts": 0,
            "created_at": datetime.now(timezone.utc),
        })
        r = s.post(f"{API}/auth/reset-password",
                   json={"email": email, "code": code, "new_password": "resetPw123"})
        assert r.status_code == 200, r.text
        # Old sessions revoked
        rme = s.get(f"{API}/auth/me", headers=_hdr(tok))
        assert rme.status_code == 401
        # New password logs in
        rl = s.post(f"{API}/auth/login", json={"email": email, "password": "resetPw123"})
        assert rl.status_code == 200


# -------- Account deletion --------
class TestDeleteAccount:
    def test_delete_account_and_reregister(self, s, mongo):
        email, tok, user = _register(s)
        uid = user["user_id"]

        # seed some content
        s.post(f"{API}/collections", json={"name": "TEST col", "entry_ids": []}, headers=_hdr(tok))

        r = s.delete(f"{API}/auth/account", headers=_hdr(tok))
        assert r.status_code == 200

        # Login blocked
        rl = s.post(f"{API}/auth/login", json={"email": email, "password": "secret123"})
        assert rl.status_code == 401

        # Token is dead
        rme = s.get(f"{API}/auth/me", headers=_hdr(tok))
        assert rme.status_code == 401

        # User anonymized
        u = mongo.users.find_one({"user_id": uid})
        assert u["deleted_at"] is not None
        assert u["email"].startswith("deleted_")
        assert u["password_hash"] is None

        # Content purged
        assert mongo.collections.count_documents({"user_id": uid}) == 0
        assert mongo.discoveries.count_documents({"user_id": uid}) == 0
        assert mongo.library.count_documents({"user_id": uid}) == 0

        # Same email can be re-registered
        r2 = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
        assert r2.status_code == 200, r2.text


# -------- Discoveries auto-save regression --------
class TestDiscoveries:
    def test_text_autosaves(self, s):
        _, tok, _ = _register(s)
        r = s.post(f"{API}/discoveries",
                   json={"kind": "text", "text": "Just watched Interstellar (2014)."},
                   headers=_hdr(tok), timeout=120)
        assert r.status_code == 200, r.text
        b = r.json()
        assert isinstance(b["detections"], list)
        assert b["saved_count"] >= 0


# -------- Library filters/sort regression --------
class TestLibrary:
    def test_library_filters_and_sort(self, s):
        _, tok, _ = _register(s)
        # trigger creation so filters exercise real data
        s.post(f"{API}/discoveries",
               json={"kind": "text", "text": "The Matrix (1999) is a sci-fi classic."},
               headers=_hdr(tok), timeout=120)

        r = s.get(f"{API}/library", headers=_hdr(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        for q in ("?media_type=movie", "?watch_status=want_to_watch", "?sort=recent",
                  "?sort=release", "?sort=rating", "?sort=alpha"):
            rr = s.get(f"{API}/library{q}", headers=_hdr(tok))
            assert rr.status_code == 200, f"{q} → {rr.status_code} {rr.text}"

    def test_genres_endpoint(self, s):
        _, tok, _ = _register(s)
        r = s.get(f"{API}/library/genres/list", headers=_hdr(tok))
        assert r.status_code == 200
        assert "genres" in r.json()


# -------- Collections CRUD regression --------
class TestCollections:
    def test_collections_crud(self, s):
        _, tok, _ = _register(s)
        # create with entry_ids empty
        r = s.post(f"{API}/collections", json={"name": "TEST watchlist", "entry_ids": []},
                   headers=_hdr(tok))
        assert r.status_code == 200
        cid = r.json()["collection_id"]

        # GET single
        rg = s.get(f"{API}/collections/{cid}", headers=_hdr(tok))
        assert rg.status_code == 200
        assert rg.json()["name"] == "TEST watchlist"

        # Batch add (empty is fine)
        rb = s.post(f"{API}/collections/{cid}/items/batch",
                    json={"entry_ids": []}, headers=_hdr(tok))
        assert rb.status_code == 200

        # Delete
        rd = s.delete(f"{API}/collections/{cid}", headers=_hdr(tok))
        assert rd.status_code == 200


# -------- Search regression --------
class TestSearch:
    def test_search_returns_200(self, s):
        _, tok, _ = _register(s)
        r = s.post(f"{API}/search", json={"query": "space adventure"},
                   headers=_hdr(tok), timeout=90)
        assert r.status_code == 200, r.text
        assert "results" in r.json()
