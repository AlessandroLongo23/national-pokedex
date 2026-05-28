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

  const compactClass = [
    "inline-flex h-6 w-6 items-center justify-center rounded-md transition",
    available
      ? "text-covered/80 ring-1 ring-covered/30 bg-covered/10 hover:text-covered hover:ring-covered/50"
      : "text-missing ring-1 ring-missing/50 bg-missing/10 hover:ring-missing hover:bg-missing/15",
  ].join(" ");

  const fullClass = [
    "inline-flex h-6 w-6 items-center justify-center rounded-md transition",
    available
      ? "bg-accent/15 text-accent ring-1 ring-accent/40 hover:bg-accent/25"
      : "bg-panel-2 text-muted ring-1 ring-border hover:text-text hover:ring-border-strong",
  ].join(" ");

  if (compact) {
    // Distinct icon shapes (Store vs Ban) carry the on/off signal alongside the
    // covered/missing colors so red-green colorblind users still parse it.
    const CompactIcon = available ? Store : Ban;
    return (
      <Tooltip content={description}>
        <button
          type="button"
          role="switch"
          aria-checked={available}
          aria-label={`Available locally: ${available ? "yes" : "no"}`}
          onClick={onToggle}
          className={compactClass}
        >
          <CompactIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Tooltip>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <Tooltip content={description}>
        <button
          type="button"
          role="switch"
          aria-checked={available}
          onClick={onToggle}
          className={fullClass}
        >
          <Store className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Tooltip>
      <span>Available locally{overridden ? " · manual" : ""}</span>
    </span>
  );
}
