# Client, identify and purchases

## The client module

One module, module scope. Put it where the app keeps analytics (`services/analytics/rocalytics.ts` if `services/analytics/` exists, else `utils/rocalytics.ts`). If an old `rocalytics.client.ts` exists, see `migration.md` first — the new module replaces it under the **same exported name** so call sites keep working.

```ts
import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RocalyticsClient } from "@rocapine/rocalytics-sdk/client";
import type { KeyValueStorage, RunContextInput } from "@rocapine/rocalytics-sdk/onboarding";

// Created once. It starts itself: reads or mints the roca id, identifies the
// device and sends `install` once per device. Every method waits for that.
export const rocalytics = new RocalyticsClient();

// AsyncStorage satisfies KeyValueStorage structurally: unsent snapshots and
// in-progress runs survive the app being killed.
export const trackingStorage: KeyValueStorage = AsyncStorage;

// Shared by the onboarding and paywall trackers. Read once per run/presentation.
export const trackingContext = (): RunContextInput => ({
  appVersion: Application.nativeApplicationVersion ?? "0.0.0",
  build: Application.nativeBuildVersion ?? null,
  platform: Platform.OS === "android" ? "android" : "ios",
  osVersion: Device.osVersion ?? null,
  // The language the flow is SHOWN in. If the app has its own language picker, use that, not the device's.
  locale: Localization.getLocales()[0]?.languageTag ?? "en-US",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
```

Import this module from the root layout (a side-effect import is enough: `import "@/services/analytics/rocalytics";`) so the client starts at launch, not at first use.

**`identifyOnStart`.** If the app already sends its own, richer `identify` at start-up (with the in-app language as `locale`), construct with `new RocalyticsClient({ identifyOnStart: false })` and make sure the app's identify runs before anything else is sent — `sendOnboardingRun` answers 404 for a roca id never identified. Otherwise leave the default.

## Identify

Wherever the app learns an identifier, call `identify`. Null values are dropped, so pass what you have:

```ts
await rocalytics.identify({ user_id: userId, revenue_cat_id: Purchases ? await Purchases.getAppUserID() : null });
```

Typical places: after sign-in / account creation, after `Purchases.configure()` / `Purchases.logIn()`, and where Adjust attribution arrives (`adjust_attribution`). Do not invent identifiers the app does not have.

## Purchases — one recipe per stack

`trackPurchase({ isTrial, value, currency, originalTransactionIdentifier, product?, transaction?, productId? })`. It deduplicates per `originalTransactionIdentifier`, so the id must be present — a purchase without it is dropped by Rocalytics.

**If the app already has one purchase pipeline** (a function every purchase goes through, like Harmony's `recordConversion`), add the `trackPurchase` call **inside it** and route new stacks into it. Never add a second, parallel call.

Wrap every call: `try { … } catch (e) { reportError(e) }` with the app's reporter (Sentry `captureException` if present, else `console.error`).

### Superwall

In the `SuperwallDelegate` subclass (create `services/superwall/superwall.delegate.ts` if none, and register it where `Superwall.configure` / `<SuperwallProvider>` is), handle `EventType.transactionComplete`. Keep existing cases; only add the call.

```ts
case EventType.transactionComplete: {
  const { product, transaction } = eventInfo.event;
  // No currency → no call: a guessed currency is wrong revenue. Report it instead.
  if (product && transaction && !product.currencyCode) reportError(new Error("[rocalytics] purchase without currencyCode"));
  else if (product && transaction) {
    rocalytics.trackPurchase({
      isTrial: product.hasFreeTrial ?? false,
      value: product.price,
      currency: product.currencyCode,
      originalTransactionIdentifier: transaction.originalTransactionIdentifier,
      product,
      transaction,
    }).catch(reportError);
  }
  break;
}
```

Check field names against the installed `expo-superwall` types (`node_modules/expo-superwall/build/**/*.d.ts`) — older versions differ.

### RevenueCat called by app code

After each successful `Purchases.purchasePackage(pkg)` / `purchaseStoreProduct(product)`:

```ts
const result = await Purchases.purchasePackage(pkg);       // MakePurchaseResult
const p = pkg.product;                                     // PurchasesStoreProduct
await rocalytics.trackPurchase({
  isTrial: p.introPrice?.price === 0,
  value: p.price,
  currency: p.currencyCode,
  // RevenueCat exposes one transaction id; it is the join and dedup key.
  originalTransactionIdentifier: result.transaction.transactionIdentifier,
  productId: result.productIdentifier,
  product: p,
  transaction: result.transaction,
});
```

Skip `userCancelled` errors. A restore is not a purchase: never call `trackPurchase` for `restorePurchases()`.

### Native paywalls on RevenueCat (custom paywall screens)

A screen registered in `PaywallProvider` `customScreens` buys through RevenueCat itself. Do **both**, with the **same** id:

1. Report the purchase as in *RevenueCat called by app code* (through the app's pipeline).
2. Close the presentation with the transaction, so the paywall tracker can join it to revenue:

```ts
complete({
  status: "purchased",
  transaction: {
    originalTransactionIdentifier: result.transaction.transactionIdentifier, // SAME value passed to trackPurchase
    purchaseToken: (result.transaction as { purchaseToken?: string }).purchaseToken, // Android join key, if the installed RevenueCat exposes it
    productId: result.productIdentifier,
  },
});
// Restore: complete({ status: "purchased", transaction: { restored: true } })
// Close button / cancel: complete({ status: "dismissed" }) — complete() must run on EVERY exit path.
```

Check `node_modules/@revenuecat/purchases-typescript-internal` for a `purchaseToken` field on the transaction. If there is none, Android purchases from these screens earn no proceeds attribution — list it in the report.

### Studio composable paywalls (`revenueCatProductProvider`)

The SDK makes the purchase and discards RevenueCat's result, so the app never sees the transaction. `revenueCatProductProvider(Purchases)` takes the Purchases module as its argument — wrap `purchaseStoreProduct` to observe it:

```ts
import Purchases, { type PurchasesStoreProduct } from "react-native-purchases";
import { revenueCatProductProvider } from "@rocapine/react-native-onboarding";

const observedPurchases = {
  getProducts: Purchases.getProducts.bind(Purchases),
  restorePurchases: Purchases.restorePurchases.bind(Purchases),
  async purchaseStoreProduct(product: PurchasesStoreProduct) {
    const result = await Purchases.purchaseStoreProduct(product);
    recordPurchase(product, result); // the app's pipeline → rocalytics.trackPurchase, as above
    return result;
  },
};

// Module scope: productProvider must be a stable reference.
export const productProvider = revenueCatProductProvider(observedPurchases);
```

Read `node_modules/@rocapine/react-native-onboarding/dist/products/adapters/revenueCat.js` first and bind **every** `Purchases` method it calls (as of 1.77.0: `getProducts`, `purchaseStoreProduct`, `restorePurchases`). `Purchases` is a class of static methods, so `{ ...Purchases }` copies none of them — list each one. Keep the wrapper in one file next to the provider.
