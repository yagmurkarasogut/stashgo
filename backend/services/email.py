"""Emergent-managed transactional email (Resend proxy).
Server-side templates only; recipients come from DB records, never request markup.
"""
import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Emergent managed email proxy. Constant (survives deployment) — never from env.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


def _cfg():
    key = os.environ.get("EMERGENT_EMAIL_KEY")
    from_name = os.environ.get("EMAIL_FROM_NAME", "Stash Go")
    return key, from_name


def is_configured() -> bool:
    key, _ = _cfg()
    return bool(key)


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    key, from_name = _cfg()
    if not key:
        logger.warning("EMERGENT_EMAIL_KEY missing — email not sent")
        raise HTTPException(status_code=503, detail="Email service not configured")
    payload = {"to": [to], "subject": subject, "html": html, "from_name": from_name}
    reply_to = os.environ.get("EMAIL_REPLY_TO")
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": key},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def reset_code_email(name: str, code: str, lang: str) -> tuple[str, str]:
    """Returns (subject, html) for the password reset code email. Fixed server-side
    template; the code is entered in the Stash Go app, never replied to this email."""
    safe_name = escape(name or "")
    if lang == "tr":
        subject = "Stash Go şifre sıfırlama kodunuz"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;'
            'font-family:Arial,sans-serif;color:#111">'
            f'<p>Merhaba {safe_name},</p>'
            '<p>Stash Go hesabınızın şifresini sıfırlamak için doğrulama kodunuz:</p>'
            f'<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{escape(code)}</p>'
            '<p>Bu kodu Stash Go uygulamasına girerek yeni şifrenizi belirleyebilirsiniz. '
            'Kod 15 dakika içinde geçerliliğini yitirir.</p>'
            '<p>Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>'
            '<p style="font-size:12px;color:#888">Stash Go tarafından gönderildi. '
            'Şifrenizi veya kart bilgilerinizi asla e-posta ile istemeyiz.</p>'
            '</td></tr></table>'
        )
    else:
        subject = "Your Stash Go password reset code"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;'
            'font-family:Arial,sans-serif;color:#111">'
            f'<p>Hi {safe_name},</p>'
            '<p>Your verification code to reset your Stash Go password is:</p>'
            f'<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{escape(code)}</p>'
            '<p>Enter this code in the Stash Go app to set a new password. '
            'The code expires in 15 minutes.</p>'
            '<p>If you did not request this, you can safely ignore this email.</p>'
            '<p style="font-size:12px;color:#888">Sent by Stash Go. We never ask for your '
            'password or card details by email.</p>'
            '</td></tr></table>'
        )
    return subject, html


def verify_email(name: str, link: str, lang: str) -> tuple[str, str]:
    """Subject + html for the account verification email. Contains a single https link
    to the app's own backend verify endpoint; asks for nothing back."""
    safe_name = escape(name or "")
    safe_link = escape(link)
    if lang == "tr":
        subject = "Stash Go e-posta doğrulama"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;'
            'font-family:Arial,sans-serif;color:#111">'
            f'<p>Merhaba {safe_name},</p>'
            '<p>Stash Go hesabını etkinleştirmek için e-posta adresini doğrula:</p>'
            f'<p><a href="{safe_link}" style="display:inline-block;background:#F5A623;'
            'color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;'
            'font-weight:bold">E-postamı doğrula</a></p>'
            '<p>Bu bağlantı 24 saat içinde geçerliliğini yitirir. Bu isteği sen yapmadıysan '
            'bu e-postayı yok sayabilirsin.</p>'
            '<p style="font-size:12px;color:#888">Stash Go tarafından gönderildi. Şifreni veya '
            'kart bilgilerini asla e-posta ile istemeyiz.</p>'
            '</td></tr></table>'
        )
    else:
        subject = "Verify your Stash Go email"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;'
            'font-family:Arial,sans-serif;color:#111">'
            f'<p>Hi {safe_name},</p>'
            '<p>Confirm your email to activate your Stash Go account:</p>'
            f'<p><a href="{safe_link}" style="display:inline-block;background:#F5A623;'
            'color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;'
            'font-weight:bold">Verify my email</a></p>'
            '<p>This link expires in 24 hours. If you did not request this, you can ignore '
            'this email.</p>'
            '<p style="font-size:12px;color:#888">Sent by Stash Go. We never ask for your '
            'password or card details by email.</p>'
            '</td></tr></table>'
        )
    return subject, html
