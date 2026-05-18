import { POKEDEX, getSet } from "@/lib/data";
import { GEN_NAMES, GEN_RANGES, type Generation } from "@/lib/data/types";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";

const POKEMON_BY_DEX = new Map(POKEDEX.map((p) => [p.dex, p.name]));

function regionForRange(dexFrom: number, dexTo: number): string | null {
  const lo = Math.min(dexFrom, dexTo);
  const hi = Math.max(dexFrom, dexTo);
  if (lo === 1 && hi === 1025) return "National";
  for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]) {
    const [a, b] = GEN_RANGES[gen];
    if (a === lo && b === hi) return GEN_NAMES[gen];
  }
  return null;
}

export function scopeLabel(
  scopeType: ScopeType,
  scopeParams: ScopeParams | Record<string, unknown>,
): string {
  switch (scopeType) {
    case "master_set": {
      const setId = (scopeParams as { setId?: string }).setId ?? "";
      const set = getSet(setId);
      return set ? `Master set · ${set.name}` : `Master set · ${setId || "unknown"}`;
    }
    case "pokemon": {
      const dex = (scopeParams as { dex?: number }).dex ?? 0;
      const name = POKEMON_BY_DEX.get(dex);
      return name ? `Pokémon · ${name} #${dex}` : `Pokémon · #${dex || "?"}`;
    }
    case "artist": {
      const artist = (scopeParams as { artist?: string }).artist ?? "";
      return `Artist · ${artist || "unknown"}`;
    }
    case "type": {
      const type = (scopeParams as { type?: string }).type ?? "";
      return `Type · ${type || "unknown"}`;
    }
    case "position": {
      const number = (scopeParams as { number?: string }).number ?? "";
      return `Position · #${number || "?"}`;
    }
    case "custom":
      return "Custom list";
    case "pokedex": {
      const params = scopeParams as { dexFrom?: number; dexTo?: number };
      const from = params.dexFrom ?? 0;
      const to = params.dexTo ?? 0;
      if (!from || !to) return "Pokédex";
      const region = regionForRange(from, to);
      return region
        ? `Pokédex · ${region} (#${from}–${to})`
        : `Pokédex · #${from}–${to}`;
    }
    default: {
      const _exhaustive: never = scopeType;
      return _exhaustive;
    }
  }
}
