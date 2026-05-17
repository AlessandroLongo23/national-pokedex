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
import { toggleOwned as toggleOwnedAction } from "./actions";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { DEV_USER_ID } from "./dev";

interface OwnedCtx {
  owned: Set<number>;
  isOwned: (dex: number) => boolean;
  toggle: (dex: number) => void;
  isPending: boolean;
}

const Ctx = createContext<OwnedCtx | null>(null);

export function OwnedProvider({
  initial,
  children,
}: {
  initial: number[];
  children: React.ReactNode;
}) {
  const [base, setBase] = useState<Set<number>>(() => new Set(initial));
  const [optimistic, applyOptimistic] = useOptimistic<Set<number>, number>(
    base,
    (state, dex) => {
      const next = new Set(state);
      if (next.has(dex)) next.delete(dex);
      else next.add(dex);
      return next;
    },
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("owned_pokemon_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "owned_pokemon",
          filter: `user_id=eq.${DEV_USER_ID}`,
        },
        (payload) => {
          const dex = (payload.new as { dex_number: number }).dex_number;
          setBase((prev) => {
            if (prev.has(dex)) return prev;
            const next = new Set(prev);
            next.add(dex);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "owned_pokemon",
          filter: `user_id=eq.${DEV_USER_ID}`,
        },
        (payload) => {
          const dex = (payload.old as { dex_number: number }).dex_number;
          setBase((prev) => {
            if (!prev.has(dex)) return prev;
            const next = new Set(prev);
            next.delete(dex);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggle = useCallback(
    (dex: number) => {
      startTransition(async () => {
        applyOptimistic(dex);
        try {
          await toggleOwnedAction(dex);
        } catch (err) {
          console.error("toggleOwned failed", err);
        }
      });
    },
    [applyOptimistic],
  );

  return (
    <Ctx.Provider
      value={{
        owned: optimistic,
        isOwned: (dex) => optimistic.has(dex),
        toggle,
        isPending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOwned() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwned must be inside OwnedProvider");
  return ctx;
}
