# rocalytics — Claude Code plugin

Adds [`@rocapine/rocalytics-sdk`](https://github.com/Rocapine/rocalytics-sdk) to an Expo app and wires it end to end.

```
/plugin marketplace add rocapine/rocapine-marketplace
/plugin install rocalytics@rocapine-marketplace
```

## Skill: `setup-rocalytics`

Run it from the app's root ("add rocalytics to this app"). It:

1. scans the app — purchase stack (Superwall, RevenueCat, native paywalls on RevenueCat), react-native-onboarding, onboarding shape, a copied `rocalytics.client.ts`;
2. asks what to include — onboarding tracking, paywall tracking (the client is always set up);
3. installs and sets up `@rocapine/react-native-onboarding` (≥ 1.76.0) when missing or too old;
4. installs the SDK and its Expo peers;
5. wires the client, identify, purchases, the onboarding run tracker and the paywall tracker into the app's existing code;
6. migrates a copied client;
7. verifies with `tsc`, lint and an `expo export` bundle, and reports what's connected and what's left.

Supersedes the copy-based `rocalytics-setup` plugin (also in this repo) for client setup; that plugin keeps the Adjust and Facebook Superwall bridges. It lives here rather than in rocalytics-sdk because that repo is public and its tests ban vendor and private-repo names.

## Maintaining

The skill reads the **installed** SDK README at run time, so API details follow the SDK. Update `skills/setup-rocalytics/` when a release changes how an app is wired (a new subpath, a new peer, a new tracker input), and bump `version` in `.claude-plugin/plugin.json`, this repo's `.claude-plugin/marketplace.json` and the rocapine-marketplace entry.
