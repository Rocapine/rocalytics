---
name: rocalytics-onboarding
description: Wire Rocalytics onboarding step tracking into a project's onboarding flow. Use after /rocalytics-setup to track step-by-step onboarding progress and answers.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# /rocalytics-onboarding

Wires Rocalytics onboarding step tracking into a project's onboarding flow.

Arguments: `$ARGUMENTS`

Run after `/rocalytics-setup`. Requires a `utils/analytics.ts` that exports `rocalytics` (scaffolded by the base skill) with a `trackOnboarding` method on `RocalyticsClient` (added in the same reference file).

---

## Overview

The client tracks onboarding progress by sending the **full snapshot** of every step seen so far on every navigation change — the backend upserts the latest snapshot for the current roca-id, keyed by `sent_at` so an out-of-order retry can't clobber a later step. Call sites never need to batch or diff anything themselves; `rocalytics.trackOnboarding(stepId, answers?, metadata?)` maintains the running snapshot internally and re-sends it each time.

If `RocalyticsClient` in `utils/rocalytics.client.ts` does not yet have `trackOnboarding`, `OnboardingStepAnswers`, `OnboardingMetadata`, or `OnboardingResponsePayload`, re-run `/rocalytics-setup` first (or reconcile the file against the reference in that skill's directory) — this skill only wires call sites, it does not scaffold the client.

---

## Step 1 — Scaffold the provider

Read `references/rocalytics-onboarding.provider.ts` (in this skill's directory) and write it to `services/analytics/providers/rocalytics-onboarding.provider.ts` in the project.

If the file already exists, reconcile: keep any existing exports, ensure `trackOnboardingStep` matches the reference signature.

---

## Step 2 — Find the onboarding flow

Search the project for the onboarding UI: screens/routes/steps under names like `onboarding`, `welcome`, `intro`, or `getting-started`, or a state machine tracking the current step (e.g. `currentStep`, `stepIndex`).

- If the project uses `@rocapine/react-native-onboarding` (the headless onboarding SDK), find where it exposes the current step / step change (e.g. a step-change callback or the current step from its hook) — that is the single call site to wire.
- Otherwise, find wherever the app already advances between onboarding screens (a `router.push` to the next step, a `setStepIndex` call, or a "Next" button handler) — every one of those call sites is a navigation change and needs a `trackOnboardingStep` call.

---

## Step 3 — Wire the call sites

At each place identified in Step 2, call `trackOnboardingStep` with the step being entered. Fire-and-forget — don't await it or block navigation on it.

```typescript
import { trackOnboardingStep } from "@/services/analytics/providers/rocalytics-onboarding.provider";

function WelcomeStep() {
  useEffect(() => {
    trackOnboardingStep("welcome", undefined, { onboarding_id: "onb_123" });
  }, []);
  // ...
}
```

Pass `metadata` (`onboarding_id`, `audience_id`, `deployment_id`, ...) on the first step of the flow if the project knows which onboarding/audience/deployment is being shown (e.g. from Onboarding Studio config) — omit it on later steps, it's merged server-side into what was already sent.

When a step collects an answer (a question screen), pass it as `answers` — either as soon as it's captured, or when the user advances past that step:

```typescript
function GoalStep() {
  const handleSelect = (goal: string) => {
    trackOnboardingStep("goal", { goal });
    router.push("/onboarding/age");
  };
  // ...
}
```

Calling `trackOnboardingStep` again with the **same** `stepId` merges the new `answers` into that step without closing it out (use this for a step with multiple questions, or to update an answer before the user moves on). Calling it with a **different** `stepId` closes out the previous step (`exited_at`) and opens the new one — this is what should fire on every actual navigation.

---

## Step 4 — Onboarding completion

If the project already tracks a completion event via `rocalytics.track("onboarding_completed")` (scaffolded by `/rocalytics-setup`), leave it as is — `trackOnboarding` is a separate, complementary snapshot of step-by-step progress and answers, not a replacement for the completion event.

---

## Verify

```bash
npx tsc --noEmit 2>&1 | grep -i rocalytics
```

A clean result (no output) means success. Fix any type errors before reporting done.

Confirm snapshots are landing by checking the `onboarding_responses` row for a test roca-id (ask the user for backend/DB access if you need to verify beyond the type check).
