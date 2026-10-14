import { adapt, managedwriter } from "@google-cloud/bigquery-storage";
import type { protos } from "@google-cloud/bigquery-storage";
import type { EventRow } from "../schema/event-row.js";

export type { EventRow };

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

// Module-level cache, one connection per destination table: warm serverless instances reuse it.
const cachedWriters = new Map<string, Promise<JsonWriter>>();

function destinationOf(cfg: WriterConfig): string {
  return `projects/${cfg.projectId}/datasets/${cfg.datasetId}/tables/${cfg.tableId}`;
}

async function connect(cfg: WriterConfig): Promise<JsonWriter> {
  const { WriterClient, JSONWriter, DefaultStream } = managedwriter;
  const destinationTable = destinationOf(cfg);
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
      const key = destinationOf(cfg);
      try {
        let pending = cachedWriters.get(key);
        if (!pending) {
          pending = connect(cfg);
          cachedWriters.set(key, pending);
        }
        const writer = await pending;
        const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)));
        await writer.appendRows(clean).getResult();
      } catch (err) {
        cachedWriters.delete(key); // force reconnect for this table on next request
        throw err;
      }
    },
  };
}
