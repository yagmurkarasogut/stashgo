"""
TMDB service — REAL API only (no mock data).
Fetches poster, backdrop, year, genres, rating, overview, runtime, cast,
director, trailer (YouTube key) and streaming/watch providers.

Matching strategy:
  - media_type-specific endpoints (search/movie vs search/tv)
  - use year (primary_release_year / first_air_date_year) when available
  - score candidates by normalized-title + year match
  - fallback: retry search without the year, and if media_type is unknown,
    try both movie and tv and keep the best-scoring candidate
"""
import os
import re
import asyncio
from typing import Optional, Dict, List, Any
import httpx

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG = "https://image.tmdb.org/t/p"
POSTER_SIZE = "w500"
BACKDROP_SIZE = "w1280"
PROFILE_SIZE = "w185"
LOGO_SIZE = "w92"


def _api_key() -> str:
    return os.environ.get("TMDB_API_KEY", "").strip()


def has_key() -> bool:
    return bool(_api_key())


def is_mocked() -> bool:
    # kept for backwards-compat with existing callers/meta endpoint
    return not has_key()


def _img(path: Optional[str], size: str) -> Optional[str]:
    return f"{TMDB_IMG}/{size}{path}" if path else None


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _year_of(s: Optional[str]) -> Optional[int]:
    try:
        return int(s[:4]) if s else None
    except (ValueError, TypeError):
        return None


async def _get(client: httpx.AsyncClient, path: str, **params) -> Optional[Dict]:
    params["api_key"] = _api_key()
    params.setdefault("language", "en-US")
    for attempt in range(3):
        try:
            r = await client.get(f"{TMDB_BASE}{path}", params=params)
            if r.status_code == 429:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code >= 400:
                return None
            return r.json()
        except Exception:
            return None
    return None


async def _search(client: httpx.AsyncClient, media_type: str, title: str, year: Optional[int]) -> List[Dict]:
    params: Dict[str, Any] = {"query": title, "include_adult": False}
    if year:
        params["primary_release_year" if media_type == "movie" else "first_air_date_year"] = year
    data = await _get(client, f"/search/{media_type}", **params)
    return (data or {}).get("results", []) if data else []


def _score(item: Dict, title: str, year: Optional[int], media_type: str) -> float:
    cand_title = item.get("title") if media_type == "movie" else item.get("name")
    cand_year = _year_of(item.get("release_date") if media_type == "movie" else item.get("first_air_date"))
    score = 0.0
    nt, nc = _norm(title), _norm(cand_title or "")
    if nt and nt == nc:
        score += 1.0
    elif nt and (nt in nc or nc in nt):
        score += 0.5
    if year and cand_year == year:
        score += 0.6
    elif year and cand_year and abs(cand_year - year) <= 1:
        score += 0.2
    # popularity as a soft tiebreaker
    score += min(item.get("popularity", 0) / 1000.0, 0.2)
    if item.get("poster_path"):
        score += 0.1
    return score


async def _best_candidate(client: httpx.AsyncClient, title: str, media_type: Optional[str], year: Optional[int]):
    """Return (media_type, candidate_dict) or (None, None)."""
    types = [media_type] if media_type in ("movie", "tv") else ["movie", "tv"]
    best = (None, None, -1.0)
    for mt in types:
        results = await _search(client, mt, title, year)
        if not results and year:
            results = await _search(client, mt, title, None)  # fallback: drop year
        for it in results[:10]:
            s = _score(it, title, year, mt)
            if s > best[2]:
                best = (mt, it, s)
    # require a minimum confidence so we don't attach a wildly wrong poster
    if best[1] is not None and best[2] >= 0.5:
        return best[0], best[1]
    # last-chance: if we had a candidate but low score, still accept the top movie hit
    if best[1] is not None and best[2] >= 0.3:
        return best[0], best[1]
    return None, None


def _extract_trailer(videos: Dict) -> Optional[str]:
    vids = (videos or {}).get("results", [])
    # prefer official YouTube Trailer, then Teaser, then any YouTube video
    def pick(kind, official_only):
        for v in vids:
            if v.get("site") == "YouTube" and v.get("type") == kind and (v.get("official") or not official_only):
                return v.get("key")
        return None
    return (pick("Trailer", True) or pick("Trailer", False)
            or pick("Teaser", True) or pick("Teaser", False)
            or next((v.get("key") for v in vids if v.get("site") == "YouTube"), None))


def _extract_providers(wp: Dict) -> List[Dict]:
    """Flatten watch/providers. Prefer US, else first available region. Returns
    a de-duplicated list of {name, logo_url, type}."""
    results = (wp or {}).get("results", {})
    if not results:
        return []
    region = results.get("US") or next(iter(results.values()), {})
    out, seen = [], set()
    for bucket, label in (("flatrate", "stream"), ("rent", "rent"), ("buy", "buy")):
        for p in region.get(bucket, []) or []:
            name = p.get("provider_name")
            if not name or name in seen:
                continue
            seen.add(name)
            out.append({
                "name": name,
                "logo_url": _img(p.get("logo_path"), LOGO_SIZE),
                "type": label,
            })
    return out[:12]


async def _details(client: httpx.AsyncClient, media_type: str, tmdb_id: int) -> Optional[Dict]:
    append = "credits,videos,watch/providers" if media_type == "movie" else "aggregate_credits,videos,watch/providers"
    det = await _get(client, f"/{media_type}/{tmdb_id}", append_to_response=append)
    if not det:
        return None

    credits = det.get("credits") or det.get("aggregate_credits") or {}
    crew = credits.get("crew", [])
    if media_type == "movie":
        director = next((c["name"] for c in crew if c.get("job") == "Director"), None)
        title = det.get("title")
        year = _year_of(det.get("release_date"))
        runtime = det.get("runtime")
    else:
        directors = []
        for person in crew:
            jobs = person.get("jobs") or []
            if any(j.get("job") in ("Director", "Series Director") for j in jobs):
                directors.append(person.get("name"))
        creators = [c.get("name") for c in det.get("created_by", [])]
        director = (directors[0] if directors else (creators[0] if creators else None))
        title = det.get("name")
        year = _year_of(det.get("first_air_date"))
        ep = det.get("episode_run_time") or []
        runtime = ep[0] if ep else None

    cast = [c.get("name") for c in (credits.get("cast") or [])[:10] if c.get("name")]

    return {
        "tmdb_id": det["id"],
        "id": det["id"],
        "media_type": media_type,
        "title": title,
        "year": year,
        "overview": det.get("overview", "") or "",
        "director": director,
        "cast": cast,
        "genres": [g["name"] for g in det.get("genres", [])],
        "runtime": runtime,
        "tmdb_rating": round(det["vote_average"], 1) if det.get("vote_average") else None,
        "poster_url": _img(det.get("poster_path"), POSTER_SIZE),
        "backdrop_url": _img(det.get("backdrop_path"), BACKDROP_SIZE),
        "trailer_key": _extract_trailer(det.get("videos")),
        "watch_providers": _extract_providers(det.get("watch/providers")),
    }


async def search_and_enrich(title: str, media_type: Optional[str] = None, year: Optional[int] = None) -> Optional[Dict]:
    """Search TMDB for title (optionally constrained by media_type/year), pick the
    best candidate, and return fully enriched details. Returns None if no key or
    no confident match (we never fabricate data)."""
    if not has_key():
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            mt, cand = await _best_candidate(client, title, media_type, year)
            if not cand:
                return None
            return await _details(client, mt, cand["id"])
    except Exception:
        return None


async def get_details(media_type: str, tmdb_id: int) -> Optional[Dict]:
    """Fetch full enriched details directly by TMDB id (no title search)."""
    if not has_key() or media_type not in ("movie", "tv"):
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await _details(client, media_type, tmdb_id)
    except Exception:
        return None


async def search_candidates(title: str, media_type: Optional[str] = None, year: Optional[int] = None, limit: int = 5) -> List[Dict]:
    """Lightweight multi-candidate search (for disambiguation UIs)."""
    if not has_key():
        return []
    out = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            types = [media_type] if media_type in ("movie", "tv") else ["movie", "tv"]
            scored = []
            for mt in types:
                results = await _search(client, mt, title, year) or await _search(client, mt, title, None)
                for it in results[:8]:
                    scored.append((mt, it, _score(it, title, year, mt)))
            scored.sort(key=lambda x: x[2], reverse=True)
            for mt, it, sc in scored[:limit]:
                out.append({
                    "tmdb_id": it["id"],
                    "media_type": mt,
                    "title": it.get("title") or it.get("name"),
                    "year": _year_of(it.get("release_date") if mt == "movie" else it.get("first_air_date")),
                    "poster_url": _img(it.get("poster_path"), POSTER_SIZE),
                })
    except Exception:
        return out
    return out
