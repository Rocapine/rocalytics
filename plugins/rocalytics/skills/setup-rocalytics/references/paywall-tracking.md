# Paywall presentation tracking

`createPaywallTracker` (`@rocapine/rocalytics-sdk/paywall`) reports each paywall presentation — start, shown, end (purchased / dismissed / cancelled / error) — to Rocalytics through `createRocalyticsPaywallSink(rocalytics)`. It never throws, never delays a paywall and never changes its result.

## Create it once

In the client module:

```ts
import { createPaywallTracker } from "@rocapine/rocalytics-sdk/paywall";
import { createRocalyticsPaywallSink } from "@rocapine/rocalytics-sdk/client";

export const paywallTracker = createPaywallTracker({
  sink: createRocalyticsPaywallSink(rocalytics),
  context: trackingContext,
  storage: trackingStorage, // unsent snapshots (≤ 20) survive the app being killed
});
```

## Studio paywalls (react-native-onboarding ≥ 1.76.0)

Pass it to the single `PaywallProvider` as `observer`. That covers `present()` / `register()` and `Paywall` onboarding steps, composable and custom-screen paywalls:

```tsx
<PaywallProvider productProvider={productProvider} customScreens={SCREENS} observer={paywallTracker}>
```

Custom paywall screens must report the purchase with its join key in `complete()` — see *Native paywalls on RevenueCat* in `client-and-purchases.md`. Without it the presentation counts as a conversion but earns no proceeds.

## Superwall paywalls (contract v1.1, `provider: "external"`)

Check the installed SDK supports it: `grep -c '"external"' node_modules/@rocapine/rocalytics-sdk/dist/paywall/*.d.ts`. If it does, report Superwall presentations from the same `SuperwallDelegate` that reports purchases:

```ts
const open = new Map<string, ReturnType<typeof paywallTracker.start>>();

case EventType.paywallOpen: {
  const info = eventInfo.event.paywallInfo;
  const handle = paywallTracker.start({
    provider: "external",
    providerName: "superwall",
    placement: info.presentedByEventWithName ?? "unknown",
    externalPaywallId: info.identifier,
    variantKey: info.experiment?.variant?.id,
    renderMode: "external",
    billing: "store",
    surface: "placement",
  });
  handle?.shown();
  open.set(info.identifier, handle);
  break;
}
case EventType.transactionComplete: {
  // …trackPurchase as in client-and-purchases.md, then:
  const id = eventInfo.event.paywallInfo?.identifier;
  open.get(id)?.end({ status: "purchased", transaction: { originalTransactionIdentifier: eventInfo.event.transaction?.originalTransactionIdentifier, productId: eventInfo.event.product?.productIdentifier } });
  open.delete(id);
  break;
}
case EventType.paywallClose: {
  const id = eventInfo.event.paywallInfo.identifier;
  open.get(id)?.end({ status: "dismissed" });
  open.delete(id);
  break;
}
```

Event and field names vary across `expo-superwall` versions — confirm each one (`paywallOpen`, `paywallClose`, `transactionComplete`, `paywallInfo.identifier`, the placement name, the experiment variant) against `node_modules/expo-superwall/build/**/*.d.ts` and adjust. `end()` is accepted once per handle; a second call is ignored, so closing after a purchase is safe.

## A paywall the app renders with its own code, outside PaywallProvider

`paywallTracker.start({ provider: "native", externalPaywallId: "<the app's variant key>", renderMode: "custom", billing: "store", surface: "placement" })`, `shown()` when it is on screen, `end(...)` on every exit path with the transaction on a purchase.
