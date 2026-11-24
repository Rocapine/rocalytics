---
name: setup-adjust
description: Add the Adjust SDK (react-native-adjust) to an Expo / React Native app and wire it the Rocapine way — tokens from the publishing platform, init (sandbox in dev), attribution sent to Rocalytics and RevenueCat, roca_id as a global partner parameter, one user_converted per purchase with order_id + event_id for Meta dedup, and store subscription tracking for revenue. Use when the user says "set up Adjust", "add Adjust", "install react-native-adjust", "wire Adjust events", "track conversions in Adjust", "Adjust attribution", or replaces the old adjust-superwall bridge or expo-marketing-stack Adjust provider.
---

# Set up Adjust

Goal: the app ends with **Adjust initialised once, attribution flowing into Rocalytics, and every purchase reported to Adjust exactly once** — as a `user_converted` event Meta can dedupe, plus a store-verified subscription for revenue.

Run `/setup-rocalytics` first when the app has no `@rocapine/rocalytics-sdk`: `roca_id`, `event_id` and the attribution join all come from it. Without it, wire Adjust anyway and list those three under *By hand*.

Work in this order. Every later step branches on the scan.

## 1. Scan the app

From the app root:

```sh
node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};for(const k of ["expo","react-native","react-native-adjust","@config-plugins/react-native-adjust","@rocapine/rocalytics-sdk","expo-superwall","react-native-purchases","expo-tracking-transparency","react-native-fbsdk-next"])console.log(k.padEnd(40),d[k]??"-")'
grep -rln --include=*.ts --include=*.tsx -e 'react-native-adjust' -e 'AdjustConfig' -e 'ADJUST_' . --exclude-dir=node_modules | head -30
grep -rln --include=*.ts --include=*.tsx -e 'trackPurchase' -e 'SuperwallDelegate' -e 'useSuperwallEvents' -e 'purchasePackage' -e 'purchaseStoreProduct' -e 'requestTrackingPermissionsAsync' . --exclude-dir=node_modules
```

Record:

| Fact | How to tell |
| --- | --- |
| **Existing Adjust code** | an `adjust.provider.ts`, `AdjustService.ts`, `adjust-superwall-bridge.ts`, `ADJUST_*` env keys. Rework it in place — never a second `Adjust.initSdk` |
| **Purchase pipeline** | the one function every purchase goes through — where `rocalytics.trackPurchase` is called. Adjust goes **into it**. Don't add a `useSuperwallEvents` listener beside it |
| **Purchase stack** | Superwall, RevenueCat direct, native paywalls on RevenueCat (same rules as `/setup-rocalytics`) |
| **ATT** | where `requestTrackingPermissionsAsync` runs, if anywhere |
| **Rocalytics** | the client module (`services/analytics/rocalytics.ts` or similar) and its `identify` call |
| **Config convention** | where the app keeps public keys: a `config.ts`, `app.config.ts` `extra`, or `EXPO_PUBLIC_*` env |
| **Bundle ids** | `ios.bundleIdentifier` / `android.package` |

## 2. Get the tokens

Tokens live in the publishing platform. Find the app with `list_applications` (`compact: true`, `name_contains`) or by bundle id, then `get_application`. Read (contract in `references/provisioning.md` § *Publishing platform contract*):

- `adjust_app_token` — the Adjust app token; `adjust_app_token_android` when Android is a separate Adjust app.
- `adjust_event_tokens` — event name → token, e.g. `{ "user_converted": "abc123", "onboarding_completed": "def456" }`; `adjust_event_tokens_android` when separate.

These fields are not in the platform yet. If they are missing or empty, ask the user for the app token and the `user_converted` token (`AskUserQuestion`, free text), and say under *By hand* that they must be saved in the publishing platform. The full list of what to provision and where is in `references/provisioning.md`.

`user_converted` is **required**. Without it, stop after install and init, and report the missing token.

App and event tokens ship in the binary: they are not secrets. Put them in a typed constants module (`services/analytics/adjust.config.ts`), not in `EXPO_PUBLIC_*` env, unless the app already keeps them in env — an env key missing from one EAS profile silently disables Adjust in that build.

## 3. Install

```sh
npx expo install react-native-adjust @config-plugins/react-native-adjust
```

`@config-plugins/react-native-adjust` 14.x needs Expo ≥ 56. On an older SDK pick the major that matches: `npm view @config-plugins/react-native-adjust versions peerDependencies --json`. Add `"@config-plugins/react-native-adjust"` to `plugins` in `app.json` / `app.config.*`. Read `node_modules/@config-plugins/react-native-adjust/README.md` for what it adds (AdServices / AdSupport, install referrer, AD_ID permission) and apply anything it says is manual.

**The installed `react-native-adjust` types are the source of truth** (`node_modules/react-native-adjust/index.d.ts`). Check every method below against them and prefer them where they differ.

This adds native code: say a **new native build** is needed.

## 4. Wire it

Follow `references/adjust-module.md`. It covers, in one module:

1. **Init** — `AdjustConfig` with sandbox under `__DEV__`, production otherwise; one `Adjust.initSdk` at startup.
2. **ATT** — init after the prompt resolves, or use the SDK's ATT waiting interval.
3. **Attribution** — the attribution callback re-identifies Rocalytics with `adjust_id` + `adjust_attribution` and sets RevenueCat's Adjust id.
4. **`roca_id`** — global partner parameter after `rocalytics.ready`.
5. **Conversions** — `user_converted` from the purchase pipeline with `order_id`, `event_id`, `is_trial`, `revenue`, `currency`.
6. **Subscriptions** — `trackAppStoreSubscription` / `trackPlayStoreSubscription` from the same place, for verified revenue.
7. **Optional events** — any other token in `adjust_event_tokens` (`onboarding_completed`, `app_opened`, …), fired where the app already tracks that moment.

Rules that hold everywhere:

- **One init, one module.** All Adjust calls go through it.
- **Each purchase reported once.** `user_converted` and the subscription call sit next to `rocalytics.trackPurchase`, fed the **same** `originalTransactionIdentifier`. A different value makes Meta double-count, silently.
- **No `setRevenue` on `user_converted`.** The store subscription call already books revenue in Adjust; both would double it.
- **`event_id` from `getEventId`, never hand-built.** The prefix is `purchase` unless the app has a legacy override (README, *Per-app prefix overrides*). Pin it in a test.
- **Never throw from tracking.** `try/catch` → the app's error reporter, else `console.error`.

### Migrating old code

- `adjust-superwall-bridge.ts` + its `useSuperwallEvents` hook (removed `rocalytics-setup` plugin): delete both. The subscription call now lives in the purchase pipeline.
- `expo-marketing-stack` `adjust.provider.ts` with `EXPO_PUBLIC_ADJUST_TOKEN_*`: keep the provider shape if the app's analytics service fans out to it, but move tokens to the constants module, add `order_id` / `event_id` / `roca_id`, and drop `trial_started` / `direct_subscription` if they fire alongside `user_converted` and have no Adjust → partner mapping (ask first if they do).

## 5. Verify

```sh
npx tsc --noEmit
npm run lint --if-present
npx expo export --platform ios --output-dir "${TMPDIR:-/tmp}/adjust-export-check"
```

Add one unit test pinning the `event_id` for a known transaction (`purchase-2000000841136630`, or the app's prefix). Mock `react-native-adjust` in specs that now import the module.

All must pass before you report done. If a failure pre-exists, prove it with `git stash` and say so.

## 6. Report

- **Connected** — init, attribution → Rocalytics / RevenueCat, `roca_id`, `user_converted`, subscriptions, optional events, each with its file.
- **Removed** — old bridge, duplicate init, env keys.
- **Needs a native build.**
- **By hand** — the dashboard items from `references/provisioning.md` § *Adjust dashboard* (Meta parameter sharing + mapping, subscription verification secrets), tokens to save in the publishing platform, and a sandbox test device check.
