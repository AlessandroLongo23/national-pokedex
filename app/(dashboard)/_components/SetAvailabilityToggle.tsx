"use client";

import { useSetAvailability } from "../_lib/SetAvailabilityContext";

interface Props {
  setId: string;
  compact?: boolean;
}

export function SetAvailabilityToggle({ setId, compact }: Props) {
  const { isAvailable, hasOverride, set } = useSetAvailability();
  const available = isAvailable(setId);
  const overridden = hasOverride(setId);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Click flips state; explicit override is created. Shift-click would reset
    // to the heuristic, but the UI keeps it simple for now.
    set(setId, e.target.checked);
  };

  const onReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    set(setId, null);
  };

  if (compact) {
    return (
      <label className="inline-flex cursor-pointer items-center justify-center gap-1">
        <input
          type="checkbox"
          checked={available}
          onChange={onChange}
          className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
          aria-label="Available locally"
        />
        {overridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-[9px] uppercase tracking-wider text-muted hover:text-accent"
            title="Reset to default (release-date heuristic)"
          >
            ↺
          </button>
        )}
      </label>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={available}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
      />
      <span>Available locally{overridden ? " (manual)" : ""}</span>
      {overridden && (
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider hover:border-accent hover:text-accent"
        >
          Reset
        </button>
      )}
    </label>
  );
}
