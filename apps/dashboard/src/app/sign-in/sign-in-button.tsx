"use client";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/sign-in" })}
    >
      Sign in with Google
    </Button>
  );
}
