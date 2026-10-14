import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const social = vi.fn();
vi.mock("@/auth/client", () => ({ authClient: { signIn: { social } } }));

const { SignInButton } = await import("./sign-in-button");

describe("SignInButton", () => {
  it("sends refused sign-ins back to /sign-in, where the error is explained", () => {
    render(<SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/", errorCallbackURL: "/sign-in" });
  });
});
