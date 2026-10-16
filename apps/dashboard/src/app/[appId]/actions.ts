"use server";
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/session";
import { TAGS } from "@/bq/cache-rules";
import { execute, LIVE_COOKIE } from "@/bq/query";
import { parseHostList, parseSettings, saveSettingsQuery } from "@/config/settings";
import { APP_ID_RE } from "@/discovery/sql";
import { readEnv } from "@/env";

function appPath(appId: string): string {
  if (!APP_ID_RE.test(appId)) throw new Error("Invalid app id");
  return `/${appId}`;
}

/** Only our own view parameters survive the redirect. */
function safeQuery(qs: string): string {
  return /^\?[A-Za-z0-9=&%._-]*$/.test(qs) ? qs : "";
}

export async function toggleLive(appId: string, qs: string) {
  await requireUser();
  const path = appPath(appId);
  const jar = await cookies();
  if (jar.get(LIVE_COOKIE)?.value === "1") {
    jar.delete(LIVE_COOKIE);
  } else {
    jar.set(LIVE_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  }
  redirect(path + safeQuery(qs));
}

export async function refreshApp(appId: string, qs: string) {
  await requireUser();
  const path = appPath(appId);
  updateTag(TAGS.data(appId));
  updateTag(TAGS.discovery(appId));
  updateTag(TAGS.apps);
  redirect(path + safeQuery(qs));
}

export async function saveSettings(appId: string, formData: FormData) {
  const user = await requireUser();
  const path = `${appPath(appId)}/settings`;
  const timezone = String(formData.get("timezone") ?? "");
  const { hosts, invalid } = parseHostList(String(formData.get("hosts") ?? ""));
  if (invalid.length > 0) redirect(`${path}?error=hosts`);
  const settings = parseSettings({ timezone, hosts });
  if (settings.timezone !== timezone) redirect(`${path}?error=timezone`);
  const res = await execute(saveSettingsQuery(readEnv(), appId, settings, user.email));
  if (!res.ok) redirect(`${path}?error=save`);
  updateTag(TAGS.config);
  redirect(`${path}?saved=1`);
}
