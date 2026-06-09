# Changelog

All notable changes to the Rocalytics API and client are documented here.

Format: `[version or date] — summary`. Breaking changes are marked **BREAKING**.

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
