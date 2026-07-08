import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import type { StoreProduct, StoreTransaction } from "expo-superwall/compat";
import { Dimensions, Platform } from "react-native";

const API_BASE = "https://rocalytics-api.rocapine.io";

const KEY_ROCA_ID = "rocalitics-roca-id";
const KEY_INSTALL_TRACKED = "rocadata-install-tracked";

export type TrackEventName =
  | "install"
  | "onboarding_completed"
  | "purchase";

export type PurchaseProduct = StoreProduct;

export type TrackPurchaseParams = {
  isTrial: boolean;
  value: number;
  product: PurchaseProduct;
  transaction: StoreTransaction;
  currency: string;
  originalTransactionIdentifier: string;
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
  private deviceContext: DeviceContext | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      this.rocaId = await this.getOrCreateRocaId();
      const idfv =
        Platform.OS === "ios"
          ? await Application.getIosIdForVendorAsync()
          : null;
      const androidId =
        Platform.OS === "android" ? Application.getAndroidId() : null;
      await this.identify({ idfv: idfv, android_id: androidId });

      this.deviceContext = await this.getDeviceContext();

      const alreadyTracked =
        await SecureStore.getItemAsync(KEY_INSTALL_TRACKED);
      if (!alreadyTracked) {
        const installTime = await Application.getInstallationTimeAsync();
        await this.trackEvent("install", { install_time: installTime });
        await SecureStore.setItemAsync(KEY_INSTALL_TRACKED, "true");
      }
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
      this.rocaId!,
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
      product,
      currency,
      originalTransactionIdentifier,
      transaction,
    } = params;

    const purchaseProperties: Record<string, unknown> = {
      is_trial: isTrial,
      original_transaction_identifier: originalTransactionIdentifier,
      product_id: product.productIdentifier,
      price: value,
      currency_code: currency,
      experimental: {
        product,
        transaction,
      },
    };

    await trackRequest(
      this.rocaId!,
      "purchase",
      purchaseProperties,
      this.deviceContext,
      `${this.rocaId}-purchase-${originalTransactionIdentifier}`,
    );
  }

  private async getOrCreateRocaId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(KEY_ROCA_ID);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY_ROCA_ID, id);
    return id;
  }

  public async identify(identifiers: IdentifyParams): Promise<void> {
    const payload = Object.fromEntries(
      Object.entries(identifiers).filter(([, v]) => v != null),
    );
    await identifyRequest(this.rocaId!, payload);
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
      this.rocaId!,
      name,
      properties || {},
      this.deviceContext,
    );
  }
}
