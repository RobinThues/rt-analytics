import { Suspense } from "react";
import { Wordmark } from "@/components/mark";
import { SignInButton } from "./sign-in-button";

const ERRORS: Record<string, string> = {
  not_allowed: "This account has no access.",
  email_not_verified: "Your Google email is not verified.",
  method_not_allowed: "Sign in with Google.",
};

async function SignInError({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const error = (await searchParams).error;
  if (typeof error !== "string") return null;
  return <p className="text-sm text-destructive">{ERRORS[error] ?? "Sign-in failed."}</p>;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6 pt-24">
      <h1 className="text-2xl">
        <Wordmark />
      </h1>
      <p>Sign in with your Google account.</p>
      <SignInButton />
      <Suspense fallback={null}>
        <SignInError searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
