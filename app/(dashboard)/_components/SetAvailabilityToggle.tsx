"use client";

import { Ban, Store } from "lucide-react";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { useUser } from "../_lib/UserContext";
import { Tooltip } from "./Tooltip";

interface Props {
  setId: string;
  compact?: boolean;
}

function describeState(available: boolean, overridden: boolean): string {
  const base = available
    ? "Available in your local stores. Click to mark unavailable."
    : "Not available locally. Click to mark available.";
  return overridden ? `${base} (set manually)` : `${base} (auto-detected from release date)`;
}

export function SetAvailabilityToggle({ setId, compact }: Props) {
  const { isAvailable, hasOverride, set } = useSetAvailability();
  const { isGuest } = useUser();
  if (isGuest) return null;
  const available = isAvailable(setId);
  const overridden = hasOverride(setId);
  const description = describeState(available, overridden);

  const onToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    set(setId, !available);
  };

  // One visual language everywhere (table, grid, set header): covered/missing
  // colors plus distinct Store/Ban icon shapes so the on/off signal stays legible
  // for red-green colorblind users. The labeled variant just adds a neutral text
  // label next to the same button — never a second color, so signals don't stack.
  const Icon = available ? Store : Ban;
  const buttonClass = [
    "inline-flex h-10 w-10 md:h-6 md:w-6 items-center justify-center rounded-md transition",
    available
      ? "text-covered-dark dark:text-covered ring-1 ring-covered/30 bg-covered/10 hover:text-covered hover:ring-covered/50"
      : "text-missing ring-1 ring-missing/50 bg-missing/10 hover:ring-missing hover:bg-missing/15",
  ].join(" ");

  const button = (
    <Tooltip content={description}>
      <button
        type="button"
        role="switch"
        aria-checked={available}
        aria-label={`Available locally: ${available ? "yes" : "no"}`}
        onClick={onToggle}
        className={buttonClass}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );

  if (compact) return button;

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      {button}
      <span>Available locally{overridden ? " · manual" : ""}</span>
    </span>
  );
}
