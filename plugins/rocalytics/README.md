# rocalytics — Claude Code plugin

Adds [`@rocapine/rocalytics-sdk`](https://github.com/Rocapine/rocalytics-sdk) to an Expo app and wires it end to end.

```
/plugin marketplace add rocapine/rocapine-marketplace
/plugin install rocalytics@rocapine-marketplace
```

## Skill: `setup-rocalytics`

Run it from the app's root ("add rocalytics to this app"). It:

1. scans the app — purchase stack (Superwall, RevenueCat, native paywalls on RevenueCat), react-native-onboarding, onboarding shape, a copied `rocalytics.client.ts`;
2. asks what to include — onboarding tracking, paywall tracking, product analytics (the client is always set up);
3. installs and sets up `@rocapine/react-native-onboarding` (≥ 1.76.0) when missing or too old;
4. installs the SDK and its Expo peers;
5. wires the client, identify, purchases, the onboarding run tracker, the paywall tracker and product analytics (after an ingest allowlist check) into the app's existing code;
6. migrates a copied client;
7. verifies with `tsc`, lint and an `expo export` bundle, and reports what's connected and what's left.

## Skill: `setup-adjust`

Run it from the app's root ("set up Adjust"). It:

1. scans the app — existing Adjust code, the purchase pipeline, ATT, Rocalytics;
2. reads the Adjust app token and event tokens from the publishing platform (`get_application`), or asks for them;
3. installs `react-native-adjust` and its Expo config plugin;
4. wires one Adjust module: init (sandbox in dev), attribution into Rocalytics `identify` and RevenueCat, `roca_id` as a global partner parameter, `user_converted` with `order_id` + `event_id` from the purchase pipeline, and store subscription tracking;
5. verifies with `tsc`, lint, a bundle and an `event_id` test, and reports the dashboard work left.

What to provision per app (tokens, dashboard setup) is in `skills/setup-adjust/references/provisioning.md`.

## Skill: `facebook-superwall`

Scaffolds `services/analytics/bridges/facebook-superwall-bridge.ts` and wires it into `useSuperwallEvents`, so Superwall purchases reach the Facebook SDK (trials at 0.2× price). Needs `expo-superwall` and `react-native-fbsdk-next`.

Replaces the removed copy-based `rocalytics-setup` plugin: `setup-rocalytics` covers its client, Superwall and onboarding setup, `setup-adjust` its Adjust bridge, `facebook-superwall` moved here as is. It lives here rather than in rocalytics-sdk because that repo is public and its tests ban vendor and private-repo names.

## Maintaining

The skill reads the **installed** SDK README at run time, so API details follow the SDK. Update `skills/setup-rocalytics/` when a release changes how an app is wired (a new subpath, a new peer, a new tracker input), and bump `version` in `.claude-plugin/plugin.json`, this repo's `.claude-plugin/marketplace.json` and the rocapine-marketplace entry.
