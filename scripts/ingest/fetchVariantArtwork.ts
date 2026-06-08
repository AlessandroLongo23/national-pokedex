import {
  genOf,
  type RegionalVariant,
  type VariantIndex,
  type VariantRegion,
} from "@/lib/data/types";
import type { VarietyForm } from "./fetchMegaArtwork";
import { chooseVariantVariety, type VariantCandidate } from "./parseVariants";

// Resolves each region-prefixed candidate to its PokeAPI form id (used in the
// official-artwork sprite path `/official-artwork/{id}.png`) AND decides, in
// the same pass, whether it is a true variant at all. A candidate whose
// (region, dex) has no region-tokened variety is region-exclusive and is
// dropped (Clodsire #980, Sneasler #903, Perrserker #863, Basculegion #902…).
// Runs only at ingest (`npm run data:rebuild`); runtime never hits PokeAPI.

const POKEAPI = "https://pokeapi.co/api/v2";
const CONCURRENCY = 8;
const RETRIES = 3;
const RETRY_DELAY_MS = 800;

// Region rank for the stable render order required by variants.json:
// alola < galar < hisui < paldea, then baseDex.
const REGION_RANK: Record<VariantRegion, number> = {
  alola: 0,
  galar: 1,
  hisui: 2,
  paldea: 3,
};

interface SpeciesVarietiesResp {
  /** Species slug, e.g. "vulpix". */
  name: string;
  varieties: { pokemon: { name: string; url: string } }[];
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
  }
  throw lastErr;
}

function idFromPokemonUrl(url: string): number | null {
  const m = url.match(/\/pokemon\/(\d+)\/?$/);
  return m ? parseInt(m[1]!, 10) : null;
}

function displayNameFor(region: VariantRegion, baseName: string): string {
  const prefix: Record<VariantRegion, string> = {
    alola: "Alolan",
    galar: "Galarian",
    hisui: "Hisuian",
    paldea: "Paldean",
  };
  return `${prefix[region]} ${baseName}`;
}

function slugFor(baseName: string): string {
  // Base-name lower-kebab with apostrophes/periods stripped: "Mr. Mime" →
  // "mr-mime", "Farfetch'd" → "farfetchd".
  return baseName
    .toLowerCase()
    .replace(/[''.]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Resolve candidates to true `RegionalVariant`s with artwork. Fetches each
 * distinct baseDex's species once, maps its varieties to {name,id}, applies
 * `chooseVariantVariety`, drops unresolved (region-exclusive) candidates with
 * a console.warn, and returns variants sorted by (region rank, baseDex) plus
 * the matching `cardIndexByVariant`.
 */
export async function resolveVariantArtwork(
  candidates: VariantCandidate[],
): Promise<{ variants: RegionalVariant[]; cardIndexByVariant: VariantIndex }> {
  const dexes = [...new Set(candidates.map((c) => c.baseDex))];
  const byDex = new Map<number, { slug: string; forms: VarietyForm[] }>();

  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= dexes.length) return;
      const dex = dexes[i]!;
      try {
        const sp = await fetchJson<SpeciesVarietiesResp>(
          `${POKEAPI}/pokemon-species/${dex}`,
        );
        const forms = sp.varieties
          .map((v) => ({ name: v.pokemon.name, id: idFromPokemonUrl(v.pokemon.url) }))
          .filter((f): f is VarietyForm => f.id != null);
        byDex.set(dex, { slug: sp.name, forms });
      } catch (err) {
        console.warn(`[variant-art] species dex=${dex} failed: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const variants: RegionalVariant[] = [];
  const cardIndexByVariant: VariantIndex = {};

  for (const c of candidates) {
    const entry = byDex.get(c.baseDex);
    if (!entry) {
      console.warn(
        `[variant-art] no species data for ${c.region} ${c.baseName} (dex=${c.baseDex}) — dropping`,
      );
      continue;
    }
    const artworkId = chooseVariantVariety(entry.slug, entry.forms, c.region);
    if (artworkId == null) {
      // Region-exclusive: NOT a variant. Drop it (its cards stay on base dex).
      // Warn so a future set's unrecognised regional form surfaces at build.
      console.warn(
        `[variant-art] region-exclusive (no ${c.region} variety) for ${c.baseName} (dex=${c.baseDex}) — not a variant`,
      );
      continue;
    }
    const variantKey = `${c.region}-${slugFor(c.baseName)}`;
    variants.push({
      variantKey,
      displayName: displayNameFor(c.region, c.baseName),
      region: c.region,
      baseDex: c.baseDex,
      gen: genOf(c.baseDex),
      artworkId,
    });
    cardIndexByVariant[variantKey] = c.cardIds;
  }

  variants.sort(
    (a, b) => REGION_RANK[a.region] - REGION_RANK[b.region] || a.baseDex - b.baseDex,
  );

  return { variants, cardIndexByVariant };
}
