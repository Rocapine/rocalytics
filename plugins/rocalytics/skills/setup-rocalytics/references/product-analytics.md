# Product analytics (`/analytics`)
`@rocapine/rocalytics-sdk/analytics` sends product events (what Amplitude's `track` carries) to the Rocalytics warehouse (BigQuery, read by Mitzu). Needs rocalytics-sdk **>= 0.10.0**. The installed README's *Product analytics* section is the source of truth.

## 0. Gate: the app must be on the ingest allowlist
The ingest drops every batch from an unknown app id (403, never retried) — events sent before the app is allowlisted are lost. Check each bundle id / package name before wiring:

```sh
for id in <ios bundle id> <android package>; do
  curl -s -X POST https://ingest.rocapi.ne/v1/batch -H 'content-type: application/json' -d "{\"app_id\":\"$id\"}"; echo "  ← $id"
done
```
- `"bad platform"` → allowlisted (the probe sends no events).
- Dev / preview variants (`<id>.dev`, `<id>.preview`) are normally not allowlisted: their batches are rejected, which is expected. Probe only the production ids for the gate.
- `"unknown app_id"` → **not allowlisted.** Wire it anyway, but put under *By hand*, as a release blocker: add the id to `event_ingest_apps` (`terraform/variables.tf`) and the app to `models/includes/apps.js` in Rocapine/rocalytics-warehouse, merged and applied **before** a build with this code ships.

## 1. The analytics module
Next to the Rocalytics client module (same folder), one instance at module scope:

```ts
import { createAnalytics } from "@rocapine/rocalytics-sdk/analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { getRandomValues } from "expo-crypto";
import { getLocales } from "expo-localization";
import { AppState, Platform } from "react-native";
import { rocalytics } from "./rocalytics"; // the client module

export const analytics = createAnalytics({
  appId: Application.applicationId!,
  platform: Platform.OS === "ios" ? "ios" : "android",
  rocaId: () => rocalytics.rocaId,       // events tracked before it resolves are kept
  context: () => ({
    appVersion: Application.nativeApplicationVersion,
    osVersion: String(Platform.Version),
    locale: getLocales()[0]?.languageTag ?? null,
  }),
  storage: AsyncStorage,                 // unsent events survive a kill
  getRandomValues,                       // Hermes has no crypto global; without it event ids use Math.random
  onDiagnostic: (d) => { if (__DEV__) console.warn("[analytics]", d.code, d.message); },
});

AppState.addEventListener("change", (s) => { if (s === "background") void analytics.flush(); });
```
- Use the client module's actual export name for `rocaId`; read the README for its exact property.
- `getRandomValues` must be passed: importing `expo-crypto` alone does **not** install `crypto` on Hermes.

## 2. Calls
| Amplitude | Rocalytics |
| --- | --- |
| `amplitude.track(name, props)` | `analytics.track(name, props)` |
| `amplitude.setUserId(id)` | `analytics.setUserId(id)` (`null` clears) |
| `amplitude.identify(new Identify().set(k, v))` | `analytics.identify({ k: v })` |
| `amplitude.reset()` | `analytics.reset()` |

- Call `setUserId` where the app learns its account id (same place as `rocalytics.identify` / `Purchases.logIn`), and `reset` on logout.
- No personal data in properties or user properties: no emails, phone numbers, names or free text. Mitzu indexes sample values.
- Event names are the app's existing Amplitude names, unchanged, so warehouse history stays continuous.

## 3. Amplitude stays (dual-run)
If the app already sends to Amplitude, **do not remove it**. Route every product event through the app's single analytics wrapper (e.g. `services/analytics`) and fan out to both:

```ts
export function track(name: string, props?: Record<string, unknown>) {
  amplitude.track(name, props);
  analytics.track(name, props);
}
```
No wrapper yet → create one and move the direct `amplitude.*` call sites onto it. The warehouse keeps reading Amplitude until the app's `sdkFrom` is set in `models/includes/apps.js`, after a parity check of both sources; Amplitude is removed only after that, in a separate change.

No Amplitude → just the module and the calls.

## 4. Report lines
- **Connected:** `analytics` module (file), wrapper (file), `setUserId` / `reset` sites, background flush.
- **By hand:** allowlist status from step 0; warehouse `apps.js` entry; Amplitude removal after cutover.
