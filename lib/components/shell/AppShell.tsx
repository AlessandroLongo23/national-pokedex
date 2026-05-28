"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useSidebarCollapse } from "./useSidebarCollapse";
import {
  SidebarCollapseContext,
  MobileMenuContext,
  SidebarForceExpandedContext,
} from "./sidebarContext";
import { SidebarEdgeToggle } from "./SidebarCollapseToggle";
import { SidebarShortcutHint } from "./SidebarShortcutHint";
import { Button } from "@/lib/components/ui/Button";

// Pages that fit the viewport exactly — typically tables that own their own
// internal scroll so rows fit the viewport and pagination stays pinned.
const VIEWPORT_FIT_ROUTES = new Set([
  "/pokedex",
  "/megas",
  "/sets",
  "/cards",
  "/transactions",
  "/binders",
  "/collection",
  "/wishlist",
  "/portfolio",
  "/packs",
]);

interface AppShellProps {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  const collapseState = useSidebarCollapse();
  const { collapsed, toggle } = collapseState;
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const sidebarW = useMotionValue(collapsed ? 64 : 240);
  const sidebarWPx = useTransform(sidebarW, (v) => `${v}px`);

  useEffect(() => {
    const controls = animate(sidebarW, collapsed ? 64 : 240, {
      duration: 0.22,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [collapsed, sidebarW]);

  const staticVars: CSSProperties = {
    ["--shell-banner-h" as string]: "0px",
  };

  const pageAnimationKey = pathname;
  const isViewportFit = VIEWPORT_FIT_ROUTES.has(pathname);

  return (
    <SidebarCollapseContext.Provider value={collapseState}>
      <MobileMenuContext.Provider value={{ open: mobileOpen, setOpen: setMobileOpen }}>
        <motion.div
          className="h-screen overflow-hidden bg-zinc-50 font-sans text-foreground dark:bg-zinc-950 dark:text-white"
          style={{ ...staticVars, ["--shell-sidebar-w" as string]: sidebarWPx }}
        >
          <aside className="z-sidebar fixed left-0 bottom-0 top-[var(--shell-banner-h)] hidden w-[var(--shell-sidebar-w)] flex-col overflow-y-auto overflow-x-hidden bg-zinc-50 md:flex dark:bg-zinc-950">
            <SidebarForceExpandedContext.Provider value={false}>
              {sidebar}
            </SidebarForceExpandedContext.Provider>
          </aside>

          <div className="z-sidebar fixed top-1/2 left-[calc(var(--shell-sidebar-w)+0.5rem)] hidden -translate-x-1/2 -translate-y-1/2 md:block">
            <SidebarEdgeToggle />
          </div>

          {mobileOpen && (
            <>
              <aside className="z-drawer fixed left-0 bottom-0 top-[var(--shell-banner-h)] flex w-72 flex-col overflow-y-auto bg-zinc-50 md:hidden dark:bg-zinc-950">
                <div className="flex justify-end p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X />
                  </Button>
                </div>
                <SidebarForceExpandedContext.Provider value={true}>
                  {sidebar}
                </SidebarForceExpandedContext.Provider>
              </aside>
              <button
                type="button"
                className="z-drawer-backdrop fixed inset-0 bg-black/40 md:hidden"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              />
            </>
          )}

          <main className="flex h-screen flex-col pl-0 pt-[var(--shell-banner-h)] md:pl-[var(--shell-sidebar-w)]">
            <div className="flex min-h-0 flex-1 flex-col p-2">
              <div
                className={`flex-1 min-h-0 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
                  isViewportFit ? "flex flex-col overflow-hidden" : "overflow-y-auto"
                }`}
              >
                <div className="z-sticky sticky top-0 h-16 rounded-t-xl bg-white dark:bg-zinc-900">
                  {topBar}
                  {!isViewportFit && (
                    <div
                      aria-hidden
                      className="shell-content-fade pointer-events-none absolute inset-x-0 top-full h-8"
                    />
                  )}
                </div>
                <div
                  key={pageAnimationKey}
                  className={`shell-page-enter ${
                    isViewportFit
                      ? "flex flex-1 min-h-0 flex-col px-6 pt-8 pb-8 md:px-12"
                      : "px-6 pt-10 pb-12 md:px-12"
                  }`}
                >
                  {children}
                </div>
              </div>
            </div>
          </main>

          <SidebarShortcutHint />
        </motion.div>
      </MobileMenuContext.Provider>
    </SidebarCollapseContext.Provider>
  );
}
