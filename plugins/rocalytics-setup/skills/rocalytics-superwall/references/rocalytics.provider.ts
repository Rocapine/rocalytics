import type { StoreProduct, StoreTransaction } from "expo-superwall/compat";

import { rocalytics } from "@/utils/analytics";

export const trackPurchase = (
  product: StoreProduct,
  transaction: StoreTransaction,
): Promise<void> => {
  return rocalytics.trackPurchase({
    isTrial: product.hasFreeTrial ?? false,
    value: product.price,
    product,
    transaction,
    currency: product.currencyCode!,
    originalTransactionIdentifier: transaction.originalTransactionIdentifier,
  });
};
