"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { MegaForm } from "@/lib/data/types";

/** What the grid is hovering: a base species (by dex) or a Mega/Primal form. */
export type HoverTarget =
  | { kind: "dex"; dex: number }
  | { kind: "mega"; form: MegaForm };

interface HoverState {
  target: HoverTarget;
  anchor: DOMRect;
}

interface HoverCtx {
  state: HoverState | null;
  show: (target: HoverTarget, anchor: DOMRect) => void;
  hide: () => void;
}

const Ctx = createContext<HoverCtx | null>(null);

export function PokemonHoverProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HoverState | null>(null);
  const show = useCallback(
    (target: HoverTarget, anchor: DOMRect) => setState({ target, anchor }),
    [],
  );
  const hide = useCallback(() => setState(null), []);
  return <Ctx.Provider value={{ state, show, hide }}>{children}</Ctx.Provider>;
}

export function usePokemonHover() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePokemonHover must be inside PokemonHoverProvider");
  return ctx;
}
