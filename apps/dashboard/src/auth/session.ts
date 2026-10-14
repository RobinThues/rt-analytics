import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readEnv } from "@/env";
import { getAuth } from "./auth";
import { userFromSession, type SessionUser } from "./validate-user";

export type { SessionUser };

export async function getUser(): Promise<SessionUser | null> {
  // headers() first: it makes this request-time, so the build never reads the environment here.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return userFromSession(session, readEnv().allowedEmails);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
