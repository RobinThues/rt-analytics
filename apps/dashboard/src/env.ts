// Reads and validates the dashboard's environment (spec section 10). Throws on invalid values so a
// misconfigured deployment fails at startup instead of on the first query.
import { JOB_SOURCES, type JobSource } from "@/bq/run-query";
import { isDay } from "@/time/range";

type Env = Record<string, string | undefined>;

export interface GcpEnv {
  projectId: string;
  projectNumber: string | null;
  serviceAccountEmail: string | null;
  poolId: string | null;
  providerId: string | null;
}

export interface DashboardEnv {
  allowedEmails: readonly string[];
  cacheTtlSeconds: number;
  maxBytesPerQuery: number;
  gcp: GcpEnv;
  /** Backquoted, validated table references for SQL. */
  analyticsTable: string;
  configTable: string;
  testLogin: { enabled: boolean; secret: string | null };
  jobSource: JobSource;
  /** Local runs only: replaces the clock's "today" (e2e, so fixtures and the demo data stay valid). */
  fixedToday: string | null;
}

const PROJECT_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;

function wholeNumber(raw: string, name: string, min: number): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${name} must be at least ${min}`);
  return n;
}

export function parseCacheTtl(raw?: string): number {
  return raw === undefined ? 3600 : wholeNumber(raw, "DASHBOARD_CACHE_TTL_SECONDS", 0);
}

export function parseMaxBytes(raw?: string): number {
  return raw === undefined ? 1_000_000_000 : wholeNumber(raw, "DASHBOARD_MAX_BYTES_PER_QUERY", 1);
}

export function parseAllowedEmails(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

const inDeployment = (env: Env) => env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";

export function testLoginState(env: Env): { enabled: boolean; secret: string | null } {
  const secret = env.DASHBOARD_TEST_LOGIN_SECRET ?? null;
  const enabled = env.DASHBOARD_TEST_LOGIN === "1" && secret !== null && secret.length >= 32 && !inDeployment(env);
  return { enabled, secret: enabled ? secret : null };
}

/** Called from instrumentation.ts: a deployment with the test login flag must not start. */
export function assertSafeTestLogin(env: Env): void {
  if (env.DASHBOARD_TEST_LOGIN === "1" && inDeployment(env)) {
    throw new Error("DASHBOARD_TEST_LOGIN must never be set in a Vercel deployment");
  }
}

/** Switches for local runs and e2e only; a deployment that has any of them must not start. */
const LOCAL_ONLY = ["DASHBOARD_JOB_SOURCE", "DASHBOARD_FIXED_TODAY"] as const;

export function parseFixedToday(raw?: string): string | null {
  if (raw === undefined) return null;
  if (!isDay(raw)) throw new Error("DASHBOARD_FIXED_TODAY must be a day (YYYY-MM-DD)");
  return raw;
}

export function assertLocalOnly(env: Env): void {
  if (!inDeployment(env)) return;
  for (const name of LOCAL_ONLY) {
    if (env[name] !== undefined) throw new Error(`${name} must never be set in a Vercel deployment`);
  }
}

export function parseJobSource(env: Env): JobSource {
  if (env.VERCEL_ENV === "production") return "production";
  const raw = env.DASHBOARD_JOB_SOURCE;
  if (raw === undefined) return "development";
  if (!(JOB_SOURCES as readonly string[]).includes(raw)) {
    throw new Error(`DASHBOARD_JOB_SOURCE must be one of ${JOB_SOURCES.join(", ")}`);
  }
  return raw as JobSource;
}

const orNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

export function readEnv(env: Env = process.env): DashboardEnv {
  const projectId = env.GCP_PROJECT_ID ?? "";
  if (!PROJECT_RE.test(projectId)) throw new Error("GCP_PROJECT_ID is missing or not a valid project id");
  const analyticsDataset = env.ANALYTICS_DATASET ?? "analytics";
  const configDataset = env.DASHBOARD_CONFIG_DATASET ?? "analytics_dashboard";
  if (!DATASET_RE.test(analyticsDataset) || !DATASET_RE.test(configDataset)) {
    throw new Error("ANALYTICS_DATASET and DASHBOARD_CONFIG_DATASET may only contain letters, digits and _");
  }
  return {
    allowedEmails: parseAllowedEmails(env.DASHBOARD_ALLOWED_EMAILS),
    cacheTtlSeconds: parseCacheTtl(env.DASHBOARD_CACHE_TTL_SECONDS),
    maxBytesPerQuery: parseMaxBytes(env.DASHBOARD_MAX_BYTES_PER_QUERY),
    gcp: {
      projectId,
      projectNumber: orNull(env.GCP_PROJECT_NUMBER),
      serviceAccountEmail: orNull(env.GCP_SERVICE_ACCOUNT_EMAIL),
      poolId: orNull(env.GCP_WORKLOAD_IDENTITY_POOL_ID),
      providerId: orNull(env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID),
    },
    analyticsTable: `\`${projectId}.${analyticsDataset}.events\``,
    configTable: `\`${projectId}.${configDataset}.dashboard_config\``,
    testLogin: testLoginState(env),
    jobSource: parseJobSource(env),
    fixedToday: parseFixedToday(env.DASHBOARD_FIXED_TODAY),
  };
}

const REQUIRED_AT_STARTUP = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];

/**
 * Called from instrumentation.ts: a misconfigured deployment fails at startup instead of on the first
 * sign-in or query. Previews have no GCP or Google values (they cannot sign in), so only the test-login
 * guard runs there. Local runs sign in with the test login, so the Google values are required in
 * production only.
 */
export function startupCheck(env: Env): void {
  assertSafeTestLogin(env);
  assertLocalOnly(env);
  if (env.VERCEL_ENV === "preview") return;
  if (env.VERCEL_ENV === "production") {
    for (const name of REQUIRED_AT_STARTUP) {
      if (!env[name]) throw new Error(`Missing environment variable ${name}`);
    }
  }
  if (parseAllowedEmails(env.DASHBOARD_ALLOWED_EMAILS).length === 0) {
    throw new Error("Missing environment variable DASHBOARD_ALLOWED_EMAILS");
  }
  readEnv(env);
}
