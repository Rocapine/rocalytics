# Changelog

All notable changes to the Rocalytics API and client are documented here.

Format: `[version or date] — summary`. Breaking changes are marked **BREAKING**.

---

## [2026-09-07] — Fix: Stripe web-checkout purchases + document per-app dedup prefixes

### Fixed
- `trackPurchase` threw on a Superwall web-checkout (Stripe) purchase: `product` and `transaction` were required and `product.productIdentifier` was dereferenced unconditionally, but a web purchase carries neither. They are now optional, `product_id` comes from a new required `productId` param, and `redemptionResult` is forwarded as `experimental.redemption_result` — the key `/track` already reads to capture the purchaser's email and Stripe customer id onto the identity.

### Changed
- **BREAKING (types only)**: `TrackPurchaseParams` now takes `productId: string`; `product` and `transaction` became optional. Callers that relied on `product.productIdentifier` being read for them must pass `productId`.

### Docs
- The README claimed `/track` forwards conversions to Meta CAPI, TikTok Events API **and** Adjust S2S. Only `meta-capi` is dispatched — there is no Adjust or TikTok forward in the project. Corrected, with a note that an `event_id` set on an Adjust/TikTok event has no server-side counterpart to dedupe against.
- Documented the per-app `event_id` prefix overrides in `meta-capi/event_id.ts` (`9xiipt` for Unchaind, `user_converted` for Harmony, `purchase` for everything else) and that `getEventId` uses its `name` argument verbatim. Their absence from the docs let Unchaind's client drift to two different prefixes in July 2026; Meta double-counted every purchase for ~7 weeks (5498 events in 30 days).
- Corrected the dedup-field table: Adjust's deduplication field is `setDeduplicationId`, not `setCallbackId`.

---

## [2026-07-21] — Check for Adjust subscription tracking during setup

### Added
- `/rocalytics-setup` Step 5: if `react-native-adjust` is a dependency, checks whether Adjust subscription tracking on Superwall purchases is already implemented (`adjust-superwall-bridge.ts` or a direct `trackAppStoreSubscription`/`trackPlayStoreSubscription` call). If it's already there, leaves it alone; if not, asks the user whether to scaffold it via `/adjust-superwall` (not invoked silently, unlike the Rocalytics/Superwall wiring in Step 4 — this forwards to Adjust, not Rocalytics, so it's opt-in).

---

## [2026-07-21] — Fix: /rocalytics-setup silently skipping Superwall wiring

### Changed
- `/rocalytics-setup` had a trailing "if expo-superwall is present, run /rocalytics-superwall" note at the very end of the skill, easy to miss and not enforced — in practice it was skipped and Superwall purchase/event tracking wasn't wired. Promoted to a required Step 4 in the main flow: check `package.json` for `expo-superwall` and invoke `/rocalytics-superwall` in the same run before reporting done.

---

## [2026-07-21] — Raw Superwall event logging

### Added
- `POST /functions/v1/superwall-events` — stores the Superwall SDK's `superwallEventInfo` payload verbatim (no schema validation) into the `superwall_events` table, alongside the normalized `track` events. Documented in `openapi.yaml` (`SuperwallEventPayload`).
- `client.trackSuperwallEvent(superwallEventInfo)` on the Rocalytics client, calling the new route.
- `/rocalytics-superwall` skill — new optional Step 3 scaffolding `rocalytics-superwall-events-bridge.ts`, which forwards every `useSuperwallEvents({ onSuperwallEvent })` event to `trackSuperwallEvent`.

---

## [2026-07-21] — Meta-via-Adjust purchase naming fix

### Changed — **BREAKING**
- The `name` passed to `getEventId` for purchase conversions forwarded to Meta via Adjust is now `"purchase"`, not `"user_converted"`. `user_converted` was already retired as an analytics event name; reusing it as the Meta callback_id name was inconsistent. Update any `getEventId("user_converted", ...)` call to `getEventId("purchase", ...)`.

---

## [2026-07-08] — qonversion_id identity field

### Added
- `qonversion_id` added to `IdentifyPayload` (`openapi.yaml`) and the client's `IdentifyParams` type — pass a Qonversion user id via `rocalytics.identify({ qonversion_id })`.

---

## [2026-07-03] — Custom events

### Added
- `trackCustomEvent(name, properties?)` on the client — fire an arbitrary-named event that the backend forwards to the CRM to drive automations (email flows, etc.) instead of storing it as an analytics event. Deduped on `${rocaId}-${name}`, so re-firing is safe.
- `POST /functions/v1/track` accepts a `custom_event: true` flag (see `CustomEventPayload` in `openapi.yaml`): when set, the `VALID_EVENTS` gate + property validation are skipped, no analytics row is written, and the event is redirected to the CRM ingest webhook with `{ application_id, event, roca_id, properties, event_id }` (where `event_id` is the `${rocaId}-${name}` deduplication_id, stored as the CRM's `custom_events.dedup_key` for idempotency). The CRM resolves the project + recipient email and runs the matching automation.

---

## [2026-07-01] — Meta-via-Adjust event naming

### Added
- Documented the event names to use as the Adjust `callback_id` when forwarding conversions to Meta through the Adjust SDK: `purchase` (purchase), `trial_started` (trial start), `subscribe` (subscribe). Compute the id with the existing `getEventId(name, properties)` — no new client code required.

---

## [2026-06-09] — Status endpoint + subscription events removed

### Added
- `GET /functions/v1/status?app={application_id}` — check event ingestion per app. Returns event names, counts, and `latest_received_at`. Use after setup to confirm `install`, `onboarding_completed`, and `purchase` are reaching the backend.

### Removed — **BREAKING**
- `trial_started` event removed from `TrackEventName` and client API. The `openapi.yaml` schema is kept for reference but the event is no longer tracked by the standard client.
- `subscription_started` event removed from `TrackEventName` and client API. Same — schema preserved, not tracked.

**Migration:** Remove any `rocalytics.track("trial_started", ...)` or `rocalytics.track("subscription_started", ...)` calls. Purchase tracking is now consolidated into `trackPurchase(...)` which fires `purchase` with `is_trial: true/false` to distinguish trial starts from paid conversions.

---

## [2026-05-13] — Superwall delegate + cross-network deduplication

### Added
- `getEventId(name, properties)` — returns a stable `"{name}-{originalTransactionIdentifier}"` string for passing as `event_id` to Meta CAPI/Pixel, TikTok Events API, and Adjust S2S to dedupe client-side and server-side conversion fires.
- `/rocalytics-superwall` skill — wires `trackPurchase` into `SuperwallDelegate.handleSuperwallEvent` for `EventType.transactionComplete`.

---

## [pre-history] — Initial events (reference only)

Events that existed before this repo was created. Documented here so AIs and integrators know these names are retired and should not be re-introduced.

| Event | Status | Notes |
|---|---|---|
| `user_converted` | Removed | Early conversion event, superseded by `purchase` |
| `paywall_presented` | Present in schema, not tracked by default | Schema exists in `openapi.yaml` but not in `TrackEventName`; wire manually if needed |
| `subscription_started` | Removed (see 2026-06-09) | Use `purchase` with `is_trial: false` |
| `trial_started` | Removed (see 2026-06-09) | Use `purchase` with `is_trial: true` |

---

## Current events (as of 2026-06-09)

| Event | How to fire | Notes |
|---|---|---|
| `install` | Auto-tracked on first launch | Guarded by SecureStore flag, fires once |
| `onboarding_completed` | `rocalytics.track("onboarding_completed")` | Fire when user finishes onboarding |
| `purchase` | `rocalytics.trackPurchase(params)` | Covers both trials (`is_trial: true`) and paid conversions |
