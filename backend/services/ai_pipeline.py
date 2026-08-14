"""
AI processing pipeline for Loom.
Uses Gemini 3 Flash via emergentintegrations to extract movie/TV titles from
text, URLs, and screenshot images. Returns structured JSON.
"""
import os
import json
import re
import uuid
import base64
from typing import List, Dict, Optional, Any
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

SYSTEM_PROMPT = """You are Loom's AI curator — a meticulous expert at identifying the SPECIFIC movie or TV show a piece of social content is about.

You will be given structured SIGNALS extracted from a social post or web page: the page/video TITLE, DESCRIPTION/CAPTION, AUTHOR/channel, HASHTAGS, and any raw on-page TEXT. You may ALSO be given an IMAGE — a thumbnail or representative frame from the video/post. When an image is present, ANALYZE IT VISUALLY: read on-screen text/subtitles, recognise actors' faces, sets, costumes, logos, and title cards to identify the exact film or show — do NOT rely on the caption alone. Weigh every signal together; hashtags (e.g. #theinvitation) and @mentions are high-signal.

CRITICAL ACCURACY RULES:
1. NEVER invent or hallucinate a title. Only return titles you can actually justify from the signals. If the signals are too thin to name a title, return an EMPTY detections array — that is the correct answer, not a guess.
2. Do NOT confuse similarly-themed films. If a caption clearly says "The Invitation", the answer is "The Invitation" — never substitute a different body-horror/thriller just because the vibe is similar.
3. For each detection give an honest confidence 0.0-1.0:
   - 0.85-1.0: title explicitly named in title/caption/hashtag.
   - 0.6-0.85: strongly implied (unique character/actor/plot + one corroborating signal).
   - 0.4-0.6: plausible but ambiguous.
   - below 0.4: do not return as a primary detection.
4. When you are NOT highly confident (confidence < 0.75), populate an "alternatives" array with up to 2 OTHER real, plausible titles the content could be, each with its own confidence. List the single best guess as "title" and the runner-ups in "alternatives". If highly confident, "alternatives" MUST be an empty array.
5. Every candidate (primary + alternatives) must be a REAL, existing movie or TV show. If you cannot name real candidates, omit the detection entirely.

Also produce:
- caption: a short cleaned caption (<=200 chars) reflecting the post.
- extracted_text: the key text signals you used (<=1500 chars).
- ai_summary: one sentence on why this matters to a movie lover.

Return STRICT JSON only, no markdown fences, no preamble. Schema:
{
  "caption": "string",
  "extracted_text": "string",
  "ai_summary": "string",
  "detections": [
    {
      "title": "string",
      "media_type": "movie" | "tv",
      "year": null,
      "confidence": 0.0-1.0,
      "reason": "string (which signals justify this)",
      "alternatives": [
        {"title": "string", "media_type": "movie"|"tv", "year": null, "confidence": 0.0-1.0}
      ]
    }
  ]
}"""


def _extract_json(text: str) -> Optional[Dict]:
    """Robustly extract JSON from a possibly fenced/verbose LLM response."""
    text = text.strip()
    # strip code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        pass
    # find first {...} block
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


def _meta(html: str, *keys: str) -> str:
    """Extract a meta tag content by property/name (first match)."""
    for key in keys:
        # property="og:title" content="..."  OR  name="..." content="..."
        for pat in (
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(key)}["\'][^>]*content=["\']([^"\']*)["\']',
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{re.escape(key)}["\']',
        ):
            m = re.search(pat, html, re.IGNORECASE)
            if m and m.group(1).strip():
                return _unescape(m.group(1).strip())
    return ""


def _unescape(s: str) -> str:
    import html as _h
    return _h.unescape(s)


def _extract_hashtags(*texts: str) -> List[str]:
    tags = []
    for t in texts:
        tags += re.findall(r"#([A-Za-z0-9_]{2,40})", t or "")
    # de-dupe, keep order
    seen, out = set(), []
    for tag in tags:
        low = tag.lower()
        if low not in seen:
            seen.add(low)
            out.append(tag)
    return out[:20]


async def _youtube_oembed(url: str, client: httpx.AsyncClient) -> Dict:
    try:
        r = await client.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
        )
        if r.status_code == 200:
            j = r.json()
            return {"title": j.get("title", ""), "author": j.get("author_name", "")}
    except Exception:
        pass
    return {}


async def fetch_url_signals(url: str) -> Dict:
    """Extract structured signals (title, description, author, hashtags, text)
    from a social/web URL. Uses OG/Twitter meta tags + oEmbed where possible.
    JS-rendered pages (IG/TikTok) still expose these meta tags server-side."""
    signals: Dict[str, Any] = {
        "url": url, "title": "", "description": "", "author": "",
        "hashtags": [], "text": "", "image": "", "platform": detect_source_platform(url),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; LoomBot/1.0; +https://loom.app) facebookexternalhit/1.1",
                "Accept-Language": "en-US,en;q=0.9",
            }
            if signals["platform"] == "youtube":
                yo = await _youtube_oembed(url, client)
                signals["title"] = yo.get("title", "")
                signals["author"] = yo.get("author", "")

            r = await client.get(url, headers=headers)
            html = r.text or ""

            signals["title"] = signals["title"] or _meta(html, "og:title", "twitter:title")
            desc = _meta(html, "og:description", "twitter:description", "description")
            signals["description"] = desc
            signals["author"] = signals["author"] or _meta(
                html, "og:site_name", "author", "twitter:creator", "article:author"
            )
            # page <title> fallback
            if not signals["title"]:
                mt = re.search(r"<title[^>]*>([^<]{2,200})</title>", html, re.IGNORECASE)
                if mt:
                    signals["title"] = _unescape(mt.group(1).strip())

            # crude visible-text strip for extra context
            txt = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            txt = re.sub(r"<style[^>]*>.*?</style>", " ", txt, flags=re.DOTALL | re.IGNORECASE)
            txt = re.sub(r"<[^>]+>", " ", txt)
            txt = _unescape(re.sub(r"\s+", " ", txt).strip())
            signals["text"] = txt[:3000]

            signals["hashtags"] = _extract_hashtags(signals["title"], desc, txt[:1500])
            # og:image is typically the video thumbnail / a representative frame
            signals["image"] = _meta(html, "og:image", "twitter:image", "og:image:secure_url")
    except Exception:
        pass
    return signals


async def _download_image(url: str) -> Optional[bytes]:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 LoomBot/1.0"})
            if r.status_code == 200 and r.content and len(r.content) < 8_000_000:
                return r.content
    except Exception:
        pass
    return None


async def _fetch_url_content(url: str) -> str:
    """Legacy helper retained for compatibility: returns concatenated signal text."""
    s = await fetch_url_signals(url)
    return _signals_to_prompt(s)


def _signals_to_prompt(s: Dict) -> str:
    parts = [f"SOURCE URL: {s.get('url','')}", f"PLATFORM: {s.get('platform','')}"]
    if s.get("title"):
        parts.append(f"TITLE: {s['title']}")
    if s.get("author"):
        parts.append(f"AUTHOR/CHANNEL: {s['author']}")
    if s.get("description"):
        parts.append(f"DESCRIPTION/CAPTION: {s['description']}")
    if s.get("hashtags"):
        parts.append("HASHTAGS: " + ", ".join("#" + h for h in s["hashtags"]))
    if s.get("text"):
        parts.append(f"RAW PAGE TEXT (may be noisy): {s['text'][:2000]}")
    return "\n".join(parts)


def detect_source_platform(url: str) -> str:
    u = url.lower()
    if "instagram.com" in u:
        return "instagram"
    if "tiktok.com" in u:
        return "tiktok"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "twitter.com" in u or "x.com" in u:
        return "x"
    return "web"


def _new_chat(session_id: str) -> LlmChat:
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    return LlmChat(
        api_key=key,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3-flash-preview")


async def analyze_text(text: str, source_url: Optional[str] = None) -> Dict:
    """Run AI analysis on plain text (with optional URL context)."""
    prompt = f"CONTENT TO ANALYZE:\n\n{text[:4000]}"
    if source_url:
        prompt = f"SOURCE URL: {source_url}\n\n{prompt}"
    chat = _new_chat(f"analyze-{uuid.uuid4().hex[:8]}")
    reply = await chat.send_message(UserMessage(text=prompt))
    parsed = _extract_json(reply) or {}
    return _normalize(parsed, fallback_text=text)


async def analyze_url(url: str) -> Dict:
    """Fetch structured signals + a thumbnail frame from a URL and run
    MULTIMODAL analysis (text signals + representative video frame)."""
    signals = await fetch_url_signals(url)
    prompt_body = _signals_to_prompt(signals)
    has_signal = bool(signals.get("title") or signals.get("description") or signals.get("hashtags"))

    # Pull the representative frame / thumbnail for visual identification
    image_bytes = await _download_image(signals.get("image", ""))

    if image_bytes:
        prompt_body += "\n\nAn IMAGE (thumbnail / representative frame from the video) is attached — analyze it visually to identify the exact title."
        chat = _new_chat(f"analyze-url-{uuid.uuid4().hex[:8]}")
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        msg = UserMessage(text=prompt_body, file_contents=[ImageContent(image_base64=b64)])
        reply = await chat.send_message(msg)
        result = _normalize(_extract_json(reply) or {}, fallback_text=prompt_body)
    else:
        if not has_signal and not signals.get("text"):
            prompt_body += "\n\n[NOTE] Very little could be extracted from this URL. Only return a detection if the URL slug itself clearly names a title; otherwise return empty detections."
        result = await analyze_text(prompt_body, source_url=url)

    result["_signals"] = {
        "title": signals.get("title", ""),
        "author": signals.get("author", ""),
        "hashtags": signals.get("hashtags", []),
        "image": signals.get("image", ""),
    }
    if not result.get("caption") and signals.get("description"):
        result["caption"] = signals["description"][:200]
    return result


async def analyze_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict:
    """Run AI analysis on a screenshot / image (Gemini vision — OCR + detection)."""
    chat = _new_chat(f"analyze-img-{uuid.uuid4().hex[:8]}")
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    image = ImageContent(image_base64=b64)
    msg = UserMessage(
        text="Analyze this screenshot. Extract all visible text (OCR), identify any movies or TV shows referenced, and return the JSON schema.",
        file_contents=[image],
    )
    reply = await chat.send_message(msg)
    parsed = _extract_json(reply) or {}
    return _normalize(parsed)


def _normalize(parsed: Dict, fallback_text: str = "") -> Dict:
    """Ensure the AI output conforms to our expected shape."""
    detections = parsed.get("detections") or []
    clean = []
    seen = set()
    for d in detections:
        title = (d.get("title") or "").strip()
        if not title:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        conf = float(d.get("confidence") or 0.5)
        # normalize alternatives
        alts_raw = d.get("alternatives") or []
        alts = []
        alt_seen = {key}
        for a in alts_raw:
            at = (a.get("title") or "").strip()
            if not at or at.lower() in alt_seen:
                continue
            alt_seen.add(at.lower())
            alts.append({
                "title": at,
                "media_type": a.get("media_type") if a.get("media_type") in ("movie", "tv") else "movie",
                "year": a.get("year") if isinstance(a.get("year"), int) else None,
                "confidence": float(a.get("confidence") or 0.4),
            })
        clean.append({
            "title": title,
            "media_type": d.get("media_type") if d.get("media_type") in ("movie", "tv") else "movie",
            "year": d.get("year") if isinstance(d.get("year"), int) else None,
            "confidence": conf,
            "reason": (d.get("reason") or "")[:300],
            "alternatives": alts[:2],
        })
    return {
        "caption": (parsed.get("caption") or "")[:200],
        "extracted_text": (parsed.get("extracted_text") or fallback_text[:1500])[:2000],
        "ai_summary": (parsed.get("ai_summary") or "")[:400],
        "detections": clean,
    }


async def semantic_search_library(query: str, library_items: List[Dict]) -> List[Dict]:
    """Ask Gemini to rank library items against a natural-language query.
    Returns list of {tmdb_id, media_type, reason, score}.
    """
    if not library_items:
        return []
    # keep a compact catalog to fit in prompt
    catalog = [
        {
            "tmdb_id": it.get("tmdb_id"),
            "media_type": it.get("media_type"),
            "title": it.get("title"),
            "year": it.get("year"),
            "director": it.get("director"),
            "genres": it.get("genres", []),
            "overview": (it.get("overview") or "")[:200],
        }
        for it in library_items[:200]
    ]
    system = """You are a semantic search engine over a user's personal movie/TV library.
Given a natural-language query, return the top matching items from the catalog and explain WHY each matched (theme, director, plot element, mood).
Return STRICT JSON only, schema:
{
  "results": [
    {"tmdb_id": number, "media_type": "movie"|"tv", "score": 0.0-1.0, "reason": "short string (why matched)"}
  ]
}
Return at most 12 results, ordered best first. If nothing matches meaningfully, return an empty array."""
    chat = LlmChat(
        api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
        session_id=f"search-{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")
    prompt = f"QUERY: {query}\n\nCATALOG:\n{json.dumps(catalog)}"
    reply = await chat.send_message(UserMessage(text=prompt))
    parsed = _extract_json(reply) or {}
    return parsed.get("results", [])[:12]
