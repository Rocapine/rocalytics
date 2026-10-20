# Onboarding run tracking

The tracker (`@rocapine/rocalytics-sdk/onboarding`) reports one **run** per time the user goes through the onboarding: which steps were shown, the answers, and completion. Delivered to Rocalytics by `createRocalyticsOnboardingSink(rocalytics)`.

Rules from the SDK README that the wiring must respect:

- **Sink or `trackOnboarding`, never both** for one flow — the ingest keeps one onboarding per roca id. Remove old `rocalytics.trackOnboarding(...)` calls for this flow.
- **Never send `onboarding_completed` yourself** for a flow on the sink: the sink sends it once per completed run. Remove manual `track("onboarding_completed")`.
- **Keep step keys and question keys** the old reporting used, so existing dashboards keep finding answers.
- **Answer values are stable option keys, never displayed labels.**
- `onboarding.version` must change whenever the manifest or a question's keys change.
- No method throws; problems go to `onDiagnostic`.

## Configure once at startup

In the client module (`client-and-purchases.md`):

```ts
import { onboardingRun } from "@rocapine/rocalytics-sdk/onboarding";
import { createRocalyticsOnboardingSink } from "@rocapine/rocalytics-sdk/client";

onboardingRun.configure({
  sink: createRocalyticsOnboardingSink(rocalytics),
  context: trackingContext,
  storage: trackingStorage,
});
```

## Studio flow (`OnboardingProvider` + a step route)

react-native-onboarding has no step observer, but **every step renders through the app's own step route** (e.g. `app/onboarding/[questionId].tsx`), which calls `useOnboardingStep({ stepNumber })` and owns `onContinue`. That route is the single seam: wiring it covers every step type, composable and custom screens alike.

Create `services/analytics/onboardingTracking.ts`:

```ts
import { onboardingRun, type AnswerInput, type OnboardingRun } from "@rocapine/rocalytics-sdk/onboarding";
import type { BaseStepType, OnboardingMetadata } from "@rocapine/react-native-onboarding";

let run: OnboardingRun | null = null;
let runOnboardingId: string | null = null;

// A short stable fingerprint of the served flow: changes when steps or their variables change.
const fingerprint = (steps: BaseStepType[]) => {
  let h = 0;
  for (const c of steps.map((s) => `${s.id}:${(s as { variableName?: string }).variableName ?? ""}`).join("|")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `s${(h >>> 0).toString(36)}`;
};

export function currentOnboardingRun(steps: BaseStepType[], metadata: OnboardingMetadata): OnboardingRun {
  if (run && runOnboardingId === metadata.id) return run;
  runOnboardingId = metadata.id;
  run = onboardingRun.start({
    onboarding: { key: metadata.id, version: fingerprint(steps) },
    manifest: { steps: steps.map((s) => ({ stepKey: s.id })) },
    studio: { onboardingId: metadata.id, audienceId: metadata.audienceId, draft: metadata.draft },
  });
  return run;
}

export function completeOnboardingRun() {
  run?.complete();
  run = null;
  runOnboardingId = null;
}

export function backgroundOnboardingRun() {
  run?.background();
}

export function toAnswer(questionKey: string | undefined, value: unknown): AnswerInput[] | undefined {
  if (!questionKey || value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return [{ questionKey, kind: "multi", value: value.map(String) }];
  if (typeof value === "number") return [{ questionKey, kind: "numeric", value }];
  if (typeof value === "string") return [{ questionKey, kind: "single", value }];
  return undefined; // objects: map to a stable key by hand, or leave unreported
}
```

Adjust `toAnswer` to the flow: `"text"` (≤ 1,000 chars) for free-text steps, the option **key** (not its label) for single/multi choice, a `unit` for numeric steps that have one. Keys match `A-Z a-z 0-9 _ . : -`, 1–128 chars.

In the step route:

```tsx
const { step, steps, onboardingMetadata, completeOnboarding } = useOnboardingStep({ stepNumber });
const navigation = useOnboardingNavigation(); // or expo-router's useFocusEffect
const exited = useRef(false);

navigation.useFocusEffect(
  useCallback(() => {
    const r = currentOnboardingRun(steps, onboardingMetadata);
    exited.current = false;
    r.enterStep(step.id);
    return () => { if (!exited.current) r.exitStep(step.id); }; // back navigation
  }, [step.id, steps, onboardingMetadata]),
);

const onContinue = (value?: unknown) => {
  const variableName = (step as { variableName?: string }).variableName;
  exited.current = true;
  currentOnboardingRun(steps, onboardingMetadata).exitStep(step.id, { answers: toAnswer(variableName, value) });
  // …existing logic: setVariable, resolveNextStepNumber, router.push / completeOnboarding()
};
```

**Where the answers really are.** Routes differ; find the one place the step's answer becomes known and report it there:

- The route passes the answer to its own handler (`goNext(answers)` → `handleAnswers(step.id, answers)`, as in Eve): call `exitStep` in that handler, mapping the app's answer shape with `toAnswer`.
- `onContinue(value)` with `step.variableName` (as in the package example): the snippet above.
- Composable screens that write through `setVariable(name, { value, label?, kind? })`: those never reach `onContinue`. Snapshot `getVariables()` (from `OnboardingProgressContext`) on focus, and on exit report each key whose entry changed, using `entry.value`, never `entry.label`.

If the route uses expo-router directly, `useFocusEffect` from `expo-router` works as well as the adapter.

Then:

- **Completion**, where the app actually ends the flow: `OnboardingProvider`'s `onComplete`, or the route's last-step branch (`isLastStep` / `resolveNextStepNumber(...) === null`). Call `completeOnboardingRun()` **first**, then the existing logic — and delete any `captureEvent`/`track("onboarding_completed")` meant for Rocalytics there.
- In the root layout, an `AppState` listener: on `"background"` call `backgroundOnboardingRun()`.
- **Resume:** react-native-onboarding restarts the flow on a cold start, so a new run is correct — do not call `resume()`. Only if the app restores the user's position itself, race `onboardingRun.resume()` against a ~3 s timeout (README, *A hand-coded onboarding*) before `start()`.
- If old reporting used other step keys than Studio step ids, map them (`stepKey: legacyKey[s.id] ?? s.id`) in **both** the manifest and `enterStep`/`exitStep`.

## Hand-coded onboarding

No Studio flow: follow the README's *A hand-coded onboarding* section exactly — `start()` with an explicit `onboarding: { key, version }` and a manifest of every screen (alternatives at one position share a `slot`), `enterStep`/`exitStep` per screen, `complete()` at the end, `background()` from `AppState`. Put the manifest next to the navigator so a new screen can't be added without it.

## Verify

Launch in dev, go through two steps, background the app: the console must show no `[rocalytics]` diagnostics such as `invalid-start` or unknown step keys. An `invalid-start` almost always means a step id or key outside `A-Z a-z 0-9 _ . : -` (max 128).
