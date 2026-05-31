import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { scopeLabel } from "../../binders/_lib/scope-label";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";

export interface BinderWidgetRow {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeParams: ScopeParams | Record<string, unknown>;
  ownedCount: number;
  targetCount: number;
}

interface Props {
  binders: BinderWidgetRow[];
}

// A quick link into the binders area: the top few binders as compact
// rows (name, scope, owned/target + a thin progress bar) inside a single
// panel. Each row links to its binder; the header links to the full list.
// Kept as plain rows rather than reusing BinderListCard so the tile reads
// as one unit instead of nested cards.
export function BindersWidget({ binders }: Props) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-panel p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">Binders</h3>
        <Link
          href="/binders"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          View all
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {binders.length === 0 ? (
        <Link
          href="/binders"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-6 text-xs text-muted transition hover:border-border-strong hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Create your first binder
        </Link>
      ) : (
        <ul className="mt-2 -mx-2">
          {binders.map((b) => {
            const pct = b.targetCount > 0 ? (b.ownedCount / b.targetCount) * 100 : 0;
            return (
              <li key={b.id}>
                <Link
                  href={`/binders/${b.id}`}
                  className="group block rounded-md px-2 py-2 transition hover:bg-panel-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{b.name}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="font-semibold text-owned">{b.ownedCount}</span>
                      <span className="text-muted"> / {b.targetCount}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="truncate text-[11px] uppercase tracking-wider text-muted">
                      {scopeLabel(b.scopeType, b.scopeParams)}
                    </span>
                    <div className="ml-auto h-1 w-20 shrink-0 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full bg-owned"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
