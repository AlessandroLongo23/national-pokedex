"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { ScrollAreaContext } from "./ScrollAreaContext";
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

// Pages that fit the viewport exactly: the content panel is clipped
// (`overflow-hidden`) and the page owns its own internal scroll so toolbars
// stay pinned while the body scrolls. The contract each such page must honour:
//   - page root:     `flex w-full min-h-0 flex-1 flex-col` (fills this area)
//   - pinned header:  a `shrink-0` wrapper (PageHeader + any filter toolbar)
//   - scroll body:    `min-h-0 flex-1 overflow-y-auto` (the grid/table/list)
// Routes NOT listed here get a scrolling panel (`overflow-y-auto`) instead and
// flow as normal documents.
// Routes that fill the viewport exactly (content panel clipped, page owns its
// own internal scroll). Routes NOT listed here scroll as a normal document:
// the page title scrolls away while sticky toolbars stay pinned. The browse
// pages (Pokédex, Sets, Cards, Packs, …) deliberately use document scroll so
// their tall page headers don't permanently eat vertical space.
const VIEWPORT_FIT_ROUTES = new Set([
  "/transactions",
  "/binders",
  "/portfolio",
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
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  // The scrolling panel (document-scroll routes). Exposed so virtualized grids
  // can scroll against the page instead of a nested container.
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

  // Mobile drawer a11y: Escape closes it, and focus moves into the drawer on
  // open so keyboard/AT users land inside the menu rather than behind it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    mobileDrawerRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

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
    <ScrollAreaContext.Provider value={scrollAreaRef}>
    <SidebarCollapseContext.Provider value={collapseState}>
      <MobileMenuContext.Provider value={{ open: mobileOpen, setOpen: setMobileOpen }}>
        <motion.div
          className="h-screen overflow-hidden bg-zinc-50 font-sans text-foreground dark:bg-zinc-900 dark:text-white"
          style={{ ...staticVars, ["--shell-sidebar-w" as string]: sidebarWPx }}
        >
          <aside className="z-sidebar fixed left-0 bottom-0 top-[var(--shell-banner-h)] hidden w-[var(--shell-sidebar-w)] flex-col overflow-y-auto overflow-x-hidden bg-zinc-50 md:flex dark:bg-zinc-900">
            <SidebarForceExpandedContext.Provider value={false}>
              {sidebar}
            </SidebarForceExpandedContext.Provider>
          </aside>

          <div className="z-sidebar fixed top-1/2 left-[calc(var(--shell-sidebar-w)+0.5rem)] hidden -translate-x-1/2 -translate-y-1/2 md:block">
            <SidebarEdgeToggle />
          </div>

          {mobileOpen && (
            <>
              <aside
                ref={mobileDrawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                className="z-drawer fixed left-0 bottom-0 top-[var(--shell-banner-h)] flex w-72 flex-col overflow-y-auto bg-zinc-50 pb-[env(safe-area-inset-bottom)] outline-none md:hidden dark:bg-zinc-900"
              >
                <div className="flex justify-end p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="min-h-[44px] min-w-[44px]"
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
                ref={scrollAreaRef}
                className={`relative flex-1 min-h-0 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${
                  isViewportFit ? "flex flex-col overflow-hidden" : "overflow-y-auto"
                }`}
              >
                <div className="z-sticky sticky top-0 h-16 rounded-t-xl bg-white dark:bg-zinc-950">
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
                    // Extra bottom padding on mobile so the last content row clears
                    // the floating LogPack FAB (bottom-right) and the home indicator;
                    // desktop keeps its original pb-8 / pb-12 (md:).
                    isViewportFit
                      ? "flex flex-1 min-h-0 flex-col px-6 pt-8 pb-[max(6rem,env(safe-area-inset-bottom))] md:px-12 md:pb-8"
                      : "px-6 pt-10 pb-[max(6rem,env(safe-area-inset-bottom))] md:px-12 md:pb-12"
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
    </ScrollAreaContext.Provider>
  );
}
