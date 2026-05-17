"use client";

export type GridFilter = "all" | "covered" | "missing" | "owned" | "needed";

const OPTIONS: { value: GridFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "covered", label: "Covered" },
  { value: "missing", label: "Missing" },
  { value: "owned", label: "Owned" },
  { value: "needed", label: "Still needed" },
];

export function FilterBar({
  value,
  onChange,
}: {
  value: GridFilter;
  onChange: (v: GridFilter) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded border px-3 py-1.5 text-xs transition ${
            value === opt.value
              ? "border-accent bg-accent font-semibold text-bg"
              : "border-border bg-panel text-text hover:bg-panel-2"
          }`}
        >
          {opt.label}
        </button>
      ))}
      <div className="ml-auto flex gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-covered" />
          covered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-missing" />
          missing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-owned" />
          owned
        </span>
      </div>
    </div>
  );
}
