---
name: rocalytics-superwall
description: Wire Rocalytics purchase tracking into a Superwall delegate. Use after /rocalytics-setup when the project uses expo-superwall for purchases.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# /rocalytics-superwall

Wires Rocalytics purchase tracking into a Superwall delegate.

Arguments: `$ARGUMENTS`

Run after `/rocalytics-setup`. Requires `expo-superwall` and a `utils/analytics.ts` that exports `rocalytics` (scaffolded by the base skill).

---

## Step 1 — Scaffold the provider

Read `references/rocalytics.provider.ts` (in this skill's directory) and write it to `services/analytics/providers/rocalytics.provider.ts` in the project.

If the file already exists, reconcile: keep any existing exports, ensure `trackPurchase` matches the reference signature.

---

## Step 2 — Wire the delegate

Locate the project's `SuperwallDelegate` subclass. If none exists, create it at `services/superwall/superwall.delegate.ts`.

Add the `EventType.transactionComplete` case to `handleSuperwallEvent`. If the case already exists, insert only the `trackPurchase` call — do not remove existing logic.

```typescript
import { captureException } from "@sentry/react-native";
import type { SuperwallEventInfo } from "expo-superwall/compat";
import { EventType, SuperwallDelegate } from "expo-superwall/compat";

import { trackPurchase } from "@/services/analytics/providers/rocalytics.provider";

export class MySuperwallDelegate extends SuperwallDelegate {
  handleSuperwallEvent(eventInfo: SuperwallEventInfo) {
    switch (eventInfo.event.type) {
      case EventType.transactionComplete:
        try {
          const product = eventInfo.event.product;
          const transaction = eventInfo.event.transaction;

          if (product && transaction) {
            trackPurchase(product, transaction);
          }
        } catch (err) {
          captureException(
            `Exception handling EventType.transactionComplete: ${err}`,
          );
        }
        break;
      default:
        break;
    }
  }
}
```

If the project does not use Sentry, replace `captureException` with `console.error`.

---

## Step 3 — Log every raw Superwall event (optional)

To keep a raw log of every Superwall event (paywall opens, page views, decisions, etc.) alongside the normalized `purchase` event, read `references/rocalytics-superwall-events-bridge.ts` and write it to `services/analytics/bridges/rocalytics-superwall-events-bridge.ts`.

Call [`useSuperwallEvents`](https://superwall.com/docs/expo/sdk-reference/hooks/useSuperwallEvents) once, near the app root, passing `logSuperwallEvent` as `onSuperwallEvent`:

```typescript
import { useSuperwallEvents } from "expo-superwall";

import { logSuperwallEvent } from "@/services/analytics/bridges/rocalytics-superwall-events-bridge";

function RootLayout() {
  useSuperwallEvents({
    onSuperwallEvent: logSuperwallEvent,
  });
  // ...rest of the layout
}
```

If the project already calls `useSuperwallEvents` elsewhere (e.g. from `/adjust-superwall`), add `logSuperwallEvent` inside that existing `onSuperwallEvent` callback instead of adding a second hook call — don't overwrite the existing callback, chain into it.

---

## Verify

```bash
npx tsc --noEmit 2>&1 | grep -i rocalytics
```

A clean result (no output) means success. Fix any type errors before reporting done.
