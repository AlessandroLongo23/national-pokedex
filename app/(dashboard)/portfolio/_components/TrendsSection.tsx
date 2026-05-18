import type { CumulativePoint } from "@/lib/data/cumulative-acquisitions";
import {
  formatPriceCompact,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import { CardsOverTimeChart } from "./CardsOverTimeChart";
import {
  ValueOverTimeChart,
  type ValuePoint,
} from "./ValueOverTimeChart";

interface Props {
  countPoints: CumulativePoint[];
  valuePoints: ValuePoint[];
  priceSource: PriceSource;
}

function startEnd(label: string, dates: string[]): string {
  if (dates.length === 0) return label;
  if (dates.length === 1) return `${label} · ${dates[0]}`;
  return `${label} · ${dates[0]} → ${dates[dates.length - 1]!}`;
}

// Two slim sparklines stacked, each tagged with its own headline number
// to the left. We hide either panel that lacks data instead of rendering
// an empty-state box — silence beats a placeholder.
export function TrendsSection({ countPoints, valuePoints, priceSource }: Props) {
  const hasCount = countPoints.length >= 2;
  const hasValue = valuePoints.length >= 2;
  if (!hasCount && !hasValue) return null;

  const lastCount = hasCount ? countPoints[countPoints.length - 1]!.count : 0;
  const lastValue = hasValue ? valuePoints[valuePoints.length - 1]!.value : 0;
  const countDates = countPoints.map((p) => p.date);
  const valueDates = valuePoints.map((p) => p.date);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold tracking-tight">Trends</h2>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        {hasCount && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Cards owned</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {lastCount.toLocaleString()}
                </p>
              </div>
              <p className="text-[11px] text-muted tabular-nums">
                {startEnd("", countDates)}
              </p>
            </div>
            <CardsOverTimeChart points={countPoints} />
          </div>
        )}
        {hasValue && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Held value</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatPriceCompact(lastValue, priceSource)}
                </p>
              </div>
              <p className="text-[11px] text-muted tabular-nums">
                {startEnd("", valueDates)}
              </p>
            </div>
            <ValueOverTimeChart points={valuePoints} source={priceSource} />
          </div>
        )}
      </div>
    </section>
  );
}
