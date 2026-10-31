// Delivery (spec 2026-10-31-launch-package, part 3). With RESEND_API_KEY: an email with numbers for the start and the
// end of a problem. Without it: the run fails when a problem starts, and GitHub's "run failed" email is the alert.
// The repo is public and so are its run logs, so `publicLines` must name only the app and the problem, no numbers.
import { DASHBOARD_URL } from "./config";
import type { Firing, OpenProblem } from "./rules";

export interface AppChanges {
  appId: string;
  started: readonly Firing[];
  ended: readonly OpenProblem[];
}

export function publicLines(changes: readonly AppChanges[]): string[] {
  return changes.flatMap((c) => [
    ...c.started.map((f) => `Started: ${c.appId} ${f.key}`),
    ...c.ended.map((p) => `Ended: ${c.appId} ${p.key}`),
  ]);
}

export function emailText(changes: readonly AppChanges[]): { subject: string; text: string } {
  const started = changes.flatMap((c) => c.started.map((f) => ({ app: c.appId, f })));
  const ended = changes.flatMap((c) => c.ended.map((p) => ({ app: c.appId, p })));
  const subject =
    started.length > 0
      ? `Alert: ${started[0]!.app} ${started[0]!.f.rule}${started.length > 1 ? ` and ${started.length - 1} more` : ""}`
      : `Ended: ${ended[0]!.app} ${ended[0]!.p.key}${ended.length > 1 ? ` and ${ended.length - 1} more` : ""}`;
  const lines = [
    ...started.map(({ app, f }) => `${app}: ${f.detail}`),
    ...ended.map(({ app, p }) => `${app}: ${p.key} has ended. It started at ${p.since}.`),
    "",
    ...changes.map((c) => `${DASHBOARD_URL}/${c.appId}`),
  ];
  return { subject, text: lines.join("\n") };
}

export async function sendEmail(
  message: { subject: string; text: string },
  env: { apiKey: string; to: string; from: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.from, to: env.to, subject: message.subject, text: message.text }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
}
