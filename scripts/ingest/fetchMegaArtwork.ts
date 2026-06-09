import type { MegaForm } from "@/lib/data/types";

// Resolves each Mega/Primal form to the PokeAPI "form id" used in the
// official-artwork sprite path (`/official-artwork/{id}.png`). Mega forms only
// carry a `baseDex` (the base species), so without this the Pokédex grid falls
// back to the base art — plain Charizard for Mega Charizard X, plain Meganium
// for the new Legends Z-A Mega Meganium, etc.

const POKEAPI = "https://pokeapi.co/api/v2";
const CONCURRENCY = 8;
const RETRIES = 3;
const RETRY_DELAY_MS = 800;

interface SpeciesVarietiesResp {
  /** Species slug, e.g. "absol". PokeAPI variety names are `{slug}-mega`. */
  name: string;
  varieties: { pokemon: { name: string; url: string } }[];
}

export interface VarietyForm {
  name: string;
  id: number;
}

interface PokemonResp {
  types: { type: { name: string } }[];
}

function capitalise(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
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

/**
 * Pick the PokeAPI variety id for a Mega/Primal `formKey`, given the species
 * slug and its variety forms. Pure (no network) so the disambiguation rules
 * are unit-testable:
 *   - an explicit `-x`/`-y` formKey matches `{slug}-mega-{x|y}`;
 *   - a plain Mega/Primal prefers the bare `{slug}-mega` (the classic Mega,
 *     over Z-A's `{slug}-mega-z` for Absol/Garchomp/Lucario);
 *   - a plain key with only X/Y variants (Charizard, Mewtwo) defaults to X.
 * Returns null when PokeAPI lists no matching variety.
 */
export function chooseMegaVariety(
  slug: string,
  forms: VarietyForm[],
  formKey: string,
  isPrimal: boolean,
): number | null {
  const tag = isPrimal ? "primal" : "mega";
  const suffix = formKey.match(/-(x|y)$/)?.[1];
  const pick = suffix
    ? forms.find((f) => f.name === `${slug}-${tag}-${suffix}`)
    : (forms.find((f) => f.name === `${slug}-${tag}`) ??
      forms.find((f) => f.name === `${slug}-${tag}-x`) ??
      forms.find((f) => f.name.startsWith(`${slug}-${tag}`)));
  return pick?.id ?? null;
}

/** formKey → { artworkId, types } for the forms PokeAPI can resolve. `types`
 * are the Mega/Primal's OWN types (Mega Charizard X is Fire/Dragon, not the base
 * Charizard's Fire/Flying), fetched from the chosen form. */
export async function resolveMegaArtwork(
  megas: MegaForm[],
): Promise<Record<string, { artworkId: number; types: string[] }>> {
  const dexes = [...new Set(megas.map((m) => m.baseDex))];
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
        console.warn(`[mega-art] species dex=${dex} failed: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const out: Record<string, { artworkId: number; types: string[] }> = {};
  const chosen: { formKey: string; id: number }[] = [];
  for (const m of megas) {
    const entry = byDex.get(m.baseDex);
    if (!entry) continue;
    const id = chooseMegaVariety(entry.slug, entry.forms, m.formKey, m.isPrimal);
    if (id != null) {
      out[m.formKey] = { artworkId: id, types: [] };
      chosen.push({ formKey: m.formKey, id });
    } else {
      console.warn(`[mega-art] no variety for ${m.formKey} (dex=${m.baseDex})`);
    }
  }

  // Second pass: fetch each resolved form's OWN types from `/pokemon/{formId}`
  // (Mega/Primal forms are frequently re-typed vs the base species).
  let nextC = 0;
  async function typeWorker() {
    while (true) {
      const i = nextC++;
      if (i >= chosen.length) return;
      const { formKey, id } = chosen[i]!;
      try {
        const p = await fetchJson<PokemonResp>(`${POKEAPI}/pokemon/${id}`);
        out[formKey]!.types = p.types.map((t) => capitalise(t.type.name));
      } catch (err) {
        console.warn(
          `[mega-art] types for ${formKey} (id=${id}) failed: ${(err as Error).message}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => typeWorker()));

  return out;
}
