"use client";

import { useRef } from "react";

export interface TrendPoint {
  date: string; // YYYY-MM-DD, UTC day
  value: number;
}

interface Props {
  // Already padded to span the section's full date range so every chart
  // sharing a TrendsSection plots on the same x-axis. Length >= 2.
  points: TrendPoint[];
  // Shared with the companion chart so a hover on one mirrors to all.
  hoveredDate: string | null;
  onHoverDate: (date: string | null) => void;
  color: "accent" | "owned";
  formatValue: (n: number) => string;
  ariaLabel: string;
}

const VIEW_W = 800;
const VIEW_H = 96;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

const FILL_BY_COLOR = {
  accent: "fill-accent/10",
  owned: "fill-owned/10",
} as const;
const STROKE_BY_COLOR = {
  accent: "stroke-accent",
  owned: "stroke-owned",
} as const;
const DOT_BY_COLOR = {
  accent: "bg-accent",
  owned: "bg-owned",
} as const;

export function TrendChart({
  points,
  hoveredDate,
  onHoverDate,
  color,
  formatValue,
  ariaLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  if (points.length < 2) return null;

  const drawH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const maxY = Math.max(...points.map((p) => p.value), 1);
  const xStep = VIEW_W / (points.length - 1);
  const yScale = (n: number) => PAD_TOP + drawH - (drawH * n) / maxY;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * xStep} ${yScale(p.value)}`)
    .join(" ");
  const areaD = `${pathD} L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z`;

  const hoverIdx = hoveredDate
    ? points.findIndex((p) => p.date === hoveredDate)
    : -1;
  const hovered = hoverIdx >= 0 ? points[hoverIdx]! : null;
  const hoverFrac =
    hovered != null ? hoverIdx / (points.length - 1) : null;
  const hoverYPct =
    hovered != null ? (yScale(hovered.value) / VIEW_H) * 100 : null;

  // Snap pointer x to the nearest day in the padded series. We update
  // on every move including hover-leave-then-reenter so the dot tracks
  // smoothly even when the pointer leaves the area briefly.
  function handlePointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(xFrac * (points.length - 1));
    onHoverDate(points[idx]!.date);
  }

  function handleLeave() {
    onHoverDate(null);
  }

  // X-axis ticks: aim for ~4 evenly-spaced dates, fewer if the series
  // is short. Picking by index keeps spacing pixel-uniform even when
  // the underlying day distribution is irregular.
  const xTickCount = Math.min(4, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const frac = xTickCount === 1 ? 0 : i / (xTickCount - 1);
    const idx = Math.round(frac * (points.length - 1));
    return { idx, frac, date: points[idx]!.date };
  });

  // Top gridline lives at PAD_TOP (8/96 ≈ 8.3%) of the chart container
  // height; bottom at VIEW_H-PAD_BOTTOM (88/96 ≈ 91.7%). Y-axis labels
  // ride those lines so the value tag aligns with the gridline it
  // describes rather than the container edge.
  const topGridPct = (PAD_TOP / VIEW_H) * 100;
  const bottomGridPct = ((VIEW_H - PAD_BOTTOM) / VIEW_H) * 100;

  // Edge correction for the tooltip pill so it never overflows the
  // chart bounds. Centered by default; flush-left near the start and
  // flush-right near the end.
  const tooltipTranslateX =
    hoverFrac == null
      ? "-50%"
      : hoverFrac < 0.08
        ? "0%"
        : hoverFrac > 0.92
          ? "-100%"
          : "-50%";

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={handleLeave}
        className="relative h-24 w-full touch-pan-y select-none"
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={ariaLabel}
        >
          <line
            x1={0}
            x2={VIEW_W}
            y1={PAD_TOP}
            y2={PAD_TOP}
            className="stroke-[var(--color-border)]"
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            x2={VIEW_W}
            y1={VIEW_H - PAD_BOTTOM}
            y2={VIEW_H - PAD_BOTTOM}
            className="stroke-[var(--color-border)]"
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          <path d={areaD} className={FILL_BY_COLOR[color]} />
          <path
            d={pathD}
            className={STROKE_BY_COLOR[color]}
            strokeWidth={1.5}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <span
          className="pointer-events-none absolute right-1.5 -translate-y-1/2 text-[10px] text-muted tabular-nums"
          style={{ top: `${topGridPct}%` }}
        >
          {formatValue(maxY)}
        </span>
        <span
          className="pointer-events-none absolute right-1.5 -translate-y-1/2 text-[10px] text-muted tabular-nums"
          style={{ top: `${bottomGridPct}%` }}
        >
          {formatValue(0)}
        </span>

        {hovered && hoverFrac != null && hoverYPct != null && (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--color-border-strong)]"
              style={{ left: `${hoverFrac * 100}%` }}
            />
            <div
              className={`pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-bg)] ${DOT_BY_COLOR[color]}`}
              style={{
                left: `${hoverFrac * 100}%`,
                top: `${hoverYPct}%`,
              }}
            />
            <div
              className="pointer-events-none absolute -top-1 whitespace-nowrap rounded border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 py-0.5 text-[11px] tabular-nums shadow-sm"
              style={{
                left: `${hoverFrac * 100}%`,
                transform: `translate(${tooltipTranslateX}, -100%)`,
              }}
            >
              <span className="text-muted">{formatTickDate(hovered.date)}</span>
              <span className="mx-1.5 text-muted/50">·</span>
              <span>{formatValue(hovered.value)}</span>
            </div>
          </>
        )}
      </div>

      <div className="relative h-3.5 text-[10px] text-muted tabular-nums">
        {xTicks.map((t, i) => {
          const isFirst = i === 0;
          const isLast = i === xTicks.length - 1;
          const tx = isFirst ? "0" : isLast ? "-100%" : "-50%";
          return (
            <span
              key={t.date}
              className="absolute top-0"
              style={{
                left: `${t.frac * 100}%`,
                transform: `translateX(${tx})`,
              }}
            >
              {formatTickDate(t.date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// "2026-04-10" → "Apr 10". UTC-stable: we never construct a Date, so
// the user's local timezone can't shift the displayed day.
function formatTickDate(yyyymmdd: string): string {
  const parts = yyyymmdd.split("-");
  if (parts.length !== 3) return yyyymmdd;
  const m = parseInt(parts[1]!, 10);
  const d = parseInt(parts[2]!, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return yyyymmdd;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[m - 1]} ${d}`;
}
