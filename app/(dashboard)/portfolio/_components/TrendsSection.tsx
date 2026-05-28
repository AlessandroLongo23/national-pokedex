"use client";

import { useMemo, useState } from "react";
import type { CumulativePoint } from "@/lib/data/cumulative-acquisitions";
import type { ValuePoint } from "@/lib/data/cumulative-value";
import {
  formatPriceCompact,
  type DisplayConversion,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import { TrendChart, type TrendPoint } from "./TrendChart";

interface Props {
  countPoints: CumulativePoint[];
  valuePoints: ValuePoint[];
  priceSource: PriceSource;
  display: DisplayConversion;
}

// Build the day-by-day series each chart needs from its raw cumulative
// points: every day in [start, end] gets a row, with the value held
// constant between explicit data points and zero-padded before the
// series begins. Both charts get the same length so the shared hover
// state maps to identical x positions in the rendered SVG.
function padToRange(
  points: TrendPoint[],
  start: string,
  end: string,
): TrendPoint[] {
  if (points.length === 0) return [];
  const out: TrendPoint[] = [];
  let cursor = 0;
  let running = 0;
  for (const day of enumerateDays(start, end)) {
    while (cursor < points.length && points[cursor]!.date <= day) {
      running = points[cursor]!.value;
      cursor++;
    }
    out.push({ date: day, value: running });
  }
  return out;
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    if (cursor === end) break;
    cursor = addDay(cursor);
  }
  return out;
}

function addDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function rangeLabel(
  start: string | undefined,
  end: string | undefined,
  hovered: string | null,
): string {
  if (hovered) return hovered;
  if (!start || !end) return "";
  if (start === end) return `Tracking since ${start}`;
  return `${start} → ${end}`;
}

export function TrendsSection({
  countPoints,
  valuePoints,
  priceSource,
  display,
}: Props) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const data = useMemo(() => {
    const counts: TrendPoint[] = countPoints.map((p) => ({
      date: p.date,
      value: p.count,
    }));
    const values: TrendPoint[] = valuePoints.map((p) => ({
      date: p.date,
      value: p.value,
    }));
    if (counts.length === 0 && values.length === 0) return null;

    const allDates = [
      ...counts.map((p) => p.date),
      ...values.map((p) => p.date),
    ];
    const start = allDates.reduce((a, b) => (a < b ? a : b));
    const end = allDates.reduce((a, b) => (a > b ? a : b));

    return {
      start,
      end,
      countSeries: padToRange(counts, start, end),
      valueSeries: padToRange(values, start, end),
      hasCount: counts.length >= 1,
      hasValue: values.length >= 1,
    };
  }, [countPoints, valuePoints]);

  if (!data) return null;

  const lastCount =
    data.countSeries[data.countSeries.length - 1]?.value ?? 0;
  const lastValue =
    data.valueSeries[data.valueSeries.length - 1]?.value ?? 0;

  return (
    <section className="space-y-4">
      <h2 className="eyebrow">Trends</h2>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        {data.hasCount && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="eyebrow">Cards owned</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {lastCount.toLocaleString()}
                </p>
              </div>
              <p className="text-[11px] text-muted tabular-nums">
                {rangeLabel(data.start, data.end, hoveredDate)}
              </p>
            </div>
            <TrendChart
              points={data.countSeries}
              hoveredDate={hoveredDate}
              onHoverDate={setHoveredDate}
              color="accent"
              formatValue={(n) => n.toLocaleString()}
              ariaLabel={`Cards owned over time: ${lastCount} as of ${data.end}`}
            />
          </div>
        )}
        {data.hasValue && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="eyebrow">Held value</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatPriceCompact(lastValue, priceSource, display)}
                </p>
              </div>
              <p className="text-[11px] text-muted tabular-nums">
                {rangeLabel(data.start, data.end, hoveredDate)}
              </p>
            </div>
            <TrendChart
              points={data.valueSeries}
              hoveredDate={hoveredDate}
              onHoverDate={setHoveredDate}
              color="owned"
              formatValue={(n) => formatPriceCompact(n, priceSource)}
              ariaLabel={`Held value over time: ${formatPriceCompact(lastValue, priceSource, display)} as of ${data.end}`}
            />
          </div>
        )}
      </div>
    </section>
  );
}
