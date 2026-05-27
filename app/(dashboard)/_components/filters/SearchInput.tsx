"use client";

import { Search, X } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search by card name",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={["relative min-w-0", className].join(" ")}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "h-8 w-full rounded-md bg-panel-2 pl-8 pr-7 text-xs text-text placeholder:text-muted",
          "border border-transparent transition",
          "hover:bg-panel-3 focus:bg-panel-3 focus:border-accent/50 focus:outline-none",
        ].join(" ")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:bg-panel-3 hover:text-text"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
