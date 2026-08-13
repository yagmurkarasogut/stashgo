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
from typing import List, Dict, Optional
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

SYSTEM_PROMPT = """You are Loom's AI curator — an expert at identifying movies and TV shows referenced in social media posts, articles, captions, screenshots, and URLs.

Given a piece of content, your job is to:
1. Identify EVERY movie or TV show mentioned or referenced (by title, character, actor, franchise, or strong visual clue).
2. Guess the media_type ("movie" or "tv") — pick the most likely one when ambiguous.
3. Provide a confidence score 0.0-1.0 for each detection.
4. Extract a short cleaned caption (max 200 chars) that captures the essence of the content.
5. Provide a 1-sentence ai_summary describing why this content matters to a movie lover.

Return STRICT JSON only, no markdown fences, no preamble. Schema:
{
  "caption": "string",
  "extracted_text": "string",
  "ai_summary": "string",
  "detections": [
    {
      "title": "string",
      "media_type": "movie" | "tv",
      "confidence": 0.0-1.0,
      "reason": "string (why you detected this)"
    }
  ]
}

If nothing recognizable, return empty detections array. Never invent titles. Be conservative — 0.4 minimum confidence."""


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


async def _fetch_url_content(url: str) -> str:
    """Best-effort fetch of a URL's HTML/text. Returns raw text (may be empty)."""
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 LoomBot/1.0"})
            content_type = r.headers.get("content-type", "")
            if "text" in content_type or "html" in content_type or "json" in content_type:
                # crude HTML strip
                txt = re.sub(r"<script[^>]*>.*?</script>", " ", r.text, flags=re.DOTALL | re.IGNORECASE)
                txt = re.sub(r"<style[^>]*>.*?</style>", " ", txt, flags=re.DOTALL | re.IGNORECASE)
                txt = re.sub(r"<[^>]+>", " ", txt)
                txt = re.sub(r"\s+", " ", txt).strip()
                return txt[:6000]
    except Exception:
        pass
    return ""


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
    """Fetch a URL and run analysis on its content."""
    raw = await _fetch_url_content(url)
    if not raw:
        raw = f"[Could not fetch page content] URL: {url}"
    return await analyze_text(raw, source_url=url)


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
        clean.append({
            "title": title,
            "media_type": d.get("media_type") if d.get("media_type") in ("movie", "tv") else "movie",
            "confidence": float(d.get("confidence") or 0.5),
            "reason": (d.get("reason") or "")[:300],
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
