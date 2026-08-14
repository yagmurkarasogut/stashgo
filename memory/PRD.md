# Loom — Product Requirements Document

## Original Problem Statement
Build the complete backend architecture and product foundation for **Loom**, an AI-powered personal movie & TV memory system. Users discover movies/TV via Instagram Reels, TikTok, YouTube Shorts, X, web articles, and screenshots — Loom captures these (via URL paste, text, or screenshot upload), runs AI analysis to extract titles/actors/directors, matches with TMDB, and builds a searchable personal library. Includes auth, personal library, collections, notes/ratings/watch status, AI pipeline, content ingestion, and semantic search.

## Stack (as built)
- **Frontend:** Expo (React Native) + Expo Router + TypeScript
- **Backend:** FastAPI (all routes under `/api`)
- **DB:** MongoDB (motor async)
- **AI:** Gemini 3 Flash via Emergent Universal LLM Key (`emergentintegrations`)
- **Movie data:** TMDB integration layer (currently MOCKED — activates automatically when `TMDB_API_KEY` is set, no code change needed)
- **Auth:** Email/Password (bcrypt + 7-day session tokens) + Emergent-managed Google OAuth

## User Personas
- **The Serial Scroller** — saves dozens of movie clips from Reels/TikTok and forgets them all.
- **The Curator** — organizes watchlists into collections and rates everything.
- **The Rediscoverer** — searches "that time-travel movie from a Reel last month" in natural language.

## Architecture
- **Auth:** `users` (email unique, user_id, password_hash nullable, auth_provider), `user_sessions` (session_token, TTL index on expires_at). Bearer-token auth helper. Google `session_id` → `/api/auth/session` exchange.
- **AI pipeline** (`services/ai_pipeline.py`): fetch URL / OCR image (Gemini vision) / plain text → Gemini structured JSON detections (title, media_type, confidence, reason) → TMDB enrichment.
- **TMDB service** (`services/tmdb.py`): real API when key present, deterministic mock catalog + poster fallback otherwise.
- **Collections:** `entry_ids` array referencing library entries.
- **Semantic search:** Gemini ranks library catalog against natural-language query, returns match_reason; naive substring fallback.

## Core Requirements (static)
1. Auth (email + Google) ✅
2. Content ingestion (URL / text / screenshot) ✅
3. AI processing pipeline (extract → detect → TMDB match → save) ✅
4. Personal library with watch status / rating / notes ✅
5. Collections ✅
6. Semantic natural-language search ✅
7. API architecture under `/api` ✅

## Implemented (2026-06)
- Full email/password + Google auth with protected routes and AuthGate — 2026-06
- Discovery ingestion + Gemini AI pipeline (text/url/screenshot) — 2026-06
- TMDB mock/real enrichment layer — 2026-06
- Library CRUD with filters, watch status, rating, notes — 2026-06
- Collections CRUD — 2026-06
- Semantic search with AI match reasons — 2026-06
- Cinematic dark "Glass/Luxe" mobile UI: Auth, Home feed, Add-discovery modal, Library grid, Search, Movie detail, Profile — 2026-06
- 23/23 backend pytest passing; all frontend flows verified — 2026-06

### Iteration 2 — Accuracy, Metadata & Organization (2026-06)
- **P1 Discovery accuracy:** richer URL signal extraction (og/twitter meta, page title, hashtags, YouTube oEmbed, author); conservative anti-hallucination prompt; per-detection `alternatives` (top-3 candidates surfaced when confidence < 0.75, each TMDB-enriched); detections ordered by confidence.
- **P2 TMDB enrichment:** added `runtime`, `tmdb_rating`, richer cast (up to 8), backdrop; shown as chips on Movie detail.
- **P3 Library:** independent type (All/Movies/TV) + status (Want/Watching/Watched) + genre (8 fixed genres) filters and sorting (Recently Added / Release Date / Rating / Alphabetical); `GET /library/genres/list`.
- **P4 Custom Lists:** `Lists` tab + list detail; a title can belong to multiple lists; add/remove from lists inline on Movie detail; list cards show cover stack + count.
- 15/15 new backend pytest passing; all frontend flows verified — 2026-06

### Iteration 3 — Real TMDB, Auto-Save, Trailers, Multi-select Lists (2026-06)
- **Real TMDB (mock removed):** `services/tmdb.py` is real-API only — media_type-specific search with year param + candidate scoring + fallback (drop year / try both types); details include poster, backdrop, year, genres, tmdb_rating, overview, runtime, cast, director, **trailer (YouTube key)** and **streaming/watch providers**. `get_details(media_type, id)` fetches directly by id. Graceful AI-only fallback (negative tmdb_id) when TMDB unreachable/no key.
- **Auto-analysis + auto-save:** `/discoveries` auto-saves every detection ≥0.5 confidence to the library (no manual button); returns `saved_count`; frontend shows a confirmation Toast + banner. Deep-link `?shared_url=` auto-starts analysis.
- **Multimodal AI (frame analysis):** URL analysis downloads the og:image thumbnail/representative frame and sends it to Gemini vision alongside text signals for visual identification.
- **Movie detail:** plays YouTube trailer (WebView) when available else poster/backdrop; 'Where to watch' provider logos; full metadata (rating, runtime, genres, cast, director).
- **Custom Lists redesign:** 'Create New List' is a full page (`/list/new`) with library multi-select (checkboxes); list detail has 'Add titles from library' (batch multi-select add). `POST /collections` accepts initial `entry_ids`; `POST /collections/{id}/items/batch`.
- 15/15 iteration-3 backend pytest passing; all frontend flows verified — 2026-06
- ⚠️ Real TMDB art/trailers/providers require a valid 32-char v3 TMDB key in `TMDB_API_KEY` (current value is an invalid placeholder).

## Backlog / Remaining
- **P1:** Custom lists (separate from collections), Apple Sign-In, native iOS Share Extension + Android Share Intent workflow (requires native build)
- **P1:** Real TMDB key wiring (user to provide) — infra already in place
- **P2:** Discovery source detail screen (original URL/caption/extracted text), streaming AI responses, offline cache, pull richer TMDB (streaming providers, trailers)
- **P2:** Migrate deprecated RN-Web style props (shadow* → boxShadow)

## Next Tasks
- Add native Share Extension / Share Intent so users can share directly from Reels/TikTok into Loom.
- Build Collections UI screens (create, browse, add posters).
- Add discovery-source detail view.
