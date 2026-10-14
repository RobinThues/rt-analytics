// Allowlist rules for Better Auth's user.validateUserInfo hook and for every request (spec section 4).
export type SessionUser = { email: string; name: string };

export function isAllowedEmail(email: unknown, allowed: readonly string[]): boolean {
  return typeof email === "string" && allowed.includes(email.trim().toLowerCase());
}

interface ValidationInput {
  user: { email?: unknown; emailVerified?: unknown };
  source: { method: string; oauth?: { providerId: string } };
}

export function validateUser(
  data: ValidationInput,
  opts: { allowed: readonly string[]; testLogin: boolean },
): void | { error: string; errorDescription?: string } {
  const { method, oauth } = data.source;
  const viaGoogle = method === "oauth" && oauth?.providerId === "google";
  const viaTest = method === "test" && opts.testLogin;
  if (!viaGoogle && !viaTest) return { error: "method_not_allowed", errorDescription: "Sign in with Google." };
  if (viaGoogle && data.user.emailVerified !== true) {
    return { error: "email_not_verified", errorDescription: "Your Google email is not verified." };
  }
  if (!isAllowedEmail(data.user.email, opts.allowed)) {
    return { error: "not_allowed", errorDescription: "This account has no access." };
  }
}

/** A session only counts while its email is still on the allowlist (sessions live for days). */
export function userFromSession(
  session: { user: { email: string; name: string } } | null,
  allowed: readonly string[],
): SessionUser | null {
  if (!session || !isAllowedEmail(session.user.email, allowed)) return null;
  return { email: session.user.email.toLowerCase(), name: session.user.name };
}
