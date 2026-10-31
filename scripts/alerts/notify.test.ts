import { describe, expect, it, vi } from "vitest";
import { emailText, publicLines, sendEmail, type AppChanges } from "./notify";

const changes: AppChanges[] = [
  {
    appId: "app",
    started: [{ key: "error_share", rule: "error_share", detail: "30 of 100 sessions had an error." }],
    ended: [{ key: "traffic_spike", since: "2026-11-09T10:00:00.000Z", cleanRuns: 3 }],
  },
];

describe("publicLines", () => {
  it("names only the app and the problem, because run logs are public", () => {
    const lines = publicLines(changes);
    expect(lines).toEqual(["Started: app error_share", "Ended: app traffic_spike"]);
    expect(lines.join(" ")).not.toMatch(/\d/);
  });
});

describe("emailText", () => {
  it("has the numbers and a dashboard link", () => {
    const { subject, text } = emailText(changes);
    expect(subject).toBe("Alert: app error_share");
    expect(text).toContain("30 of 100");
    expect(text).toContain("traffic_spike has ended");
    expect(text).toContain("https://rt-analytics-dashboard.vercel.app/app");
  });

  it("counts further problems in the subject, and says when only an end is new", () => {
    const two = [{ ...changes[0]!, started: [changes[0]!.started[0]!, changes[0]!.started[0]!], ended: [] }];
    expect(emailText(two).subject).toBe("Alert: app error_share and 1 more");
    expect(emailText([{ ...changes[0]!, started: [] }]).subject).toBe("Ended: app traffic_spike");
  });
});

describe("sendEmail", () => {
  const env = { apiKey: "key", to: "to@example.com", from: "from@example.com" };

  it("posts to Resend", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    await sendEmail({ subject: "s", text: "t" }, env, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body as string)).toEqual({ from: env.from, to: env.to, subject: "s", text: "t" });
  });

  it("throws on an error answer, without the key in the message", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 403 }));
    await expect(sendEmail({ subject: "s", text: "t" }, env, fetcher as unknown as typeof fetch)).rejects.toThrow(
      "Resend answered 403",
    );
  });
});
