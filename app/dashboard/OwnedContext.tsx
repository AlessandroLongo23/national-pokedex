"use client";

import { createContext, useCallback, useContext, useOptimistic, useTransition } from "react";
import { toggleOwned as toggleOwnedAction } from "./actions";

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
  const [optimistic, applyOptimistic] = useOptimistic<Set<number>, number>(
    new Set(initial),
    (state, dex) => {
      const next = new Set(state);
      if (next.has(dex)) next.delete(dex);
      else next.add(dex);
      return next;
    },
  );
  const [isPending, startTransition] = useTransition();

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
