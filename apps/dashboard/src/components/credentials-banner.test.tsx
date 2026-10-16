import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/auth/session";
import { checkCredentials } from "@/bq/credentials";
import { CredentialsBanner } from "./credentials-banner";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/auth/session", () => ({
  requireUser: vi.fn(async () => {
    throw new Error("NEXT_REDIRECT /sign-in");
  }),
}));
vi.mock("@/bq/credentials", () => ({ checkCredentials: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/bq/client", () => ({ getBigQuery: () => ({ authClient: {} }) }));
vi.mock("@/env", () => ({ readEnv: () => ({}) }));

describe("CredentialsBanner", () => {
  it("checks the signed-in user before it looks at the credentials", async () => {
    await expect(CredentialsBanner()).rejects.toThrow("NEXT_REDIRECT");
    expect(requireUser).toHaveBeenCalled();
    expect(checkCredentials).not.toHaveBeenCalled();
  });
});
