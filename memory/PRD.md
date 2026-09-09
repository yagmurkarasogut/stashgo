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

## Production Notes / Incident Log
- **Prod login/registration "Registration failed":** Reproduced the exact payload against backend logic in preview → 200 OK (register + login), so backend/DB/validation are correct. Symptom = client fallback shown when the thrown error has no `detail` → the deployed build could not reach the backend (empty/incorrect `EXPO_PUBLIC_BACKEND_URL` baked at Metro build time). Preview and production use SEPARATE DBs (preview-only accounts 401 in prod by design).
  - Client hardening shipped in `src/api/client.ts`: explicit `ApiError` on network/fetch failure (includes target URL), explicit error when `EXPO_PUBLIC_BACKEND_URL` is empty, readable handling of array (422) `detail`. Verified by testing_agent (iteration_5) — no regression; wrong password now shows "Invalid credentials".
  - Action: dispatched deployer to verify the LITERAL baked backend URL and re-bake `EXPO_PUBLIC_BACKEND_URL=https://media-vault-api.emergent.host` if wrong. User must **redeploy** to re-bundle, then use a **production-registered** account.


## PRODUCTION-READY BRIEF — Progress Log

### PHASE 1 (done): Architecture analysis reported to user.
Stack: Expo Router FE (fetch+useState, no react-query), FastAPI `/api`, MongoDB
(users, user_sessions, discoveries, library, collections). Auth: email/pw (bcrypt +
7-day session token) + Emergent Google. Gaps: no i18n, no admin/role, no analytics,
no ads CRM, no account deletion, no legal pages, no Nostr.

### Grup A — Store-blocker foundations (IN PROGRESS)
Done & tested this turn:
- Backend (additive, backward-compatible in server.py):
  - `users.role` field (default "user"); admin seeded on startup for
    yagmurkarasogut@gmail.com (idempotent).
  - `UserPublic.role` + `_to_public` now returns role.
  - `POST /api/auth/change-password` (auth'd; verifies current pw).
  - `DELETE /api/auth/account` — soft delete: sets deleted_at, anonymizes PII,
    frees email for re-registration, invalidates sessions.
  - login + get_current_user reject users with `deleted_at`.
  - curl-verified: change-pw (old pw 401), delete (login 401 after), re-register 200.
- Frontend:
  - `app/settings.tsx` (new) — language toggle (EN/TR, persisted via storage),
    change password, legal links (ToS, Privacy/KVKK), delete account w/ confirm.
  - Profile → Settings link (testID profile-settings-button); route registered in _layout.
  - Screenshot-verified render + TR toggle.

Deferred to next turns (reported to user):
- Full i18n rollout across ALL screens (only Settings localized so far).
- Email-based password reset (needs Emergent Resend integration → integration_expert first).
- First-launch language prompt.
- Legal pages actual content/screens (currently placeholder links).
- Then Grup B (analytics/rating/genres), Grup C (admin+ads CRM), Grup D, Grup E (Nostr).

### VPN/network (Madge 2) — pending deeper RCA
Backend externally healthy (health/register 200, valid SSL, CORS *). User reports
their specific phone needs VPN though others don't. Next: deployer-agent RCA covering
DNS/IPv4-IPv6/SSL/firewall + confirm prod build never bakes preview URL.


### SCOPE FREEZE iteration (Trace 1.0) — COMPLETE & TESTED (iteration_9)
User froze scope: stabilize + production-ready, NO new roadmap features (Nostr/ads/
analytics/rankings/ratings all deferred). Delivered this turn:
- Complete TR/EN i18n: src/i18n/{index.tsx,translations.ts}; I18nProvider wired in _layout
  (device-locale default via expo-localization, persisted key 'trace_language'). Localized
  ALL screens: tabs, login, register, onboarding (EXACT provided TR copy), home, library
  (filters/sorts/genres), lists, search, profile, settings, add-discovery, movie detail,
  list detail, list new. TR verified with no English leftover on core screens.
- Forgot/reset password via Emergent-managed Resend (backend/services/email.py, key already
  in backend/.env: EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME=Trace). Flow: /auth/forgot-password
  (non-enumerating, 6-digit bcrypt code, 15min) + /auth/reset-password (wrong/expired 400,
  >5 attempts 429). Email delivery verified. Frontend: app/(auth)/forgot.tsx 2-step.
- Legal screens app/legal/[doc].tsx (bilingual Terms + Privacy/KVKK), linked from Settings.
- Settings finalized (exact TR delete-account copy).
- Backend: change-password, account deletion (KVKK), admin role seed (yagmurkarasogut@gmail.com)
  — all from prior turn, re-verified.
Testing: iteration_9 = 18/18 backend pytest + full frontend PASS. Retest false.

### STILL PENDING for production release (reported to user, not yet done)
- VPN/production connectivity RCA (needs deployer agent on production side).
- App Store / Google Play config audit (app.json identifiers/version/build/permissions).
- Deterministic build-time production API URL (vs current client.ts runtime safety-net).


### Follow-up: VPN RCA + Store Audit + Login Language (COMPLETE)
Checkpoint before work: git 39490a8.
- **Login Language switch**: compact TR|EN pill top-right of login screen (app/(auth)/login.tsx),
  uses useI18n setLang, persisted. Verified: whole login screen switches TR/EN instantly.
- **Store Audit (app.json)**: added ios.buildNumber="1", android.versionCode=1,
  ios ITSAppUsesNonExemptEncryption=false (skips App Store export-compliance prompt).
  Kept scheme="frontend" (Google OAuth derives redirect from scheme via Linking.createURL —
  changing it risks OAuth regression on rebuild; not a store blocker). Permissions already minimal
  (INTERNET, READ_MEDIA_IMAGES) with usage strings. bundleId/package unchanged.
- **Legal**: company-specific fields now explicit [PLACEHOLDER] markers (provider/contact/effective
  date) per user — not invented. Structure ready for real details later.
- **VPN RCA (deployer, authoritative)**: production origin HEALTHY, 2 fixed replicas (no sleep),
  no geo/WAF/IP-allowlist/bot-challenge. Top hypothesis = broken/half-open IPv6 on the affected
  carrier; VPN masks it via IPv4. NOT a source bug — no RN-side fix to force IPv4 in fetch.
  Action for user: on failing device test cellular vs wifi / disable IPv6 to confirm; platform to
  confirm AAAA/IPv6 origin reachability. App already resolves prod host deterministically in non-dev
  builds (client.ts safety-net), so production never actually uses the baked preview URL.


### Rebrand Trace->Stash Go + AI-from-Home + AI beyond Library (iteration_10) + Subscriptions
Checkpoint before payments: git 77f53c5.
- BRAND: user-facing "Trace"->"Stash Go" in i18n (en+tr), legal, email templates, app.json name,
  EMAIL_FROM_NAME. Auth wordmarks replaced with logo image (assets/images/logo.png) on login/
  register/onboarding. Technical ids/hostnames/scheme/bundleId unchanged.
- TR fix: removed "Vault/Kasa/Kasanız" -> "Library/Kütüphane(niz)"; titles never translated (data).
- AI from Home: app/ai-discover.tsx (conversational) + Home "Ask Stash Go" entry+chips.
- AI beyond library: backend POST /api/ai/discover (ai_pipeline.discover_from_clue, Gemini general
  knowledge, TMDB-enriched, NOT library-bound, not auto-saved; save via POST /library). Tested identify+recommend.
- iteration_10 testing PASS (backend 14/14, frontend ~95%); the only miss (auth wordmarks) fixed after.

### Subscriptions — Stash Go Premium (Emergent-managed RevenueCat)
- RevenueCat connected + provisioned: entitlement `pro`, offering `default`, $rc_monthly=prod682fc458bf.
  Price set to USD 2.99 + TRY 149.99 / month. Keys in frontend/.env. Details in /app/memory/revenuecat.md.
- Frontend: src/lib/revenuecat.tsx (per playbook), _layout QueryClient+SubscriptionProvider+logIn/out,
  app/paywall.tsx (coded paywall, monthly, restore, entitlement gate, unavailable fallback), Settings
  premium row, entitlement bridge src/lib/entitlement.ts.
- AI limit: FREE=5 analyses/calendar day (backend ai_usage counter on /discoveries + /ai/discover),
  PREMIUM=unlimited via client X-Premium header (entitlement source of truth = RC SDK per playbook).
  curl-verified: 6th call -> 402; X-Premium:1 bypass -> 200. GET /api/ai/usage reports usage.
  On 402 the AI screen redirects to /paywall.
- CAVEAT: real purchases only work on a native/dev or store build; Expo Go/web use RC Test Store
  (simulated). User must complete store-side IAP setup (FAQ in payments panel) for live purchases.


### Stash Go 1.0 polish pass (checkpoint e6b1d7c)
DONE+TESTED: onboarding copy "Nasıl çalışır?"/"How does it work?"; removed duplicate top-left onboarding logo (login/register logo kept); AI credit system backend (recommend=2, analysis=1, 5/day free, premium unlimited) curl-verified 5->3->2->0->402; GET /api/ai/usage returns credits; Home shows "✨ n/5 AI credits" badge (Premium=Sınırsız); Home+Library focus-refresh (fixes "0 KÜTÜPHANEDE" count + immediate sync), Lists already had it; Search (Ara) now routes to the SAME general AI (/ai-discover) instead of library-only /search; remove-from-library confirmation (native Alert, TR/EN copy) on movie detail; portrait-only + userInterfaceStyle=dark locked; TR nav terms already correct (Ana Sayfa/Kütüphane/Listeler/Ara/Profil); device-language default already via expo-localization.
DEFERRED (needs dedicated pass, reported to user): #5 EMAIL VERIFICATION (required-verify flow + resend + gating) — larger auth change; #9 extra Library filter categories (metadata already on detail page); exhaustive QA of #14 back/close, #16 keyboard, #17 large-text, #18 offline messages, #19 permission rationale (existing behavior mostly compliant; not fully re-audited). NOTE: remove-confirm uses RN Alert (works on device, no-op on web preview).

### Part 3 RevenueCat diagnostic (iteration 11)
App-side prepared correctly (proj7dfcb740, entitlement pro, offering default current, $rc_monthly=prod682fc458bf @ 2.99USD/149.99TRY, SDK keys in .env, SubscriptionProvider+logIn/out+coded paywall). "Abonelik seçenekleri kullanılamıyor" appears because: (a) preview runs on web/Expo Go = RevenueCat TEST STORE (simulated), and (b) real App Store Connect + Google Play subscription products with matching product IDs are NOT yet created, and store credentials (ASC .p8 API key, Play service-account JSON) NOT yet uploaded to RevenueCat. => EXTERNAL STORE-CONFIG BLOCKER, not an app bug. Real offerings/purchases only resolve in a native dev/TestFlight/Play build after store products exist. Do NOT claim real purchases work until verified in a native build.
