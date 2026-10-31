// Alert part of `npm run setup:gcp -- --alerts --github-repo <owner/name>`. Creates the analytics_alerts dataset and
// its state table, a keyless service account that can read analytics and write only that dataset, and a workload
// identity pool that accepts only `main` of the repo. Idempotent.
import { execFileSync } from "node:child_process";
import { BigQuery } from "@google-cloud/bigquery";
import { ALERTS_DATASET, BQ_LOCATION, STATE_TABLE } from "./alerts/config";
import { STATE_SCHEMA } from "./alerts/state";

export const ALERTS_SA = "rt-analytics-alerts";
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function githubWifConfig(repo: string, projectNumber: string) {
  if (!REPO_RE.test(repo)) throw new Error("The GitHub repo must look like owner/name");
  if (!/^\d+$/.test(projectNumber)) throw new Error("GCP project number must be digits");
  const poolId = "github";
  const providerId = "github";
  const pool = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;
  const subject = `repo:${repo}:ref:refs/heads/main`;
  return {
    poolId,
    providerId,
    issuer: "https://token.actions.githubusercontent.com",
    attributeCondition: `assertion.sub == "${subject}"`,
    providerName: `${pool}/providers/${providerId}`,
    subjectPrincipal: `principal://iam.googleapis.com/${pool}/subject/${subject}`,
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

export async function setupAlerts(projectId: string, repo: string): Promise<void> {
  const projectNumber = gcloud("projects", "describe", projectId, "--format=value(projectNumber)");
  const wif = githubWifConfig(repo, projectNumber);
  const email = `${ALERTS_SA}@${projectId}.iam.gserviceaccount.com`;
  const bq = new BigQuery({ projectId });
  const inProject = `--project=${projectId}`;

  // 1. State dataset and table
  const dataset = bq.dataset(ALERTS_DATASET);
  if (!(await dataset.exists())[0]) {
    await bq.createDataset(ALERTS_DATASET, { location: BQ_LOCATION });
    console.log(`Created dataset ${ALERTS_DATASET} (${BQ_LOCATION})`);
  } else {
    console.log(`Dataset ${ALERTS_DATASET} exists`);
  }
  if (!(await dataset.table(STATE_TABLE).exists())[0]) {
    await dataset.createTable(STATE_TABLE, { schema: [...STATE_SCHEMA] });
    console.log(`Created table ${STATE_TABLE}`);
  } else {
    console.log(`Table ${STATE_TABLE} exists`);
  }

  // 2. Service account without a key: run queries, read analytics, write only the state
  if (!tryGcloud("iam", "service-accounts", "describe", email, inProject)) {
    gcloud("iam", "service-accounts", "create", ALERTS_SA, inProject, "--display-name=rt-analytics alerts (keyless)");
    console.log(`Created service account ${email}`);
  } else {
    console.log(`Service account ${email} exists`);
  }
  await gcloudRetry(
    "projects",
    "add-iam-policy-binding",
    projectId,
    `--member=serviceAccount:${email}`,
    "--role=roles/bigquery.jobUser",
    "--condition=None",
    "--quiet",
  );
  await grantDataset(bq, "analytics", "READER", email);
  await grantDataset(bq, ALERTS_DATASET, "WRITER", email);

  // 3. Workload identity pool and GitHub OIDC provider
  const poolArgs = ["--location=global", inProject];
  if (!tryGcloud("iam", "workload-identity-pools", "describe", wif.poolId, ...poolArgs)) {
    gcloud("iam", "workload-identity-pools", "create", wif.poolId, ...poolArgs, "--display-name=GitHub Actions");
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
    "--attribute-mapping=google.subject=assertion.sub",
    `--attribute-condition=${wif.attributeCondition}`,
  );
  console.log(`${providerExists ? "Updated" : "Created"} OIDC provider ${wif.providerId}`);

  // 4. Only tokens for main of this repo may become the service account
  await gcloudRetry(
    "iam",
    "service-accounts",
    "add-iam-policy-binding",
    email,
    inProject,
    "--role=roles/iam.workloadIdentityUser",
    `--member=${wif.subjectPrincipal}`,
    "--quiet",
  );
  console.log(`Granted roles/iam.workloadIdentityUser on ${email} to main of ${repo}`);

  console.log("\nSet these (non-secret) variables in the GitHub repo, which turns the alert job on:");
  console.log(`  gh variable set ALERTS_WIF_PROVIDER --body "${wif.providerName}"`);
  console.log(`  gh variable set ALERTS_SERVICE_ACCOUNT --body "${email}"`);
}
