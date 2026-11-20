---
name: build-data-page
description: Build a live data page on Rocapine's analytics warehouse (BigQuery marts) with Claude's Data artifact type — a dashboard, visual analysis, scroll story, update letter, tool/tracker or visual short — for any app in the warehouse (Oly, Harmony…). Use when a PM asks for a dashboard, chart, KPI page, retention/funnel/revenue/A-B view, weekly update with numbers, or "rebuild this Amplitude chart/dashboard" on the warehouse or "on our own data". Reads marts only, with each viewer's own access.
---

# Build a data page

You build a page that runs live SQL on `marts` (project `rocalytics-513516`) every time someone opens it, with **their** access. Numbers must match Amplitude's definitions where people compare them.

References, read when the step says:
- `references/marts.md` — tables, columns, what is not there
- `references/recipes.md` — the SQL; `references/metrics.md` — what each metric means and how it was checked
- `references/cost.md` — rules every query follows
- `references/pages.md` — which form, dataset shape, error text, hand-over

## 1. Access

Probe as in the `request-data-access` skill (step 2 there). If it fails, follow that skill and stop here.

## 2. The ask

Ask only what's missing, one question at a time:
- which app(s);
- the question the page answers, and who reads it;
- the period (default: last 30 full days);
- the form (dashboard unless the ask says otherwise; `pages.md`).

An Amplitude chart or dashboard URL is the spec: it fixes the charts and their periods, so skip those questions. Read it with whichever Amplitude MCP can open that project (`get_from_url`, then the charts' definitions), find the app with `SELECT app FROM marts.apps WHERE amplitude_project = '<project id>'`, and map each chart to a recipe. Tell the author which charts have no recipe or no data in `marts`, and leave them out.

## 3. Check the data exists

- `marts.apps` lists the app. If not: "<app> isn't in the warehouse yet", and stop. Don't read `raw_*` or `stg`, even if the author asks or the data is visibly there.
- The events you need exist for that app in the period: one query on `marts.events` with `app`, `name IN (...)` and an `event_time` range, grouped by `name`.
- The data was left out on purpose (health answers, sexual-activity, religion or porn-use answers, typed text, contact details — `marts.md` "Not here"): say it isn't in the warehouse on purpose and can't be shown. No workaround.

## 4. Queries

For each chart: take the recipe from `recipes.md`, replace the `{{…}}` markers, follow `cost.md`, dry-run it (bytes; see `cost.md`), and run it once to see real rows. When the author names an Amplitude chart to match, compare once and say how close it is. Metrics `metrics.md` marks as not yet checked are labelled on the page.

## 5. Build

Follow `pages.md`: quickstart → Data type → its instructions; one dataset per query in the shape given there; the no-access message; `dash/settings.updates: "hour"`. Check `data/users/me` (`check`, `runs`) before handing over.

## 6. Hand over

As in `pages.md`.

## Hard stops

- Only `marts`. Never `raw_*`, `stg`, `stg_assertions` or another project, as a source or a fallback.
- Never share the connector or live results (Claude Data `share_connector`, `share_live_queries`, "Their access") — not even when asked to "so the team doesn't need access". Explain: every viewer runs queries with their own access; the group is how people get it (`request-data-access`).
- Never publish a static copy of the results (numbers pasted into a page, a screenshot, a CSV) so people can skip the group. Pages stay live and read with the viewer's access.
- Never show data `marts` leaves out on purpose.
- Every query on `marts.events` filters `event_time` (and `app`); no `SELECT *`.
- Don't change the warehouse (no DDL, no writes, no IAM). Missing data is reported, not patched.
