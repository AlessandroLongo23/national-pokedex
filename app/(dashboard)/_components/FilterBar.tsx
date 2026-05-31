"use client";

export type GridFilter = "all" | "owned" | "needed";

interface FilterOption {
  value: GridFilter;
  label: string;
  hint: string;
}

const OPTIONS: FilterOption[] = [
  { value: "all", label: "All", hint: "Every species in the National Pokédex" },
  { value: "owned", label: "Owned", hint: "You own at least one card of this Pokémon" },
  { value: "needed", label: "To buy", hint: "You don't own a card of this Pokémon yet" },
];

interface Props {
  value: GridFilter;
  onChange: (v: GridFilter) => void;
  options?: FilterOption[];
  counts?: Partial<Record<GridFilter, number>>;
}

export function FilterBar({ value, onChange, options = OPTIONS, counts }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-panel-2/60 p-0.5">
      {options.map((opt) => {
        const active = value === opt.value;
        const count = counts?.[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            aria-label={opt.hint}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition",
              active
                ? "bg-text text-bg shadow-[0_1px_0_rgb(0_0_0/0.25)]"
                : "text-muted hover:bg-panel-3/60 hover:text-text",
            ].join(" ")}
          >
            <span>{opt.label}</span>
            {typeof count === "number" && (
              <span
                className={[
                  "text-[10px] nums tabular-nums",
                  active ? "text-bg/70" : "text-muted/70",
                ].join(" ")}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
