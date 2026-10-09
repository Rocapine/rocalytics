import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import type { RedemptionResult } from "expo-superwall";
import type { StoreProduct, StoreTransaction } from "expo-superwall/compat";
import { Dimensions, Platform } from "react-native";

const API_BASE = "https://rocalytics-api.rocapine.io";

// Never rename this key in a shipped app: every user would get a new rocaId, and the rocaId is the
// Superwall / RevenueCat PK (a new one = a Superwall reset and a new RevenueCat customer). Apps
// created from rocapine/app-template use "rocalitics-roca-id"; keep whichever the app already has.
const KEY_ROCA_ID = "rocalytics-roca-id";
const KEY_INSTALL_TRACKED = "rocadata-install-tracked";

export type TrackEventName =
  | "install"
  | "onboarding_completed"
  | "purchase";

export type PurchaseProduct = StoreProduct;

export type TrackPurchaseParams = {
  isTrial: boolean;
  value: number;
  currency: string;
  productId: string;
  originalTransactionIdentifier: string;
  product?: PurchaseProduct;
  transaction?: StoreTransaction;
  redemptionResult?: RedemptionResult;
};

export type AdjustAttribution = {
  trackerToken?: string | null;
  trackerName?: string | null;
  network?: string | null;
  campaign?: string | null;
  adgroup?: string | null;
  creative?: string | null;
  clickLabel?: string | null;
  adid?: string | null;
  costType?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  fbInstallReferrer?: string | null;
};

export type OnboardingStepAnswers = Record<string, unknown>;

export type OnboardingMetadata = Record<string, unknown>;

export type OnboardingStepResponse = {
  step_id: string;
  entered_at: string;
  exited_at: string | null;
  answers: OnboardingStepAnswers;
};

export type OnboardingResponsePayload = {
  onboarding_metadata?: OnboardingMetadata;
  sent_at: string;
  responses: OnboardingStepResponse[];
};

export type IdentifyParams = {
  revenue_cat_id?: string | null;
  qonversion_id?: string | null;
  adjust_id?: string | null;
  adjust_attribution?: AdjustAttribution | null;
  user_id?: string | null;
  email?: string | null;
  amplitude_device_id?: string | null;
  idfa?: string | null;
  idfv?: string | null;
  android_id?: string | null;
  customerio_id?: string | null;
  segment_id?: string | null;
  gaid?: string | null;
  locale?: string;
};

type DeviceContext = {
  ip: string | null;
  user_agent: string;
  device_model: string | null;
  device_brand: string | null;
  device_manufacturer: string | null;
  os_name: string | null;
  os_version: string | null;
  screen_width: number;
  screen_height: number;
  screen_scale: number;
  timezone: string;
  locale: string;
  app_version: string | null;
  app_build: string | null;
};

const getHeaders = (rocaId: string): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Roca-ID": rocaId,
  "X-Application-ID": Application.applicationId ?? "unknown",
  "X-Platform": Platform.OS,
});

/**
 * Returns the cross-network event id for an event, or `undefined` if the event
 * has no transaction identifier in its properties.
 *
 * Use this same id as the `event_id` (Meta CAPI / Pixel), `event_id` (TikTok
 * Events API), or `callback_id` (Adjust S2S) when you also fire the conversion
 * to those networks client-side. Rocalytics derives the same id server-side
 * when forwarding, so the ad network deduplicates pixel ↔ server.
 *
 * Format: `${name}-${originalTransactionIdentifier}`.
 */
export const getEventId = (
  name: string,
  properties?: Record<string, unknown> | null,
): string | undefined => {
  if (!properties) return undefined;
  const txId =
    (properties.original_transaction_identifier as string | undefined) ??
    (properties.originalTransactionIdentifier as string | undefined) ??
    (
      properties.transaction as
        | { originalTransactionIdentifier?: string }
        | undefined
    )?.originalTransactionIdentifier;
  if (!txId) return undefined;
  return `${name}-${txId}`;
};

export const identifyRequest = async (
  rocaId: string,
  payload: Partial<IdentifyParams>,
): Promise<void> => {
  const response = await fetch(`${API_BASE}/functions/v1/identify`, {
    method: "POST",
    headers: getHeaders(rocaId),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`[ROCALYTICS] identify failed: ${response.status}`);
  }
};

export const superwallEventRequest = async (
  rocaId: string,
  superwallEventInfo: Record<string, unknown>,
): Promise<void> => {
  const response = await fetch(`${API_BASE}/functions/v1/superwall-events`, {
    method: "POST",
    headers: getHeaders(rocaId),
    body: JSON.stringify({ superwallEventInfo }),
  });
  if (!response.ok) {
    throw new Error(
      `[ROCALYTICS] superwall-events failed: ${response.status}`,
    );
  }
};

export const onboardingResponseRequest = async (
  rocaId: string,
  payload: OnboardingResponsePayload,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE}/functions/v1/onboarding-response`,
    {
      method: "POST",
      headers: getHeaders(rocaId),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(
      `[ROCALYTICS] onboarding-response failed: ${response.status}`,
    );
  }
};

export const trackRequest = async (
  rocaId: string,
  name: string,
  properties: Record<string, unknown>,
  deviceContext: Record<string, unknown> | null,
  deduplicationId?: string,
  // When true, the backend does NOT store this as an analytics event — it forwards it to the CRM
  // to drive automations. Used by `trackCustomEvent` for arbitrary (non-analytics) event names.
  customEvent?: boolean,
): Promise<void> => {
  const response = await fetch(`${API_BASE}/functions/v1/track`, {
    method: "POST",
    headers: getHeaders(rocaId),
    body: JSON.stringify({
      name,
      deduplication_id: deduplicationId ?? `${rocaId}-${name}`,
      properties,
      device_context: deviceContext,
      ...(customEvent ? { custom_event: true } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`[ROCALYTICS] track failed: ${response.status} (${name})`);
  }
};

export class RocalyticsClient {
  rocaId: string | null = null;
  /** True only when SecureStore was read and held no rocaId (fresh install), not on a failed read. */
  isNewRocaId = false;
  /** True when SecureStore could not be read or written: the rocaId lives for this launch only. */
  isTemporaryRocaId = false;
  private pendingRocaIdWrite = false;
  /** Resolves from SecureStore only, no network. Never resolves to null. */
  readonly rocaIdReady: Promise<string>;
  private deviceContext: DeviceContext | null = null;
  private onboardingMetadata: OnboardingMetadata | null = null;
  private onboardingResponses: OnboardingStepResponse[] = [];
  readonly ready: Promise<void>;

  constructor() {
    this.rocaIdReady = this.getOrCreateRocaId();
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const rocaId = await this.rocaIdReady;
      const idfv =
        Platform.OS === "ios"
          ? await Application.getIosIdForVendorAsync()
          : null;
      const androidId =
        Platform.OS === "android" ? Application.getAndroidId() : null;
      // Report the device locale so server-side email localisation has it on the identity, not
      // just inside each event's device_context.
      await this.identify({
        idfv: idfv,
        android_id: androidId,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
      });

      this.deviceContext = await this.getDeviceContext();

      const alreadyTracked =
        await SecureStore.getItemAsync(KEY_INSTALL_TRACKED);
      if (!alreadyTracked) {
        const installTime = await Application.getInstallationTimeAsync();
        await this.trackEvent("install", { install_time: installTime });
        await SecureStore.setItemAsync(KEY_INSTALL_TRACKED, "true");
      }

      if (this.pendingRocaIdWrite) await this.persistRocaId(rocaId);
    } catch (error) {
      console.error("Error initializing Rocalytics client:", error);
    }
  }

  async track(
    name: TrackEventName,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    await this.ready;
    await this.trackEvent(name, properties);
  }

  /**
   * Fire a CUSTOM event with any name. Unlike `track`, a custom event is NOT stored as a
   * rocalytics analytics event — the backend forwards it to the CRM to trigger automations
   * (e.g. an email flow). `properties` become template variables / condition operands there.
   * Deduplication is keyed on `${rocaId}-${name}`, so re-firing the same custom event is safe.
   */
  async trackCustomEvent(
    name: string,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    await this.ready;
    await trackRequest(
      await this.rocaIdReady,
      name,
      properties || {},
      this.deviceContext,
      undefined,
      true,
    );
  }

  async trackPurchase(params: TrackPurchaseParams): Promise<void> {
    await this.ready;
    const {
      isTrial,
      value,
      currency,
      productId,
      originalTransactionIdentifier,
      product,
      transaction,
      redemptionResult,
    } = params;

    const purchaseProperties: Record<string, unknown> = {
      is_trial: isTrial,
      original_transaction_identifier: originalTransactionIdentifier,
      product_id: productId,
      price: value,
      currency_code: currency,
      experimental: {
        product,
        transaction,
        redemption_result: redemptionResult,
      },
    };

    const rocaId = await this.rocaIdReady;
    await trackRequest(
      rocaId,
      "purchase",
      purchaseProperties,
      this.deviceContext,
      `${rocaId}-purchase-${originalTransactionIdentifier}`,
    );
  }

  /**
   * Logs a raw Superwall SDK event payload verbatim, alongside the normalized
   * `track` events. Pass the `eventInfo` from `useSuperwallEvents` /
   * `handleSuperwallEvent` straight through.
   */
  async trackSuperwallEvent(
    superwallEventInfo: Record<string, unknown>,
  ): Promise<void> {
    await this.ready;
    await superwallEventRequest(await this.rocaIdReady, superwallEventInfo);
  }

  /**
   * Call on every onboarding navigation change — entering a step, answering
   * a question, or moving to the next one. Sends the full step-by-step
   * snapshot seen so far; the backend upserts the latest snapshot for this
   * roca-id, so there's no need to batch or debounce calls.
   *
   * Pass `metadata` (onboarding_id, audience_id, deployment_id, ...) on any
   * call where it's known — it's merged into whatever was sent before.
   */
  async trackOnboarding(
    stepId: string,
    answers?: OnboardingStepAnswers,
    metadata?: OnboardingMetadata,
  ): Promise<void> {
    await this.ready;

    if (metadata) {
      this.onboardingMetadata = { ...this.onboardingMetadata, ...metadata };
    }

    const now = new Date().toISOString();
    const current =
      this.onboardingResponses[this.onboardingResponses.length - 1];
    if (current && current.step_id === stepId) {
      if (answers) current.answers = { ...current.answers, ...answers };
    } else {
      if (current && current.exited_at === null) current.exited_at = now;
      this.onboardingResponses.push({
        step_id: stepId,
        entered_at: now,
        exited_at: null,
        answers: answers ?? {},
      });
    }

    await onboardingResponseRequest(await this.rocaIdReady, {
      onboarding_metadata: this.onboardingMetadata ?? undefined,
      sent_at: now,
      responses: this.onboardingResponses,
    });
  }

  // A SecureStore failure must never yield a null or shared id, and only a stored id may become
  // an SDK's PK (an unstored one changes next launch, i.e. a Superwall reset). A failed read falls
  // back to a temporary UUID that is never persisted (the stored id may still exist); a new id
  // whose write fails is temporary too, and its write is retried at the end of init().
  private async getOrCreateRocaId(): Promise<string> {
    let existing: string | null = null;
    let readFailed = false;
    try {
      existing = await SecureStore.getItemAsync(KEY_ROCA_ID);
    } catch (error) {
      readFailed = true;
      console.error(new Error(`[ROCALYTICS] rocaId read failed: ${error}`));
    }
    if (existing) {
      this.rocaId = existing;
      return existing;
    }
    const id = Crypto.randomUUID();
    this.rocaId = id;
    if (readFailed) {
      this.isTemporaryRocaId = true;
      return id;
    }
    if (!(await this.persistRocaId(id)) && !(await this.persistRocaId(id))) {
      this.isTemporaryRocaId = true;
      return id;
    }
    this.isNewRocaId = true;
    return id;
  }

  private async persistRocaId(id: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(KEY_ROCA_ID, id);
      this.pendingRocaIdWrite = false;
      return true;
    } catch (error) {
      this.pendingRocaIdWrite = true;
      console.error(new Error(`[ROCALYTICS] rocaId write failed: ${error}`));
      return false;
    }
  }

  public async identify(identifiers: IdentifyParams): Promise<void> {
    const payload = Object.fromEntries(
      Object.entries(identifiers).filter(([, v]) => v != null),
    );
    await identifyRequest(await this.rocaIdReady, payload);
  }

  private async getDeviceContext(): Promise<DeviceContext> {
    const { width, height, scale } = Dimensions.get("screen");
    let ip: string | null = null;
    try {
      const result = await Network.getIpAddressAsync();
      if (result && result !== "0.0.0.0") ip = result;
    } catch {}

    const appName = Application.applicationName ?? "App";
    const appVersion = Application.nativeApplicationVersion ?? "1.0";
    const brand = Device.brand ?? Platform.OS;
    const model = Device.modelName ?? "Unknown";
    const osName = Device.osName ?? Platform.OS;
    const osVersion = Device.osVersion ?? String(Platform.Version);
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const userAgent = `${appName}/${appVersion} (${brand} ${model}; ${osName} ${osVersion}; ${locale})`;

    return {
      ip,
      user_agent: userAgent,
      device_model: Device.modelName,
      device_brand: Device.brand,
      device_manufacturer: Device.manufacturer,
      os_name: Device.osName,
      os_version: Device.osVersion,
      screen_width: width,
      screen_height: height,
      screen_scale: scale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale,
      app_version: Application.nativeApplicationVersion,
      app_build: Application.nativeBuildVersion,
    };
  }

  public async trackEvent(
    name: TrackEventName,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    await trackRequest(
      await this.rocaIdReady,
      name,
      properties || {},
      this.deviceContext,
    );
  }
}
