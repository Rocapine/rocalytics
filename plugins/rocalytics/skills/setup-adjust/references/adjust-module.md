# The Adjust module

One file owns every Adjust call. Default path `services/analytics/adjust.ts`; follow the app's layout and naming if it has one (`services/analytics/providers/adjust.provider.ts`, `services/AdjustService.ts`). Adapt imports to the app's path aliases, error reporter and Rocalytics module.

Check every API against `node_modules/react-native-adjust/index.d.ts` (written against react-native-adjust 5.8).

## Config

`services/analytics/adjust.config.ts` — values from the publishing platform (`get_application` → `adjust_app_token`, `adjust_event_tokens`; Facebook from `meta_app_id`):

```typescript
export const ADJUST_APP_TOKEN = "abc123def456";

/** Event name → Adjust event token. Only events listed here are sent. */
export const ADJUST_EVENT_TOKENS = {
  user_converted: "xyz789",
  // onboarding_completed: "…",
  // app_opened: "…",
} as const satisfies Record<string, string>;

/** Meta app id, for Meta Install Referrer on Android. null when the app has none. */
export const FACEBOOK_APP_ID: string | null = "1234567890";
```

If the platform holds separate iOS / Android values, use `Platform.select` per constant.

## Module

```typescript
import Purchases from "react-native-purchases"; // only when the app uses RevenueCat
import { Platform } from "react-native";
import {
  Adjust,
  AdjustAppStoreSubscription,
  AdjustConfig,
  AdjustEvent,
  AdjustPlayStoreSubscription,
  type AdjustAttribution,
} from "react-native-adjust";
import { getEventId } from "@rocapine/rocalytics-sdk/client";

import { rocalytics } from "@/services/analytics/rocalytics";
import { ADJUST_APP_TOKEN, ADJUST_EVENT_TOKENS, FACEBOOK_APP_ID } from "./adjust.config";

let initialized = false;

/** Call once at startup, after the ATT prompt has resolved (see below). */
export function initAdjust() {
  if (initialized) return;
  initialized = true;
  try {
    const config = new AdjustConfig(
      ADJUST_APP_TOKEN,
      __DEV__ ? AdjustConfig.EnvironmentSandbox : AdjustConfig.EnvironmentProduction,
    );
    if (__DEV__) config.setLogLevel(AdjustConfig.LogLevelVerbose);
    if (FACEBOOK_APP_ID) config.setFbAppId(FACEBOOK_APP_ID); // fills fbInstallReferrer
    config.enableCostDataInAttribution();
    config.setAttributionCallback(onAttribution);
    Adjust.initSdk(config);
    void setRocaId();
  } catch (error) {
    console.error("[adjust] init failed", error);
  }
}

/** The adid only exists once Adjust's backend answered the install: this callback is the first moment it is readable. */
async function onAttribution(attribution: AdjustAttribution) {
  try {
    const adjustId = await getAdjustId();
    await rocalytics.identify({
      adjust_attribution: attribution,
      ...(adjustId ? { adjust_id: adjustId } : {}), // omit, never null: null would clobber a real value
    });
    if (adjustId) Purchases.setAdjustID(adjustId);
  } catch (error) {
    console.error("[adjust] attribution forward failed", error);
  }
}

export function getAdjustId(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      Adjust.getAdidWithTimeout(3000, (adid) => resolve(adid ?? null));
    } catch {
      resolve(null);
    }
  });
}

/** Joins every Adjust event and postback back to the Rocalytics device. */
async function setRocaId() {
  try {
    await rocalytics.ready;
    if (rocalytics.rocaId) Adjust.addGlobalPartnerParameter("roca_id", rocalytics.rocaId);
  } catch (error) {
    console.error("[adjust] roca_id failed", error);
  }
}

export type AdjustPurchase = {
  price: number;
  currency: string;
  isTrial: boolean;
  productId: string;
  /** The SAME value passed to rocalytics.trackPurchase. */
  originalTransactionIdentifier: string;
  /** Android only. */
  storeTransactionId?: string | null;
  purchaseToken?: string | null;
  signature?: string | null;
};

/** Call from the purchase pipeline, right next to rocalytics.trackPurchase. */
export function trackAdjustPurchase(purchase: AdjustPurchase) {
  trackUserConverted(purchase);
  trackStoreSubscription(purchase);
}

function trackUserConverted(p: AdjustPurchase) {
  try {
    const event = new AdjustEvent(ADJUST_EVENT_TOKENS.user_converted);
    // No setRevenue: the store subscription call books the revenue; both would double it.
    event.addPartnerParameter("revenue", String(p.price));
    event.addPartnerParameter("currency", p.currency);
    event.addPartnerParameter("is_trial", String(p.isTrial));
    event.addPartnerParameter("order_id", p.originalTransactionIdentifier);
    const eventId = getEventId("purchase", { original_transaction_identifier: p.originalTransactionIdentifier });
    if (eventId) event.addPartnerParameter("event_id", eventId);
    Adjust.trackEvent(event);
  } catch (error) {
    console.error("[adjust] user_converted failed", error);
  }
}

function trackStoreSubscription(p: AdjustPurchase) {
  try {
    if (Platform.OS === "ios") {
      Adjust.trackAppStoreSubscription(
        new AdjustAppStoreSubscription(String(p.price), p.currency, p.originalTransactionIdentifier),
      );
    } else if (Platform.OS === "android") {
      // Adjust verifies a Play subscription with the purchase token; without it, skip.
      if (!p.storeTransactionId || !p.purchaseToken) return;
      // Argument order: (price, currency, sku, orderId, signature, purchaseToken).
      Adjust.trackPlayStoreSubscription(
        new AdjustPlayStoreSubscription(
          p.price,
          p.currency,
          p.productId,
          p.storeTransactionId,
          p.signature ?? "", // RevenueCat exposes none
          p.purchaseToken,
        ),
      );
    }
  } catch (error) {
    console.error("[adjust] subscription failed", error);
  }
}

/** Any other event with a token in ADJUST_EVENT_TOKENS. Unmapped names are skipped. */
export function trackAdjustEvent(name: string) {
  const token = (ADJUST_EVENT_TOKENS as Record<string, string>)[name];
  if (!token) return;
  try {
    Adjust.trackEvent(new AdjustEvent(token));
  } catch (error) {
    console.error(`[adjust] ${name} failed`, error);
  }
}
```

Drop the RevenueCat import and the `setAdjustID` line when the app has no `react-native-purchases`. Drop `getEventId` / `roca_id` when the app has no Rocalytics SDK, and list them under *By hand*.

## Where each call goes

| Call | Where |
| --- | --- |
| `initAdjust()` | Startup, once. Root layout module scope, or the analytics service's `initialize()` if it has one |
| `trackAdjustPurchase(...)` | Inside the purchase pipeline, next to `rocalytics.trackPurchase`, with the same transaction fields |
| `trackAdjustEvent("onboarding_completed")` etc. | Where the app already tracks that moment (its analytics wrapper fan-out if it has one) |

### ATT (iOS)

Adjust reads the IDFA at init. If the app shows the ATT prompt:

- **Prompt at startup** → call `initAdjust()` in the `.then` of `requestTrackingPermissionsAsync()`.
- **Prompt later** (e.g. in onboarding) → init at startup with `config.setAttConsentWaitingInterval(120)` (seconds; the SDK holds the first session until consent or timeout).

No ATT in the app → init at startup, nothing else.

### Purchase field mapping

| Stack | `originalTransactionIdentifier` | Android `storeTransactionId` / `purchaseToken` / `signature` |
| --- | --- | --- |
| Superwall (`transactionComplete` / delegate) | `transaction.originalTransactionIdentifier` | `transaction.storeTransactionId` / `transaction.purchaseToken` / `transaction.signature` |
| RevenueCat `purchasePackage` | the value the app already passes to `trackPurchase` | `transaction.transactionIdentifier` / `transaction.purchaseToken` / none |

Whatever the stack, reuse the exact fields the pipeline already hands `rocalytics.trackPurchase`. Check names against the installed `expo-superwall` / `react-native-purchases` types.

## Test

Pin the `event_id` (prefix drift made Meta double-count for weeks on one app):

```typescript
jest.mock("react-native-adjust", () => {
  const events: any[] = [];
  class AdjustEvent { params: Record<string, string> = {}; constructor(public token: string) {} addPartnerParameter(k: string, v: string) { this.params[k] = v; } }
  return {
    Adjust: { trackEvent: (e: any) => events.push(e), trackAppStoreSubscription: jest.fn(), trackPlayStoreSubscription: jest.fn(), addGlobalPartnerParameter: jest.fn() },
    AdjustEvent, AdjustAppStoreSubscription: jest.fn(), AdjustPlayStoreSubscription: jest.fn(), AdjustConfig: jest.fn(),
    __events: events,
  };
});

it("user_converted carries order_id and the Meta event_id", () => {
  trackAdjustPurchase({ price: 9.99, currency: "USD", isTrial: false, productId: "p", originalTransactionIdentifier: "2000000841136630" });
  const [event] = require("react-native-adjust").__events;
  expect(event.params.order_id).toBe("2000000841136630");
  expect(event.params.event_id).toBe("purchase-2000000841136630");
});
```

Use the app's prefix if it has a legacy override.
