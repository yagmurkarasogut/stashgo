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

## Backlog / Remaining
- **P1:** Custom lists (separate from collections), Apple Sign-In, native iOS Share Extension + Android Share Intent workflow (requires native build)
- **P1:** Real TMDB key wiring (user to provide) — infra already in place
- **P2:** Discovery source detail screen (original URL/caption/extracted text), streaming AI responses, offline cache, pull richer TMDB (streaming providers, trailers)
- **P2:** Migrate deprecated RN-Web style props (shadow* → boxShadow)

## Next Tasks
- Add native Share Extension / Share Intent so users can share directly from Reels/TikTok into Loom.
- Build Collections UI screens (create, browse, add posters).
- Add discovery-source detail view.
