import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventList } from "./event-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const rows = [
  { name: "signup", total: 40, change: 10, spark: [] },
  { name: "share", total: 10, change: -5, spark: [] },
];

describe("EventList", () => {
  it("draws row bars by count; event names stay in the text color", () => {
    render(<EventList rows={rows} hrefFor={(e) => `/x?event=${e}`} selected={null} compare />);
    const bars = screen.getAllByTestId("row-bar");
    expect(bars.map((b) => b.style.width)).toEqual(["100.0%", "25.0%"]);
    const link = screen.getByRole("link", { name: "signup" });
    expect(link.className.split(" ")).toContain("underline");
    expect(link.className).not.toContain("text-primary");
  });
});
