"use client";

import { createContext, useContext, type RefObject } from "react";

/**
 * A ref to the dashboard's scrolling panel — the element AppShell scrolls in
 * document-scroll mode (every route NOT in `VIEWPORT_FIT_ROUTES`).
 *
 * Virtualized grids read this so they can virtualize against the page's own
 * scroll instead of owning a nested `overflow-y-auto` box. That's what lets the
 * page title scroll away while the filter toolbar stays pinned: title, toolbar
 * and rows all live in one scroll region.
 *
 * `null` when used outside AppShell (e.g. an embedded grid) — consumers fall
 * back to their own scroll container.
 */
export const ScrollAreaContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useScrollArea() {
  return useContext(ScrollAreaContext);
}
