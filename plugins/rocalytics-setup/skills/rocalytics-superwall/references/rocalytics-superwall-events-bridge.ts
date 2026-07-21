import type { SuperwallEventInfo } from "expo-superwall";

import { rocalytics } from "@/utils/analytics";

/**
 * Forwards every Superwall SDK event verbatim to Rocalytics as a raw log
 * (`superwall_events` table), alongside the normalized `purchase` event
 * tracked separately via `trackPurchase`. Pass this straight to
 * `useSuperwallEvents({ onSuperwallEvent: ... })`.
 */
export function logSuperwallEvent(eventInfo: SuperwallEventInfo): void {
  rocalytics.trackSuperwallEvent(eventInfo).catch((error) => {
    console.error("Failed to log Superwall event to Rocalytics", error);
  });
}
