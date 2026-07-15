import { ConsentManager } from "./consent.js";
import { VisitorManager } from "./visitor.js";
import { SessionManager } from "./session.js";
import { EventQueue, fetchTransport, type Transport } from "./queue.js";
import { SDK_VERSION } from "./version.js";
import type { AnalyticsConfig, AnalyticsEvent, ConsentState, EventMap } from "./types.js";
import { setupErrorCapture } from "./errors.js";
import { setupWebVitals } from "./webvitals.js";

export interface Analytics<E extends EventMap = EventMap> {
  track<K extends keyof E & string>(name: K, props: E[K]): void;
  page(): void;
  identify(userId: string): void;
  reset(): void;
  flush(useBeacon?: boolean): void;
  getConsent(): ConsentState;
  acceptConsent(): void;
  declineConsent(): void;
  onConsentChange(fn: (s: ConsentState) => void): () => void;
}

export interface AnalyticsDeps {
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
  transport?: Transport;
  now?: () => number;
}

function noop(): Analytics<never> {
  return {
    track: () => {}, page: () => {}, identify: () => {}, reset: () => {}, flush: () => {},
    getConsent: () => "pending", acceptConsent: () => {}, declineConsent: () => {},
    onConsentChange: () => () => {},
  } as unknown as Analytics<never>;
}

export function createAnalytics<E extends EventMap = EventMap>(
  config: AnalyticsConfig,
  deps: AnalyticsDeps = {},
): Analytics<E> {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser && deps.transport === undefined) return noop() as Analytics<E>;

  const ls = deps.localStorage !== undefined ? deps.localStorage : isBrowser ? window.localStorage : null;
  const ss = deps.sessionStorage !== undefined ? deps.sessionStorage : isBrowser ? window.sessionStorage : null;
  const now = deps.now ?? Date.now;

  const consent = new ConsentManager(ls);
  const visitor = new VisitorManager(ls);
  const session = new SessionManager(ss, now);
  const queue = new EventQueue({
    endpoint: config.endpoint ?? "/api/a",
    flushIntervalMs: config.flushIntervalMs ?? 5000,
    maxBatchSize: config.maxBatchSize ?? 10,
    transport: deps.transport ?? fetchTransport,
    getMeta: () => ({ appId: config.appId, sdkVersion: SDK_VERSION, consentState: consent.get() }),
  });

  let userId: string | null = null;

  function buildEvent(name: string, props: Record<string, unknown>, sessionId: string, state: ConsentState): AnalyticsEvent {
    const url = isBrowser ? new URL(window.location.href) : null;
    return {
      eventId: crypto.randomUUID(),
      name,
      ts: new Date(now()).toISOString(),
      sessionId,
      visitorId: visitor.getId(state),
      userId,
      pagePath: url?.pathname ?? "",
      referrer: isBrowser && document.referrer ? document.referrer : null,
      utmSource: url?.searchParams.get("utm_source") ?? null,
      utmMedium: url?.searchParams.get("utm_medium") ?? null,
      utmCampaign: url?.searchParams.get("utm_campaign") ?? null,
      viewportW: isBrowser ? window.innerWidth : null,
      viewportH: isBrowser ? window.innerHeight : null,
      props,
    };
  }

  function emit(name: string, props: Record<string, unknown>): void {
    const state = consent.get();
    const s = session.touch(state);
    if (s.isNew) queue.enqueue(buildEvent("$session_start", {}, s.id, state));
    queue.enqueue(buildEvent(name, props, s.id, state));
  }

  consent.onChange((state) => {
    if (state === "declined") visitor.clear();
    emit("$consent", { state });
  });

  if (isBrowser) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") queue.flush(true);
    });
    if (config.captureWebVitals !== false) setupWebVitals(emit);
    if (config.captureErrors !== false) setupErrorCapture(emit);
  }

  const analytics: Analytics<E> = {
    track: (name, props) => emit(name, (props ?? {}) as Record<string, unknown>),
    page: () => emit("$pageview", {}),
    identify: (uid) => {
      userId = uid;
      emit("$identify", {});
    },
    reset: () => {
      userId = null;
      visitor.clear();
      session.reset();
    },
    flush: (useBeacon = false) => queue.flush(useBeacon),
    getConsent: () => consent.get(),
    acceptConsent: () => consent.accept(),
    declineConsent: () => consent.decline(),
    onConsentChange: (fn) => consent.onChange(fn),
  };
  return analytics;
}
