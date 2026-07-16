import { beforeEach, describe, expect, it, vi } from "vitest";

const appendRows = vi.fn((_rows: Record<string, unknown>[]) => ({ getResult: vi.fn().mockResolvedValue({}) }));
const getWriteStream = vi.fn().mockResolvedValue({ tableSchema: { fields: [] } });
const createStreamConnection = vi.fn().mockResolvedValue({ connected: true });

vi.mock("@google-cloud/bigquery-storage", () => ({
  adapt: { convertStorageSchemaToProto2Descriptor: vi.fn(() => ({ descriptor: true })) },
  managedwriter: {
    DefaultStream: "_default",
    WriterClient: vi.fn(function (this: Record<string, unknown>) {
      this.getWriteStream = getWriteStream;
      this.createStreamConnection = createStreamConnection;
    }),
    JSONWriter: vi.fn(function (this: Record<string, unknown>) {
      this.appendRows = appendRows;
    }),
  },
}));

import { createBigQueryWriter, type EventRow } from "./bigquery-writer.js";

function row(over: Partial<EventRow> = {}): EventRow {
  return {
    event_id: "e1", app_id: "wordle", event_name: "$pageview",
    timestamp: new Date("2026-07-11T10:00:00Z"),
    visitor_id: null, session_id: "s1", user_id: null, page_path: "/", referrer: null,
    utm_source: null, utm_medium: null, utm_campaign: null, country: "DE",
    browser: "Chrome", os: "macOS", device_type: "desktop",
    viewport_w: 800, viewport_h: 600, props: null,
    consent_state: "pending", sdk_version: "0.1.0",
    ...over,
  };
}

describe("createBigQueryWriter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes the stream connection once across writes", async () => {
    const w = createBigQueryWriter({
      projectId: "p", datasetId: "analytics", tableId: "events",
      credentials: { client_email: "sa@p.iam", private_key: "k" },
    });
    await w.write([row()]);
    await w.write([row({ event_id: "e2" })]);
    expect(createStreamConnection).toHaveBeenCalledTimes(1);
    expect(appendRows).toHaveBeenCalledTimes(2);
  });

  it("appends rows with null fields omitted and Date preserved", async () => {
    const w = createBigQueryWriter({
      projectId: "p", datasetId: "analytics", tableId: "events",
      credentials: { client_email: "sa@p.iam", private_key: "k" },
    });
    await w.write([row()]);
    expect(appendRows).toHaveBeenCalledTimes(1);
    const sent = appendRows.mock.calls[0]![0] as Record<string, unknown>[];
    expect(sent[0]!.timestamp).toBeInstanceOf(Date);
    expect("visitor_id" in sent[0]!).toBe(false);
    expect(sent[0]!.country).toBe("DE");
  });
});
