# Rocalytics SDK

Client-side integration guide for [Rocalytics](https://rocalytics-api.rocapine.io) — the Rocapine analytics backend.

Rocalytics is delivered as a copy-paste TypeScript client, not a published npm package. Drop the file into your project, instantiate once, and call `track` / `identify` / `trackPurchase` from your app code.

---

## Contents

- [Quickstart (Expo)](#quickstart-expo)
- [Claude Code skill](#claude-code-skill)
- [API reference](#api-reference)
- [Events](#events)
- [HTTP API](#http-api)
- [Identifiers](#identifiers)
- [Device context](#device-context)
- [Deduplication](#deduplication)
- [Cross-network deduplication](#cross-network-deduplication)

---

## Quickstart (Expo)

### 1. Install dependencies

```bash
npx expo install expo-application expo-crypto expo-device expo-network expo-secure-store
```

If you use Superwall for purchases:

```bash
npx expo install expo-superwall
```

### 2. Copy the client

Copy [`examples/expo/rocalytics.client.ts`](./examples/expo/rocalytics.client.ts) into your project at `utils/rocalytics.client.ts`.

### 3. Instantiate once

```typescript
// utils/analytics.ts
import { RocalyticsClient } from "./rocalytics.client";

export const rocalytics = new RocalyticsClient();
```

The constructor kicks off init in the background (it generates / loads the `roca-id`, collects device context, and fires the first-launch `install` event). You do not need to `await` it — `.track` and `.trackPurchase` await it internally.

### 4. Track events

```typescript
import { rocalytics } from "@/utils/analytics";

await rocalytics.track("onboarding_completed");
```

### 5. Track purchases (Superwall)

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

### 6. Attach third-party identifiers

Call `identify` whenever you obtain a new ID (Amplitude device ID, Adjust adid, RevenueCat user, IDFV/IDFA, GAID, etc.):

```typescript
await rocalytics.identify({
  amplitude_device_id: amplitudeDeviceId,
  adjust_id: adjustId,
  revenue_cat_id: revenueCatUserId,
});
```

Identifiers are merged server-side onto the current `roca-id`. Send only the IDs you have; `null` / `undefined` values are filtered out.

---

## Claude Code skill

This repo ships a [Claude Code](https://claude.com/claude-code) plugin that scaffolds the client for you.

### Install (recommended)

In Claude Code:

```
/plugin marketplace add Rocapine/rocalytics
/plugin install rocalytics-setup@rocapine
```

Then run:

```
/rocalytics-setup
```

Claude will install the Expo dependencies, write `utils/rocalytics.client.ts`, and show you how to wire the client into your app.

### Manual install (fallback)

Copy [`plugins/rocalytics-setup/skills/rocalytics-setup`](./plugins/rocalytics-setup/skills/rocalytics-setup) into your project at `.claude/skills/rocalytics-setup`, or globally at `~/.claude/skills/rocalytics-setup`.

---

## API reference

### `new RocalyticsClient()`

Creates a singleton client. The constructor starts initialization (load/generate `roca-id`, collect device context, fire first-launch `install`). The instance exposes a `ready: Promise<void>` you can await if you need to be sure init is complete — but `.track` and `.trackPurchase` await it for you.

### `client.track(name, properties?)`

Fire a named event.

| Param | Type | Notes |
|---|---|---|
| `name` | `TrackEventName` | One of `"install"`, `"onboarding_completed"`, `"purchase"`, `"subscription_started"`, `"trial_started"` |
| `properties` | `Record<string, unknown>` | Optional free-form properties |

### `client.trackPurchase(params)`

Fire a `purchase` event. Deduplication key is `${rocaId}-purchase-${originalTransactionIdentifier}`, so re-firing the same transaction is safe.

```typescript
type TrackPurchaseParams = {
  isTrial: boolean;
  value: number;
  product: StoreProduct; // expo-superwall/compat
  transaction: StoreTransaction; // expo-superwall/compat
  currency: string;
  originalTransactionIdentifier: string;
};
```

### `client.identify(identifiers)`

Attach third-party identifiers to the current `roca-id`. `null` / `undefined` values are filtered out before sending.

```typescript
type IdentifyParams = {
  revenue_cat_id?: string | null;
  adjust_id?: string | null;
  user_id?: string | null;
  amplitude_device_id?: string | null;
  idfa?: string | null;
  idfv?: string | null;
  android_id?: string | null;
  customerio_id?: string | null;
  segment_id?: string | null;
  gaid?: string | null;
};
```

---

## Events

| Event | When |
|---|---|
| `install` | Auto-fired on first launch only (guarded by SecureStore flag) |
| `onboarding_completed` | Fire from your app when the user finishes onboarding |
| `purchase` | Fire via `trackPurchase` after a successful transaction |
| `trial_started` | Fire from your app when a free trial starts |
| `subscription_started` | Fire from your app when a paid subscription starts (non-trial) |

To add a new event type, extend the `TrackEventName` union in `rocalytics.client.ts`.

---

## HTTP API

The client talks to `https://rocalytics-api.rocapine.io`. Full contract: [`openapi.yaml`](./openapi.yaml).

### `POST /functions/v1/track`

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Roca-ID` | UUID for the device (persisted in SecureStore) |
| `X-Application-ID` | `Application.applicationId` |
| `X-Platform` | `ios` or `android` |

Body:

```json
{
  "name": "purchase",
  "deduplication_id": "<roca-id>-purchase-<transaction-id>",
  "properties": { },
  "device_context": { }
}
```

### `POST /functions/v1/identify`

Same headers. Body is a partial `IdentifyParams` object (only non-null IDs).

---

## Identifiers

The `roca-id` is the primary key for a device. It is:

- A UUID generated on first launch (`Crypto.randomUUID()`).
- Persisted in `expo-secure-store` under the key `rocalitics-roca-id`.
- Stable forever — survives app updates; only reset on app uninstall.

Third-party IDs (Amplitude, Adjust, RevenueCat, IDFV, IDFA, GAID, …) are merged onto the `roca-id` via `identify`. This lets you join Rocalytics events with data from other analytics providers.

---

## Device context

Every `track` call ships a snapshot of device context, collected once during init:

```typescript
{
  ip,                    // best-effort, may be null
  user_agent,            // "<AppName>/<AppVersion> (<Brand> <Model>; <OS> <OSVersion>; <Locale>)"
  device_model,
  device_brand,
  device_manufacturer,
  os_name,
  os_version,
  screen_width,
  screen_height,
  screen_scale,
  timezone,
  locale,
  app_version,
  app_build,
}
```

---

## Deduplication

Every event has a `deduplication_id`. The server treats two events with the same `deduplication_id` as the same event — duplicates are silently dropped.

Defaults:

- Regular events: `${rocaId}-${name}` (one event per name per device — useful for `install`, `onboarding_completed`).
- Purchase events: `${rocaId}-purchase-${originalTransactionIdentifier}` (one event per transaction, so the same purchase can be safely retried).

To override, call `trackRequest` directly with a custom `deduplicationId`.

---

## Cross-network deduplication

Rocalytics forwards purchase / trial / subscription events to ad networks (Meta CAPI, TikTok Events API, Adjust S2S) server-side. If your app **also** fires the same conversion client-side (Meta Pixel, TikTok Pixel, Adjust SDK), the ad network needs an `event_id` (or `callback_id`) shared by both calls to deduplicate them — otherwise the conversion is double-counted.

The client exports a helper that returns the same id Rocalytics uses when forwarding:

```typescript
import { getEventId } from "@/utils/rocalytics.client";

const eventId = getEventId("purchase", {
  originalTransactionIdentifier: transaction.originalTransactionIdentifier,
});
// → "purchase-2000000841136630"
```

Pass `eventId` as:

| Network | Field |
|---|---|
| Meta CAPI / Pixel | `event_id` |
| TikTok Events API / Pixel | `event_id` |
| Adjust S2S | `callback_id` |

Signature:

```typescript
getEventId(
  name: string,
  properties?: Record<string, unknown> | null,
): string | undefined;
```

Returns `${name}-${originalTransactionIdentifier}` if a transaction id is present in `properties` (looked up under `original_transaction_identifier`, `originalTransactionIdentifier`, or `transaction.originalTransactionIdentifier`), otherwise `undefined`. Skip the client-side network fire when it returns `undefined`.

---

## License

Internal — Rocapine.
