# Recipes

SQL for `marts` that matches Amplitude where `metrics.md` says it was checked. Replace the `{{…}}` markers with literal values before the query goes in a dataset (the Data loader sends plain SQL; there are no query parameters). Dates are `YYYY-MM-DD`, UTC; `{{end}}` is included.

Platform is the user's latest platform (`marts.users.last_platform`), the way Amplitude groups by its platform user property. Drop the `users` join when the page doesn't split by platform.

Each recipe states whether it was checked against Amplitude. Unchecked ones: say so on the page ("not yet checked against Amplitude") until a check is recorded in `metrics.md`.

### dau_wau

Daily and rolling 7-day active users (active = an event the user triggered). Checked: no (DAU/WAU are new to the warehouse; compare with Amplitude's "Active users" on first use).

```sql
WITH d AS (
  SELECT day, user_key
  FROM marts.user_activity_daily
  WHERE app = '{{app}}' AND active_events > 0
    AND day BETWEEN DATE_SUB(DATE '{{start}}', INTERVAL 6 DAY) AND DATE '{{end}}'
),
days AS (SELECT day FROM UNNEST(GENERATE_DATE_ARRAY(DATE '{{start}}', DATE '{{end}}')) AS day)
SELECT days.day,
  COUNT(DISTINCT IF(d.day = days.day, d.user_key, NULL)) AS dau,
  COUNT(DISTINCT d.user_key) AS wau
FROM days
JOIN d ON d.day BETWEEN DATE_SUB(days.day, INTERVAL 6 DAY) AND days.day
GROUP BY days.day
ORDER BY days.day
```

### new_users

Users first seen each day, by platform. Checked: partly — see `metrics.md` (Amplitude's server-side "(none)" users differ).

```sql
SELECT first_seen_day AS day, COALESCE(last_platform, 'unknown') AS platform, COUNT(*) AS new_users
FROM marts.users
WHERE app = '{{app}}' AND first_seen_day BETWEEN DATE '{{start}}' AND DATE '{{end}}'
GROUP BY 1, 2
ORDER BY 1, 2
```

### uniques_by_event

Unique users per day for chosen events (Amplitude "Uniques"). Checked: yes.

```sql
SELECT DATE(event_time) AS day, name, COUNT(DISTINCT user_key) AS users, COUNT(*) AS events
FROM marts.events
WHERE app = '{{app}}' AND name IN ({{events}})
  AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))
GROUP BY 1, 2
ORDER BY 1, 2
```

`{{events}}` is a quoted list: `'app_open', 'notification_opened'`.

### funnel_ordered

Users who did step 1 in the range, then step 2 after it, then step 3 after that, each within `{{window_days}}` days of step 1 (Amplitude "this order", conversion window). Add or remove steps by repeating the `s2` pattern. Checked: no.

```sql
WITH s1 AS (
  SELECT user_key, MIN(event_time) AS t1
  FROM marts.events
  WHERE app = '{{app}}' AND name = '{{step1}}'
    AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))
  GROUP BY 1
),
later AS (
  SELECT user_key, name, event_time
  FROM marts.events
  WHERE app = '{{app}}' AND name IN ('{{step2}}', '{{step3}}')
    AND event_time >= TIMESTAMP('{{start}}')
    AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 + {{window_days}} DAY))
),
s2 AS (
  SELECT s1.user_key, s1.t1, MIN(l.event_time) AS t2
  FROM s1 JOIN later l ON l.user_key = s1.user_key AND l.name = '{{step2}}'
    AND l.event_time > s1.t1 AND l.event_time <= TIMESTAMP_ADD(s1.t1, INTERVAL {{window_days}} DAY)
  GROUP BY 1, 2
),
s3 AS (
  SELECT DISTINCT s2.user_key
  FROM s2 JOIN later l ON l.user_key = s2.user_key AND l.name = '{{step3}}'
    AND l.event_time > s2.t2 AND l.event_time <= TIMESTAMP_ADD(s2.t1, INTERVAL {{window_days}} DAY)
)
SELECT 1 AS step, '{{step1}}' AS name, COUNT(*) AS users FROM s1
UNION ALL SELECT 2, '{{step2}}', COUNT(*) FROM s2
UNION ALL SELECT 3, '{{step3}}', COUNT(*) FROM s3
ORDER BY step
```

### event_retention

Amplitude "N-day retention" for a start event and a return event over a date range. Cohort: each user once, on their first start-event day in the range. Retained on day N: the return event happened N calendar days after **any** of the user's start-event days in the range. Day 0 is everyone. A day N is left out for users whose day N hasn't ended. Checked: partly — close on Unchaind, but on Oly days 1–3 run about 1–2 points above Amplitude (`metrics.md`). Say so on the page.

```sql
WITH s AS (
  SELECT DISTINCT user_key, DATE(event_time) AS d
  FROM marts.events
  WHERE app = '{{app}}' AND name = '{{start_event}}'
    AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))
),
r AS (
  SELECT DISTINCT user_key, DATE(event_time) AS d
  FROM marts.events
  WHERE app = '{{app}}' AND name = '{{return_event}}'
    AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 31 DAY))
),
cohort AS (SELECT user_key, MIN(d) AS d0 FROM s GROUP BY 1),
hit AS (
  SELECT DISTINCT s.user_key, DATE_DIFF(r.d, s.d, DAY) AS n
  FROM s JOIN r ON r.user_key = s.user_key AND r.d > s.d AND r.d <= DATE_ADD(s.d, INTERVAL 30 DAY)
),
plat AS (SELECT user_key, last_platform AS platform FROM marts.users WHERE app = '{{app}}')
SELECT COALESCE(p.platform, 'unknown') AS platform, n AS day_n,
  COUNT(*) AS cohort_users,
  COUNTIF(n = 0 OR h.user_key IS NOT NULL) AS retained,
  ROUND(100 * COUNTIF(n = 0 OR h.user_key IS NOT NULL) / COUNT(*), 1) AS pct
FROM cohort c
CROSS JOIN UNNEST([0, 1, 2, 3, 4, 5, 6, 7, 14, 30]) AS n
LEFT JOIN hit h ON h.user_key = c.user_key AND h.n = n
LEFT JOIN plat p ON p.user_key = c.user_key
WHERE DATE_ADD(c.d0, INTERVAL n DAY) < CURRENT_DATE()
GROUP BY 1, 2
ORDER BY 1, 2
```

### new_user_retention

New-user retention from the precomputed table (first-seen cohort, 24-hour windows). Checked: yes (see `metrics.md`).

```sql
SELECT day_n, COALESCE(platform, 'unknown') AS platform,
  SUM(cohort_users) AS cohort_users,
  SUM(retained_active_users) AS retained,
  ROUND(100 * SUM(retained_active_users) / SUM(cohort_users), 2) AS pct
FROM marts.retention
WHERE app = '{{app}}' AND cohort_day BETWEEN DATE '{{start}}' AND DATE '{{end}}'
GROUP BY 1, 2
ORDER BY 2, 1
```

For a curve per cohort week, add `DATE_TRUNC(cohort_day, WEEK(MONDAY)) AS cohort_week` to the SELECT and GROUP BY.

### revenue_arppu

Revenue from every RevenueCat event that carries `$revenue` (initial purchases, trial conversions, renewals, product changes, non-subscription purchases, and refunds on cancellations as negative amounts), production only. RevenueCat sends `$revenue` in USD whatever the store currency (`currency` is the buyer's), and Amplitude sums it the same way. ARPPU = revenue / users with a positive revenue event. Checked: no.

```sql
SELECT DATE(event_time) AS day,
  ROUND(SUM(CAST(JSON_VALUE(properties, '$."$revenue"') AS FLOAT64)), 2) AS revenue_usd,
  COUNT(DISTINCT IF(CAST(JSON_VALUE(properties, '$."$revenue"') AS FLOAT64) > 0, user_key, NULL)) AS paying_users,
  ROUND(SAFE_DIVIDE(SUM(CAST(JSON_VALUE(properties, '$."$revenue"') AS FLOAT64)),
    COUNT(DISTINCT IF(CAST(JSON_VALUE(properties, '$."$revenue"') AS FLOAT64) > 0, user_key, NULL))), 2) AS arppu_usd
FROM marts.events
WHERE app = '{{app}}'
  AND name LIKE 'rc\\_%'
  AND JSON_VALUE(properties, '$."$revenue"') IS NOT NULL
  AND JSON_VALUE(properties, '$.environment') = 'PRODUCTION'
  AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))
GROUP BY 1
ORDER BY 1
```

### ab_by_variant

Users exposed to a flag (`[Experiment] Exposure`), by variant (first exposure wins), and how many then did a goal event within `{{window_days}}` days. Checked: no. Users exposed to two variants are dropped.

```sql
WITH exp AS (
  SELECT user_key,
    ARRAY_AGG(JSON_VALUE(properties, '$."[Experiment] Variant"') IGNORE NULLS ORDER BY event_time LIMIT 1)[SAFE_OFFSET(0)] AS variant,
    MIN(event_time) AS t0,
    COUNT(DISTINCT JSON_VALUE(properties, '$."[Experiment] Variant"')) AS variants
  FROM marts.events
  WHERE app = '{{app}}' AND name = '[Experiment] Exposure'
    AND JSON_VALUE(properties, '$."[Experiment] Flag Key"') = '{{flag_key}}'
    AND event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))
  GROUP BY 1
),
goal AS (
  SELECT user_key, event_time
  FROM marts.events
  WHERE app = '{{app}}' AND name = '{{goal_event}}'
    AND event_time >= TIMESTAMP('{{start}}')
    AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 + {{window_days}} DAY))
)
SELECT e.variant, COUNT(DISTINCT e.user_key) AS exposed,
  COUNT(DISTINCT g.user_key) AS converted,
  ROUND(100 * COUNT(DISTINCT g.user_key) / COUNT(DISTINCT e.user_key), 2) AS pct
FROM exp e
LEFT JOIN goal g ON g.user_key = e.user_key
  AND g.event_time >= e.t0 AND g.event_time <= TIMESTAMP_ADD(e.t0, INTERVAL {{window_days}} DAY)
WHERE e.variants = 1
GROUP BY 1
ORDER BY 1
```

No significance test here: show counts and rates, and say when a variant has under ~1,000 users.

### notification_opt_in

Latest notification permission of users first seen in the range, by platform (user property, so it's each user's state now, not at sign-up). Checked: no.

```sql
SELECT COALESCE(last_platform, 'unknown') AS platform,
  COALESCE(notification_permission, 'unknown') AS permission,
  COUNT(*) AS users
FROM marts.users
WHERE app = '{{app}}' AND first_seen_day BETWEEN DATE '{{start}}' AND DATE '{{end}}'
GROUP BY 1, 2
ORDER BY 1, 3 DESC
```
