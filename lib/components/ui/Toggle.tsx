"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ToggleSize = "sm" | "md";

export interface ToggleProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "onClick" | "type" | "role" | "aria-checked"
  > {
  /** Controlled on/off state. */
  checked: boolean;
  /** Fires with the next state when the user flips the switch. */
  onCheckedChange: (checked: boolean) => void;
  size?: ToggleSize;
}

/* The thumb is sized to fill the track's content box exactly, and the 2px
   transparent border supplies the inset gap. That keeps the "on" travel on a
   whole spacing step (translate-x-4 / -5), so the knob lands flush at either
   end regardless of the theme's spacing scale — no magic-pixel translate that
   silently drifts (which is what broke the old inline switch). */
const trackSize: Record<ToggleSize, string> = {
  sm: "h-5 w-9",
  md: "h-6 w-11",
};

const thumbSize: Record<ToggleSize, string> = {
  sm: "size-4",
  md: "size-5",
};

const thumbTravel: Record<ToggleSize, string> = {
  sm: "translate-x-4",
  md: "translate-x-5",
};

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { checked, onCheckedChange, size = "md", disabled, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border-2 border-transparent",
        "transition-colors duration-[var(--duration-base)] ease-[var(--ease-in-out)] motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lume-ring-focus)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--lume-button-accent-bg)]" : "bg-panel-3",
        trackSize[size],
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none block rounded-full bg-[var(--color-neutral-50)] shadow-sm",
          "transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
          thumbSize[size],
          checked ? thumbTravel[size] : "translate-x-0",
        )}
      />
    </button>
  );
});
