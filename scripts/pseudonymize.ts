// Usage: npm run pseudonymize -- --app <appId> <value>...
// Prints "<pseudonym>\t<value>" for each value, with the key from ANALYTICS_PSEUDONYM_KEY or
// ANALYTICS_DAILY_SALT (the same rules as createServerTracker). Used to turn a deletion request into ids
// for sql/templates/delete_pseudonyms.sql.
import { parseArgs } from "node:util";
import { createServerTracker } from "../src/next/server-tracker.js";

const { values, positionals } = parseArgs({ options: { app: { type: "string" } }, allowPositionals: true });
if (!values.app || positionals.length === 0) {
  console.error("Usage: npm run pseudonymize -- --app <appId> <value>...");
  process.exit(2);
}
const tracker = createServerTracker({ appId: values.app });
for (const value of positionals) {
  const id = tracker.pseudonymize(value);
  if (!id) process.exit(1);
  console.log(`${id}\t${value}`);
}
