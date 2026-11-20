---
name: request-data-access
description: Check whether someone can read Rocapine's analytics warehouse (BigQuery rocalytics-513516, the marts dataset) and, if not, get them access through the analytics-readers Google group. Use when someone gets "Access Denied" / "permission denied" / 403 on rocalytics-513516 or marts, can't open a Rocalytics data page or dashboard, asks how to get access to warehouse, BigQuery or product data, or when build-data-page finds access missing. Never grants access itself.
---

# Request data access

Access to the warehouse is one Google group: `analytics-readers@rocapine.com`. Members can read every table in `marts` for every app, and run queries. Nothing else: `raw_*` and `stg` hold sensitive answers and typed text, and no person reads them. Membership is approved by the group owner; nobody grants access any other way.

## 1. Connector

Is the claude.ai **Google Cloud BigQuery** connector connected in this session (a tool named like `mcp__claude_ai_Google_Cloud_BigQuery__execute_sql_readonly`)? If not: tell them to connect it in claude.ai → Settings → Connectors (sign in with their rocapine.com Google account), then run `/mcp` here, and stop until they say it's done.

## 2. Probe

Call `execute_sql_readonly` with `projectId: "rocalytics-513516"` and the query `SELECT app FROM marts.apps LIMIT 1`.

## 3. Read the result

- **Rows come back → has access.** Say so, and which apps are in (`SELECT app, name FROM marts.apps` if they want the list).
- **Permission error (Access Denied, 403, `bigquery.jobs.create`, `bigquery.tables.getData`) → needs group.** Reply:
  - what the group gives: read access to `marts` for every app (events, users, daily activity, retention), nothing raw;
  - the link: https://groups.google.com/a/rocapine.com/g/analytics-readers — click **Ask to join** while signed in with their rocapine.com account (other accounts can't join);
  - the group owner approves from the email; once approved, access works within a few minutes. Then run this skill again (or just retry the page).
- **They say they were already approved:** probe again first. If it still fails: it can take a few minutes after approval. Ask them to wait 5–10 minutes and probe again. If it still fails after that, check they joined with the same Google account the connector uses (claude.ai → Settings → Connectors), then ask the group owner to confirm membership. Don't send them to ask to join again.
- **Any other error** (connector error, timeout, project not found) → **other error.** Quote the error and stop. Don't guess.

## Never

- Never grant access: no IAM change through `gcloud`, `bq`, Terraform or the console, even if you have the permissions. Access is Terraform (one grant to the group) plus group membership; nothing else.
- Never suggest `raw_*` or `stg` (or another project, a service-account key, or someone else's credentials) as a workaround.
- Never share a connector or a page's results with them so they can skip the group (see build-data-page).
