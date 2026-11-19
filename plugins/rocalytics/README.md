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

Supersedes the copy-based `rocalytics-setup` plugin (also in this repo) for client setup; that plugin keeps the Adjust and Facebook Superwall bridges. It lives here rather than in rocalytics-sdk because that repo is public and its tests ban vendor and private-repo names.

## Skill: `request-data-access`

"I get Access Denied on the warehouse", "how do I get access to the data". Checks the claude.ai Google Cloud BigQuery connector, probes `marts`, and if access is missing sends you to "Ask to join" the `analytics-readers@rocapine.com` group (read on `marts` for every app, nothing raw). It never grants access itself.

## Skill: `build-data-page`

"Build a retention dashboard for Oly", "rebuild this Amplitude dashboard on the warehouse", "a weekly update with Harmony's numbers". Builds a live page with Claude's Data artifact type (dashboard, visual analysis, scroll story, letter, tool, visual short) that queries `marts` with each viewer's own access. It uses recipes whose numbers were checked against Amplitude (`references/metrics.md`), follows the warehouse's cost rules, and never reads `raw_*`/`stg` or shares a connector.

## Maintaining

The skill reads the **installed** SDK README at run time, so API details follow the SDK. Update `skills/setup-rocalytics/` when a release changes how an app is wired (a new subpath, a new peer, a new tracker input), and bump `version` in `.claude-plugin/plugin.json`, this repo's `.claude-plugin/marketplace.json` and the rocapine-marketplace entry.

`build-data-page/references/marts.md` mirrors the `marts` tables in `Rocapine/rocalytics-warehouse`: update it (and the recipes) when a `marts` column changes. Record each new Amplitude check in `references/metrics.md`.
