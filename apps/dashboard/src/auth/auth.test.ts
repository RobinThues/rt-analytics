// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "@/env";
import { createAuth } from "./auth";

const secret = "t".repeat(32);
const vars = {
  GCP_PROJECT_ID: "robin-thues",
  DASHBOARD_ALLOWED_EMAILS: "robin@example.com",
  DASHBOARD_TEST_LOGIN: "1",
  DASHBOARD_TEST_LOGIN_SECRET: secret,
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

async function login(auth: ReturnType<typeof createAuth>, email: string, key = secret) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-login-secret": key },
      body: JSON.stringify({ email }),
    }),
  );
}

describe("test login", () => {
  it("creates a session cookie for an allowlisted email", async () => {
    const auth = createAuth(readEnv(vars), vars);
    const res = await login(auth, "robin@example.com");
    expect(res.status).toBe(200);
    const cookies = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookies).toContain("session_token");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    expect(session?.user.email).toBe("robin@example.com");
  });

  it("refuses a wrong secret or a non-allowlisted email", async () => {
    const auth = createAuth(readEnv(vars), vars);
    expect((await login(auth, "robin@example.com", "x".repeat(32))).status).toBe(403);
    expect((await login(auth, "other@example.com")).status).toBe(403);
  });

  it("does not exist when the guard fails", async () => {
    const prod = { ...vars, VERCEL_ENV: "production" };
    const auth = createAuth(readEnv(prod), prod);
    expect((await login(auth, "robin@example.com")).status).toBe(404);
  });
});
