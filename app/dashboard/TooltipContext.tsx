"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface TooltipState {
  dex: number;
  anchor: DOMRect;
}

interface TooltipCtx {
  state: TooltipState | null;
  show: (dex: number, anchor: DOMRect) => void;
  hide: () => void;
}

const Ctx = createContext<TooltipCtx | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null);
  const show = useCallback((dex: number, anchor: DOMRect) => setState({ dex, anchor }), []);
  const hide = useCallback(() => setState(null), []);
  return <Ctx.Provider value={{ state, show, hide }}>{children}</Ctx.Provider>;
}

export function useTooltip() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTooltip must be inside TooltipProvider");
  return ctx;
}
