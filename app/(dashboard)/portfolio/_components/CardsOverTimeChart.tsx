"use client";

import type { CumulativePoint } from "@/lib/data/cumulative-acquisitions";

interface Props {
  points: CumulativePoint[];
  height?: number;
}

export function CardsOverTimeChart({ points, height = 220 }: Props) {
  if (points.length < 2) {
    return (
      <p className="rounded-md border border-dashed border-border py-12 text-center text-xs text-muted">
        Not enough data yet — your line will appear once you{"'"}ve acquired cards on at least two
        days.
      </p>
    );
  }

  const maxY = points[points.length - 1]!.count;
  const W = 800;
  const H = height;
  const PAD = 28;
  const xStep = (W - PAD * 2) / (points.length - 1);
  const yScale = (n: number) => H - PAD - ((H - PAD * 2) * n) / Math.max(maxY, 1);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${PAD + i * xStep} ${yScale(p.count)}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${PAD + (points.length - 1) * xStep} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Cards owned over time">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-border" strokeWidth="1" />
      <path d={areaD} className="fill-accent/10" />
      <path d={pathD} className="stroke-accent" strokeWidth="2" fill="none" />
      <text x={PAD} y={H - 6} className="fill-current text-[10px] text-muted">
        {points[0]!.date}
      </text>
      <text
        x={W - PAD}
        y={H - 6}
        textAnchor="end"
        className="fill-current text-[10px] text-muted"
      >
        {points[points.length - 1]!.date}
      </text>
      <text x={PAD} y={16} className="fill-current text-[10px] text-muted">
        {maxY.toLocaleString()} cards
      </text>
    </svg>
  );
}
