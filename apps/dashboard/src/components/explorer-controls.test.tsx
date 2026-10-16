import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { catalog } from "@/explorer/fixtures";
import { ExplorerControls } from "./explorer-controls";

const optionLabels = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

describe("ExplorerControls", () => {
  it("offers the event's metrics and keys and shows the current filter with suggested values", () => {
    render(
      <ExplorerControls
        appId="demo"
        qsBase={[["from", "2026-10-01"]]}
        catalog={catalog}
        sel={{ event: "place_selected", metric: { kind: "events" }, filter: { key: "source", value: "map" }, by: null }}
        values={["map", "search"]}
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
    const list = document.getElementById(screen.getByLabelText("Value").getAttribute("list") ?? "");
    expect([...(list?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value"))).toEqual([
      "map",
      "search",
    ]);
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
});
