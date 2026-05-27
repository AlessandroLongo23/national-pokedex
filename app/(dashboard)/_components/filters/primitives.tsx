"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

/* ─── Popover ─────────────────────────────────────────────────────────────
   One canonical popover used by every filter dropdown. The trigger renders
   in place; the content portals as an absolutely-positioned card right
   below. Open state and outside-click handling live here, never inline.
*/

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  width?: string;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  width = "w-[min(92vw,320px)]",
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const toggle = () => onOpenChange(!open);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle })}
      {open && (
        <div
          className={[
            "absolute top-full z-30 mt-1.5 origin-top overflow-hidden rounded-lg border border-border bg-panel shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)]",
            "animate-[popover-in_140ms_ease-out]",
            align === "start" ? "left-0" : "right-0",
            width,
          ].join(" ")}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── PopoverHeader ───────────────────────────────────────────────────────
   Used inside Popover content. Tiny eyebrow + optional reset link.
*/

export function PopoverHeader({
  label,
  onClear,
  count,
}: {
  label: string;
  onClear?: () => void;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="eyebrow !text-[10px] !tracking-[0.18em]">{label}</span>
      {onClear && count != null && count > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] uppercase tracking-[0.16em] text-muted transition hover:text-text"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/* ─── FilterButton ────────────────────────────────────────────────────────
   The single trigger used by every dropdown filter. Three visual states:
   - idle: muted label
   - has-selection: bright label + tiny accent dot
   - open: bright label, ring on trigger
*/

interface FilterButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  count?: number;
  open?: boolean;
  hideChevron?: boolean;
}

export const FilterButton = forwardRef<HTMLButtonElement, FilterButtonProps>(
  function FilterButton(
    { label, count = 0, open = false, hideChevron, className = "", ...rest },
    ref,
  ) {
    const active = count > 0;
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={[
          "group inline-flex h-8 items-center gap-1.5 rounded-md border bg-panel-2 px-2.5 text-xs transition",
          "outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
          open
            ? "border-border-strong text-text"
            : active
              ? "border-border-strong text-text hover:bg-panel-3"
              : "border-border text-muted hover:border-border-strong hover:text-text",
          className,
        ].join(" ")}
      >
        {active && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
          />
        )}
        <span className="whitespace-nowrap">{label}</span>
        {active && count > 1 && (
          <span className="ml-0.5 rounded-sm bg-panel-3 px-1 py-px text-[10px] nums text-text">
            {count}
          </span>
        )}
        {!hideChevron && (
          <ChevronDown
            aria-hidden
            className={[
              "h-3 w-3 shrink-0 text-muted transition-transform",
              open ? "rotate-180 text-text" : "group-hover:text-text",
            ].join(" ")}
          />
        )}
      </button>
    );
  },
);

/* ─── FilterChip ──────────────────────────────────────────────────────────
   Used inside popovers (rarity / price / region / form). Two states only:
   off, on. No borders fighting with fills.
*/

export function FilterChip({
  active,
  onClick,
  children,
  size = "sm",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md font-medium transition outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/60",
        size === "sm"
          ? "px-2 py-1 text-[11px]"
          : "px-2.5 py-1.5 text-xs",
        active
          ? "bg-[color-mix(in_oklch,var(--color-accent)_18%,transparent)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-accent)_45%,transparent)]"
          : "bg-panel-2 text-muted hover:bg-panel-3 hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ─── ActiveChip ──────────────────────────────────────────────────────────
   A removable chip used in V2 (active-filters strip). Click anywhere to
   remove. Compact, label first then × on hover-or-always.
*/

export function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="group inline-flex h-6 items-center gap-1 rounded-full bg-panel-2 pl-2 pr-1.5 text-[11px] text-text transition hover:bg-panel-3"
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        aria-hidden
        className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition group-hover:text-text"
      >
        <svg viewBox="0 0 8 8" className="h-2 w-2" fill="none">
          <path
            d="M1 1l6 6M7 1l-6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  );
}

/* ─── Segmented ───────────────────────────────────────────────────────────
   Used by supertype tabs and (variant) sort. Single source of truth so the
   active pill is the same shape across the toolbar.
*/

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex h-8 items-center rounded-md bg-panel-2 p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            id={`${id}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              "h-7 rounded px-2.5 text-xs font-medium transition outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60",
              active
                ? "bg-panel-3 text-text shadow-[inset_0_0_0_1px_var(--color-border)]"
                : "text-muted hover:text-text",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── ResultCount ────────────────────────────────────────────────────────
   Single canonical "X of Y cards" + Clear-all affordance.
*/

export function ResultCount({
  result,
  total,
  dirty,
  onClear,
  compact,
}: {
  result: number;
  total: number;
  dirty: boolean;
  onClear: () => void;
  compact?: boolean;
}) {
  return (
    <div className={[
      "flex items-center gap-2.5",
      compact ? "text-[11px]" : "text-xs",
    ].join(" ")}>
      <span className="nums text-text">
        {result.toLocaleString()}
        {result !== total && (
          <span className="text-muted">
            {" "}/ {total.toLocaleString()}
          </span>
        )}
        <span className="text-muted"> {result === 1 ? "card" : "cards"}</span>
      </span>
      {dirty && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] uppercase tracking-[0.16em] text-muted transition hover:text-text"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/* ─── useDelayedOpen ──────────────────────────────────────────────────────
   Boolean toggle helper used by a few popovers.
*/

export function useToggle(initial = false) {
  const [open, setOpen] = useState(initial);
  return [open, setOpen] as const;
}
