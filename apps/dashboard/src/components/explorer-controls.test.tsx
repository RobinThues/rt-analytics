import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { catalog } from "@/explorer/fixtures";
import { ExplorerControls } from "./explorer-controls";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const optionLabels = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

const suggestions = () => {
  const list = document.getElementById(screen.getByLabelText("Value").getAttribute("list") ?? "");
  return [...(list?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value"));
};

describe("ExplorerControls", () => {
  it("offers the event's metrics and keys and shows the current filter with suggested values", () => {
    render(
      <ExplorerControls
        appId="demo"
        qsBase={[["from", "2026-10-01"]]}
        catalog={catalog}
        sel={{ event: "place_selected", metric: { kind: "events" }, filter: { key: "source", value: "map" }, by: null }}
        values={[
          ["source", ["map", "search"]],
          ["place", ["Berlin"]],
        ]}
      />,
    );
    expect(optionLabels(screen.getByLabelText("Metric"))).toEqual([
      "Events",
      "Sessions",
      "Visitors",
      "Distinct values of source",
      "Distinct values of place",
    ]);
    expect(screen.getByLabelText("Filter by")).toHaveValue("source");
    expect(screen.getByLabelText("Value")).toHaveValue("map");
    expect(suggestions()).toEqual(["map", "search"]);
    expect(screen.getByLabelText("Break down by")).toHaveValue("");
  });
  it("server events have no visitor or session metric", () => {
    render(
      <ExplorerControls
        appId="demo"
        qsBase={[]}
        catalog={catalog}
        sel={{ event: "calendar_poll", metric: { kind: "events" }, filter: null, by: null }}
        values={[]}
      />,
    );
    const labels = optionLabels(screen.getByLabelText("Metric"));
    expect(labels).not.toContain("Visitors");
    expect(labels).not.toContain("Sessions");
  });

  it("a key chosen in the form offers its values before Apply", async () => {
    render(
      <ExplorerControls
        appId="demo"
        qsBase={[]}
        catalog={catalog}
        sel={{ event: "place_selected", metric: { kind: "events" }, filter: null, by: null }}
        values={[
          ["source", ["map", "search"]],
          ["place", ["Berlin"]],
        ]}
      />,
    );
    expect(suggestions()).toEqual([]);
    await userEvent.setup().selectOptions(screen.getByLabelText("Filter by"), "place");
    expect(suggestions()).toEqual(["Berlin"]);
  });

  it("Apply navigates in place to the canonical URL", async () => {
    window.history.replaceState(null, "", "/demo/events?from=2026-10-01&event=place_selected");
    render(
      <ExplorerControls
        appId="demo"
        qsBase={[["from", "2026-10-01"]]}
        catalog={catalog}
        sel={{ event: "place_selected", metric: { kind: "events" }, filter: { key: "source", value: "map" }, by: null }}
        values={[]}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Apply" }));
    expect(push).toHaveBeenCalledTimes(1);
    const [url, opts] = push.mock.calls[0] as [string, unknown];
    expect(url).toMatch(/^\/demo\/events\?from=2026-10-01&event=place_selected/);
    expect(url).toContain("filter=source%3Amap");
    expect(url).not.toContain("fk=");
    expect(opts).toEqual({ scroll: false });
  });
});
