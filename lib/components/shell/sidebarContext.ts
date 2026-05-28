"use client";

import { createContext, useContext } from "react";

export type SidebarCollapseValue = {
  collapsed: boolean;
  toggle: () => void;
  hydrated: boolean;
};

export const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

export function useSidebarCollapseContext(): SidebarCollapseValue {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error("useSidebarCollapseContext must be used inside <AppShell>");
  }
  return ctx;
}

export type MobileMenuValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const MobileMenuContext = createContext<MobileMenuValue | null>(null);

export function useMobileMenu(): MobileMenuValue {
  const ctx = useContext(MobileMenuContext);
  if (!ctx) {
    throw new Error("useMobileMenu must be used inside <AppShell>");
  }
  return ctx;
}

// In the mobile drawer, force full labels regardless of the user's
// collapse preference.
export const SidebarForceExpandedContext = createContext<boolean>(false);

export function useSidebarForceExpanded(): boolean {
  return useContext(SidebarForceExpandedContext);
}
