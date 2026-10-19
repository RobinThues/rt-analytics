"use server";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/session";
import { TAGS } from "@/bq/cache-rules";
import { execute } from "@/bq/query";
import { getFunnels, getSettings } from "@/config/data";
import { deleteFunnelQuery, FUNNEL_ID_RE, MAX_NAME, saveFunnelQuery } from "@/config/funnels";
import { buildCatalog } from "@/discovery/catalog";
import { listEvents, listPropKeys } from "@/discovery/data";
import { APP_ID_RE } from "@/discovery/sql";
import { readEnv } from "@/env";
import { allowedFor, parseStep, validateSteps } from "@/funnels/steps";

const KEPT = new Set(["from", "to", "compare", "steps"]);

/** Bound arguments come from the browser: keep only our own view parameters. */
function funnelsUrl(appId: string, qs: string, change: (p: URLSearchParams) => void): string {
  const p = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs)) if (KEPT.has(k)) p.append(k, v);
  change(p);
  const s = p.toString();
  return `/${appId}/funnels${s ? `?${s}` : ""}`;
}

function checkApp(appId: string) {
  if (!APP_ID_RE.test(appId)) throw new Error("Invalid app id");
}

export async function saveFunnel(appId: string, steps: string[], qs: string, formData: FormData) {
  const user = await requireUser();
  checkApp(appId);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > MAX_NAME) redirect(funnelsUrl(appId, qs, (p) => p.set("error", "name")));
  const { timezone: tz } = await getSettings(appId);
  const [events, keys, saved] = await Promise.all([listEvents(appId, tz), listPropKeys(appId, tz), getFunnels(appId)]);
  const catalog = buildCatalog(events.ok ? events.rows : [], keys.ok ? keys.rows : []);
  const valid = Array.isArray(steps)
    ? validateSteps(
        steps.map((s) => parseStep(String(s))),
        allowedFor(catalog, saved.funnels),
      )
    : null;
  if (!valid) redirect(funnelsUrl(appId, qs, (p) => p.set("error", "steps")));
  const id = crypto.randomUUID();
  const res = await execute(saveFunnelQuery(readEnv(), appId, { id, name, steps: valid }, user.email));
  if (!res.ok) redirect(funnelsUrl(appId, qs, (p) => p.set("error", "save")));
  updateTag(TAGS.config);
  redirect(
    funnelsUrl(appId, qs, (p) => {
      p.delete("steps");
      p.set("funnel", id);
    }),
  );
}

export async function deleteFunnel(appId: string, id: string, qs: string) {
  await requireUser();
  checkApp(appId);
  if (!FUNNEL_ID_RE.test(id)) throw new Error("Invalid funnel id");
  const res = await execute(deleteFunnelQuery(readEnv(), appId, id));
  if (!res.ok) redirect(funnelsUrl(appId, qs, (p) => p.set("error", "delete")));
  updateTag(TAGS.config);
  redirect(funnelsUrl(appId, qs, (p) => p.delete("steps")));
}
