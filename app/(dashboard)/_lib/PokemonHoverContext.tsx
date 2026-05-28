"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface HoverState {
  dex: number;
  anchor: DOMRect;
}

interface HoverCtx {
  state: HoverState | null;
  show: (dex: number, anchor: DOMRect) => void;
  hide: () => void;
}

const Ctx = createContext<HoverCtx | null>(null);

export function PokemonHoverProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HoverState | null>(null);
  const show = useCallback((dex: number, anchor: DOMRect) => setState({ dex, anchor }), []);
  const hide = useCallback(() => setState(null), []);
  return <Ctx.Provider value={{ state, show, hide }}>{children}</Ctx.Provider>;
}

export function usePokemonHover() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePokemonHover must be inside PokemonHoverProvider");
  return ctx;
}
