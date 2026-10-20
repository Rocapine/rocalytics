# Migrating a copied rocalytics.client.ts

Apps used to copy the Rocalytics client into `utils/rocalytics.client.ts` (often with `services/analytics/providers/rocalytics.provider.ts` on top). The SDK's `RocalyticsClient` sends the same requests — a test replays the reference client's scenarios — so the move is mechanical.

Read the installed README's *Migrating from a copied `rocalytics.client.ts`* section and follow it. In short:

1. Install the SDK and the peers (SKILL.md step 4).
2. Find every import of the copied client: `grep -rn "rocalytics.client" --include=*.ts --include=*.tsx . --exclude-dir=node_modules`.
3. Create the client module (`client-and-purchases.md`) exporting the instance under the **name call sites already use** (`rocalytics`, `rocalyticsClient`, …), or repoint the imports. Keep the old provider's function signatures (`trackPurchase(product, transaction)` etc.) so their callers don't change; only their bodies move to the SDK.
4. Delete the copied file. Never run both clients: two clients mean two roca ids and double installs.
5. If the copy had local changes (extra events, a custom base URL), carry them over as `RocalyticsClient` options or `trackCustomEvent` calls, and list them in the report.

## Onboarding reporting

If the app called `rocalytics.trackOnboarding(stepId, answers, metadata)`:

- Moving to the tracker (onboarding tracking chosen): delete every `trackOnboarding` call for the flow, and reuse the same step ids and question keys in the tracker (`onboarding-tracking.md`).
- Not moving: leave `trackOnboarding` as it is. It still works on the SDK client.

Delete any manual `track("onboarding_completed")` once the flow is on the sink — the sink sends it.

## Old plugin

The `rocalytics-setup` plugin (1.x) produced the copied-client setup. This skill replaces its client setup; nothing it scaffolded for the client needs to stay. Its Adjust / Facebook Superwall bridges are separate and stay.
