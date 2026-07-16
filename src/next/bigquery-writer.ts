import { adapt, managedwriter } from "@google-cloud/bigquery-storage";
import type { protos } from "@google-cloud/bigquery-storage";

export interface EventRow {
  event_id: string;
  app_id: string;
  event_name: string;
  timestamp: Date;
  visitor_id: string | null;
  session_id: string | null;
  user_id: string | null;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  /** JSON-serialized custom props */
  props: string | null;
  consent_state: string;
  sdk_version: string;
}

export interface RowWriter {
  write(rows: EventRow[]): Promise<void>;
}

export interface WriterConfig {
  projectId: string;
  datasetId: string;
  tableId: string;
  credentials: { client_email: string; private_key: string };
}

type JsonWriter = { appendRows(rows: Record<string, unknown>[]): { getResult(): Promise<unknown> } };

// Module-level cache: warm serverless instances reuse the stream connection.
let cachedWriter: Promise<JsonWriter> | null = null;

async function connect(cfg: WriterConfig): Promise<JsonWriter> {
  const { WriterClient, JSONWriter, DefaultStream } = managedwriter;
  const destinationTable = `projects/${cfg.projectId}/datasets/${cfg.datasetId}/tables/${cfg.tableId}`;
  const client = new WriterClient({ projectId: cfg.projectId, credentials: cfg.credentials });
  const writeStream = await client.getWriteStream({
    streamId: `${destinationTable}/streams/_default`,
    view: 2 as protos.google.cloud.bigquery.storage.v1.WriteStreamView, // FULL
  });
  const protoDescriptor = adapt.convertStorageSchemaToProto2Descriptor(writeStream.tableSchema!, "root");
  const connection = await client.createStreamConnection({ streamId: DefaultStream, destinationTable });
  return new JSONWriter({ connection, protoDescriptor }) as unknown as JsonWriter;
}

export function createBigQueryWriter(cfg: WriterConfig): RowWriter {
  return {
    async write(rows: EventRow[]): Promise<void> {
      try {
        cachedWriter ??= connect(cfg);
        const writer = await cachedWriter;
        const clean = rows.map((r) =>
          Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)),
        );
        await writer.appendRows(clean).getResult();
      } catch (err) {
        cachedWriter = null; // force reconnect on next request
        throw err;
      }
    },
  };
}
