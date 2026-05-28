"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Loader2, type LucideIcon } from "lucide-react";
import {
  useSidebarCollapseContext,
  useSidebarForceExpanded,
} from "./sidebarContext";

export type UserCardMenuItem =
  | { type: "link"; label: string; href: string; icon?: LucideIcon }
  | {
      type: "button";
      label: string;
      onClick: () => void | Promise<void>;
      icon?: LucideIcon;
      danger?: boolean;
      loadingLabel?: string;
    };

interface SidebarUserCardProps {
  name: string;
  subtitle?: string;
  initials: string;
  menuItems: UserCardMenuItem[];
}

export function SidebarUserCard({
  name,
  subtitle,
  initials,
  menuItems,
}: SidebarUserCardProps) {
  const [open, setOpen] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [fixedPos, setFixedPos] = useState<{ left: number; bottom: number } | null>(null);
  const { collapsed } = useSidebarCollapseContext();
  const forceExpanded = useSidebarForceExpanded();
  const effectiveCollapsed = forceExpanded ? false : collapsed;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open || !effectiveCollapsed || !buttonRef.current) {
      setFixedPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setFixedPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
  }, [open, effectiveCollapsed]);

  async function handleItem(item: UserCardMenuItem, idx: number) {
    if (item.type !== "button") return;
    setBusyIndex(idx);
    try {
      await item.onClick();
    } finally {
      setBusyIndex(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <div className="flex min-w-0 items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {initials || "?"}
            </span>
          </span>
          <AnimatePresence initial={false}>
            {!effectiveCollapsed && (
              <motion.span
                key="identity"
                initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                animate={{ opacity: 1, width: "auto", marginLeft: 12 }}
                exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex min-w-0 flex-col items-start overflow-hidden whitespace-nowrap leading-tight"
              >
                <span className="max-w-[140px] truncate text-sm font-medium text-zinc-900 dark:text-white">
                  {name}
                </span>
                {subtitle && (
                  <span className="max-w-[140px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {subtitle}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {!effectiveCollapsed && (
            <motion.span
              key="chevron"
              initial={{ opacity: 0, width: 0, marginLeft: 0, marginRight: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 8, marginRight: 8 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0, marginRight: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="shrink-0 overflow-hidden"
            >
              <ChevronDown className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {open && (!effectiveCollapsed || fixedPos) && (
        <div
          role="menu"
          style={
            effectiveCollapsed && fixedPos
              ? { position: "fixed", left: fixedPos.left, bottom: fixedPos.bottom }
              : undefined
          }
          className={
            effectiveCollapsed
              ? "z-dropdown w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              : "z-dropdown absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          }
        >
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            if (item.type === "link") {
              return (
                <Link
                  key={idx}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {Icon && <Icon className="h-4 w-4" strokeWidth={1.5} />}
                  <span>{item.label}</span>
                </Link>
              );
            }
            const isBusy = busyIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => handleItem(item, idx)}
                disabled={isBusy}
                role="menuitem"
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors disabled:opacity-50 ${
                  item.danger
                    ? "text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  Icon && <Icon className="h-4 w-4" strokeWidth={1.5} />
                )}
                <span>{isBusy && item.loadingLabel ? item.loadingLabel : item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
