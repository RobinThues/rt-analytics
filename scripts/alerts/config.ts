// Which apps get alerts, with which values. The values come from scripts/alerts/backtest.ts on real days. Only
// wetter-in-kalender for now: the other apps have so little traffic that these rules say nothing about them.
import type { Thresholds } from "./rules";

export const WETTER_THRESHOLDS: Thresholds = {
  errorShare: { share: 0.2, minErrorSessions: 20 },
  routeFailures: { minFailures: 20 },
  // Before launch, at about 200 events a day, gaps reached 70 minutes; since 28 Oct, at 20,000 a day, they are 0.
  silentAll: { minutes: 45 },
  silentPageviews: { minBaseline: 8 },
  trafficSpike: { factor: 0, minPageviews: 0 },
  trafficDrop: { share: 0.2, minBaseline: 30 },
};

export const ALERT_APPS: ReadonlyArray<{ appId: string; thresholds: Thresholds }> = [
  { appId: "wetter-in-kalender", thresholds: WETTER_THRESHOLDS },
];

/** Runs every 15 minutes, so 4 clean runs are 1 hour. */
export const CLEAR_AFTER_RUNS = 4;

export const DASHBOARD_URL = "https://rt-analytics-dashboard.vercel.app";

export const PROJECT_ID = "robin-thues";
export const EVENTS_TABLE = `\`${PROJECT_ID}.analytics.events\``;
export const ALERTS_DATASET = "analytics_alerts";
export const STATE_TABLE = "alert_state";
export const BQ_LOCATION = "EU";

/** Stops one run from scanning more than this. The whole table is far smaller today. */
export const MAX_BYTES_PER_RUN = 500 * 1024 * 1024;
