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

// Loose comparison for the binder-name / scope-label duplication check:
// users commonly name a binder identically to its auto-label (and sometimes
// with a period where the auto-label has a middle dot). Both should
// collapse the subtitle.
function normalizeNameKey(s: string): string {
  return s.toLowerCase().replace(/[·.]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns the trailing `(…)` of the scope label when the rest of the label
// matches the binder name (e.g. name="Pokédex · National",
// label="Pokédex · National (#1–1025)" → "(#1–1025)"). Lets the row append
// only the differentiating tail to the name instead of repeating the whole
// label underneath.
function trailingDifferentiator(name: string, label: string): string | null {
  const m = label.match(/^(.*?)(\s*\([^)]+\))\s*$/);
  if (!m) return null;
  if (normalizeNameKey(m[1]!) !== normalizeNameKey(name)) return null;
  return m[2]!.trim();
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
          <h2 className="eyebrow">By binder</h2>
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
        <h2 className="eyebrow">By binder</h2>
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
            const label = scopeLabel(b.scopeType, b.scopeParams);
            const labelKey = normalizeNameKey(label);
            const nameKey = normalizeNameKey(b.name);
            const tail = trailingDifferentiator(b.name, label);
            const showSubtitle = labelKey !== nameKey && tail === null;
            // Only print the value-share when the portfolio is meaningfully
            // split. One binder holding all of the value doesn't need a
            // "100% of total" tag below it — that's the absence of the rest.
            const showValueShare =
              totalValue > 0 && b.value > 0 && valueShare < 99;
            return (
              <li key={b.id}>
                <Link
                  href={`/binders/${b.id}`}
                  aria-label={`${b.name}, ${b.ownedCount.toLocaleString()} of ${b.targetCount.toLocaleString()} owned, value ${formatPriceCompact(b.value, priceSource)}${
                    totalValue > 0 && b.value > 0
                      ? ` (${valueShare.toFixed(0)}% of total)`
                      : ""
                  }`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-panel md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text group-hover:text-accent">
                      {b.name}
                      {tail && (
                        <span className="ml-1.5 font-normal text-muted">
                          {tail}
                        </span>
                      )}
                    </div>
                    {showSubtitle && (
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {label}
                      </div>
                    )}
                  </div>

                  <div
                    className="col-span-2 flex items-center gap-3 text-xs tabular-nums md:col-span-1 md:col-start-2"
                    aria-hidden
                  >
                    <span className="text-muted">
                      <span className="font-medium text-text">
                        {b.ownedCount.toLocaleString()}
                      </span>
                      {" / "}
                      {b.targetCount.toLocaleString()}
                    </span>
                    <div className="relative h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-owned"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  <div
                    className="col-start-2 row-start-1 text-right md:col-start-3 md:row-start-1"
                    aria-hidden
                  >
                    <div className="text-sm font-medium tabular-nums">
                      {formatPriceCompact(b.value, priceSource)}
                    </div>
                    {showValueShare && (
                      <div className="text-[10px] text-muted tabular-nums">
                        {valueShare.toFixed(0)}% of total
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
