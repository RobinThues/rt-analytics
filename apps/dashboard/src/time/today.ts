// The app's "today": the clock in the app's timezone, or DASHBOARD_FIXED_TODAY in local runs and e2e.
import { readEnv, type DashboardEnv } from "@/env";
import { addDays, dayStart, todayIn } from "./range";

export function appToday(tz: string, env: DashboardEnv = readEnv()): string {
  return env.fixedToday ?? todayIn(tz, new Date());
}

/** Start of the day after the app's today, as an ISO timestamp: the end of the discovery windows. */
export function todayEnd(tz: string, env: DashboardEnv = readEnv()): string {
  return dayStart(addDays(appToday(tz, env), 1), tz);
}
