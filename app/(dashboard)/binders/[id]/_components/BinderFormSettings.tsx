"use client";

import { Toggle } from "@/lib/components/ui/Toggle";

interface Props {
  includeMegas: boolean;
  includeVariants: boolean;
  pending: boolean;
  onChange: (next: { includeMegas: boolean; includeVariants: boolean }) => void;
}

/** Compact inclusion panel for a pokedex-scope binder. Controlled — the
 * parent owns the flag state so the progress count reacts optimistically. */
export function BinderFormSettings({ includeMegas, includeVariants, pending, onChange }: Props) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">Binder contents</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Mega Evolutions
            <span className="block text-xs text-muted">Show Mega/Primal slots in range.</span>
          </span>
          <Toggle
            checked={includeMegas}
            disabled={pending}
            onCheckedChange={(next) => onChange({ includeMegas: next, includeVariants })}
            aria-label="Include Mega Evolutions in this binder"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Regional variants
            <span className="block text-xs text-muted">
              Show Alolan/Galarian/etc. slots in range.
            </span>
          </span>
          <Toggle
            checked={includeVariants}
            disabled={pending}
            onCheckedChange={(next) => onChange({ includeMegas, includeVariants: next })}
            aria-label="Include regional variants in this binder"
          />
        </label>
      </div>
    </div>
  );
}
