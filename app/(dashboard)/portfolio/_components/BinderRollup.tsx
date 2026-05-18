import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { scopeLabel } from "../../binders/_lib/scope-label";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";
import {
  formatPriceCompact,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

export interface BinderRollupRow {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeParams: ScopeParams | Record<string, unknown>;
  ownedCount: number;
  targetCount: number;
  value: number;
}

interface Props {
  rows: BinderRollupRow[];
  priceSource: PriceSource;
  totalValue: number;
}

// Per-binder roll-up — the page's reason for existing on the binder-first
// model. Renders as a table-like list: rows are dense, scannable, and
// scoped to a single visual unit (no nested cards). A tiny inline meter
// trails the value so progress and value land in the same glance.
//
// Rows are sorted by value descending — the question this answers is
// "which binders carry most of my collection's worth?", so the highest
// values go first.
export function BinderRollup({ rows, priceSource, totalValue }: Props) {
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">By binder</h2>
        </header>
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-xs text-muted">
          You don{"'"}t have any binders yet.{" "}
          <Link href="/binders/new" className="text-accent hover:underline">
            Create one
          </Link>{" "}
          to see how your value breaks down.
        </p>
      </section>
    );
  }

  const sorted = [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">By binder</h2>
        <Link
          href="/binders"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          All binders
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>
      <div className="overflow-hidden rounded-md border border-border">
        <ul className="divide-y divide-border">
          {sorted.map((b) => {
            const pct = b.targetCount > 0 ? (b.ownedCount / b.targetCount) * 100 : 0;
            const valueShare = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
            return (
              <li key={b.id}>
                <Link
                  href={`/binders/${b.id}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-panel md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text group-hover:text-accent">
                      {b.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">
                      {scopeLabel(b.scopeType, b.scopeParams)}
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center gap-3 text-xs tabular-nums md:col-span-1 md:col-start-2">
                    <span className="text-muted">
                      <span className="font-medium text-text">
                        {b.ownedCount.toLocaleString()}
                      </span>
                      {" / "}
                      {b.targetCount.toLocaleString()}
                    </span>
                    <div
                      className="relative h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-border"
                      aria-hidden
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-owned"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span
                      className="w-10 text-right text-muted"
                      title={`${pct.toFixed(1)}% complete`}
                    >
                      {b.targetCount === 0 ? "—" : `${Math.round(pct)}%`}
                    </span>
                  </div>

                  <div
                    className="col-start-2 row-start-1 text-right md:col-start-3 md:row-start-1"
                    title={
                      totalValue > 0
                        ? `${valueShare.toFixed(1)}% of total portfolio value`
                        : undefined
                    }
                  >
                    <div className="text-sm font-medium tabular-nums">
                      {formatPriceCompact(b.value, priceSource)}
                    </div>
                    {totalValue > 0 && b.value > 0 && (
                      <div className="text-[11px] text-muted tabular-nums">
                        {valueShare.toFixed(0)}%
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
