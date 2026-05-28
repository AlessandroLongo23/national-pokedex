"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip } from "@/lib/components/ui/Tooltip";
import { useSidebarCollapseContext } from "./sidebarContext";
import { sidebarToggleLabel } from "./keyboardShortcuts";

const HINT_STORAGE_KEY = "pokedex-sidebar-shortcut-hint-shown";
export const SIDEBAR_HINT_EVENT = "pokedex:sidebar-hint";

export function SidebarEdgeToggle() {
  const { collapsed, toggle } = useSidebarCollapseContext();

  function handleClick() {
    toggle();
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(HINT_STORAGE_KEY) === "1") return;
    window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    window.dispatchEvent(new CustomEvent(SIDEBAR_HINT_EVENT));
  }

  const label = collapsed ? "Expand menu" : "Collapse menu";

  return (
    <Tooltip label={label} shortcut={sidebarToggleLabel()} side="right" sideOffset={8}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        className="hidden h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-900 md:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-white"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
        ) : (
          <ChevronLeft className="h-3 w-3" strokeWidth={2} />
        )}
      </button>
    </Tooltip>
  );
}
