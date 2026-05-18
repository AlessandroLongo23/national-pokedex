"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { CardEntry } from "@/lib/data/types";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";
import { PageHeader } from "../../../_components/PageHeader";
import { CardGrid } from "../../../_components/CardGrid";
import { PokedexGrid } from "../../../_components/PokedexGrid";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { scopeLabel } from "../../_lib/scope-label";
import { deleteBinder, renameBinder } from "../../../_lib/binder-actions";
import { CustomBinderEditor } from "./CustomBinderEditor";

interface BinderSummary {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeParams: ScopeParams | Record<string, unknown>;
}

interface Props {
  binder: BinderSummary;
  cards: CardEntry[];
  customCardIds: string[];
}

export function BinderDetailClient({ binder, cards, customCardIds }: Props) {
  const router = useRouter();
  const { ownedCards, ownedSpecies } = useOwnedCards();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(binder.name);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPokedex = binder.scopeType === "pokedex";
  const dexRange = useMemo<{ from: number; to: number; nums: number[] } | null>(() => {
    if (!isPokedex) return null;
    const p = binder.scopeParams as { dexFrom?: number; dexTo?: number };
    const from = Math.min(p.dexFrom ?? 0, p.dexTo ?? 0);
    const to = Math.max(p.dexFrom ?? 0, p.dexTo ?? 0);
    const nums: number[] = [];
    for (let d = from; d <= to; d++) nums.push(d);
    return { from, to, nums };
  }, [isPokedex, binder.scopeParams]);

  const total = isPokedex ? (dexRange?.nums.length ?? 0) : cards.length;
  const ownedCount = useMemo(() => {
    if (isPokedex && dexRange) {
      let n = 0;
      for (const d of dexRange.nums) if (ownedSpecies.has(d)) n++;
      return n;
    }
    return cards.reduce((acc, c) => acc + (ownedCards.has(c.id) ? 1 : 0), 0);
  }, [isPokedex, dexRange, ownedSpecies, cards, ownedCards]);
  const pct = total > 0 ? (ownedCount / total) * 100 : 0;

  function commitRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === binder.name) {
      setRenaming(false);
      setNameDraft(binder.name);
      return;
    }
    setError(null);
    start(async () => {
      try {
        await renameBinder(binder.id, trimmed);
        setRenaming(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed");
      }
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete "${binder.name}"? This can't be undone.`)) return;
    setError(null);
    start(async () => {
      try {
        await deleteBinder(binder.id);
        router.push("/binders");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  const isCustom = binder.scopeType === "custom";
  const scopeBroken = !isCustom && !isPokedex && total === 0;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow={scopeLabel(binder.scopeType, binder.scopeParams)}
        title={
          renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setNameDraft(binder.name);
                }
              }}
              className="rounded-md border border-border bg-panel-2 px-2 py-1 text-2xl font-bold tracking-tight md:text-3xl"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="text-left hover:text-muted"
              aria-label="Rename binder"
            >
              {binder.name}
            </button>
          )
        }
        right={
          <div className="flex w-[260px] flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="uppercase tracking-wider text-muted">Progress</span>
              <span className="nums tabular-nums">
                <span className="font-semibold text-owned">{ownedCount}</span>
                <span className="text-muted"> / {total}</span>
                <span className="ml-1.5 text-muted">({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="relative h-1 overflow-hidden rounded-full bg-border">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-owned transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-end gap-2 text-xs">
              {isCustom && (
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="rounded border border-border bg-panel px-2 py-0.5 hover:border-border-strong"
                >
                  {editing ? "Done editing" : "Add cards"}
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="rounded border border-missing/40 bg-panel px-2 py-0.5 text-missing hover:border-missing/70 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        }
      />

      {scopeBroken && (
        <div className="rounded-md border border-missing/40 bg-missing/10 p-3 text-sm text-missing">
          This binder{"'"}s scope no longer matches any cards in the catalog. The set or value
          may have been renamed or removed.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-missing/40 bg-missing/10 p-3 text-sm text-missing">
          {error}
        </div>
      )}

      {isCustom && editing && (
        <CustomBinderEditor
          binderId={binder.id}
          initialIds={customCardIds}
          onChange={() => router.refresh()}
        />
      )}

      {isPokedex && dexRange ? (
        <PokedexGrid
          dexNumbers={dexRange.nums}
          groupByGenDefault={dexRange.to - dexRange.from + 1 > 200}
          storageKey={`binder-${binder.id}`}
        />
      ) : cards.length === 0 && !scopeBroken ? (
        <div className="rounded-lg border border-border bg-panel p-8 text-sm text-muted">
          {isCustom
            ? "No cards yet. Click \"Add cards\" above to start filling this binder."
            : "No cards match this scope."}
        </div>
      ) : (
        <CardGrid
          cards={cards}
          storageKey={`binder-${binder.id}`}
          initialSort="number"
        />
      )}
    </div>
  );
}
