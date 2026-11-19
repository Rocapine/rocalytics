# Pages

Pages are built with the Artifact tool's **Data** type. Its own instructions (returned when you create from its `type_url`) are the authority on page mechanics: drawings, marks, calcs, checks. This file only fixes what Rocalytics pages add on top.

## Which form

| The ask | Form |
|---|---|
| "a dashboard", "track X", several KPIs to watch, no form named | dashboard (default) |
| "why did X move", "dig into", one question answered with several views | visual analysis |
| "a story", "walk the team through", "scrollytelling", a narrative with a few numbers | scroll story |
| "weekly update", "a note for the team", "investor update" | letter |
| "a tool to look up / compare / filter", a tracker people use | tool |
| "one chart for Slack", "a quick visual" | visual short |

When two fit, ask once which they want; else take the default.

## Starting

`Artifact` with `action: "quickstart"`, `intent: "other"`, then create from the Data type's `type_url` with a short `title`. Follow the instructions in the result.

## Datasets

One dataset per query, in the artifact store, `datasets/<id>`:

```json
{
  "title": "New users per day",
  "description": "marts.users, first_seen_day, by last platform",
  "langs": {"query": "sql"},
  "source": {
    "kind": "call",
    "connector": "Google Cloud BigQuery",
    "tool": "execute_sql_readonly",
    "args": {"projectId": "rocalytics-513516", "query": "<SQL from recipes.md, markers replaced>", "timeoutMs": 110000}
  }
}
```

Loader on the page: `read.bigquery(answer)`. `dash/settings` = `{"updates": "hour"}`.

Every query reads `marts` only (see `marts.md`, `cost.md`).

## When a viewer can't read the data

Every viewer runs the queries with their own Google account. Someone outside `analytics-readers@rocapine.com` gets a permission error instead of rows. The page must show, in place of each empty chart or once at the top:

> You don't have access to the Rocalytics warehouse yet. Ask to join https://groups.google.com/a/rocapine.com/g/analytics-readers with your rocapine.com account; approval comes by email and access works a few minutes later.

Never solve this by sharing the author's connector or results (Claude Data "Their access", `share_connector`, `share_live_queries`).

## Before hand-over

Read `data/users/me` → `check` and `runs`: no faults, every dataset returned rows (or an expected empty result you explain).

## Hand-over

Tell the author, briefly:
- what the page shows, and for which app, period and platforms;
- assumptions and definitions in `metrics.md` terms ("new users = first seen", "new-user retention = 24-hour windows from the first event", "event retention = return N days after any start day"), and every "not yet checked against Amplitude" metric;
- bytes per open (sum of dry-runs);
- the page is private until they share it from its Share menu; sharing the link is fine, since each viewer still needs to be in `analytics-readers@rocapine.com` to see numbers;
- plus the Data type's own hand-over lines.
