# Installing @rocapine/react-native-onboarding

Only when the scan found it missing. This is the minimum the trackers need; if the `react-native-onboarding` plugin is installed in this session, its `setup-headless-sdk`, `setup-ui-sdk` and `setup-paywalls` skills go deeper — use them, but this file is enough on its own.

## Install

```sh
npx expo install @rocapine/react-native-onboarding @rocapine/react-native-onboarding-ui
npm ls @rocapine/react-native-onboarding   # must be >= 1.76.0
```

Then install only the peers that are missing (`expo-application`, `expo-font`, `expo-image`; check the installed `package.json` `peerDependencies`). **Never add `expo-router` to a react-navigation app** — without it the package's navigation adapter is a no-op; pass `OnboardingProvider` a `navigation` adapter instead.

A `401` means the `@rocapine` registry isn't configured: run `rocapine doctor --fix` (Rocapine CLI), don't hand-edit `~/.npmrc`. Then read `node_modules/@rocapine/react-native-onboarding/README.md` for peer requirements of the installed version.

## Configure once

At module scope in the root layout (or the client module), before anything renders:

```ts
import Constants from "expo-constants";
import { OnboardingStudio } from "@rocapine/react-native-onboarding";

OnboardingStudio.init({
  projectId: process.env.EXPO_PUBLIC_ROCAPINE_PROJECT_ID!,
  appVersion: Constants.expoConfig?.version ?? "1.0.0",
  isSandbox: __DEV__,
});
```

Ask the user for the Onboarding Studio project id if `EXPO_PUBLIC_ROCAPINE_PROJECT_ID` is not in `.env*`, and add it there.

## Paywalls — only if paywall tracking was chosen

Mount **one** `PaywallProvider` at the root, with `PaywallHost` as a sibling of the app (never inside a screen). For a RevenueCat app, use the observed provider from `client-and-purchases.md`:

```tsx
import { PaywallProvider } from "@rocapine/react-native-onboarding";
import { PaywallHost } from "@rocapine/react-native-onboarding-ui";

<PaywallProvider productProvider={productProvider} customScreens={SCREENS} observer={paywallTracker}>
  <Stack />
  <PaywallHost />
</PaywallProvider>
```

`customScreens` and `productProvider` must be stable references (module scope). Existing Superwall / RevenueCat paywalls keep working: mounting the provider changes nothing until the app calls `present()` or a Studio flow has a `Paywall` step.

## Onboarding — only if the app moves its onboarding to Studio

Do not convert a hand-coded onboarding to a Studio flow as part of this skill — track it as hand-coded (`onboarding-tracking.md`). Mounting `OnboardingProvider` and a step route is only for an app that already has, or asked for, a Studio onboarding; follow the package README's *OnboardingProvider* section for that.
