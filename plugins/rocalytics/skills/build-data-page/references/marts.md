# `marts`: what pages can read

Project `rocalytics-513516`, location `EU`, dataset `marts`. Built by Dataform in `Rocapine/rocalytics-warehouse` (`models/definitions/marts/`). Refreshed every 3 hours. Amplitude history arrives about hourly, so the current day is always partial.

Pages read `marts` and nothing else. `raw_*` and `stg` are not readable by people (ADR 0005) and are never a fallback.

Which apps are in: `SELECT app, name, history_from, sdk_from, first_event_at, last_event_at FROM marts.apps`. An app missing from that list is not in the warehouse yet.

## `events` — one row per event

Partitioned by `DATE(event_time)` with **a partition filter required**; clustered by `app`, `name`. The only large table: filter `event_time` and `app` every time.

| Column | Type | Meaning |
|---|---|---|
| `app` | STRING | App slug (`oly`, `harmony`). |
| `app_id` | STRING | Bundle id / package name; null for Amplitude server-side events. |
| `platform` | STRING | Platform of the event; null for server-side events. |
| `source` | STRING | `amplitude` or `sdk`. |
| `event_id` | STRING | Unique id (deduplicated). |
| `name` | STRING | Event name, as the app sends it (`rc_initial_purchase_event`, `[Experiment] Exposure`). |
| `event_time` | TIMESTAMP | Event time, UTC. **Partition column.** |
| `client_time`, `received_at` | TIMESTAMP | Device clock; arrival time. |
| `user_key` | STRING | The user column: account `user_id` when known (backfilled, so pre-login events count as the same user), else `amp:<amplitude_id>` / `roca:<roca_id>`. Count users with this. |
| `user_id`, `roca_id`, `device_id` | STRING | Raw ids, kept so a user can be deleted. Don't show them on pages. |
| `session_id` | INTEGER | Session. |
| `app_version` | STRING | |
| `language` | STRING | Amplitude only: language name (`French`). |
| `locale` | STRING | SDK only: BCP 47 (`fr-FR`). |
| `country` | STRING | Amplitude only, from the IP. |
| `step_name`, `step_number` | STRING, INTEGER | Onboarding step (from 1). |
| `properties` | JSON | Event properties. Read with `JSON_VALUE(properties, '$."<key>"')`; keys with `$` or spaces need the quotes (`'$."$revenue"'`, `'$."[Experiment] Variant"'`). |

## `user_activity_daily` — one row per (app, user_key, day) with an event

Partitioned by `day`, clustered by `app`, `user_key`. Use it for DAU/WAU/MAU, stickiness and activity, instead of `events`.

`app`, `user_key`, `day` (UTC DATE), `events`, `active_events` (events the user triggered: not server-side, background or notification scheduling — a day with `active_events = 0` is not an active day), `sessions`, `first_event_at`, `last_event_at`, `first_source`, `first_platform`, `last_platform`, `first_app_version`, `last_app_version`, `first_country`, `last_country`, `last_language`, `last_locale`, `received_at`.

## `users` — one row per (app, user_key)

Clustered by `app`, `user_key`. Small. Join to the others on **both** `app` and `user_key`.

- Lifecycle: `identified`, `first_seen_at`, `first_seen_day` (the acquisition cohort), `last_seen_at`, `active_days`, `event_count`, `first_source`.
- Segments: `first_platform`, `last_platform` (`ios`, `android`, `web`), `first_app_version`, `last_app_version`, `first_country`, `last_country`, `last_language`, `last_locale`.
- Latest user properties: `premium`, `has_account`, `account_provider`, `att_status`, `notification_permission`, `subscription_status`, `app_language`, `device_region`, `onboarding_name`, `onboarding_id`, `superwall_experiment`, `superwall_variant_id`, `adjust_network`, `adjust_campaign`, `adjust_adgroup`, `adjust_creative`.
- Oly only: `health_connected`, `watch_paired`, `widget_installed`, `program_week`, `completed_sessions`, `tdy_tier`.

## `retention` — new-user N-day retention, precomputed

Partitioned by `cohort_day`, clustered by `app`, `day_n`. One row per (`app`, `cohort_day`, `platform`, `country`, `day_n`), `day_n` in 0–7, 14, 30, 60, 90.

`cohort_users`, `retained_users` (any event in window `day_n`), `retained_active_users` (an event the user triggered — **the KPI**). Windows are 24 hours from the user's first event. Rate = `SUM(retained_active_users) / SUM(cohort_users)` after summing segments. A (`cohort_day`, `day_n`) appears only once every user's window has ended. Cohorts in the first 30 days after `apps.history_from` are left out.

## `apps` — one row per app

`app`, `name`, `studio`, `publishing_platform_id`, `amplitude_project`, `ios_bundle_id`, `android_bundle_id`, `sdk_from` (when SDK events take over; null while Amplitude is the only source), `history_from`, `users`, `identified_users`, `premium_users`, `first_event_at`, `last_event_at`.

## Not here, on purpose

- Health answers (sexual activity, cycle symptoms, religion, porn use…), typed text, emails, phone numbers, click and ad-network ids, URLs. They are dropped from `properties` and user properties. A page that needs them can't be built; say so, don't look elsewhere.
- Amplitude user properties not listed under `users`.
- Ad spend, Supabase purchases and attribution (warehouse phases 2 and 4).
