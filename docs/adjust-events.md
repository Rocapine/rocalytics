# Sending an event to Adjust

How an app fires a conversion through the Adjust SDK so it lines up with Rocalytics and with what Adjust forwards to Meta.

Every Adjust event carries three ids:

| Id | Adjust field | Value | Why |
|---|---|---|---|
| `roca_id` | global partner parameter `roca_id` | `rocalytics.rocaId` | Joins every Adjust event and postback back to the Rocalytics device. |
| `order_id` | partner parameter `order_id` | the purchase's `originalTransactionIdentifier` | Meta's `order_id`. The delayed pLTV (`AppendValue`) Rocalytics sends matches the conversion on it. |
| `event_id` | partner parameter `event_id` | `getEventId(name, { original_transaction_identifier })` | Meta deduplicates on `event_id` + `event_name`, against the copy Rocalytics sends through Meta CAPI. |

The one rule: the transaction id must be **the same value you passed to `trackPurchase`**. If it differs, Meta double-counts and `AppendValue` matches nothing. No error is raised.

---

## 1. `roca_id`: once, as a global partner parameter

Set it once the client is ready. Adjust then adds it to every event and postback.

```typescript
import { Adjust } from "react-native-adjust";
import { rocalytics } from "@/services/analytics/rocalytics";

await rocalytics.ready;
if (rocalytics.rocaId) {
  Adjust.addGlobalPartnerParameter("roca_id", rocalytics.rocaId);
}
```

`rocaId` is null before `ready` and when the client is inert. Skip it then, never send an empty string.

> Server side, Meta CAPI sends `external_id` = `sha256(roca_id)`. A raw `roca_id` forwarded by Adjust does not join with it, so don't map `roca_id` to Meta's `external_id` unless you hash it the same way.

---

## 2. `order_id` and `event_id`: on each conversion event

```typescript
import { Adjust, AdjustEvent } from "react-native-adjust";
import { getEventId } from "@rocapine/rocalytics-sdk/client";

export function trackAdjustConversion(
  adjustEventToken: string,
  name: "trial_started" | "purchase" | "subscribe", // the prefix Rocalytics uses, see below
  originalTransactionIdentifier: string, // the same value passed to trackPurchase
) {
  const event = new AdjustEvent(adjustEventToken);

  event.addPartnerParameter("order_id", originalTransactionIdentifier);

  const eventId = getEventId(name, { original_transaction_identifier: originalTransactionIdentifier });
  if (eventId) event.addPartnerParameter("event_id", eventId);

  Adjust.trackEvent(event);
}
```

Example, for a purchase with transaction `2000000841136630`:

| Parameter | Value |
|---|---|
| `roca_id` | `0b6c…` (global) |
| `order_id` | `2000000841136630` |
| `event_id` | `purchase-2000000841136630` |

`getEventId` returns `undefined` without a transaction id. Send no `event_id` then, rather than a made-up one.

`event_id` goes in a **partner parameter**, because partner parameters are what Adjust forwards to Meta. `setCallbackId` is not a dedup field and Meta never sees it. `setDeduplicationId` only dedupes inside Adjust.

### Which `name` to pass

The prefix must be exactly the one `meta-capi` uses, character for character:

- `trial_started` → `trial_started-<tx>`
- `subscribe` → `subscribe-<tx>`
- `purchase` → `purchase-<tx>`, **except** the apps with a legacy prefix (Unchaind `9xiipt`, Harmony `user_converted`). See "Per-app prefix overrides" under [Cross-network deduplication](../README.md#cross-network-deduplication).

Pin the expected id in a test in the app. Nothing on the Rocalytics side notices a drift.

### Roca-only apps

For apps in `APPS_WITHOUT_REDUNDANT_EVENTS` (`meta-capi/index.ts`: Stashcook, Military Calisthenics Women, Pose, Lockyn), Rocalytics sends only its `Roca*` events to Meta, never `StartTrial` / `Purchase`. Those two conversions come **only** from the app's Adjust events (`trial_started`, `user_converted`):

- `order_id` is **required**: Rocalytics's `AppendValue` (delayed pLTV) points at the conversion by `order_id` alone.
- `event_id` has no server twin to dedupe against. It is still worth sending, so a resend or a Meta SDK fire of the same conversion dedupes.

---

## 3. Adjust dashboard: forward the parameters to Meta

Partner parameters reach Meta only once the Meta partner module is set up to send them ([Adjust: Set up Meta](https://help.adjust.com/en/article/facebook)):

1. **Data sharing**: enable **Parameters**, so the SDK's partner parameters are shared with Meta.
2. **Event linking**: link each Adjust event token to its Meta event (`trial_started` → `StartTrial`, `user_converted` → `Purchase`, …). The Meta event name is the other half of the dedup key, so it must be the one Rocalytics uses for the same kind.
3. **Parameter mapping**: map each SDK parameter to its Meta parameter: `order_id` → `order_id`, `event_id` → `event_id`.

---

## Checklist

- [ ] `roca_id` set as a global partner parameter after `rocalytics.ready`, only when not null.
- [ ] Every conversion carries `order_id` = the `originalTransactionIdentifier` sent to `trackPurchase`.
- [ ] Every conversion carries `event_id` from `getEventId`, with the app's exact prefix.
- [ ] In the Adjust dashboard: parameter sharing on, events linked to the right Meta events, `order_id` and `event_id` mapped.
- [ ] A test in the app pins the expected `event_id` for each conversion.
