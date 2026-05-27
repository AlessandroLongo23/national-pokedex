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
import { toggleWishlistCard as toggleAction } from "./card-actions";

interface WishlistCtx {
  wishlist: Set<string>;
  isWishlisted: (cardId: string) => boolean;
  toggle: (cardId: string) => void;
  isPending: boolean;
}

const Ctx = createContext<WishlistCtx | null>(null);

export function WishlistProvider({
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
      .channel("wishlist_cards_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wishlist_cards",
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
          table: "wishlist_cards",
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
          const { wishlisted } = await toggleAction(cardId);
          setBase((prev) => {
            if (wishlisted === prev.has(cardId)) return prev;
            const next = new Set(prev);
            if (wishlisted) next.add(cardId);
            else next.delete(cardId);
            return next;
          });
        } catch (err) {
          console.error("toggleWishlistCard failed", err);
        }
      });
    },
    [applyOptimistic, userId],
  );

  return (
    <Ctx.Provider
      value={{
        wishlist: optimistic,
        isWishlisted: (id) => optimistic.has(id),
        toggle,
        isPending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWishlist must be inside WishlistProvider");
  return ctx;
}
