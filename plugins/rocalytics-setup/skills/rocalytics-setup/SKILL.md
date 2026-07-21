---
name: rocalytics-setup
description: Install and wire up the Rocalytics analytics client in an Expo/React Native project. Use this whenever the user wants to add Rocalytics tracking, set up the rocalytics client, or mentions rocalytics in any context — even if they just say "add rocalytics" or "set up rocalytics". Scaffolds utils/rocalytics.client.ts and instantiates the client at app startup.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# /rocalytics-setup

Sets up the Rocalytics analytics client in an Expo/React Native project.

Arguments: `$ARGUMENTS`

---

## Overview

Two steps:

1. Install required Expo dependencies.
2. Scaffold `utils/rocalytics.client.ts` from the reference file.
3. Instantiate `RocalyticsClient` once at app startup and call `.track(...)` / `.trackPurchase(...)` from app code.

---

## Step 1 — Install dependencies

Run from the project root:

```bash
npx expo install expo-application expo-crypto expo-device expo-network expo-secure-store
```

Optional (only if the project uses Superwall for purchases — required for the `StoreProduct` / `StoreTransaction` types):

```bash
npx expo install expo-superwall
```

If the project does not use Superwall, replace the `import type { StoreProduct, StoreTransaction } from "expo-superwall/compat";` line with project-local types and adjust `TrackPurchaseParams` accordingly.

---

## Step 2 — Scaffold the client

Read `references/rocalytics.client.ts` (in this skill's directory) and write it to `utils/rocalytics.client.ts` in the project.

If the file already exists, reconcile: keep any fields or methods the user has already added, but ensure all exported types and the `RocalyticsClient` class match the reference. The reference is the source of truth for the API contract.

**Key things this client does:**

- Persists a `roca-id` UUID in SecureStore (created on first launch, stable forever).
- Collects device context (IP, user-agent, screen size, timezone, locale, app version, etc.).
- Auto-tracks an `install` event on first launch (guarded by a SecureStore flag).
- `track(name, properties?)` fires a named analytics event.
- `trackCustomEvent(name, properties?)` fires a custom (any-name) event that the backend forwards to the CRM to drive automations, instead of storing it as analytics. Deduped on `${rocaId}-${name}`.
- `identify(identifiers)` attaches third-party IDs (Amplitude, Adjust, RevenueCat, IDFV/IDFA, GAID, email, Adjust attribution object, …) to the current `roca-id`.
- `trackPurchase(params)` fires a `purchase` event with deduplication keyed on `originalTransactionIdentifier`.
- `getEventId(name, properties)` returns `${name}-${originalTransactionIdentifier}` — pass this as `event_id` (Meta CAPI/Pixel, TikTok Events API) or `callback_id` (Adjust S2S) when firing the same conversion to those networks so they dedupe client pixel ↔ Rocalytics server forward. Use `"purchase"`, `"trial_started"`, or `"subscribe"` as `name` when the event is forwarded to Meta via Adjust — see below.

---

## Step 3 — Use the client

Instantiate once and reuse. The instance exposes a `ready` promise; call sites do not need to await it — `.track` and `.trackPurchase` await it internally.

```typescript
// utils/analytics.ts
import { RocalyticsClient } from "./rocalytics.client";

export const rocalytics = new RocalyticsClient();
```

Track an event:

```typescript
import { rocalytics } from "@/utils/analytics";

await rocalytics.track("onboarding_completed");
```

Identify with third-party IDs (call when you have the IDs available — e.g. after Amplitude init):

```typescript
await rocalytics.identify({
  amplitude_device_id: amplitudeDeviceId,
  adjust_id: adjustId,
  revenue_cat_id: revenueCatUserId,
  qonversion_id: qonversionUserId,
});
```

Track a purchase (Superwall example):

```typescript
await rocalytics.trackPurchase({
  isTrial: product.hasFreeTrial ?? false,
  value: product.price,
  product,
  transaction,
  currency: product.currencyCode!,
  originalTransactionIdentifier: transaction.originalTransactionIdentifier,
});
```

Cross-network deduplication — when the app also fires conversion events to Meta / TikTok / Adjust client-side, pass the same `event_id` so the ad network dedupes against Rocalytics's server-side forward:

```typescript
import { getEventId } from "./rocalytics.client";

const eventId = getEventId("purchase", {
  originalTransactionIdentifier: transaction.originalTransactionIdentifier,
});
// → "purchase-2000000841136630"

// Use eventId as:
// - Meta CAPI / Pixel `event_id`
// - TikTok Events API `event_id`
// - Adjust S2S `callback_id`
```

Returns `undefined` if the event has no transaction identifier — skip cross-network firing in that case.

Attach Adjust attribution — call this from the Adjust attribution callback so Rocalytics can forward campaign data server-side:

```typescript
import type { AdjustAttribution } from "./rocalytics.client";

export const setAdjustAttribution = async (
  attribution: AdjustAttribution,
): Promise<void> => {
  try {
    await rocalytics.identify({ adjust_attribution: attribution });
  } catch (error) {
    console.error("[Rocalytics] Failed to set adjust attribution:", error);
  }
};
```

Wire it into the Adjust SDK setup:

```typescript
import Adjust, { AdjustConfig } from "react-native-adjust";

const config = new AdjustConfig(adjustToken, environment);
config.setAttributionCallback(setAdjustAttribution);
Adjust.initSdk(config);
```

Naming events sent to Meta via Adjust — when firing a purchase / trial / subscribe event through the Adjust SDK (e.g. `AdjustEvent`), reuse `getEventId` (the same Rocalytics deduplication id) for the `callback_id`, passing the Meta-facing event name so Meta's forwarded events dedupe against Rocalytics's server-side forward:

```typescript
import Adjust, { AdjustEvent } from "react-native-adjust";
import { getEventId } from "./rocalytics.client";

const event = new AdjustEvent(adjustEventToken);
event.setCallbackId(
  getEventId("purchase", {
    originalTransactionIdentifier: transaction.originalTransactionIdentifier,
  }),
);
// → "purchase-2000000841136630"
Adjust.trackEvent(event);
```

| Event | `name` passed to `getEventId` | Resulting id |
|---|---|---|
| Purchase | `"purchase"` | `purchase-{originalTransactionIdentifier}` |
| Trial started | `"trial_started"` | `trial_started-{originalTransactionIdentifier}` |
| Subscribe | `"subscribe"` | `subscribe-{originalTransactionIdentifier}` |

Attach user email — call when the email becomes known (after sign-in, onboarding, etc.):

```typescript
export const setEmail = async (email: string): Promise<void> => {
  try {
    await rocalytics.identify({ email });
  } catch (error) {
    console.error("[Rocalytics] Failed to set email:", error);
  }
};
```

---

## Verify

Type-check the project:

```bash
npx tsc --noEmit 2>&1 | grep -i rocalytics
```

A clean result (no output) means success. Fix any type errors before reporting done.

---

## Check event ingestion

After launching the app at least once, confirm events are reaching the Rocalytics backend:

```bash
curl "https://rocalytics-api.rocapine.io/functions/v1/status?app=YOUR_APP_ID"
```

Replace `YOUR_APP_ID` with the application bundle ID (e.g. `com.example.app`) — the same value passed as `X-Application-ID` in the client.

Expected response shape:

```json
{
  "application_id": "com.example.app",
  "events": [
    { "name": "install", "count": 1, "latest_received_at": "2026-06-09T15:01:09.181963+00:00" },
    { "name": "onboarding_completed", "count": 1, "latest_received_at": "2026-06-09T15:03:32.445206+00:00" },
    { "name": "purchase", "count": 1, "latest_received_at": "2026-06-09T15:00:21.570293+00:00" }
  ]
}
```

Check for these three events:

| Event | Triggered by | When to expect it |
|---|---|---|
| `install` | First app launch (auto-tracked by client) | Immediately after first run |
| `onboarding_completed` | `rocalytics.track("onboarding_completed")` | After user completes onboarding |
| `purchase` | `rocalytics.trackPurchase(...)` | After a successful transaction |

If an event is missing, verify the corresponding call is reached and that `X-Application-ID` matches the `app` query parameter.

---

## Superwall

If `expo-superwall` is present in `package.json` dependencies, run `/rocalytics-superwall` after this skill completes to wire purchase tracking into the Superwall delegate.
