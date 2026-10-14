import { assertSafeTestLogin } from "./env";

export function register() {
  assertSafeTestLogin(process.env);
}
