import { EVENTS } from "../schema/index.js";
import type { ServerTracker } from "./server-tracker.js";

/** Status codes from here on count as a failure of the route. */
const FAILURE_STATUS = 500;
const DEFAULT_WINDOW_MS = 10_000;

export interface RouteFailureOptions {
  tracker: Pick<ServerTracker, "track">;
  /** A fixed name for the route, e.g. "/api/search". Never the request URL: it can hold personal data. */
  route: string;
  /** Runs the write after the response, e.g. Next.js `after`. Default: the response waits for the write. */
  schedule?: (task: () => Promise<void>) => void;
  /** At most one write per this time, per server instance and status. Default 10 seconds. */
  windowMs?: number;
  now?: () => number;
}

/** redirect(), notFound() and similar work by throwing an error with a digest; they aren't failures. */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE");
}

/**
 * Wraps a route handler and reports failures as `$route_failure` events with `{ route, status, count }`:
 * a response with status 500 or higher, or a thrown error (status 500, thrown on to the caller). `count` holds
 * the failures since the last write, so an outage does not also mean one BigQuery write per failed request.
 * Sum `count` when reading the rows. Reporting never changes the response.
 */
export function withFailureEvents<A extends unknown[]>(
  opts: RouteFailureOptions,
  handler: (...args: A) => Response | Promise<Response>,
): (...args: A) => Promise<Response> {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = opts.now ?? Date.now;
  const seen = new Map<number, { pending: number; lastWrite: number }>();

  async function report(status: number): Promise<void> {
    try {
      const entry = seen.get(status) ?? { pending: 0, lastWrite: -Infinity };
      seen.set(status, entry);
      entry.pending += 1;
      const at = now();
      if (at - entry.lastWrite < windowMs) return;
      const count = entry.pending;
      entry.pending = 0;
      entry.lastWrite = at;
      const write = () => opts.tracker.track(EVENTS.routeFailure, { route: opts.route, status, count });
      if (opts.schedule) opts.schedule(write);
      else await write();
    } catch (err) {
      console.error("rt-analytics route failure event error:", err);
    }
  }

  return async (...args) => {
    let res: Response;
    try {
      res = await handler(...args);
    } catch (err) {
      if (!isNextControlFlow(err)) await report(FAILURE_STATUS);
      throw err;
    }
    if (res.status >= FAILURE_STATUS) await report(res.status);
    return res;
  };
}
