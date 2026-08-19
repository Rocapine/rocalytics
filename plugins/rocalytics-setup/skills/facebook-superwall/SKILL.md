---
name: facebook-superwall
description: Wire Facebook SDK purchase tracking into Superwall events. Use when the project tracks purchases with Facebook SDK and uses expo-superwall.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# /facebook-superwall

Scaffolds a bridge that forwards Superwall `transactionComplete` events to Facebook SDK for purchase tracking.

Arguments: `$ARGUMENTS`

Requires `expo-superwall` and `react-native-fbsdk-next` already installed and configured.

---

## Step 1 — Scaffold the bridge

Read `references/facebook-superwall-bridge.ts` (in this skill's directory) and write it to `services/analytics/bridges/facebook-superwall-bridge.ts` in the project.

If the file already exists, reconcile: keep any existing exports, ensure `trackPurchaseWithFacebookSDK` matches the reference signature.

The bridge applies a 0.2x price multiplier to trial purchases before sending to Facebook SDK.

Malformed events are logged with `console.error` and swallowed — nothing throws.

---

## Step 2 — Wire the hook

Call [`useSuperwallEvents`](https://github.com/superwall/expo-superwall#usesuperwallevents) once, near the app root (root layout / top-level App component), passing `trackPurchaseWithFacebookSDK` as `onSuperwallEvent`:

```typescript
import { useSuperwallEvents } from "expo-superwall";

import { trackPurchaseWithFacebookSDK } from "@/services/analytics/bridges/facebook-superwall-bridge";

function RootLayout() {
  useSuperwallEvents({
    onSuperwallEvent: trackPurchaseWithFacebookSDK,
  });
  // ...rest of the layout
}
```

If the project already calls `useSuperwallEvents` elsewhere, add `onSuperwallEvent: trackPurchaseWithFacebookSDK` to that existing call instead of adding a second one — don't overwrite an existing `onSuperwallEvent` callback, chain into it.

---

## Verify

```bash
npx tsc --noEmit 2>&1 | grep -i facebook
```

A clean result (no output) means success. Fix any type errors before reporting done.
