# Metric definitions

How each metric is counted so it matches Amplitude, and the check that proved it. When a page uses a metric marked "not yet checked", say so on the page, and if the author names an Amplitude chart to match, compare once and add a "Checked:" line here (through a PR to this plugin).

Days are UTC. Amplitude projects may use another timezone: when comparing, set the Amplitude chart to UTC.

## New-user retention

Use `marts.retention` (recipe `new_user_retention`). Cohort: users first seen on `cohort_day`. Retained on day N: an event the user triggered in the 24-hour window N after their first event. `retained_active_users` is the KPI.

Checked: Oly, cohorts 2026-09-15 to 10-15, against Amplitude "New user" retention: D1 7.0% vs 7.2%, D7 2.5% vs 2.6%, D30 0.82% vs 0.83%.

## Event retention

A chosen start event and return event, Amplitude "N-day retention" over a date range (recipe `event_retention`). Cohort: each user once, on their first start-event day in the range. Retained on day N: the return event happened N calendar days after **any** of the user's start-event days in the range, not only the first. Counting only from the first day undercounts badly (Unchaind D7 34% vs Amplitude 56%).

Checked:
- Unchaind, 2026-11-19, on the raw Amplitude export (before Unchaind was in `marts`): `home_viewed` → `home_viewed`, existing iOS users: D1 73.6% vs 75.8%, D7 57.6% vs 58.6%; `Subscribe` → `home_viewed`, iOS: D1 70.9% vs 68.5%, D7 38.3% vs 37.7%, D30 18.0% vs 17.7%.
- Oly, 2026-11-19, on `marts`, `app_open` → `app_open`, 2026-10-01 to 10-14, UTC: iOS cohort 2,048 vs 2,049, D1 11.3% vs 9.0%, D2 7.5% vs 6.7%, D7 4.2% vs 3.7%, D14 1.7% vs 1.9%, D30 1.6% vs 1.6%; Android cohort 125 vs 126, D1 8.8% vs 7.1%, D7 8.0% vs 7.1%. The warehouse runs higher on the first days for Oly; the likely cause is `user_key` joining a user's devices once they log in, where Amplitude counts per device until it merges them. Not proven. Show early-day numbers as close to Amplitude, not equal.

## Unique users per event

`COUNT(DISTINCT user_key)` per UTC day (recipe `uniques_by_event`).

Checked: Oly `app_open`, 2026-10-01 to 10-14: identical every day (141, 121, 132, … 193; 2,174 over the range in Amplitude). Unchaind daily uniques also matched exactly on the raw export.

## New users

First event seen, from `marts.users.first_seen_day` (recipe `new_users`). Amplitude's own "new user" relies on its user creation time, which the export doesn't carry.

Checked: Unchaind, iOS and Android about 5% above Amplitude. Amplitude counts server-side "(none)"-platform users that never opened the app; the warehouse files them under their app platform or not at all. Say so on the page when the numbers will be compared.

## Active users (DAU/WAU)

A user is active on a day with `active_events > 0` in `marts.user_activity_daily` (recipe `dau_wau`): server-side, background and notification-scheduling events don't count. Amplitude's "Any Active Event" counts every event except those it marks inactive, so expect the warehouse to be a little lower. Not yet checked against Amplitude.

## Revenue and ARPPU

RevenueCat `rc_*` events with `environment = PRODUCTION`, summed `$revenue` as sent, per currency (recipe `revenue_arppu`). Like Amplitude, no currency conversion. ARPPU = revenue / users with a revenue event. Not yet checked against Amplitude.

## Funnels

Ordered steps, each after the previous, all within a conversion window from step 1 (recipe `funnel_ordered`), like Amplitude's "this order" with a window. Not yet checked against Amplitude.

## A/B tests by flag variant

`[Experiment] Exposure` events, keyed by `properties."[Experiment] Flag Key"`, variant from `properties."[Experiment] Variant"`, first exposure wins, users seen in two variants dropped (recipe `ab_by_variant`). Not yet checked against Amplitude Experiment, which also applies its own exposure rules and significance test.

## Platform

Amplitude splits by the user's platform property (their latest), not each event's platform. Use `marts.users.last_platform` (`ios`, `android`, `web`). Server-side events have no platform.
