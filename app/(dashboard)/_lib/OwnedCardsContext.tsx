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
import { toggleOwnedCard as toggleAction } from "./card-actions";

interface OwnedCardsCtx {
  ownedCards: Set<string>;
  ownedSpecies: Set<number>;
  isOwned: (cardId: string) => boolean;
  isSpeciesOwned: (dex: number) => boolean;
  ownedCountForSpecies: (dex: number) => number;
  toggle: (cardId: string) => void;
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

function deriveSpecies(owned: Set<string>): Set<number> {
  const species = new Set<number>();
  for (const id of owned) {
    const dexes = CARD_TO_DEX[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

export function OwnedCardsProvider({
  userId,
  initial,
  children,
}: {
  userId: string;
  initial: string[];
  children: React.ReactNode;
}) {
  const [base, setBase] = useState<Set<string>>(() => new Set(initial));
  const [optimistic, applyOptimistic] = useOptimistic<Set<string>, string>(
    base,
    (state, cardId) => {
      const next = new Set(state);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    },
  );
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
          const id = (payload.new as { card_id: string }).card_id;
          setBase((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
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
            const next = new Set(prev);
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

  const ownedSpecies = useMemo(() => deriveSpecies(optimistic), [optimistic]);

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
      startTransition(async () => {
        applyOptimistic(cardId);
        try {
          await toggleAction(cardId);
        } catch (err) {
          console.error("toggleOwnedCard failed", err);
        }
      });
    },
    [applyOptimistic],
  );

  return (
    <Ctx.Provider
      value={{
        ownedCards: optimistic,
        ownedSpecies,
        isOwned: (id) => optimistic.has(id),
        isSpeciesOwned: (dex) => ownedSpecies.has(dex),
        ownedCountForSpecies,
        toggle,
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
