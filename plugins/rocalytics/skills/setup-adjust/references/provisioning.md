# What to provision for Adjust

Done once per app, before or alongside `/setup-adjust`. Code values are saved in the publishing platform, so the skill (and any dev) reads them with `get_application` instead of asking around.

## Publishing platform contract

Rocapine uses **one multi-platform Adjust app per app**: the same app token and event tokens serve iOS and Android.

`get_application` returns, per app:

| Field | Type | Meaning |
| --- | --- | --- |
| `adjust_app_token` | `string \| null` | Adjust app token, 12 characters |
| `adjust_event_tokens` | `Record<string, string>` | Event name → token (6 characters), e.g. `{ "user_converted": "abc123" }`. `{}` = none provisioned |

Tokens ship in the app binary: plain columns, not secrets. Written with the publishing-platform MCP tool `set_app_adjust_config`. App health has an "adjust" check: `adjust_app_token` and `adjust_event_tokens.user_converted` set. The publishing-platform plugin's `provision-adjust` skill creates the events and saves the tokens.

## In the publishing platform (read by the skill)

| Field | Required | What | Where to find it in Adjust |
| --- | --- | --- | --- |
| `adjust_app_token` | yes | The app token (one multi-platform Adjust app) | *App settings* → *App token* |
| `adjust_event_tokens.user_converted` | yes | One event per conversion, trial or paid (`is_trial` partner parameter says which). Linked to Meta `Purchase` | *Events* → event token |
| `adjust_event_tokens.trial_started` | recommended | Trial start. Linked to Meta `StartTrial`; `event_id` `trial_started-<tx>` | *Events* |
| `adjust_event_tokens.direct_subscription` | recommended | Paid subscription with no trial. Linked to Meta `Subscribe`; `event_id` `subscribe-<tx>` | *Events* |
| `adjust_event_tokens.onboarding_completed` | optional | Onboarding finished. Only if UA optimises or reports on it | *Events* |
| `adjust_event_tokens.app_opened` | optional | Each app open | *Events* |
| `meta_app_id` (already exists) | recommended | Meta app id, so Adjust reads Meta Install Referrer on Android (fills `fbInstallReferrer` in attribution) | Meta for Developers |

Create the events in Adjust with these exact names, so every app's dashboard reads the same.

Each purchase fires `user_converted` plus `trial_started` (trial) or `direct_subscription` (paid), mirroring the Purchase + StartTrial / Subscribe twins meta-capi sends, with the same `event_id`s so Meta dedupes them. On Roca-only apps (`docs/adjust-events.md`) these Adjust events are Meta's only StartTrial / Purchase.

## In the Adjust dashboard (by hand, not code)

1. **App** — created in the Rocapine Adjust account, bundle id / package matching the app, store links once live.
2. **Subscription verification** — iOS: App Store Connect in-app purchase shared secret (or App Store Server API key). Android: Google Play service account with financial-data access. Without them `trackAppStoreSubscription` / `trackPlayStoreSubscription` stay unverified and book no revenue.
3. **Meta partner module** ([Adjust: Set up Meta](https://help.adjust.com/en/article/facebook)):
   - *Data sharing* → enable **Parameters**.
   - *Event linking* → `user_converted` → `Purchase`, `trial_started` → `StartTrial`, `direct_subscription` → `Subscribe`.
   - *Parameter mapping* → `order_id` → `order_id`, `event_id` → `event_id`.
4. **Other partners** (TikTok, Google, Apple Search Ads) — enable and link `user_converted` per the network's UA needs.
5. **SKAN** — conversion value schema, if the app runs iOS campaigns relying on SKAN.
6. **Test device** — add the dev's device (adid / IDFA / GAID) in *Testing console* to check sandbox events after the first build.

## Checklist

- [ ] Adjust app created, bundle ids match.
- [ ] `user_converted`, `trial_started`, `direct_subscription` events created; tokens saved in the publishing platform (`/provision-adjust`).
- [ ] App token saved in the publishing platform.
- [ ] Optional event tokens saved, if any.
- [ ] Subscription verification secrets set (iOS + Android).
- [ ] Meta: parameters shared, `user_converted` → `Purchase`, `trial_started` → `StartTrial`, `direct_subscription` → `Subscribe`, `order_id` + `event_id` mapped.
- [ ] A sandbox install and a sandbox purchase show in the Testing console.
