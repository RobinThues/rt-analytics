// Cheap redirect for visitors without a session cookie. Not the security boundary: requireUser() checks
// the session and the allowlist on every page and server action.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  matcher: ["/((?!api/auth|sign-in|_next/static|_next/image|favicon.ico).*)"],
};
