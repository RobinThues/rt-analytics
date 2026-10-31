// GitHub turns scheduled runs off after 60 days without a commit, and then no alert would ever come. Its enable API
// could renew them, but GitHub's docs say notifications go to whoever re-enabled a workflow, and here that would be a
// bot token on the only alert path. So a failed run asks Robin for a commit instead, once a day from day 50.

const DAY_MS = 86_400_000;
const REMIND_FROM_DAYS = 50;

/** True for one 15-minute slot per day. A late or skipped run only costs that day's reminder. */
export function scheduleReminderDue(lastCommitAt: string | undefined, now: Date): boolean {
  const commit = Date.parse(lastCommitAt ?? "");
  if (Number.isNaN(commit)) return false;
  if ((now.getTime() - commit) / DAY_MS < REMIND_FROM_DAYS) return false;
  return now.getUTCHours() === 8 && now.getUTCMinutes() < 15;
}
