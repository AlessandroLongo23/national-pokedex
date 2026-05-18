import Link from "next/link";
import { scopeLabel } from "../binders/_lib/scope-label";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";
import { formatPriceCompact, type PriceSource } from "@/lib/pricing/pokemontcg";

interface Props {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeParams: ScopeParams | Record<string, unknown>;
  ownedCount: number;
  targetCount: number;
  value: number;
  priceSource: PriceSource;
}

export function BinderListCard({
  id,
  name,
  scopeType,
  scopeParams,
  ownedCount,
  targetCount,
  value,
  priceSource,
}: Props) {
  const pct = targetCount > 0 ? (ownedCount / targetCount) * 100 : 0;
  return (
    <Link
      href={`/binders/${id}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-panel p-5 transition hover:border-border-strong"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {scopeLabel(scopeType, scopeParams)}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight">{name}</div>
      <div className="mt-3 flex items-baseline justify-between text-sm nums tabular-nums">
        <span>
          <span className="font-semibold text-owned">{ownedCount}</span>
          <span className="text-muted"> / {targetCount}</span>
        </span>
        <span className="text-xs text-muted">
          {targetCount === 0 ? "Empty" : `${pct.toFixed(1)}%`}
        </span>
      </div>
      {value > 0 && (
        <div className="mt-1 text-xs text-muted tabular-nums">
          Value{" "}
          <span className="font-medium text-text">
            {formatPriceCompact(value, priceSource)}
          </span>
        </div>
      )}
      <div className="absolute right-0 bottom-0 left-0 h-1 bg-panel-2">
        <div
          className="h-full bg-owned transition-[width] duration-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </Link>
  );
}
