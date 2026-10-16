import { startupCheck } from "./env";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") startupCheck(process.env);
}
