import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlowPagesTable, TopErrorsTable } from "./quality-tables";

const tokens = (el: Element | null) => (el?.className ?? "").split(" ");

describe("quality tables at phone width", () => {
  it("top errors: fixed layout, fixed number columns, the message truncates", () => {
    render(
      <TopErrorsTable
        rows={[
          {
            message: "TypeError: Cannot read properties of undefined (reading 'lat')",
            occurrences: 13,
            last_seen: "2026-10-12 10:17",
          },
        ]}
      />,
    );
    expect(tokens(screen.getByRole("table"))).toContain("table-fixed");
    expect(tokens(screen.getByRole("columnheader", { name: "Count" }))).toContain("w-14");
    expect(tokens(screen.getByRole("columnheader", { name: "Last seen" }))).toContain("w-32");
    expect(tokens(screen.getByRole("cell", { name: /TypeError/ }))).toContain("truncate");
  });

  it("slowest pages: fixed layout, fixed number columns, the page truncates", () => {
    render(<SlowPagesTable rows={[{ page_path: "/a/very/long/path/that/never/ends", p75: 3274, samples: 363 }]} />);
    expect(tokens(screen.getByRole("table"))).toContain("table-fixed");
    expect(tokens(screen.getByRole("columnheader", { name: "LCP p75" }))).toContain("w-20");
    expect(tokens(screen.getByRole("columnheader", { name: "Samples" }))).toContain("w-16");
    expect(tokens(screen.getByRole("cell", { name: /very\/long/ }))).toContain("truncate");
  });
});
