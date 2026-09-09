"""Iteration 12 backend tests: email verification gate + regressions (ai/usage,
credit deductions, forgot-password, login)."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "Backend URL env var not set"
BASE_URL = BASE_URL.rstrip("/")


def _fresh_email():
    return f"tester+{uuid.uuid4().hex[:8]}@gmail.com"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def registered(api):
    email = _fresh_email()
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "123456", "name": "Iter12"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_token" in data and "user" in data
    return {"email": email, "token": data["session_token"], "user": data["user"]}


# --- Email verification -------------------------------------------------

class TestEmailVerification:
    def test_register_returns_email_verified_false(self, registered):
        u = registered["user"]
        assert u["email_verified"] is False
        assert u["auth_provider"] == "email"
        assert u["email"] == registered["email"]

    def test_me_exposes_email_verified_false(self, api, registered):
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": f"Bearer {registered['token']}"})
        assert r.status_code == 200
        me = r.json()
        assert me["email_verified"] is False
        assert me["email"] == registered["email"]

    def test_verify_email_bogus_token_returns_html_200(self, api):
        r = requests.get(f"{BASE_URL}/api/auth/verify-email", params={"token": "bogus-xyz"})
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/html" in ct
        body = r.text.lower()
        assert "invalid" in body or "geçersiz" in body

    def test_resend_verification_known_unverified(self, api, registered):
        r = api.post(f"{BASE_URL}/api/auth/resend-verification",
                     json={"email": registered["email"], "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_resend_verification_unknown_email_non_enumerating(self, api):
        r = api.post(f"{BASE_URL}/api/auth/resend-verification",
                     json={"email": _fresh_email(), "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}


# --- Auth regressions ---------------------------------------------------

class TestAuthRegression:
    def test_login_still_works(self, api, registered):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": registered["email"], "password": "123456"})
        assert r.status_code == 200
        data = r.json()
        assert "session_token" in data
        assert data["user"]["email"] == registered["email"]

    def test_login_wrong_password_401(self, api, registered):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": registered["email"], "password": "wrongpass"})
        assert r.status_code == 401

    def test_forgot_password_known_ok(self, api, registered):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password",
                     json={"email": registered["email"], "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_forgot_password_unknown_ok_non_enumerating(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password",
                     json={"email": _fresh_email(), "lang": "en"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_reset_password_bogus_code_400(self, api, registered):
        r = api.post(f"{BASE_URL}/api/auth/reset-password", json={
            "email": registered["email"], "code": "000000", "new_password": "newpass123",
        })
        # either 400 invalid or 429 too many attempts; must not be 200
        assert r.status_code in (400, 429)


# --- AI usage + credits -------------------------------------------------

class TestAIUsageAndCredits:
    def test_ai_usage_shape(self, api, registered):
        r = api.get(f"{BASE_URL}/api/ai/usage",
                    headers={"Authorization": f"Bearer {registered['token']}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["limit"] == 5
        assert "used" in d and "remaining" in d
        assert d["remaining"] == max(0, d["limit"] - d["used"])
        assert d["premium"] is False
        assert d["unlimited"] is False

    def test_ai_discover_costs_2_credits(self, api, registered):
        # baseline usage
        u0 = api.get(f"{BASE_URL}/api/ai/usage",
                     headers={"Authorization": f"Bearer {registered['token']}"}).json()
        used0 = u0["used"]
        # avoid exhausting quota if a prior test bumped it — need >= 2 remaining
        if used0 + 2 > 5:
            pytest.skip("Not enough remaining credits to exercise ai/discover")
        r = api.post(f"{BASE_URL}/api/ai/discover", json={"query": "cozy romantic feel good movie"},
                     headers={"Authorization": f"Bearer {registered['token']}"}, timeout=45)
        assert r.status_code == 200, r.text
        # confirm credits deducted by 2
        u1 = api.get(f"{BASE_URL}/api/ai/usage",
                     headers={"Authorization": f"Bearer {registered['token']}"}).json()
        assert u1["used"] == used0 + 2, f"expected +2 credits, got {u1['used']} vs {used0}"

    def test_discoveries_text_costs_1_credit(self, api, registered):
        u0 = api.get(f"{BASE_URL}/api/ai/usage",
                     headers={"Authorization": f"Bearer {registered['token']}"}).json()
        used0 = u0["used"]
        if used0 + 1 > 5:
            pytest.skip("Not enough remaining credits to exercise /discoveries")
        r = api.post(f"{BASE_URL}/api/discoveries",
                     json={"kind": "text", "text": "I loved Inception directed by Christopher Nolan"},
                     headers={"Authorization": f"Bearer {registered['token']}"}, timeout=60)
        assert r.status_code == 200, r.text
        u1 = api.get(f"{BASE_URL}/api/ai/usage",
                     headers={"Authorization": f"Bearer {registered['token']}"}).json()
        assert u1["used"] == used0 + 1, f"expected +1 credit, got {u1['used']} vs {used0}"

    def test_402_when_credits_exhausted(self, api):
        # fresh account, spam ai/discover to exceed 5 credits (each costs 2)
        email = _fresh_email()
        r = api.post(f"{BASE_URL}/api/auth/register",
                     json={"email": email, "password": "123456", "name": "Exhaust"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        # 3 successful ai/discover calls consume 6 credits — 3rd should 402
        statuses = []
        for i in range(4):
            rr = api.post(f"{BASE_URL}/api/ai/discover", json={"query": f"test query {i}"},
                          headers=h, timeout=60)
            statuses.append(rr.status_code)
            if rr.status_code == 402:
                break
        assert 402 in statuses, f"expected a 402 in {statuses}"
