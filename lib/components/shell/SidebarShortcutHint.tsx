"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SIDEBAR_HINT_EVENT } from "./SidebarCollapseToggle";
import { sidebarToggleLabel } from "./keyboardShortcuts";
import { Button } from "@/lib/components/ui/Button";

const AUTO_DISMISS_MS = 6000;

export function SidebarShortcutHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onShow() {
      setVisible(true);
    }
    window.addEventListener(SIDEBAR_HINT_EVENT, onShow);
    return () => window.removeEventListener(SIDEBAR_HINT_EVENT, onShow);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="z-tooltip fixed bottom-6 left-6 flex max-w-sm items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-lg transition-opacity dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
    >
      <span>
        Tip: press{" "}
        <kbd className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {sidebarToggleLabel()}
        </kbd>{" "}
        to toggle the sidebar.
      </span>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Dismiss tip"
        onClick={() => setVisible(false)}
        className="shrink-0"
      >
        <X />
      </Button>
    </div>
  );
}
