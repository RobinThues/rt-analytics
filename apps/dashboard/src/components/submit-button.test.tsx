import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SubmitButton } from "./submit-button";

describe("SubmitButton", () => {
  it("is disabled and shows the pending label while the form action runs", async () => {
    let finish = () => {};
    const action = () => new Promise<void>((resolve) => (finish = resolve));
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Saving…">Save funnel</SubmitButton>
      </form>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Save funnel" }));
    const button = await screen.findByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    finish();
    expect(await screen.findByRole("button", { name: "Save funnel" })).toBeEnabled();
  });
});
