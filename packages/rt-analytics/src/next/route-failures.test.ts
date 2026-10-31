import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withFailureEvents } from "./route-failures.js";

describe("withFailureEvents", () => {
  let track: ReturnType<typeof vi.fn<(name: string, props?: Record<string, unknown>) => Promise<void>>>;
  let clock: number;
  const options = () => ({ tracker: { track }, route: "/api/search", now: () => clock });

  beforeEach(() => {
    track = vi.fn(async () => {});
    clock = 1_000_000;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a good response through and writes nothing", async () => {
    const ok = new Response("ok");
    const route = withFailureEvents(options(), async () => ok);
    await expect(route()).resolves.toBe(ok);
    expect(track).not.toHaveBeenCalled();
  });

  it("doesn't count client errors", async () => {
    const route = withFailureEvents(options(), () => new Response(null, { status: 404 }));
    await route();
    expect(track).not.toHaveBeenCalled();
  });

  it("reports a 5xx response and returns it unchanged", async () => {
    const failed = new Response("down", { status: 503 });
    const route = withFailureEvents(options(), async () => failed);
    await expect(route()).resolves.toBe(failed);
    expect(track).toHaveBeenCalledExactlyOnceWith("$route_failure", { route: "/api/search", status: 503, count: 1 });
  });

  it("reports a thrown error as 500 and throws it on", async () => {
    const boom = new Error("boom");
    const route = withFailureEvents(options(), async () => {
      throw boom;
    });
    await expect(route()).rejects.toBe(boom);
    expect(track).toHaveBeenCalledExactlyOnceWith("$route_failure", { route: "/api/search", status: 500, count: 1 });
  });

  it.each(["NEXT_REDIRECT;replace;/x;307;", "NEXT_HTTP_ERROR_FALLBACK;404", "DYNAMIC_SERVER_USAGE"])(
    "doesn't count Next.js control flow (%s) and throws it on",
    async (digest) => {
      const signal = Object.assign(new Error("control flow"), { digest });
      const route = withFailureEvents(options(), async () => {
        throw signal;
      });
      await expect(route()).rejects.toBe(signal);
      expect(track).not.toHaveBeenCalled();
    },
  );

  it("passes the handler's arguments on", async () => {
    const handler = vi.fn(async (_a: string, _b: number) => new Response());
    await withFailureEvents(options(), handler)("x", 1);
    expect(handler).toHaveBeenCalledWith("x", 1);
  });

  it("writes once per window and counts the failures in between", async () => {
    const route = withFailureEvents(options(), () => new Response(null, { status: 503 }));
    await route();
    clock += 1_000;
    await route();
    clock += 1_000;
    await route();
    expect(track).toHaveBeenCalledTimes(1);
    clock += 10_000;
    await route();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith("$route_failure", { route: "/api/search", status: 503, count: 3 });
  });

  it("counts each status on its own", async () => {
    let status = 503;
    const route = withFailureEvents(options(), () => new Response(null, { status }));
    await route();
    status = 500;
    await route();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith("$route_failure", { route: "/api/search", status: 500, count: 1 });
  });

  it("hands the write to schedule, so the response doesn't wait", async () => {
    const tasks: Array<() => Promise<void>> = [];
    const route = withFailureEvents({ ...options(), schedule: (t) => void tasks.push(t) }, () => {
      return new Response(null, { status: 500 });
    });
    await route();
    expect(track).not.toHaveBeenCalled();
    await tasks[0]!();
    expect(track).toHaveBeenCalledOnce();
  });

  it("keeps the response when reporting fails", async () => {
    track.mockRejectedValue(new Error("write failed"));
    const failed = new Response(null, { status: 503 });
    const route = withFailureEvents(options(), () => failed);
    await expect(route()).resolves.toBe(failed);
    const throwing = withFailureEvents(
      {
        ...options(),
        schedule: () => {
          throw new Error("no request scope");
        },
      },
      () => failed,
    );
    await expect(throwing()).resolves.toBe(failed);
  });
});
