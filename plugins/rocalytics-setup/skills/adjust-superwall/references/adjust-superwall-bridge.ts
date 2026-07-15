import type { SuperwallEventInfo } from "expo-superwall";
import { Platform } from "react-native";
import Adjust, {
  AdjustAppStoreSubscription,
  AdjustPlayStoreSubscription,
} from "react-native-adjust";

/**
 * Forwards a Superwall `transactionComplete` event to Adjust as a subscription.
 * Pass this straight to `useSuperwallEvents({ onSuperwallEvent: ... })`.
 */
export function trackSubscriptionFromSuperwallEvent(
  eventInfo: SuperwallEventInfo,
) {
  if (eventInfo.event.event !== "transactionComplete") return;

  const { product, transaction } = eventInfo.event;
  if (!product || !transaction) {
    console.error(
      new Error(
        `trackSubscriptionFromSuperwallEvent: transactionComplete event missing product or transaction: product: ${!!product}, transaction: ${!!transaction}`,
      ),
    );
    return;
  }

  const price = String(product.price);
  const currency = product.currencyCode;
  if (!currency) {
    console.error(
      new Error(
        "trackSubscriptionFromSuperwallEvent: missing currencyCode on product",
      ),
    );
    return;
  }

  if (Platform.OS === "ios") {
    const transactionId = transaction.originalTransactionIdentifier;
    if (!transactionId) {
      console.error(
        "trackSubscriptionFromSuperwallEvent: transactionId is required for iOS purchases",
      );
      return;
    }
    try {
      Adjust.trackAppStoreSubscription(
        new AdjustAppStoreSubscription(price, currency, transactionId),
      );
    } catch (error) {
      console.error(
        "An error occured while tracking App Store subscription",
        error,
      );
    }
  } else if (Platform.OS === "android") {
    const sku = product.productIdentifier;
    const orderId = transaction.storeTransactionId;
    const { signature, purchaseToken } = transaction;
    if (!sku || !orderId || !signature || !purchaseToken) {
      console.error(
        `trackSubscriptionFromSuperwallEvent: sku, orderId, signature, and purchaseToken are required for Android purchases: sku: ${!!sku}, orderId: ${!!orderId}, signature: ${!!signature}, purchaseToken: ${!!purchaseToken}`,
      );
      return;
    }
    try {
      Adjust.trackPlayStoreSubscription(
        new AdjustPlayStoreSubscription(
          price,
          currency,
          sku,
          orderId,
          signature,
          purchaseToken,
        ),
      );
    } catch (error) {
      console.error(
        "An error occured while tracking Play Store subscription",
        error,
      );
    }
  }
}
