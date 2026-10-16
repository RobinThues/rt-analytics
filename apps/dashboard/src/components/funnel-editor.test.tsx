import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunnelEditor } from "./funnel-editor";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("FunnelEditor", () => {
  beforeEach(() => push.mockClear());

  it("builds the steps URL from the rows", async () => {
    render(
      <FunnelEditor
        events={["$pageview", "place_selected", "subscribe_click"]}
        keys={{ $pageview: ["path"], place_selected: ["source"] }}
        initial={[]}
        baseQuery={[
          ["from", "2026-10-01"],
          ["to", "2026-10-16"],
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Step 1 event"), "place_selected");
    await user.selectOptions(screen.getByLabelText("Step 1 filter"), "source");
    await user.type(screen.getByLabelText("Step 1 value"), "map:x");
    await user.selectOptions(screen.getByLabelText("Step 2 event"), "subscribe_click");
    await user.click(screen.getByRole("button", { name: "Show funnel" }));
    expect(push).toHaveBeenCalledWith(
      "?from=2026-10-01&to=2026-10-16&steps=place_selected%3Asource%3Amap%3Ax&steps=subscribe_click",
    );
  });

  it("2 to 5 rows", async () => {
    render(<FunnelEditor events={["a"]} keys={{}} initial={[]} baseQuery={[]} />);
    expect(screen.getAllByRole("button", { name: /Remove step/ })[0]).toBeDisabled();
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /Remove step/ })[0]).toBeEnabled();
  });

  it("starts from the given steps and changing the event clears the filter", async () => {
    render(
      <FunnelEditor
        events={["place_selected", "subscribe_click"]}
        keys={{ place_selected: ["source"], subscribe_click: ["target"] }}
        initial={[
          { event: "place_selected", filter: { key: "source", value: "map" } },
          { event: "subscribe_click", filter: null },
        ]}
        baseQuery={[]}
      />,
    );
    expect(screen.getByLabelText("Step 1 value")).toHaveValue("map");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Step 1 event"), "subscribe_click");
    expect(screen.getByLabelText("Step 1 filter")).toHaveValue("");
  });

  it("an event called constructor has no inherited keys", () => {
    render(
      <FunnelEditor
        events={["constructor"]}
        keys={{}}
        initial={[
          { event: "constructor", filter: null },
          { event: "constructor", filter: null },
        ]}
        baseQuery={[]}
      />,
    );
    expect(screen.getByLabelText("Step 1 filter").querySelectorAll("option")).toHaveLength(1);
  });
});
