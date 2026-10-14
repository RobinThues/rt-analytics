// Better Auth in stateless mode (no database): session and OAuth state live in encrypted cookies.
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { readEnv, type DashboardEnv } from "@/env";
import { testLoginPlugin } from "./test-login";
import { validateUser } from "./validate-user";

export function createAuth(env: DashboardEnv, vars: Record<string, string | undefined> = process.env) {
  return betterAuth({
    baseURL: vars.BETTER_AUTH_URL,
    secret: vars.BETTER_AUTH_SECRET,
    socialProviders: {
      google: { clientId: vars.GOOGLE_CLIENT_ID ?? "", clientSecret: vars.GOOGLE_CLIENT_SECRET ?? "" },
    },
    session: { cookieCache: { enabled: true, maxAge: 7 * 24 * 60 * 60, strategy: "jwe", refreshCache: true } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: true },
    user: {
      validateUserInfo: (data) => validateUser(data, { allowed: env.allowedEmails, testLogin: env.testLogin.enabled }),
    },
    plugins: [testLoginPlugin({ ...env.testLogin, allowed: env.allowedEmails }), nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | null = null;

/** Lazy, so importing this module never reads the environment (tests, build-time page data collection). */
export function getAuth(): ReturnType<typeof createAuth> {
  instance ??= createAuth(readEnv());
  return instance;
}
