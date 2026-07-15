---
name: adjust-superwall
description: Wire Adjust subscription tracking into Superwall purchase events via the useSuperwallEvents hook. Use when the project tracks purchases with Adjust and uses expo-superwall.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash
---

# /adjust-superwall

Scaffolds a bridge that forwards Superwall `transactionComplete` events to Adjust subscription tracking.

Arguments: `$ARGUMENTS`

Requires `expo-superwall` and `react-native-adjust` already installed and configured.

---

## Step 1 — Scaffold the bridge

Read `references/adjust-superwall-bridge.ts` (in this skill's directory) and write it to `services/analytics/bridges/adjust-superwall-bridge.ts` in the project.

If the file already exists, reconcile: keep any existing exports, ensure `trackSubscriptionFromSuperwallEvent` matches the reference signature for both iOS and Android.

Malformed events are logged with `console.error` and swallowed — nothing throws.

---

## Step 2 — Wire the hook

Call [`useSuperwallEvents`](https://github.com/superwall/expo-superwall#usesuperwallevents) once, near the app root (root layout / top-level App component), passing `trackSubscriptionFromSuperwallEvent` as `onSuperwallEvent`:

```typescript
import { useSuperwallEvents } from "expo-superwall";

import { trackSubscriptionFromSuperwallEvent } from "@/services/analytics/bridges/adjust-superwall-bridge";

function RootLayout() {
  useSuperwallEvents({
    onSuperwallEvent: trackSubscriptionFromSuperwallEvent,
  });
  // ...rest of the layout
}
```

If the project already calls `useSuperwallEvents` elsewhere, add `onSuperwallEvent: trackSubscriptionFromSuperwallEvent` to that existing call instead of adding a second one — don't overwrite an existing `onSuperwallEvent` callback, chain into it.

---

## Verify

```bash
npx tsc --noEmit 2>&1 | grep -i adjust
```

A clean result (no output) means success. Fix any type errors before reporting done.
