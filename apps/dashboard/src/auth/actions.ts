"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

/** Ends the session (the nextCookies plugin clears the cookie) and goes to the sign-in page. */
export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
