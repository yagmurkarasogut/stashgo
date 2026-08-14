"""
Loom Backend — AI-powered movie & TV discovery platform
FastAPI + MongoDB + Gemini 3 Flash + TMDB (mock-capable)
"""
import os
import re
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any, Literal

import bcrypt
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from services import ai_pipeline, tmdb as tmdb_svc

# ---------- SETUP ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Loom API", version="0.1.0")
api = APIRouter(prefix="/api")

logger = logging.getLogger("loom")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _fallback_tmdb_id(title: str, media_type: str) -> int:
    """Deterministic negative pseudo-id for AI detections not yet matched to TMDB
    (keeps them out of the real positive TMDB id space)."""
    import hashlib
    h = int(hashlib.md5(f"{title.lower()}|{media_type}".encode()).hexdigest(), 16)
    return -(h % 2_000_000_000) - 1


# ---------- MODELS ----------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionBody(BaseModel):
    session_id: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    auth_provider: str
    created_at: datetime


class AuthResponse(BaseModel):
    session_token: str
    user: UserPublic


class DiscoveryCreate(BaseModel):
    kind: Literal["url", "text", "screenshot"]
    url: Optional[str] = None
    text: Optional[str] = None
    image_base64: Optional[str] = None  # for screenshots
    image_mime: Optional[str] = "image/jpeg"


class AltCandidate(BaseModel):
    title: str
    media_type: Literal["movie", "tv"]
    confidence: float
    tmdb_id: Optional[int] = None
    poster_url: Optional[str] = None
    year: Optional[int] = None


class Detection(BaseModel):
    title: str
    media_type: Literal["movie", "tv"]
    confidence: float
    reason: Optional[str] = None
    tmdb_id: Optional[int] = None
    poster_url: Optional[str] = None
    year: Optional[int] = None
    saved: bool = False
    entry_id: Optional[str] = None
    alternatives: List[AltCandidate] = []


class Discovery(BaseModel):
    discovery_id: str
    user_id: str
    kind: str
    source_platform: str
    source_url: Optional[str] = None
    caption: str = ""
    extracted_text: str = ""
    ai_summary: str = ""
    detections: List[Detection] = []
    saved_count: int = 0
    created_at: datetime


class LibraryEntry(BaseModel):
    entry_id: str
    user_id: str
    tmdb_id: int
    media_type: str
    title: str
    year: Optional[int] = None
    overview: str = ""
    director: Optional[str] = None
    cast: List[str] = []
    genres: List[str] = []
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    runtime: Optional[int] = None
    tmdb_rating: Optional[float] = None
    trailer_key: Optional[str] = None
    watch_providers: List[Dict[str, Any]] = []
    watch_status: Literal["want_to_watch", "watching", "watched"] = "want_to_watch"
    user_rating: Optional[float] = None
    user_note: str = ""
    discovery_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LibraryUpdate(BaseModel):
    watch_status: Optional[Literal["want_to_watch", "watching", "watched"]] = None
    user_rating: Optional[float] = Field(default=None, ge=0, le=10)
    user_note: Optional[str] = None


class Collection(BaseModel):
    collection_id: str
    user_id: str
    name: str
    description: str = ""
    entry_ids: List[str] = []
    item_count: int = 0
    cover_posters: List[str] = []
    created_at: datetime


class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    entry_ids: List[str] = []


class SearchQuery(BaseModel):
    query: str


# ---------- AUTH HELPERS ----------
async def create_session(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = sess["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _to_public(user: Dict) -> Dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "auth_provider": user.get("auth_provider", "email"),
        "created_at": user["created_at"],
    }


# ---------- AUTH ROUTES ----------
@api.post("/auth/register", response_model=AuthResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user")
    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user_doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name or body.email.split("@")[0],
        "picture": None,
        "password_hash": pw_hash,
        "auth_provider": "email",
        "created_at": now_utc(),
    }
    await db.users.insert_one(user_doc)
    token = await create_session(user_id)
    return {"session_token": token, "user": _to_public(user_doc)}


@api.post("/auth/login", response_model=AuthResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": _to_public(user)}


_used_google_session_ids: set = set()


@api.post("/auth/session", response_model=AuthResponse)
async def google_session(body: GoogleSessionBody):
    """Exchange Emergent Google OAuth session_id for our session_token."""
    if body.session_id in _used_google_session_ids:
        raise HTTPException(status_code=401, detail="Session already used")
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google session")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("google session exchange failed")
        raise HTTPException(status_code=401, detail="Auth exchange failed")

    _used_google_session_ids.add(body.session_id)
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email in Google session")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        user = existing
    else:
        user_id = new_id("user")
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "created_at": now_utc(),
        }
        await db.users.insert_one(user)

    token = await create_session(user_id)
    return {"session_token": token, "user": _to_public(user)}


@api.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return _to_public(user)


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- AI PIPELINE / DISCOVERIES ----------
async def _enrich_detections(raw: List[Dict]) -> List[Dict]:
    enriched = []
    for d in raw:
        info = await tmdb_svc.search_and_enrich(d["title"], d.get("media_type"), d.get("year"))
        if not info:
            # No TMDB match (or no valid API key yet) — keep the AI detection so the
            # user still captures it. Full art/metadata fills in once TMDB is reachable.
            info = {
                "tmdb_id": _fallback_tmdb_id(d["title"], d.get("media_type", "movie")),
                "media_type": d.get("media_type", "movie"),
                "title": d["title"],
                "year": d.get("year"),
                "overview": "",
                "director": None,
                "cast": [],
                "genres": [],
                "runtime": None,
                "tmdb_rating": None,
                "poster_url": None,
                "backdrop_url": None,
                "trailer_key": None,
                "watch_providers": [],
                "_unmatched": True,
            }
        # enrich alternatives lightly so the user can pick the right one
        alt_out = []
        for a in d.get("alternatives", [])[:2]:
            ainfo = await tmdb_svc.search_and_enrich(a["title"], a.get("media_type"), a.get("year"))
            if ainfo:
                alt_out.append({
                    "title": ainfo["title"],
                    "media_type": ainfo["media_type"],
                    "confidence": a.get("confidence", 0.4),
                    "tmdb_id": ainfo["tmdb_id"],
                    "poster_url": ainfo.get("poster_url"),
                    "year": ainfo.get("year"),
                })
        enriched.append({
            "title": info["title"],
            "media_type": info["media_type"],
            "confidence": d.get("confidence", 0.5),
            "reason": d.get("reason", ""),
            "tmdb_id": info["tmdb_id"],
            "poster_url": info.get("poster_url"),
            "year": info.get("year"),
            "saved": False,
            "entry_id": None,
            "alternatives": alt_out,
            "_info": info,  # full enriched details, used for auto-save
        })
    # order by confidence (best first)
    enriched.sort(key=lambda x: x.get("confidence", 0), reverse=True)
    return enriched


async def _upsert_library_entry(user_id: str, info: Dict, discovery_id: Optional[str] = None) -> Dict:
    """Insert a library entry from already-enriched TMDB `info`, or return existing."""
    existing = await db.library.find_one(
        {"user_id": user_id, "tmdb_id": info["tmdb_id"], "media_type": info["media_type"]},
        {"_id": 0},
    )
    if existing:
        return existing
    entry = {
        "entry_id": new_id("lib"),
        "user_id": user_id,
        "tmdb_id": info["tmdb_id"],
        "media_type": info["media_type"],
        "title": info.get("title"),
        "year": info.get("year"),
        "overview": info.get("overview", ""),
        "director": info.get("director"),
        "cast": info.get("cast", []),
        "genres": info.get("genres", []),
        "poster_url": info.get("poster_url"),
        "backdrop_url": info.get("backdrop_url"),
        "runtime": info.get("runtime"),
        "tmdb_rating": info.get("tmdb_rating"),
        "trailer_key": info.get("trailer_key"),
        "watch_providers": info.get("watch_providers", []),
        "watch_status": "want_to_watch",
        "user_rating": None,
        "user_note": "",
        "discovery_id": discovery_id,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.library.insert_one(entry)
    entry.pop("_id", None)
    return entry


# minimum confidence for a detection to be auto-saved to the library
AUTO_SAVE_THRESHOLD = 0.5


@api.post("/discoveries", response_model=Discovery)
async def create_discovery(body: DiscoveryCreate, user=Depends(get_current_user)):
    if body.kind == "url":
        if not body.url:
            raise HTTPException(status_code=400, detail="url required")
        ai = await ai_pipeline.analyze_url(body.url)
        source_platform = ai_pipeline.detect_source_platform(body.url)
        source_url = body.url
    elif body.kind == "text":
        if not body.text:
            raise HTTPException(status_code=400, detail="text required")
        ai = await ai_pipeline.analyze_text(body.text)
        source_platform = "manual"
        source_url = None
    elif body.kind == "screenshot":
        if not body.image_base64:
            raise HTTPException(status_code=400, detail="image_base64 required")
        try:
            img_bytes = base64.b64decode(body.image_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid base64")
        ai = await ai_pipeline.analyze_image(img_bytes, body.image_mime or "image/jpeg")
        source_platform = "screenshot"
        source_url = None
    else:
        raise HTTPException(status_code=400, detail="invalid kind")

    enriched = await _enrich_detections(ai.get("detections", []))

    # Auto-save every confident detection to the library (no manual step needed)
    saved_count = 0
    discovery_id = new_id("disc")
    for det in enriched:
        info = det.pop("_info", None)
        if info and det.get("confidence", 0) >= AUTO_SAVE_THRESHOLD:
            entry = await _upsert_library_entry(user["user_id"], info, discovery_id)
            det["saved"] = True
            det["entry_id"] = entry["entry_id"]
            saved_count += 1

    doc = {
        "discovery_id": discovery_id,
        "user_id": user["user_id"],
        "kind": body.kind,
        "source_platform": source_platform,
        "source_url": source_url,
        "caption": ai.get("caption", ""),
        "extracted_text": ai.get("extracted_text", ""),
        "ai_summary": ai.get("ai_summary", ""),
        "detections": enriched,
        "saved_count": saved_count,
        "created_at": now_utc(),
    }
    await db.discoveries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/discoveries", response_model=List[Discovery])
async def list_discoveries(user=Depends(get_current_user), limit: int = 50):
    cursor = db.discoveries.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


@api.get("/discoveries/{discovery_id}", response_model=Discovery)
async def get_discovery(discovery_id: str, user=Depends(get_current_user)):
    d = await db.discoveries.find_one({"discovery_id": discovery_id, "user_id": user["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return d


@api.delete("/discoveries/{discovery_id}")
async def delete_discovery(discovery_id: str, user=Depends(get_current_user)):
    r = await db.discoveries.delete_one({"discovery_id": discovery_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------- LIBRARY ----------
class LibrarySaveBody(BaseModel):
    tmdb_id: int
    media_type: Literal["movie", "tv"]
    title: str
    discovery_id: Optional[str] = None


@api.post("/library", response_model=LibraryEntry)
async def save_to_library(body: LibrarySaveBody, user=Depends(get_current_user)):
    existing = await db.library.find_one(
        {"user_id": user["user_id"], "tmdb_id": body.tmdb_id, "media_type": body.media_type},
        {"_id": 0},
    )
    if existing:
        return existing
    # fetch full details directly by id (accurate — no re-search by title)
    info = await tmdb_svc.get_details(body.media_type, body.tmdb_id) if body.tmdb_id > 0 else None
    if not info:
        info = await tmdb_svc.search_and_enrich(body.title, body.media_type)
    if not info:
        # keep the capture even without TMDB enrichment
        info = {
            "tmdb_id": body.tmdb_id if body.tmdb_id != 0 else _fallback_tmdb_id(body.title, body.media_type),
            "media_type": body.media_type,
            "title": body.title,
            "year": None, "overview": "", "director": None, "cast": [], "genres": [],
            "runtime": None, "tmdb_rating": None, "poster_url": None, "backdrop_url": None,
            "trailer_key": None, "watch_providers": [],
        }
    entry = await _upsert_library_entry(user["user_id"], info, body.discovery_id)
    return entry


@api.get("/library", response_model=List[LibraryEntry])
async def list_library(
    user=Depends(get_current_user),
    media_type: Optional[str] = None,
    watch_status: Optional[str] = None,
    genre: Optional[str] = None,
    sort: Optional[str] = "recent",
):
    q = {"user_id": user["user_id"]}
    if media_type in ("movie", "tv"):
        q["media_type"] = media_type
    if watch_status:
        q["watch_status"] = watch_status
    if genre:
        # case-insensitive genre match within the genres array
        q["genres"] = {"$elemMatch": {"$regex": f"^{re.escape(genre)}$", "$options": "i"}}

    sort_map = {
        "recent": [("created_at", -1)],
        "release": [("year", -1)],
        "rating": [("tmdb_rating", -1)],
        "alpha": [("title", 1)],
    }
    sort_spec = sort_map.get(sort or "recent", sort_map["recent"])
    cursor = db.library.find(q, {"_id": 0}).sort(sort_spec).limit(500)
    items = await cursor.to_list(length=500)
    # push null sort-values to the end for release/rating
    if sort in ("release", "rating"):
        key = "year" if sort == "release" else "tmdb_rating"
        items.sort(key=lambda x: (x.get(key) is None, -(x.get(key) or 0)))
    return items


@api.get("/library/genres/list")
async def library_genres(user=Depends(get_current_user)):
    """Distinct genres present in the user's library."""
    genres = await db.library.distinct("genres", {"user_id": user["user_id"]})
    return {"genres": sorted([g for g in genres if g])}


@api.get("/library/{entry_id}", response_model=LibraryEntry)
async def get_library_entry(entry_id: str, user=Depends(get_current_user)):
    e = await db.library.find_one({"entry_id": entry_id, "user_id": user["user_id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    return e


@api.patch("/library/{entry_id}", response_model=LibraryEntry)
async def update_library_entry(entry_id: str, body: LibraryUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = now_utc()
    r = await db.library.update_one(
        {"entry_id": entry_id, "user_id": user["user_id"]},
        {"$set": update},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    e = await db.library.find_one({"entry_id": entry_id}, {"_id": 0})
    return e


@api.delete("/library/{entry_id}")
async def delete_library_entry(entry_id: str, user=Depends(get_current_user)):
    r = await db.library.delete_one({"entry_id": entry_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    # also remove from any collections
    await db.collections.update_many(
        {"user_id": user["user_id"]}, {"$pull": {"entry_ids": entry_id}}
    )
    return {"ok": True}


# ---------- COLLECTIONS ----------
@api.post("/collections", response_model=Collection)
async def create_collection(body: CollectionCreate, user=Depends(get_current_user)):
    doc = {
        "collection_id": new_id("col"),
        "user_id": user["user_id"],
        "name": body.name,
        "description": body.description,
        "entry_ids": list(dict.fromkeys(body.entry_ids)),
        "created_at": now_utc(),
    }
    await db.collections.insert_one(doc)
    doc.pop("_id", None)
    doc["item_count"] = len(doc["entry_ids"])
    doc["cover_posters"] = []
    return doc


@api.get("/collections", response_model=List[Collection])
async def list_collections(user=Depends(get_current_user)):
    cols = await db.collections.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=100)
    for c in cols:
        ids = c.get("entry_ids", [])
        c["item_count"] = len(ids)
        if ids:
            posters = await db.library.find(
                {"user_id": user["user_id"], "entry_id": {"$in": ids[:4]}},
                {"_id": 0, "poster_url": 1},
            ).to_list(length=4)
            c["cover_posters"] = [p["poster_url"] for p in posters if p.get("poster_url")]
        else:
            c["cover_posters"] = []
    return cols


@api.get("/collections/{collection_id}")
async def get_collection(collection_id: str, user=Depends(get_current_user)):
    c = await db.collections.find_one({"collection_id": collection_id, "user_id": user["user_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="List not found")
    ids = c.get("entry_ids", [])
    entries = []
    if ids:
        docs = await db.library.find(
            {"user_id": user["user_id"], "entry_id": {"$in": ids}}, {"_id": 0}
        ).to_list(length=500)
        # preserve list order
        order = {eid: i for i, eid in enumerate(ids)}
        entries = sorted(docs, key=lambda d: order.get(d["entry_id"], 9999))
    c["entries"] = entries
    c["item_count"] = len(entries)
    return c


@api.get("/library/{entry_id}/lists")
async def lists_for_entry(entry_id: str, user=Depends(get_current_user)):
    """Return all custom lists, flagging which contain this entry."""
    cols = await db.collections.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=100)
    return {
        "lists": [
            {
                "collection_id": c["collection_id"],
                "name": c["name"],
                "contains": entry_id in c.get("entry_ids", []),
                "item_count": len(c.get("entry_ids", [])),
            }
            for c in cols
        ]
    }


class CollectionItemBody(BaseModel):
    entry_id: str


class CollectionBatchBody(BaseModel):
    entry_ids: List[str] = []


@api.post("/collections/{collection_id}/items")
async def add_to_collection(collection_id: str, body: CollectionItemBody, user=Depends(get_current_user)):
    r = await db.collections.update_one(
        {"collection_id": collection_id, "user_id": user["user_id"]},
        {"$addToSet": {"entry_ids": body.entry_id}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"ok": True}


@api.post("/collections/{collection_id}/items/batch")
async def batch_add_to_collection(collection_id: str, body: CollectionBatchBody, user=Depends(get_current_user)):
    r = await db.collections.update_one(
        {"collection_id": collection_id, "user_id": user["user_id"]},
        {"$addToSet": {"entry_ids": {"$each": body.entry_ids}}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"ok": True, "added": len(body.entry_ids)}


@api.delete("/collections/{collection_id}/items/{entry_id}")
async def remove_from_collection(collection_id: str, entry_id: str, user=Depends(get_current_user)):
    await db.collections.update_one(
        {"collection_id": collection_id, "user_id": user["user_id"]},
        {"$pull": {"entry_ids": entry_id}},
    )
    return {"ok": True}


@api.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, user=Depends(get_current_user)):
    await db.collections.delete_one({"collection_id": collection_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- SEARCH ----------
@api.post("/search")
async def semantic_search(body: SearchQuery, user=Depends(get_current_user)):
    items = await db.library.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(length=500)
    if not items:
        return {"query": body.query, "results": []}
    try:
        matches = await ai_pipeline.semantic_search_library(body.query, items)
    except Exception:
        logger.exception("semantic search failed, falling back to text match")
        matches = []
    # attach full item + reason
    by_key = {(it["tmdb_id"], it["media_type"]): it for it in items}
    hydrated = []
    for m in matches:
        key = (m.get("tmdb_id"), m.get("media_type"))
        if key in by_key:
            it = by_key[key].copy()
            it["match_reason"] = m.get("reason", "")
            it["match_score"] = m.get("score", 0)
            hydrated.append(it)
    # fallback: naive substring match if AI returned nothing
    if not hydrated:
        ql = body.query.lower()
        for it in items:
            hay = " ".join([
                it.get("title", ""),
                it.get("overview", ""),
                it.get("director") or "",
                " ".join(it.get("genres", [])),
                " ".join(it.get("cast", [])),
            ]).lower()
            if any(tok in hay for tok in re.findall(r"\w+", ql) if len(tok) > 3):
                hit = it.copy()
                hit["match_reason"] = "Text match"
                hit["match_score"] = 0.5
                hydrated.append(hit)
        hydrated = hydrated[:12]
    return {"query": body.query, "results": hydrated}


# ---------- META ----------
@api.get("/")
async def root():
    return {
        "service": "loom",
        "version": "0.1.0",
        "tmdb_mocked": tmdb_svc.is_mocked(),
    }


@api.get("/health")
async def health():
    return {"ok": True, "time": now_utc().isoformat()}


# ---------- APP ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.discoveries.create_index([("user_id", 1), ("created_at", -1)])
    await db.library.create_index([("user_id", 1), ("tmdb_id", 1), ("media_type", 1)], unique=True)
    await db.collections.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Loom API ready. TMDB mocked=%s", tmdb_svc.is_mocked())


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
