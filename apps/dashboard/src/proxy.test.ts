// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("sends visitors without a session cookie to sign-in", () => {
    const res = proxy(new NextRequest("http://localhost:3000/demo"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });

  it("lets requests with a session cookie through", () => {
    const req = new NextRequest("http://localhost:3000/demo", {
      headers: { cookie: "better-auth.session_token=abc" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy matcher", () => {
  // Next compiles the matcher like a path regexp; the leading group decides which paths run the proxy.
  const runsProxy = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("protects app pages", () => {
    expect(runsProxy("/")).toBe(true);
    expect(runsProxy("/demo")).toBe(true);
    expect(runsProxy("/demo/settings")).toBe(true);
  });
  it("leaves sign-in, auth API and the public privacy page alone", () => {
    expect(runsProxy("/sign-in")).toBe(false);
    expect(runsProxy("/api/auth/callback/google")).toBe(false);
    expect(runsProxy("/privacy")).toBe(false);
  });
  it("serves the favicon to signed-out visitors", () => {
    expect(runsProxy("/icon.svg")).toBe(false);
  });
});
