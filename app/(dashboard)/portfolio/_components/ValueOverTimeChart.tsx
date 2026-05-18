"use client";

import type { PriceSource } from "@/lib/pricing/pokemontcg";

export interface ValuePoint {
  date: string;
  value: number;
}

interface Props {
  points: ValuePoint[];
  // Source kept on the API for parity with CardsOverTimeChart and so
  // callers can later expose a tooltip — currently unused in the visual.
  source: PriceSource;
  height?: number;
}

// Twin of CardsOverTimeChart, in the owned/amber palette. Same "render
// nothing on empty" contract — the parent owns the messaging.
export function ValueOverTimeChart({ points, source: _source, height = 96 }: Props) {
  if (points.length < 2) return null;

  const maxY = points[points.length - 1]!.value;
  const W = 800;
  const H = height;
  const PAD_X = 0;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 4;
  const drawW = W - PAD_X * 2;
  const drawH = H - PAD_TOP - PAD_BOTTOM;
  const xStep = drawW / (points.length - 1);
  const yScale = (n: number) => PAD_TOP + drawH - (drawH * n) / Math.max(maxY, 1);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${PAD_X + i * xStep} ${yScale(p.value)}`)
    .join(" ");
  const areaD = `${pathD} L ${PAD_X + (points.length - 1) * xStep} ${H} L ${PAD_X} ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label="Collection value over time"
    >
      <path d={areaD} className="fill-owned/10" />
      <path
        d={pathD}
        className="stroke-owned"
        strokeWidth="1.5"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
