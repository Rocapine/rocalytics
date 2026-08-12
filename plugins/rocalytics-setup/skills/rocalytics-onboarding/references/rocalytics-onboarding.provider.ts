import type {
  OnboardingMetadata,
  OnboardingStepAnswers,
} from "@/utils/rocalytics.client";
import { rocalytics } from "@/utils/analytics";

/**
 * Call every time the onboarding flow navigates — entering a step, the user
 * answering a question, or moving to the next step. Sends the full snapshot
 * of steps seen so far; the backend upserts the latest snapshot for this
 * roca-id, so there's no need to batch, debounce, or await this call site.
 *
 * Pass `metadata` (onboarding_id, audience_id, deployment_id, ...) once you
 * know which onboarding is being shown — typically on the first step.
 */
export function trackOnboardingStep(
  stepId: string,
  answers?: OnboardingStepAnswers,
  metadata?: OnboardingMetadata,
): void {
  rocalytics.trackOnboarding(stepId, answers, metadata).catch((error) => {
    console.error("Failed to track onboarding step to Rocalytics", error);
  });
}
