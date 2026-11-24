# What to provision for Adjust

Done once per app, before or alongside `/setup-adjust`. Code values are saved in the publishing platform, so the skill (and any dev) reads them with `get_application` instead of asking around.

## In the publishing platform (read by the skill)

| Field | Required | What | Where to find it in Adjust |
| --- | --- | --- | --- |
| `adjust_app_token` | yes | The app token. One token when the Adjust app is multi-platform; otherwise an iOS and an Android token | *App settings* → *App token* |
| `adjust_event_tokens.user_converted` | yes | One event per conversion, trial or paid (`is_trial` partner parameter says which). Linked to Meta `Purchase` | *Events* → event token |
| `adjust_event_tokens.onboarding_completed` | optional | Onboarding finished. Only if UA optimises or reports on it | *Events* |
| `adjust_event_tokens.app_opened` | optional | Each app open | *Events* |
| `meta_app_id` (already exists) | recommended | Meta app id, so Adjust reads Meta Install Referrer on Android (fills `fbInstallReferrer` in attribution) | Meta for Developers |

Create the events in Adjust with these exact names, so every app's dashboard reads the same.

`trial_started` / `direct_subscription` (old expo-marketing-stack): not created by default. `user_converted` + `is_trial` covers both. Add `trial_started` only for an app whose Meta campaigns optimise on `StartTrial` through Adjust (the Roca-only apps, see `docs/adjust-events.md`).

## In the Adjust dashboard (by hand, not code)

1. **App** — created in the Rocapine Adjust account, bundle id / package matching the app, store links once live.
2. **Subscription verification** — iOS: App Store Connect in-app purchase shared secret (or App Store Server API key). Android: Google Play service account with financial-data access. Without them `trackAppStoreSubscription` / `trackPlayStoreSubscription` stay unverified and book no revenue.
3. **Meta partner module** ([Adjust: Set up Meta](https://help.adjust.com/en/article/facebook)):
   - *Data sharing* → enable **Parameters**.
   - *Event linking* → `user_converted` → `Purchase` (and any optional event to its Meta event).
   - *Parameter mapping* → `order_id` → `order_id`, `event_id` → `event_id`.
4. **Other partners** (TikTok, Google, Apple Search Ads) — enable and link `user_converted` per the network's UA needs.
5. **SKAN** — conversion value schema, if the app runs iOS campaigns relying on SKAN.
6. **Test device** — add the dev's device (adid / IDFA / GAID) in *Testing console* to check sandbox events after the first build.

## Checklist

- [ ] Adjust app created, bundle ids match.
- [ ] `user_converted` event created; token saved in the publishing platform.
- [ ] App token saved in the publishing platform.
- [ ] Optional event tokens saved, if any.
- [ ] Subscription verification secrets set (iOS + Android).
- [ ] Meta: parameters shared, `user_converted` → `Purchase`, `order_id` + `event_id` mapped.
- [ ] A sandbox install and a sandbox purchase show in the Testing console.
