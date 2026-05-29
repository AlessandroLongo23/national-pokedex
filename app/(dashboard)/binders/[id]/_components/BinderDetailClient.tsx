"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Notebook } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import { MEGAS } from "@/lib/data";
import {
  ownedCardsByDex,
  pickDisplayCardId,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import { PageHeader } from "../../../_components/PageHeader";
import { CardGrid } from "../../../_components/CardGrid";
import { CardRail } from "../../../_components/CardRail";
import { PokedexGrid } from "../../../_components/PokedexGrid";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { useUser } from "../../../_lib/UserContext";
import { scopeLabel } from "../../_lib/scope-label";
import {
  clearBinderCellOverride,
  deleteBinder,
  renameBinder,
  setBinderCellOverride,
} from "../../../_lib/binder-actions";
import { CustomBinderEditor } from "./CustomBinderEditor";
import { BinderCellPicker } from "./BinderCellPicker";
import {
  CardPricesProvider,
  type CardPriceRecord,
} from "../../../_lib/CardPricesContext";
import { formatPriceCompact, type PriceSource } from "@/lib/pricing/pokemontcg";

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
  recentAdditions: CardEntry[];
  cellOverrides: Record<number, string>;
  value: number;
  pricedCount: number;
  ownedPricedTotal: number;
  priceSource: PriceSource;
  prices: CardPriceRecord;
}

export function BinderDetailClient({
  binder,
  cards,
  customCardIds,
  recentAdditions,
  cellOverrides,
  value,
  pricedCount,
  ownedPricedTotal,
  priceSource,
  prices,
}: Props) {
  const router = useRouter();
  const { ownedCards, ownedSpecies, ownedMegaForms } = useOwnedCards();
  const { treatMegasAsSeparate, megaPlacement, display } = useUser();
  const includeMegasInBinder =
    treatMegasAsSeparate && megaPlacement !== "separate";
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

  // Megas that belong to this pokedex-binder's range (only when the toggle
  // is on AND placement is not "separate").
  const megasInRange = useMemo(() => {
    if (!isPokedex || !dexRange || !includeMegasInBinder) return [];
    return MEGAS.filter((m) => m.baseDex >= dexRange.from && m.baseDex <= dexRange.to);
  }, [isPokedex, dexRange, includeMegasInBinder]);

  const total = isPokedex
    ? (dexRange?.nums.length ?? 0) + megasInRange.length
    : cards.length;
  const ownedCount = useMemo(() => {
    if (isPokedex && dexRange) {
      let n = 0;
      for (const d of dexRange.nums) if (ownedSpecies.has(d)) n++;
      for (const m of megasInRange) if (ownedMegaForms.has(m.formKey)) n++;
      return n;
    }
    return cards.reduce((acc, c) => acc + (ownedCards.has(c.id) ? 1 : 0), 0);
  }, [isPokedex, dexRange, ownedSpecies, megasInRange, ownedMegaForms, cards, ownedCards]);
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

  // Optimistic override state — initialized from server, updated locally.
  const [overrides, setOverrides] = useState<Record<number, string>>(cellOverrides);
  useEffect(() => {
    setOverrides(cellOverrides);
  }, [cellOverrides]);

  const [pickerDex, setPickerDex] = useState<number | null>(null);

  // Map: dex# -> all cards in this binder that include that dex (for the picker modal).
  const variantsByDex = useMemo<Map<number, CardEntry[]>>(() => {
    if (!isPokedex || !dexRange) return new Map();
    const m = new Map<number, CardEntry[]>();
    for (const c of cards) {
      for (const d of c.dex) {
        if (d < dexRange.from || d > dexRange.to) continue;
        const arr = m.get(d);
        if (arr) arr.push(c);
        else m.set(d, [c]);
      }
    }
    return m;
  }, [isPokedex, dexRange, cards]);

  const ownedByDex = useMemo<Map<number, CardEntry[]>>(() => {
    if (!isPokedex) return new Map();
    return ownedCardsByDex(cards, ownedCards);
  }, [isPokedex, cards, ownedCards]);

  const displayCardByDex = useMemo<Map<number, CardEntry>>(() => {
    if (!isPokedex || !dexRange) return new Map();
    const byId = new Map(cards.map((c) => [c.id, c]));
    const out = new Map<number, CardEntry>();
    for (const d of dexRange.nums) {
      const ownedForDex = ownedByDex.get(d) ?? [];
      // When the toggle is on, Mega cards must not represent a base dex slot.
      // Stale overrides pointing at a Mega card fall through to the rarity
      // fallback (no DB cleanup needed — flipping the toggle off restores).
      const cardId = pickDisplayCardId(overrides[d], ownedForDex, treatMegasAsSeparate);
      if (cardId) {
        const card = byId.get(cardId);
        if (card) out.set(d, card);
      }
    }
    return out;
  }, [isPokedex, dexRange, cards, ownedByDex, overrides, treatMegasAsSeparate]);

  function onPickCard(cardId: string) {
    if (pickerDex == null) return;
    const dex = pickerDex;
    const prev = overrides[dex];
    setOverrides((o) => ({ ...o, [dex]: cardId }));
    start(async () => {
      try {
        await setBinderCellOverride(binder.id, dex, cardId);
      } catch (err) {
        setOverrides((o) => {
          const next = { ...o };
          if (prev == null) delete next[dex];
          else next[dex] = prev;
          return next;
        });
        setError(err instanceof Error ? err.message : "Failed to set display card");
      }
    });
  }

  function onClearPick() {
    if (pickerDex == null) return;
    const dex = pickerDex;
    const prev = overrides[dex];
    if (prev == null) return;
    setOverrides((o) => {
      const next = { ...o };
      delete next[dex];
      return next;
    });
    start(async () => {
      try {
        await clearBinderCellOverride(binder.id, dex);
      } catch (err) {
        setOverrides((o) => ({ ...o, [dex]: prev }));
        setError(err instanceof Error ? err.message : "Failed to clear choice");
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        icon={Notebook}
        mobileTitle={binder.name}
        subtitle={scopeLabel(binder.scopeType, binder.scopeParams)}
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
        actions={
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
            {ownedPricedTotal > 0 && (
              <div className="mt-1 flex items-baseline justify-between text-[11px]">
                <span className="uppercase tracking-wider text-muted">Value</span>
                <span
                  className="tabular-nums"
                  title={`${pricedCount.toLocaleString()} of ${ownedPricedTotal.toLocaleString()} owned cards priced`}
                >
                  <span className="font-semibold text-text">
                    {formatPriceCompact(value, priceSource, display)}
                  </span>
                  {pricedCount < ownedPricedTotal && (
                    <span className="ml-1 text-muted">
                      ({pricedCount}/{ownedPricedTotal})
                    </span>
                  )}
                </span>
              </div>
            )}
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

      <CardPricesProvider prices={prices}>
        {isCustom && editing && (
          <CustomBinderEditor
            binderId={binder.id}
            initialIds={customCardIds}
            onChange={() => router.refresh()}
          />
        )}

        {!isPokedex && (
          <CardRail
            title="Recent additions"
            subtitle="Your latest acquisitions in this binder"
            cards={recentAdditions}
            emptyMessage="No cards in this binder owned yet — they'll appear here as you acquire them."
            rail="recent-additions"
          />
        )}

        {isPokedex && dexRange ? (
          <>
            <PokedexGrid
              dexNumbers={dexRange.nums}
              groupByGenDefault={dexRange.to - dexRange.from + 1 > 200}
              storageKey={`binder-${binder.id}`}
              displayCardByDex={displayCardByDex}
              onCellClick={(dex) => setPickerDex(dex)}
            />
            <BinderCellPicker
              binderId={binder.id}
              dex={pickerDex}
              variants={pickerDex != null ? (variantsByDex.get(pickerDex) ?? []) : []}
              currentOverride={pickerDex != null ? overrides[pickerDex] : undefined}
              displayedCardId={
                pickerDex != null ? (displayCardByDex.get(pickerDex)?.id ?? null) : null
              }
              onSetOverride={onPickCard}
              onClearOverride={onClearPick}
              onClose={() => setPickerDex(null)}
            />
          </>
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
      </CardPricesProvider>
    </div>
  );
}
