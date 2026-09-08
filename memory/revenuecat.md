# RevenueCat — integrated (2026-09-08)
Memory for later interaction with the user's RevenueCat account via the integration proxy.

## Identifiers (from /setup response — verbatim)
- rc_project_id: proj7dfcb740
- apple_app_id: app6129a81744
- play_app_id: appe037cfeabb
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prod682fc458bf   (USD 2.99 + TRY 149.99 / P1M, trial: none)
  - $rc_annual  -> proddc00154b43   (default $79.99 / P1Y — provisioned, NOT shown in UI; app uses monthly only)
- Bundle id / package (app.json): com.emergent.mediavaultapi.fcqxk1 (iOS + Android)
- Dashboard: https://app.revenuecat.com/projects/proj7dfcb740

## App wiring
- SDK keys written to frontend/.env: EXPO_PUBLIC_REVENUECAT_TEST/IOS/ANDROID_API_KEY
- lib: frontend/src/lib/revenuecat.tsx (SubscriptionProvider, useSubscription, initializeRevenueCat)
- init at module scope in app/_layout.tsx; QueryClientProvider + SubscriptionProvider added
- identity: Purchases.logIn(user.user_id) / logOut() in AuthGate effect
- paywall: app/paywall.tsx (coded paywall, monthly package, restore, entitlement gate)
- entitlement bridge: frontend/src/lib/entitlement.ts mirrors isSubscribed -> API client sends X-Premium header

## AI usage limit (Stash Go requirement)
- Backend server.py: FREE_AI_DAILY_LIMIT=5. _check_ai_quota() counts ai_usage per user per calendar day.
- Enforced on POST /api/discoveries and POST /api/ai/discover. GET /api/ai/usage reports usage.
- Premium bypass: client sends header `X-Premium: 1` when RevenueCat entitlement `pro` is active.
  (Per Emergent RC playbook, entitlement source of truth is the client SDK; backend only counts free usage.)

## Later product/price changes (integration proxy ONLY — never call RevenueCat REST directly)
AUTH header: Authorization: Bearer <emergent key, in playbook — NOT stored here>
- Upsert price: POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/d50e39f8-aaa1-4f5a-a14a-a8cc03951d7e/products
  body: {"products":[{"package":"$rc_monthly","price":2.99,"currency":"USD","period":"P1M","prices":[{"amount_micros":2990000,"currency":"USD"},{"amount_micros":149990000,"currency":"TRY"}]}]}
- Remove package: DELETE .../products/%24rc_monthly
- Status: GET $INTEGRATION_PROXY_URL/internal/revenuecat/projects/d50e39f8-aaa1-4f5a-a14a-a8cc03951d7e/status
- Recover keys / repopulate .env: re-run idempotent /setup.

## Going LIVE (USER manual store steps — agent cannot do)
All steps are in the FAQ section of the payments panel. Summary:
1. Upload App Store Connect API key (.p8) + Google Play service-account JSON to RevenueCat dashboard.
2. Set up payment profiles in App Store Connect + Play Console.
3. Create matching IAP products using the SAME product IDs shown in the RevenueCat dashboard.
4. Make a release build, test via TestFlight / Play internal testing, then submit for review.
NOTE: Real purchases only work in store/dev builds — Expo Go / web preview use the RevenueCat Test Store (simulated).
