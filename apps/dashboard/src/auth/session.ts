import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readEnv } from "@/env";
import { getAuth } from "./auth";
import { userFromSession, type SessionUser } from "./validate-user";

export type { SessionUser };

export async function getUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return userFromSession(session, readEnv().allowedEmails);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
