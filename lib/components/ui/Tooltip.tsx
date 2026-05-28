"use client";

import { type ReactElement } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

type Side = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  /** Tooltip text. When empty/undefined, the wrapper is a no-op and `children` render unchanged. */
  label?: string;
  shortcut?: string;
  side?: Side;
  sideOffset?: number;
  delay?: number;
  children: ReactElement;
}

export function Tooltip({
  label,
  shortcut,
  side = "top",
  sideOffset = 8,
  delay = 400,
  children,
}: TooltipProps) {
  if (!label) return children;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset}>
          <BaseTooltip.Popup className="z-tooltip flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <span>{label}</span>
            {shortcut && (
              <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-sans text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
                {shortcut}
              </kbd>
            )}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
