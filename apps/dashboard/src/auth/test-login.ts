// Test-only sign-in for Playwright (spec section 4). A Better Auth plugin endpoint, because Better Auth only
// creates users inside its own endpoint context when validateUserInfo is set.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { isAllowedEmail } from "./validate-user";

export function testLoginPlugin(opts: { enabled: boolean; secret: string | null; allowed: readonly string[] }) {
  return {
    id: "rtd-test-login",
    endpoints: {
      testLogin: createAuthEndpoint(
        "/test-login",
        { method: "POST", body: z.object({ email: z.string() }) },
        async (ctx) => {
          if (!opts.enabled || !opts.secret) throw new APIError("NOT_FOUND");
          if (ctx.headers?.get("x-test-login-secret") !== opts.secret) throw new APIError("FORBIDDEN");
          const email = ctx.body.email.trim().toLowerCase();
          if (!isAllowedEmail(email, opts.allowed)) throw new APIError("FORBIDDEN");
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            found?.user ??
            (await ctx.context.internalAdapter.createUser(
              { email, name: email, emailVerified: true },
              { method: "test" },
            ));
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
