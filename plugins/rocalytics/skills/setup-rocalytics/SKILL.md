---
name: setup-rocalytics
description: Add @rocapine/rocalytics-sdk to an Expo / React Native app and wire it end to end — the Rocalytics client (install, identify, purchases), onboarding run tracking and paywall presentation tracking. Detects the purchase stack (Superwall, RevenueCat, native paywalls on RevenueCat), installs and sets up @rocapine/react-native-onboarding when missing, and migrates a copied rocalytics.client.ts. Use when the user says "add rocalytics", "set up rocalytics", "install the rocalytics sdk", "track paywalls / onboarding in rocalytics", or "migrate rocalytics.client.ts to the SDK".
---

# Set up Rocalytics

Goal: the app ends with **everything connected** — one Rocalytics client, every purchase reported exactly once, and (when chosen) onboarding runs and paywall presentations reported through the SDK's trackers.

Work in this order. Do not skip the scan: every later step branches on it.

## 1. Scan the app

Run from the app root (the folder with `package.json` and `app.json` / `app.config.*`):

```sh
node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};for(const k of ["expo","react-native","expo-router","@rocapine/rocalytics-sdk","@rocapine/react-native-onboarding","@rocapine/react-native-onboarding-ui","expo-superwall","react-native-purchases","@react-native-async-storage/async-storage","expo-localization","expo-application","expo-crypto","expo-device","expo-network","expo-secure-store"])console.log(k.padEnd(44),d[k]??"-")'
grep -rln --include=*.ts --include=*.tsx -e 'rocalytics' -e 'RocalyticsClient' . --exclude-dir=node_modules | head -30
grep -rln --include=*.ts --include=*.tsx -e 'SuperwallDelegate' -e 'purchaseStoreProduct' -e 'purchasePackage' -e 'revenueCatProductProvider' -e 'PaywallProvider' -e 'OnboardingProvider' -e 'useOnboardingStep' -e 'trackOnboarding' -e 'onboarding_completed' . --exclude-dir=node_modules
```

Record, for the plan you show the user:

| Fact | How to tell |
| --- | --- |
| **Purchase stack** — any mix of: | |
| Superwall | `expo-superwall` + a `SuperwallDelegate` subclass |
| RevenueCat direct | `react-native-purchases` with `purchasePackage` / `purchaseStoreProduct` in app code |
| Native paywalls on RevenueCat | `PaywallProvider` with `customScreens`, screens buying through RevenueCat |
| Studio composable paywalls | `PaywallProvider` with `productProvider={revenueCatProductProvider(...)}` |
| Superwall **on** RevenueCat | a Superwall `PurchaseController` that calls `Purchases.purchase*`. These purchases belong to Superwall: report them from the delegate **only**, never also after the RevenueCat call — the two send different transaction ids, so dedup cannot catch the double count |
| **Existing purchase pipeline** | one function every purchase already goes through (e.g. `recordConversion`). Wire Rocalytics **into it**, never beside it |
| **react-native-onboarding** | installed? version ≥ **1.76.0** (first with `PaywallProvider` `observer`)? `-ui` installed? |
| **Onboarding shape** | Studio flow (`OnboardingProvider` + a step route calling `useOnboardingStep`), hand-coded screens, or none |
| **Old Rocalytics** | a copied `rocalytics.client.ts`, a `rocalytics.provider.ts`, `trackOnboarding(...)` calls, manual `track("onboarding_completed")` |
| **Root layout** | `app/_layout.tsx` (expo-router) or `App.tsx` |
| **Sign-in / RevenueCat id** | where the app learns its user id and calls `Purchases.configure` / `logIn` |

## 2. Ask what to include

Use `AskUserQuestion` (multi-select). The client is always included; say so in the question. Pre-select what the scan found:

- **Onboarding tracking** — report onboarding runs (steps, answers, completion). Pre-select if an onboarding exists.
- **Paywall tracking** — report paywall presentations (shown / purchased / dismissed). Pre-select if paywalls exist.

Then show the plan in a few lines — detected stack, what will be installed, which files change — and continue. Ask again only when the scan is genuinely ambiguous (e.g. two purchase pipelines and no way to tell which is live).

## 3. react-native-onboarding

Both trackers attach to `@rocapine/react-native-onboarding`. If paywall or onboarding tracking was chosen:

- **Missing** → install and set it up yourself: `references/onboarding-sdk.md`.
- **Older than 1.76.0** → upgrade (`npx expo install @rocapine/react-native-onboarding@latest @rocapine/react-native-onboarding-ui@latest`), then read the package's CHANGELOG between the two versions for breaking changes and fix call sites.
- **Present and recent** → nothing to do.

## 4. Install the SDK

```sh
npm view @rocapine/rocalytics-sdk version      # confirm the latest published version
npx expo install @rocapine/rocalytics-sdk expo-application expo-crypto expo-device expo-network expo-secure-store expo-localization @react-native-async-storage/async-storage
```

The `expo-*` modules are the client's peers (`expo-modules-core` comes with `expo`). A missing peer **fails the Metro bundle**; one missing from the native binary (an OTA update to an older build) makes the client inert, not crash. Adding native modules means a **new native build** — say so in the report.

**The installed README is the source of truth.** Read `node_modules/@rocapine/rocalytics-sdk/README.md` (sections *Rocalytics client*, *Paywall presentations*, *API*) before writing code, and prefer it over this skill wherever they differ.

## 5. Wire it

Follow the references in this order, skipping what was not chosen:

1. `references/client-and-purchases.md` — the client module, identify, `trackPurchase` per purchase stack. Always.
2. `references/onboarding-tracking.md` — onboarding runs.
3. `references/paywall-tracking.md` — paywall presentations.
4. `references/migration.md` — only if old Rocalytics code was found. Do it **while** wiring, not after: the old client and the SDK client must never both run.

Rules that hold everywhere:

- **One `RocalyticsClient` per app**, module scope, created once.
- **Each purchase reported once.** One `trackPurchase` per transaction, from the single pipeline.
- **Never throw from tracking code.** The SDK never throws; app glue around it must not either (`try/catch` → the app's error reporter, else `console.error`).
- Keep the app's conventions: path aliases, folder layout (`services/analytics/…` if it exists), lint style.

## 6. Verify

```sh
npx tsc --noEmit
npm run lint --if-present
npx expo export --platform ios --output-dir /tmp/rocalytics-export-check   # bundle check: catches a missing peer
```

All three must pass before you report done. Fix what you broke; if a failure pre-exists, prove it with `git stash` and say so.

## 7. Report

End with a short report:

- **Connected** — client, identify, purchases (per stack), onboarding, paywalls, each with the file it lives in.
- **Removed** — old client files, `trackOnboarding` calls, manual `onboarding_completed`.
- **Needs a native build** — when peers were added.
- **By hand** — Studio side (moments/paywalls published), anything the scan could not decide.
- **Known gaps** — copy the ones that apply from `references/known-gaps.md`.
