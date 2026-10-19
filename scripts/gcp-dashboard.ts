// Dashboard part of `npm run setup:gcp -- --dashboard --vercel-team <slug> [--vercel-project <name>]
// [--per-user-query-quota-gib <n>] [--keep-pool-binding]`.
// Creates the analytics_dashboard dataset, a workload identity pool that trusts only the dashboard's Vercel
// project, and one keyless service account per Vercel environment: production tokens can only become
// rt-analytics-dashboard, development tokens (local runs, e2e) only rt-analytics-dashboard-dev. Also sets a
// per-user daily query quota, so local runs can never use up the project quota production needs. Idempotent.
import { execFileSync } from "node:child_process";
import { BigQuery } from "@google-cloud/bigquery";

export const DASHBOARD_SA = "rt-analytics-dashboard";
export const DASHBOARD_DEV_SA = "rt-analytics-dashboard-dev";
const PER_USER_QUOTA_PREFERENCE_ID = "rt-analytics-query-usage-per-user-per-day";
export const CONFIG_DATASET = "analytics_dashboard";
const ANALYTICS_DATASET = "analytics";
const LOCATION = "EU";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export const CONFIG_SCHEMA = [
  { name: "kind", type: "STRING", mode: "REQUIRED" },
  { name: "id", type: "STRING", mode: "REQUIRED" },
  { name: "app_id", type: "STRING", mode: "REQUIRED" },
  { name: "name", type: "STRING", mode: "NULLABLE" },
  { name: "value", type: "JSON", mode: "REQUIRED" },
  { name: "updated_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "updated_by", type: "STRING", mode: "REQUIRED" },
] as const;

export function wifConfig(team: string, project: string, projectNumber: string) {
  if (!SLUG_RE.test(team) || !SLUG_RE.test(project)) throw new Error("Vercel team and project must be slugs");
  if (!/^\d+$/.test(projectNumber)) throw new Error("GCP project number must be digits");
  const poolId = "vercel";
  const providerId = "vercel";
  const pool = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;
  const sub = (env: string) => `"owner:${team}:project:${project}:environment:${env}"`;
  return {
    poolId,
    providerId,
    issuer: `https://oidc.vercel.com/${team}`,
    allowedAudience: `https://vercel.com/${team}`,
    attributeCondition: `assertion.sub in [${sub("production")}, ${sub("development")}]`,
    stsAudience: `//iam.googleapis.com/${pool}/providers/${providerId}`,
    principalSet: `principalSet://iam.googleapis.com/${pool}/*`,
    /** The one identity a Vercel environment's tokens map to (google.subject = assertion.sub). */
    subjectPrincipal: (env: "production" | "development") =>
      `principal://iam.googleapis.com/${pool}/subject/owner:${team}:project:${project}:environment:${env}`,
  } as const;
}

function gcloud(...args: string[]): string {
  return execFileSync("gcloud", args, { encoding: "utf8" }).trim();
}

function tryGcloud(...args: string[]): string | null {
  try {
    return execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** A new service account takes a while before IAM accepts it in bindings; retry for up to 2 minutes. */
async function gcloudRetry(...args: string[]): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return gcloud(...args);
    } catch (err) {
      if (attempt >= 12) throw err;
      console.log(`gcloud ${args.slice(0, 3).join(" ")} failed, retrying in 10 s (${attempt}/12)`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

type AccessEntry = { role?: string; userByEmail?: string };

async function grantDataset(bq: BigQuery, datasetId: string, role: "READER" | "WRITER", email: string) {
  const dataset = bq.dataset(datasetId);
  const [meta] = await dataset.getMetadata();
  const access: AccessEntry[] = meta.access ?? [];
  if (access.some((a) => a.userByEmail === email && a.role === role)) {
    console.log(`${datasetId}: ${role} already granted`);
    return;
  }
  access.push({ role, userByEmail: email });
  await dataset.setMetadata({ access });
  console.log(`${datasetId}: granted ${role} to ${email}`);
}

export async function setupDashboard(
  projectId: string,
  opts: { team: string; project: string; perUserQuotaGib: number; keepPoolBinding: boolean },
): Promise<void> {
  const projectNumber = gcloud("projects", "describe", projectId, "--format=value(projectNumber)");
  const wif = wifConfig(opts.team, opts.project, projectNumber);
  const emailOf = (name: string) => `${name}@${projectId}.iam.gserviceaccount.com`;
  const saEmail = emailOf(DASHBOARD_SA);
  const devSaEmail = emailOf(DASHBOARD_DEV_SA);
  const bq = new BigQuery({ projectId });
  const inProject = `--project=${projectId}`;

  // 1. APIs for token exchange and impersonation
  gcloud("services", "enable", "iam.googleapis.com", "sts.googleapis.com", "iamcredentials.googleapis.com", inProject);
  console.log("APIs enabled: iam, sts, iamcredentials");

  // 2. Config dataset and table
  const dataset = bq.dataset(CONFIG_DATASET);
  if (!(await dataset.exists())[0]) {
    await bq.createDataset(CONFIG_DATASET, { location: LOCATION });
    console.log(`Created dataset ${CONFIG_DATASET} (${LOCATION})`);
  } else {
    console.log(`Dataset ${CONFIG_DATASET} exists`);
  }
  if (!(await dataset.table("dashboard_config").exists())[0]) {
    await dataset.createTable("dashboard_config", { schema: [...CONFIG_SCHEMA] });
    console.log("Created table dashboard_config");
  } else {
    console.log("Table dashboard_config exists");
  }

  // 3. Service accounts without keys, one per Vercel environment, with the same permissions: run queries;
  //    read analytics; read and write analytics_dashboard
  const accounts = [
    { name: DASHBOARD_SA, email: saEmail, label: "rt-analytics dashboard (keyless)" },
    { name: DASHBOARD_DEV_SA, email: devSaEmail, label: "rt-analytics dashboard, local and e2e (keyless)" },
  ];
  for (const sa of accounts) {
    if (!tryGcloud("iam", "service-accounts", "describe", sa.email, inProject)) {
      gcloud("iam", "service-accounts", "create", sa.name, inProject, `--display-name=${sa.label}`);
      console.log(`Created service account ${sa.email}`);
    } else {
      console.log(`Service account ${sa.email} exists`);
    }
    await gcloudRetry(
      "projects",
      "add-iam-policy-binding",
      projectId,
      `--member=serviceAccount:${sa.email}`,
      "--role=roles/bigquery.jobUser",
      "--condition=None",
      "--quiet",
    );
    console.log(`Granted roles/bigquery.jobUser on the project to ${sa.email}`);
    await grantDataset(bq, ANALYTICS_DATASET, "READER", sa.email);
    await grantDataset(bq, CONFIG_DATASET, "WRITER", sa.email);
  }

  // 5. Workload identity pool and Vercel OIDC provider
  const poolArgs = ["--location=global", inProject];
  if (!tryGcloud("iam", "workload-identity-pools", "describe", wif.poolId, ...poolArgs)) {
    gcloud("iam", "workload-identity-pools", "create", wif.poolId, ...poolArgs, "--display-name=Vercel");
    console.log(`Created workload identity pool ${wif.poolId}`);
  } else {
    console.log(`Workload identity pool ${wif.poolId} exists`);
  }
  const providerScope = [`--workload-identity-pool=${wif.poolId}`, ...poolArgs];
  const providerExists = tryGcloud(
    "iam",
    "workload-identity-pools",
    "providers",
    "describe",
    wif.providerId,
    ...providerScope,
  );
  gcloud(
    "iam",
    "workload-identity-pools",
    "providers",
    providerExists ? "update-oidc" : "create-oidc",
    wif.providerId,
    ...providerScope,
    `--issuer-uri=${wif.issuer}`,
    `--allowed-audiences=${wif.allowedAudience}`,
    "--attribute-mapping=google.subject=assertion.sub",
    `--attribute-condition=${wif.attributeCondition}`,
  );
  console.log(`${providerExists ? "Updated" : "Created"} OIDC provider ${wif.providerId} (${wif.issuer})`);

  // 6. Each environment's tokens may impersonate only its own service account. The subject bindings come
  //    first, so production keeps working while the older pool-wide binding is removed.
  const subjects = [
    { email: saEmail, env: "production" as const },
    { email: devSaEmail, env: "development" as const },
  ];
  for (const { email, env } of subjects) {
    await gcloudRetry(
      "iam",
      "service-accounts",
      "add-iam-policy-binding",
      email,
      inProject,
      "--role=roles/iam.workloadIdentityUser",
      `--member=${wif.subjectPrincipal(env)}`,
      "--quiet",
    );
    console.log(`Granted roles/iam.workloadIdentityUser on ${email} to ${env} tokens`);
  }
  if (opts.keepPoolBinding) {
    console.log("Kept the pool-wide binding on the production account (--keep-pool-binding)");
  } else {
    const removed = tryGcloud(
      "iam",
      "service-accounts",
      "remove-iam-policy-binding",
      saEmail,
      inProject,
      "--role=roles/iam.workloadIdentityUser",
      `--member=${wif.principalSet}`,
      "--quiet",
    );
    console.log(removed === null ? "Pool-wide binding already removed" : "Removed the pool-wide binding");
  }

  // 7. Per-user daily query cap. BigQuery applies it to every user and service account separately.
  gcloud(
    "quotas",
    "preferences",
    "update",
    PER_USER_QUOTA_PREFERENCE_ID,
    inProject,
    "--service=bigquery.googleapis.com",
    "--quota-id=QueryUsagePerUserPerDay",
    `--preferred-value=${opts.perUserQuotaGib * 1024}`,
    "--allow-missing",
    "--allow-high-percentage-quota-decrease",
    "--allow-quota-decrease-below-usage",
    "--quiet",
  );
  console.log(`Set per-user query quota to ${opts.perUserQuotaGib} GiB/day`);

  console.log("\nSet these (non-secret) variables in the dashboard's Vercel project (production and development):");
  console.log(`  GCP_PROJECT_ID=${projectId}`);
  console.log(`  GCP_PROJECT_NUMBER=${projectNumber}`);
  console.log(`  GCP_WORKLOAD_IDENTITY_POOL_ID=${wif.poolId}`);
  console.log(`  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=${wif.providerId}`);
  console.log("One value per environment:");
  console.log(`  GCP_SERVICE_ACCOUNT_EMAIL (production)=${saEmail}`);
  console.log(`  GCP_SERVICE_ACCOUNT_EMAIL (development)=${devSaEmail}`);
}
