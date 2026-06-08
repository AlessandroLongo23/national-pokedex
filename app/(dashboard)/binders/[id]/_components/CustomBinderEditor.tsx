"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SETS } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { CardGrid } from "../../../_components/CardGrid";
import {
  addCardToCustomBinder,
  removeCardFromCustomBinder,
} from "../../../_lib/binder-actions";

interface Props {
  binderId: string;
  initialIds: string[];
  onChange?: () => void;
}

export function CustomBinderEditor({ binderId, initialIds, onChange }: Props) {
  const [setId, setSetId] = useState<string>("");
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic membership — single source of truth for what's in the binder.
  const [present, setPresent] = useState<Set<string>>(() => new Set(initialIds));
  const [, start] = useTransition();

  // Sync if parent re-renders with new initialIds (e.g. after router.refresh).
  useEffect(() => {
    setPresent(new Set(initialIds));
  }, [initialIds]);

  useEffect(() => {
    if (!setId) {
      setCards(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cards-by-set/${setId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as CardEntry[];
      })
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load cards");
          setCards(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const sortedSets = useMemo(
    () => [...SETS].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
    [],
  );

  function toggle(cardId: string) {
    const wasIn = present.has(cardId);
    const next = new Set(present);
    if (wasIn) next.delete(cardId);
    else next.add(cardId);
    setPresent(next);

    start(async () => {
      try {
        if (wasIn) await removeCardFromCustomBinder(binderId, cardId);
        else await addCardToCustomBinder(binderId, cardId);
        onChange?.();
      } catch (err) {
        // Roll back optimistic update on failure.
        setPresent((prev) => {
          const rb = new Set(prev);
          if (wasIn) rb.add(cardId);
          else rb.delete(cardId);
          return rb;
        });
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-3">
        <label className="flex-1 space-y-1 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Filter to a set, then click cards to add or remove
          </span>
          <select
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
          >
            <option value="">Choose a set…</option>
            {sortedSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.series})
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-muted">
          In binder: <span className="font-semibold text-text">{present.size}</span>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-missing/40 bg-missing/10 px-3 py-2 text-sm text-missing">
          {error}
        </p>
      )}

      {!setId ? (
        <p className="text-sm text-muted">Pick a set to see its cards.</p>
      ) : loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : cards && cards.length > 0 ? (
        <CardGrid
          cards={cards}
          storageKey={`binder-edit-${binderId}`}
          initialSort="number"
          selectMode
          selected={present}
          onSelect={toggle}
          hideActions
        />
      ) : (
        <p className="text-sm text-muted">No cards found for this set.</p>
      )}
    </section>
  );
}
