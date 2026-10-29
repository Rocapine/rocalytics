# Known gaps

Copy the ones that apply into the final report. They are limits of the SDKs today, not wiring mistakes — don't try to work around them in app code.

- **Composable paywall purchases carry no join key in the paywall tracker.** A purchase made through `revenueCatProductProvider` is reported by `trackPurchase` (via the observed Purchases wrapper), but react-native-onboarding passes the observer no transaction id for it, so that presentation counts as a conversion without proceeds.
- **A `Paywall` onboarding step is not linked to its onboarding run.** react-native-onboarding never fills `onboardingRun` in the presentation info, so the paywall and the run are reported separately.
- **(Only if the app could not be upgraded, SKILL.md step 3.) No Studio variant or deployment id on runs with react-native-onboarding < 1.78.0**, and no Studio variant on runs with rocalytics-sdk < 0.7.0. Runs stay versioned by a fingerprint of the served steps either way.
- **(Only if the app could not be upgraded.) Paywall `observer` presentations carry no Studio variant on react-native-onboarding < 1.78.0.** Older releases declare `variantKey` / `deploymentId` on the presentation info but never fill them. 1.78.0 fills both (RNO PR #349). RNO issue #237 is still open for the SDK's own per-step analytics events; Rocalytics does not use those.
- **RevenueCat transaction id.** RevenueCat exposes only `transactionIdentifier`; it is sent as `originalTransactionIdentifier`. Renewals of the same subscription get new ids.
- **Android proceeds.** If the installed RevenueCat types expose no Play `purchaseToken`, Android purchases from custom paywall screens earn no proceeds attribution.
- **Native modules added.** New `expo-*` peers need a new native build; an OTA update to an older binary leaves the client inert (no crash, nothing sent) until users update.
