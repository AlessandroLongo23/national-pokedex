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
import { CARD_INDEX, CARD_INDEX_BY_MEGA, CARD_INDEX_BY_VARIANT } from "@/lib/data";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  adjustOwnedQuantity as adjustAction,
  setOwnedQuantity as setQtyAction,
  toggleOwnedCard as toggleAction,
} from "./card-actions";
import { useUser } from "./UserContext";

export interface InitialOwnedCard {
  cardId: string;
  quantity: number;
}

interface OwnedCardsCtx {
  /** Set of owned card-ids (qty > 0). Use for "is this owned?" checks. */
  ownedCards: Set<string>;
  /** Distinct species (dex#) the user has at least one card for. When the
   * `treat_megas_as_separate` preference is on, cards with a megaFormKey
   * are excluded — they contribute to `ownedMegaForms` instead. */
  ownedSpecies: Set<number>;
  /** Distinct Mega form keys the user owns at least one card for. Always
   * derived, regardless of the toggle, so consumers can query it. */
  ownedMegaForms: Set<string>;
  /** Distinct regional-variant keys the user owns at least one card for.
   * Always derived, regardless of the toggle, so consumers can query it. */
  ownedVariantForms: Set<string>;
  isOwned: (cardId: string) => boolean;
  isSpeciesOwned: (dex: number) => boolean;
  isMegaFormOwned: (formKey: string) => boolean;
  isVariantFormOwned: (variantKey: string) => boolean;
  /** Distinct cards of this species the user owns (variants covered). */
  ownedCountForSpecies: (dex: number) => number;
  ownedCountForMegaForm: (formKey: string) => number;
  ownedCountForVariantForm: (variantKey: string) => number;
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

// card-id → mega formKey, populated only for cards that resolve to a known
// single-Pokémon Mega/Primal form. Tag-team Megas (names containing " & ")
// are absent here — they keep contributing to dex# regardless of the toggle.
const CARD_TO_MEGA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [formKey, cardIds] of Object.entries(CARD_INDEX_BY_MEGA)) {
    for (const id of cardIds) m[id] = formKey;
  }
  return m;
})();

// card-id → variant variantKey, populated only for cards that resolved to a
// true regional variant (region-exclusive region-prefixed cards are absent and
// keep contributing to dex# regardless of the toggle).
const CARD_TO_VARIANT: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [variantKey, cardIds] of Object.entries(CARD_INDEX_BY_VARIANT)) {
    for (const id of cardIds) m[id] = variantKey;
  }
  return m;
})();

/** Pure species derivation with injectable maps so it is unit-testable
 * without the committed indexes. `deriveSpecies` delegates to it. */
export function computeSpecies(
  owned: Map<string, number>,
  opts: {
    cardToDex: Record<string, number[]>;
    cardToMega: Record<string, string>;
    cardToVariant: Record<string, string>;
    treatMegasAsSeparate: boolean;
    treatVariantsAsSeparate: boolean;
  },
): Set<number> {
  const species = new Set<number>();
  for (const id of owned.keys()) {
    if (opts.treatMegasAsSeparate && opts.cardToMega[id]) continue;
    if (opts.treatVariantsAsSeparate && opts.cardToVariant[id]) continue;
    const dexes = opts.cardToDex[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

function deriveSpecies(
  owned: Map<string, number>,
  treatMegasAsSeparate: boolean,
  treatVariantsAsSeparate: boolean,
): Set<number> {
  return computeSpecies(owned, {
    cardToDex: CARD_TO_DEX,
    cardToMega: CARD_TO_MEGA,
    cardToVariant: CARD_TO_VARIANT,
    treatMegasAsSeparate,
    treatVariantsAsSeparate,
  });
}

function deriveMegaForms(owned: Map<string, number>): Set<string> {
  const forms = new Set<string>();
  for (const id of owned.keys()) {
    const key = CARD_TO_MEGA[id];
    if (key) forms.add(key);
  }
  return forms;
}

function deriveVariantForms(owned: Map<string, number>): Set<string> {
  const forms = new Set<string>();
  for (const id of owned.keys()) {
    const key = CARD_TO_VARIANT[id];
    if (key) forms.add(key);
  }
  return forms;
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
  const { treatMegasAsSeparate, treatVariantsAsSeparate } = useUser();
  const [base, setBase] = useState<Map<string, number>>(
    () => new Map(initial.map((r) => [r.cardId, r.quantity])),
  );
  const [optimistic, applyOptimistic] = useOptimistic<
    Map<string, number>,
    OptimisticAction
  >(base, applyAction);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!userId) return;
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
  const ownedSpecies = useMemo(
    () => deriveSpecies(optimistic, treatMegasAsSeparate, treatVariantsAsSeparate),
    [optimistic, treatMegasAsSeparate, treatVariantsAsSeparate],
  );
  const ownedMegaForms = useMemo(() => deriveMegaForms(optimistic), [optimistic]);
  const ownedVariantForms = useMemo(() => deriveVariantForms(optimistic), [optimistic]);
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
      for (const id of ids) {
        if (!optimistic.has(id)) continue;
        if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
        if (treatVariantsAsSeparate && CARD_TO_VARIANT[id]) continue;
        n++;
      }
      return n;
    },
    [optimistic, treatMegasAsSeparate, treatVariantsAsSeparate],
  );

  const ownedCountForMegaForm = useCallback(
    (formKey: string) => {
      const ids = CARD_INDEX_BY_MEGA[formKey];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );

  const ownedCountForVariantForm = useCallback(
    (variantKey: string) => {
      const ids = CARD_INDEX_BY_VARIANT[variantKey];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );

  const toggle = useCallback(
    (cardId: string) => {
      if (!userId) return;
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
    [applyOptimistic, base, userId],
  );

  const adjust = useCallback(
    (cardId: string, delta: number) => {
      if (!userId) return;
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
    [applyOptimistic, userId],
  );

  const setQuantity = useCallback(
    (cardId: string, qty: number) => {
      if (!userId) return;
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
    [applyOptimistic, userId],
  );

  return (
    <Ctx.Provider
      value={{
        ownedCards: ownedSet,
        ownedSpecies,
        ownedMegaForms,
        ownedVariantForms,
        isOwned: (id) => optimistic.has(id),
        isSpeciesOwned: (dex) => ownedSpecies.has(dex),
        isMegaFormOwned: (formKey) => ownedMegaForms.has(formKey),
        isVariantFormOwned: (variantKey) => ownedVariantForms.has(variantKey),
        ownedCountForSpecies,
        ownedCountForMegaForm,
        ownedCountForVariantForm,
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
