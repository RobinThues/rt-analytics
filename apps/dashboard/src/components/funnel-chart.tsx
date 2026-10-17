"use client";
import { useId, useState } from "react";
import { funnelGeometry } from "@/funnels/chart";
import type { FunnelStep, FunnelStepView } from "@/funnels/steps";
import { formatInt, formatShare } from "@/lib/format";

// Left-to-right funnel (layout spec, "Funnel chart"; mockup in docs/superpowers/specs/
// 2026-10-16-dashboard-layout-mockups/funnel.html). Bars per step, hatched drop-off bands between them,
// conversion chips, the previous period as a faint bar behind. On phones the same chart runs top to
// bottom. The table under the chart carries the numbers for keyboard and screen reader users.

type Props = { steps: readonly FunnelStep[]; view: readonly FunnelStepView[]; compare: boolean };

const share = (v: number | null) => (v === null ? "–" : formatShare(v));
const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const filterLabel = (s: FunnelStep | undefined) => (s?.filter ? `${s.filter.key} = ${s.filter.value}` : "");

function Tooltip({ v, compare, left, top }: { v: FunnelStepView; compare: boolean; left: string; top: string }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-sm tabular-nums"
      style={{ left, top }}
    >
      <p className="font-medium">{formatInt(v.cur)} sessions</p>
      <p>{share(v.fromFirst)} of step 1</p>
      {compare && v.prev !== null && (
        <p className="text-muted-foreground">
          Previous: {formatInt(v.prev)} ({share(v.prevFromFirst)})
        </p>
      )}
    </div>
  );
}

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--muted)" />
      <rect width="2" height="6" fill="var(--border)" />
    </pattern>
  );
}

const H = { width: 760, height: 268, base: 212, size: 172 };

function Horizontal({ steps, view, compare }: Props) {
  const hatch = useId();
  const [hover, setHover] = useState<number | null>(null);
  const g = funnelGeometry(view, { compare, size: H.size });
  const slot = H.width / view.length;
  const barW = Math.min(126, slot * 0.55);
  const x = (i: number) => slot * i + (slot - barW) / 2;
  const top = (len: number) => H.base - len;
  const maxChars = Math.max(10, Math.floor(slot / 8));
  return (
    <div className="relative hidden sm:block">
      <svg viewBox={`0 0 ${H.width} ${H.height}`} width="100%" role="img" aria-label="Funnel chart">
        <defs>
          <Hatch id={hatch} />
        </defs>
        <line x1="0" x2={H.width} y1={H.base} y2={H.base} stroke="var(--border)" />
        {g.bars.map((b, i) => {
          const next = g.bars[i + 1];
          if (!next) return null;
          const x1 = x(i) + barW;
          const x2 = x(i + 1);
          return (
            <path
              key={`band-${b.step}`}
              d={`M${x1} ${top(b.length)} L${x2} ${top(next.length)} L${x2} ${H.base} L${x1} ${H.base} Z`}
              fill={`url(#${hatch})`}
            />
          );
        })}
        {g.bars.map((b, i) => (
          <g
            key={b.step}
            data-testid={`funnel-bar-h-${b.step}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect x={x(i) - 4} y={8} width={barW + 8} height={H.base - 8} fill="transparent" />
            {b.prevLength !== null && (
              <rect
                x={x(i) - 10}
                y={top(b.prevLength)}
                width={barW + 20}
                height={b.prevLength}
                rx="4"
                fill="var(--chart-previous)"
                opacity="0.3"
              />
            )}
            <rect x={x(i)} y={top(b.length)} width={barW} height={b.length} rx="4" fill="var(--chart-current)" />
            <text
              x={x(i) + barW / 2}
              y={top(Math.max(b.length, b.prevLength ?? 0)) - 8}
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {formatInt(view[i]?.cur ?? 0)}
            </text>
            <text x={x(i) + barW / 2} y={H.base + 20} textAnchor="middle" fontSize="12" fill="var(--foreground)">
              {short(`${b.step}. ${steps[i]?.event ?? ""}`, maxChars)}
              <title>{steps[i]?.event}</title>
            </text>
            <text x={x(i) + barW / 2} y={H.base + 36} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {short(filterLabel(steps[i]), maxChars)}
            </text>
          </g>
        ))}
        {g.chips.map((c) => {
          const i = c.afterStep - 1;
          const cx = (x(i) + barW + x(i + 1)) / 2;
          const cy = (top(g.bars[i]?.length ?? 0) + top(g.bars[i + 1]?.length ?? 0)) / 2 + 12;
          return (
            <g key={`chip-${c.afterStep}`}>
              <rect
                x={cx - 30}
                y={cy - 12}
                width="60"
                height="22"
                rx="11"
                fill="var(--card)"
                stroke="var(--border)"
              />
              <text x={cx} y={cy + 3} textAnchor="middle" fontSize="11" fill="var(--foreground)">
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && view[hover] && (
        <Tooltip v={view[hover]} compare={compare} left={`${((x(hover) + barW / 2) / H.width) * 100}%`} top="0" />
      )}
    </div>
  );
}

const V = { width: 340, row: 74, bar: 22, size: 230 };

function Vertical({ steps, view, compare }: Props) {
  const hatch = useId();
  const [hover, setHover] = useState<number | null>(null);
  const g = funnelGeometry(view, { compare, size: V.size });
  const y = (i: number) => i * V.row + 20;
  const height = view.length * V.row - 8;
  return (
    <div className="relative sm:hidden">
      <svg viewBox={`0 0 ${V.width} ${height}`} width="100%" role="img" aria-label="Funnel chart">
        <defs>
          <Hatch id={hatch} />
        </defs>
        {g.bars.map((b, i) => {
          const next = g.bars[i + 1];
          if (!next) return null;
          return (
            <path
              key={`band-${b.step}`}
              d={`M${next.length} ${y(i) + V.bar} L${b.length} ${y(i) + V.bar} L${next.length} ${y(i + 1) - 20} Z`}
              fill={`url(#${hatch})`}
            />
          );
        })}
        {g.bars.map((b, i) => (
          <g
            key={b.step}
            data-testid={`funnel-bar-v-${b.step}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
          >
            <rect x="0" y={y(i) - 16} width={V.width} height={V.bar + 18} fill="transparent" />
            <text x="0" y={y(i) - 5} fontSize="12" fill="var(--foreground)">
              {short(`${b.step}. ${steps[i]?.event ?? ""}${steps[i]?.filter ? ` (${filterLabel(steps[i])})` : ""}`, 44)}
            </text>
            {b.prevLength !== null && (
              <rect
                x="0"
                y={y(i) - 3}
                width={b.prevLength}
                height={V.bar + 6}
                rx="4"
                fill="var(--chart-previous)"
                opacity="0.3"
              />
            )}
            <rect x="0" y={y(i)} width={b.length} height={V.bar} rx="4" fill="var(--chart-current)" />
            <text
              x={Math.max(b.length, b.prevLength ?? 0) + 6}
              y={y(i) + 16}
              fontSize="13"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {formatInt(view[i]?.cur ?? 0)}
            </text>
          </g>
        ))}
        {g.chips.map((c) => {
          const i = c.afterStep - 1;
          const cy = y(i) + V.bar + 16;
          return (
            <text
              key={`chip-${c.afterStep}`}
              x={V.width - 4}
              y={cy}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {c.label.replace("→", "↓")}
            </text>
          );
        })}
      </svg>
      {hover !== null && view[hover] && (
        <Tooltip v={view[hover]} compare={compare} left="70%" top={`${(y(hover) / height) * 100}%`} />
      )}
    </div>
  );
}

export function FunnelChart(props: Props) {
  return (
    <div data-testid="funnel-chart">
      <Horizontal {...props} />
      <Vertical {...props} />
    </div>
  );
}
