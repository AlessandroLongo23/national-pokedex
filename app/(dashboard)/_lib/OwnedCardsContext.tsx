"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { CARD_INDEX } from "@/lib/data";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  adjustOwnedQuantity as adjustAction,
  setOwnedQuantity as setQtyAction,
  toggleOwnedCard as toggleAction,
} from "./card-actions";

export interface InitialOwnedCard {
  cardId: string;
  quantity: number;
}

interface OwnedCardsCtx {
  /** Set of owned card-ids (qty > 0). Use for "is this owned?" checks. */
  ownedCards: Set<string>;
  /** Distinct species (dex#) the user has at least one card for. */
  ownedSpecies: Set<number>;
  isOwned: (cardId: string) => boolean;
  isSpeciesOwned: (dex: number) => boolean;
  /** Distinct cards of this species the user owns (variants covered). */
  ownedCountForSpecies: (dex: number) => number;
  /** Quantity of a single card; 0 if not owned. */
  quantityOf: (cardId: string) => number;
  /** Total copies across the whole collection (sum of all quantities). */
  totalCopies: number;
  /** Binary toggle — adds with qty 1 if absent, removes entirely if present. */
  toggle: (cardId: string) => void;
  /** Bump qty by delta. Decrements below 1 remove the row. */
  adjust: (cardId: string, delta: number) => void;
  /** Set an absolute quantity. `qty = 0` removes the card. */
  setQuantity: (cardId: string, qty: number) => void;
  isPending: boolean;
}

const Ctx = createContext<OwnedCardsCtx | null>(null);

// Build a card-id → dex[] map once so deriving species is O(1) per card.
const CARD_TO_DEX: Record<string, number[]> = (() => {
  const m: Record<string, number[]> = {};
  for (const [dexStr, cardIds] of Object.entries(CARD_INDEX)) {
    const dex = Number(dexStr);
    for (const id of cardIds) {
      if (!m[id]) m[id] = [];
      m[id].push(dex);
    }
  }
  return m;
})();

function deriveSpecies(owned: Map<string, number>): Set<number> {
  const species = new Set<number>();
  for (const id of owned.keys()) {
    const dexes = CARD_TO_DEX[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

type OptimisticAction =
  | { kind: "set"; cardId: string; quantity: number }
  | { kind: "delta"; cardId: string; delta: number };

function applyAction(
  state: Map<string, number>,
  action: OptimisticAction,
): Map<string, number> {
  const next = new Map(state);
  if (action.kind === "set") {
    if (action.quantity <= 0) next.delete(action.cardId);
    else next.set(action.cardId, action.quantity);
    return next;
  }
  const current = next.get(action.cardId) ?? 0;
  const updated = current + action.delta;
  if (updated <= 0) next.delete(action.cardId);
  else next.set(action.cardId, updated);
  return next;
}

export function OwnedCardsProvider({
  userId,
  initial,
  children,
}: {
  userId: string;
  initial: InitialOwnedCard[];
  children: React.ReactNode;
}) {
  const [base, setBase] = useState<Map<string, number>>(
    () => new Map(initial.map((r) => [r.cardId, r.quantity])),
  );
  const [optimistic, applyOptimistic] = useOptimistic<
    Map<string, number>,
    OptimisticAction
  >(base, applyAction);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("owned_cards_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "owned_cards",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { card_id: string; quantity?: number };
          const qty = row.quantity ?? 1;
          setBase((prev) => {
            if (prev.get(row.card_id) === qty) return prev;
            const next = new Map(prev);
            next.set(row.card_id, qty);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "owned_cards",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { card_id: string; quantity?: number };
          const qty = row.quantity ?? 1;
          setBase((prev) => {
            if (prev.get(row.card_id) === qty) return prev;
            const next = new Map(prev);
            next.set(row.card_id, qty);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "owned_cards",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const id = (payload.old as { card_id: string }).card_id;
          setBase((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const ownedSet = useMemo(() => new Set(optimistic.keys()), [optimistic]);
  const ownedSpecies = useMemo(() => deriveSpecies(optimistic), [optimistic]);
  const totalCopies = useMemo(() => {
    let n = 0;
    for (const q of optimistic.values()) n += q;
    return n;
  }, [optimistic]);

  const ownedCountForSpecies = useCallback(
    (dex: number) => {
      const ids = CARD_INDEX[dex];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );

  const toggle = useCallback(
    (cardId: string) => {
      const current = base.get(cardId) ?? 0;
      const targetQty = current > 0 ? 0 : 1;
      startTransition(async () => {
        applyOptimistic({ kind: "set", cardId, quantity: targetQty });
        try {
          const { quantity } = await toggleAction(cardId);
          setBase((prev) => {
            const present = prev.get(cardId) ?? 0;
            if (present === quantity) return prev;
            const next = new Map(prev);
            if (quantity <= 0) next.delete(cardId);
            else next.set(cardId, quantity);
            return next;
          });
        } catch (err) {
          console.error("toggleOwnedCard failed", err);
        }
      });
    },
    [applyOptimistic, base],
  );

  const adjust = useCallback(
    (cardId: string, delta: number) => {
      if (delta === 0) return;
      startTransition(async () => {
        applyOptimistic({ kind: "delta", cardId, delta });
        try {
          const { quantity } = await adjustAction(cardId, delta);
          setBase((prev) => {
            const present = prev.get(cardId) ?? 0;
            if (present === quantity) return prev;
            const next = new Map(prev);
            if (quantity <= 0) next.delete(cardId);
            else next.set(cardId, quantity);
            return next;
          });
        } catch (err) {
          console.error("adjustOwnedQuantity failed", err);
        }
      });
    },
    [applyOptimistic],
  );

  const setQuantity = useCallback(
    (cardId: string, qty: number) => {
      const clamped = Math.max(0, Math.floor(qty));
      startTransition(async () => {
        applyOptimistic({ kind: "set", cardId, quantity: clamped });
        try {
          const { quantity } = await setQtyAction(cardId, clamped);
          setBase((prev) => {
            const present = prev.get(cardId) ?? 0;
            if (present === quantity) return prev;
            const next = new Map(prev);
            if (quantity <= 0) next.delete(cardId);
            else next.set(cardId, quantity);
            return next;
          });
        } catch (err) {
          console.error("setOwnedQuantity failed", err);
        }
      });
    },
    [applyOptimistic],
  );

  return (
    <Ctx.Provider
      value={{
        ownedCards: ownedSet,
        ownedSpecies,
        isOwned: (id) => optimistic.has(id),
        isSpeciesOwned: (dex) => ownedSpecies.has(dex),
        ownedCountForSpecies,
        quantityOf: (id) => optimistic.get(id) ?? 0,
        totalCopies,
        toggle,
        adjust,
        setQuantity,
        isPending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOwnedCards() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwnedCards must be inside OwnedCardsProvider");
  return ctx;
}
