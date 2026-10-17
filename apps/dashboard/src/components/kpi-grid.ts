// Lines between KPI cells, never around them (visual style spec, "KPI row"). The edge rule is a pure
// function; the class names come from literal tables so Tailwind sees every one of them.

export type KpiCols = { base: 1 | 2 | 3 | 6; sm?: 2 | 3 | 6; lg?: 2 | 3 | 6 };

/** Summary columns: 2 on phones, 3 from sm, 6 from lg; its skeletons use the same. */
export const SUMMARY_COLS: KpiCols = { base: 2, sm: 3, lg: 6 };

/** Which sides of cell `index` (of `count`, in `cols` columns) border another cell. */
export function kpiEdges(index: number, count: number, cols: number): { left: boolean; top: boolean; bottom: boolean } {
  return {
    left: index % cols !== 0,
    top: index >= cols,
    bottom: index < (Math.ceil(count / cols) - 1) * cols,
  };
}

const EDGE = {
  "": {
    left: "border-l pl-4",
    noLeft: "border-l-0 pl-0",
    top: "border-t pt-3",
    noTop: "border-t-0 pt-0",
    bottom: "pb-3",
    noBottom: "pb-0",
    right: "pr-4",
    noRight: "pr-0",
  },
  "sm:": {
    left: "sm:border-l sm:pl-4",
    noLeft: "sm:border-l-0 sm:pl-0",
    top: "sm:border-t sm:pt-3",
    noTop: "sm:border-t-0 sm:pt-0",
    bottom: "sm:pb-3",
    noBottom: "sm:pb-0",
    right: "sm:pr-4",
    noRight: "sm:pr-0",
  },
  "lg:": {
    left: "lg:border-l lg:pl-4",
    noLeft: "lg:border-l-0 lg:pl-0",
    top: "lg:border-t lg:pt-3",
    noTop: "lg:border-t-0 lg:pt-0",
    bottom: "lg:pb-3",
    noBottom: "lg:pb-0",
    right: "lg:pr-4",
    noRight: "lg:pr-0",
  },
} as const;

const GRID = {
  base: { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 6: "grid-cols-6" },
  sm: { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 6: "sm:grid-cols-6" },
  lg: { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 6: "lg:grid-cols-6" },
} as const;

type Prefix = "" | "sm:" | "lg:";

const breakpoints = (cols: KpiCols): Array<[Prefix, number]> => {
  const all: Array<[Prefix, number | undefined]> = [
    ["", cols.base],
    ["sm:", cols.sm],
    ["lg:", cols.lg],
  ];
  return all.flatMap(([p, n]) => (n === undefined ? [] : [[p, n] as [Prefix, number]]));
};

export function kpiCellClass(index: number, count: number, cols: KpiCols): string {
  return breakpoints(cols)
    .map(([p, n]) => {
      const e = kpiEdges(index, count, n);
      const lastCol = index % n === n - 1 || index === count - 1;
      const t = EDGE[p];
      return [
        e.left ? t.left : t.noLeft,
        e.top ? t.top : t.noTop,
        e.bottom ? t.bottom : t.noBottom,
        lastCol ? t.noRight : t.right,
      ].join(" ");
    })
    .join(" ");
}

export function kpiGridClass(cols: KpiCols): string {
  return [GRID.base[cols.base], cols.sm && GRID.sm[cols.sm], cols.lg && GRID.lg[cols.lg]].filter(Boolean).join(" ");
}
