import type { SuperwallEventInfo } from "expo-superwall";
import { AppEventsLogger } from "react-native-fbsdk-next";

const TRIAL_PRICE_MULTIPLIER = 0.2;

/**
 * Forwards a Superwall `transactionComplete` event to Facebook SDK for purchase tracking.
 * Applies a 0.2x price multiplier for trial purchases.
 * Pass this straight to `useSuperwallEvents({ onSuperwallEvent: ... })`.
 */
export function trackPurchaseWithFacebookSDK(
  eventInfo: SuperwallEventInfo,
) {
  if (eventInfo.event.event !== "transactionComplete") return;

  const { product, transaction } = eventInfo.event;
  if (!product || !transaction) {
    console.error(
      new Error(
        `trackPurchaseWithFacebookSDK: transactionComplete event missing product or transaction: product: ${!!product}, transaction: ${!!transaction}`,
      ),
    );
    return;
  }

  const currency = product.currencyCode;
  if (!currency) {
    console.error(
      new Error(
        "trackPurchaseWithFacebookSDK: missing currencyCode on product",
      ),
    );
    return;
  }

  // Calculate price: apply trial multiplier if applicable
  const basePrice = product.price;
  const finalPrice = product.hasFreeTrial
    ? basePrice * TRIAL_PRICE_MULTIPLIER
    : basePrice;

  try {
    AppEventsLogger.logPurchase(finalPrice, currency);

    if (product.hasFreeTrial) {
      AppEventsLogger.logEvent(AppEventsLogger.AppEvents.StartTrial);
    } else {
      AppEventsLogger.logEvent(AppEventsLogger.AppEvents.Subscribe, finalPrice, {
        fb_currency: currency,
      });
    }
  } catch (error) {
    console.error(
      "An error occurred while tracking purchase with Facebook SDK",
      error,
    );
  }
}
