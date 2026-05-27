"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toggleFavoriteCard as toggleAction } from "./favorite-actions";

interface FavoritesCtx {
  favorites: Set<string>;
  isFavorited: (cardId: string) => boolean;
  toggle: (cardId: string) => void;
  isPending: boolean;
}

const Ctx = createContext<FavoritesCtx | null>(null);

export function FavoritesProvider({
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
    if (!userId) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("user_favorites_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_favorites",
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
          table: "user_favorites",
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

  const toggle = useCallback(
    (cardId: string) => {
      if (!userId) return;
      startTransition(async () => {
        applyOptimistic(cardId);
        try {
          const { favorited } = await toggleAction(cardId);
          // Feed the authoritative result back into `base` so when the
          // transition ends `useOptimistic` resets to the new value instead
          // of the pre-click value (and we don't have to wait on the
          // realtime echo to avoid a flicker).
          setBase((prev) => {
            if (favorited === prev.has(cardId)) return prev;
            const next = new Set(prev);
            if (favorited) next.add(cardId);
            else next.delete(cardId);
            return next;
          });
        } catch (err) {
          console.error("toggleFavoriteCard failed", err);
        }
      });
    },
    [applyOptimistic, userId],
  );

  return (
    <Ctx.Provider
      value={{
        favorites: optimistic,
        isFavorited: (id) => optimistic.has(id),
        toggle,
        isPending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites must be inside FavoritesProvider");
  return ctx;
}
