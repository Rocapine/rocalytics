# Cost rules

Every page open runs every dataset's query, billed to `rocalytics-513516` (on-demand pricing, about $6.25 per TiB scanned). The warehouse exists to cost less than Amplitude.

1. **`marts.events` needs `event_time` in the WHERE clause** (`require_partition_filter`); without it BigQuery refuses the query. Bound both ends: `event_time >= TIMESTAMP('{{start}}') AND event_time < TIMESTAMP(DATE_ADD('{{end}}', INTERVAL 1 DAY))`.
2. Filter `app` too (and `name` when you can): both are cluster columns, so they cut bytes.
3. Prefer the small tables: `user_activity_daily` for activity, `retention` for new-user retention, `users` for segments. Read `events` only for specific events.
4. Name columns. Never `SELECT *`.
5. Dry-run every query before it goes in a page (`bq query --dry_run --use_legacy_sql=false --location=EU`, or BigQuery's `dryRun` through the connector if you have no `bq`) and write the bytes in the hand-over. Above 2 GB for one page open, cut the date range or move to a smaller table, and tell the author.
6. Return what the page draws: aggregate in SQL, keep each result under about 5,000 rows.
7. Leave `dash/settings.updates` at `"hour"`: viewers' results are cached for an hour, not re-run on every open.
