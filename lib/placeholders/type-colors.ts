// Pure constants for the placeholder-print feature. Kept JSON-free so the
// client print components can import it without dragging the heavy `@/lib/data`
// barrel (species.json etc.) into the browser bundle.

/** Official-artwork type pill colors, copied verbatim from the legacy Python
 * placeholder builder (`legacy/_placeholder_common.py` TYPE_COLORS). Keys are
 * lowercased English type names. */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};

export const TYPE_FALLBACK = "#777777";

/** Navy gen-badge fill from the legacy builder (GEN_BADGE_FILL). */
export const GEN_BADGE_FILL = "#2E3A59";

export const GEN_ROMAN: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? TYPE_FALLBACK;
}
