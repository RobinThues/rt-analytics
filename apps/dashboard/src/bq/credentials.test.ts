// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkCredentials } from "./credentials";

describe("checkCredentials", () => {
  it("ok when a token can be fetched", async () => {
    await expect(checkCredentials({ getAccessToken: async () => ({ token: "t" }) })).resolves.toEqual({ ok: true });
  });
  it("not ok on failure; logs a short reason only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = `invalid_grant: token ya29.SECRET expired ${"x".repeat(300)}`;
    const res = await checkCredentials({
      getAccessToken: async () => {
        throw new Error(message);
      },
    });
    expect(res).toEqual({ ok: false });
    expect(log).toHaveBeenCalledOnce();
    const reason = String(log.mock.calls[0]?.[1]);
    expect(reason.startsWith("Error: invalid_grant")).toBe(true);
    expect(reason.length).toBeLessThanOrEqual("Error: ".length + 200);
    log.mockRestore();
  });
});
