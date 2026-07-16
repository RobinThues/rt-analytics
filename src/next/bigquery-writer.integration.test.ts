import { describe, expect, it } from "vitest";
import { createBigQueryWriter } from "./bigquery-writer.js";

// Opt-in: only runs when RTA_TEST_CREDENTIALS points at a key.json for a dev dataset.
// Example: RTA_TEST_CREDENTIALS=$(cat key.json) npx vitest run src/next/bigquery-writer.integration.test.ts
const raw = process.env.RTA_TEST_CREDENTIALS;

describe.skipIf(!raw)("BigQueryWriter (real dataset)", () => {
  it("writes one row to analytics.events", async () => {
    const creds = JSON.parse(raw as string) as { project_id: string; client_email: string; private_key: string };
    const writer = createBigQueryWriter({
      projectId: creds.project_id,
      datasetId: "analytics",
      tableId: "events",
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
    await expect(
      writer.write([
        {
          event_id: crypto.randomUUID(), app_id: "rta_integration_test", event_name: "$pageview",
          timestamp: new Date(), visitor_id: "d_test", session_id: "s-test", user_id: null,
          page_path: "/integration-test", referrer: null, utm_source: null, utm_medium: null,
          utm_campaign: null, country: null, browser: "Test", os: "Test", device_type: "desktop",
          viewport_w: null, viewport_h: null, props: null, consent_state: "pending", sdk_version: "0.1.0",
        },
      ]),
    ).resolves.toBeUndefined();
  });
});
