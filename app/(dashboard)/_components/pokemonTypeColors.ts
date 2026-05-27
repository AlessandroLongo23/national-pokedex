// Type palette used to tint Pokédex cells. Each entry is a CSS color with
// space-separated RGB channels so callers can compose `rgb(... / <alpha>)`
// at arbitrary opacity without re-specifying the hue per state.
//
// Hues chosen to read against the app's deep neutral background (zinc-950)
// while staying recognizable as the canonical Pokémon type colors fans
// already carry in their heads.

export type PokemonType =
  | "Normal"
  | "Fire"
  | "Water"
  | "Electric"
  | "Grass"
  | "Ice"
  | "Fighting"
  | "Poison"
  | "Ground"
  | "Flying"
  | "Psychic"
  | "Bug"
  | "Rock"
  | "Ghost"
  | "Dragon"
  | "Dark"
  | "Steel"
  | "Fairy";

export const TYPE_RGB: Record<PokemonType, string> = {
  Normal: "168 162 158",
  Fire: "248 113 100",
  Water: "96 165 250",
  Electric: "250 204 21",
  Grass: "74 222 128",
  Ice: "125 211 252",
  Fighting: "220 60 60",
  Poison: "192 132 252",
  Ground: "217 138 56",
  Flying: "165 180 252",
  Psychic: "244 114 182",
  Bug: "163 220 53",
  Rock: "200 170 110",
  Ghost: "139 92 246",
  Dragon: "129 140 248",
  Dark: "120 113 108",
  Steel: "148 163 184",
  Fairy: "249 168 212",
};

const FALLBACK_RGB = "100 116 139"; // slate, for unknowns

export function typeRgb(t: string | undefined): string {
  if (!t) return FALLBACK_RGB;
  return TYPE_RGB[t as PokemonType] ?? FALLBACK_RGB;
}

/**
 * Background gradient for a cell tinted by Pokémon type. Dual-type cells
 * get a soft diagonal blend; single-type cells get a vertical sheen so
 * solid swatches don't look flat against neighbors.
 */
export function typeBackground(types: string[], alpha: number): string {
  const a = alpha.toFixed(3);
  const ahi = Math.min(alpha * 1.25, 1).toFixed(3);
  const t1 = typeRgb(types[0]);
  const t2 = typeRgb(types[1] ?? types[0]);
  if (types[1] && types[1] !== types[0]) {
    return `linear-gradient(135deg, rgb(${t1} / ${ahi}) 0%, rgb(${t1} / ${a}) 48%, rgb(${t2} / ${a}) 52%, rgb(${t2} / ${ahi}) 100%)`;
  }
  return `linear-gradient(160deg, rgb(${t1} / ${ahi}) 0%, rgb(${t1} / ${a}) 100%)`;
}

/** Single rgb color string for hover rings, shadows, etc. */
export function typeColor(types: string[], alpha: number): string {
  return `rgb(${typeRgb(types[0])} / ${alpha.toFixed(3)})`;
}
