const SERIES_ABBREV: Record<string, string> = {
  "Scarlet & Violet": "SV",
  "Mega Evolution": "ME",
  "Sword & Shield": "SS",
  "Sun & Moon": "SM",
  XY: "XY",
  "Black & White": "BW",
  EX: "EX",
  "Diamond & Pearl": "DP",
  Platinum: "PT",
  "HeartGold & SoulSilver": "HGSS",
  Neo: "NEO",
  Base: "BS",
  Gym: "GYM",
  "E-Card": "EC",
  POP: "POP",
  NP: "NP",
  Other: "•",
};

export const SERIES_TINT: Record<string, string> = {
  "Scarlet & Violet": "border-sv-tint/35 bg-sv-tint/15 text-sv-tint",
  "Mega Evolution": "border-me-tint/40 bg-me-tint/15 text-me-tint",
  "Sword & Shield": "border-[#a78bff]/35 bg-[#a78bff]/15 text-[#c4b3ff]",
  "Sun & Moon": "border-[#ffb86b]/35 bg-[#ffb86b]/15 text-[#ffcf99]",
  XY: "border-[#5db8ff]/35 bg-[#5db8ff]/15 text-[#a3d4ff]",
  "Black & White": "border-[#9ca3af]/35 bg-[#9ca3af]/15 text-[#cfd4dc]",
  EX: "border-[#fb7185]/35 bg-[#fb7185]/15 text-[#fda4af]",
  "Diamond & Pearl": "border-[#67e8f9]/35 bg-[#67e8f9]/15 text-[#a5f3fc]",
  Platinum: "border-[#cbd5e1]/35 bg-[#cbd5e1]/15 text-[#e2e8f0]",
  "HeartGold & SoulSilver": "border-[#fde047]/35 bg-[#fde047]/15 text-[#fef08a]",
};

export const DEFAULT_SERIES_TINT = "border-border bg-panel-2 text-muted";

export function SeriesBadge({ series, full }: { series: string; full?: boolean }) {
  const tint = SERIES_TINT[series] ?? DEFAULT_SERIES_TINT;
  const label = full ? series : SERIES_ABBREV[series] ?? series.slice(0, 3).toUpperCase();
  return (
    <span
      className={[
        "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        tint,
      ].join(" ")}
      title={series}
    >
      {label}
    </span>
  );
}
