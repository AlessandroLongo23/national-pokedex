import type { PokedexEntry, SpeciesEntry, SpeciesIndex } from "@/lib/data/types";

const POKEAPI = "https://pokeapi.co/api/v2";
const CONCURRENCY = 8;
const RETRIES = 3;
const RETRY_DELAY_MS = 800;

interface PokemonResp {
  height: number;
  weight: number;
  types: { type: { name: string } }[];
  abilities: { ability: { name: string }; is_hidden: boolean }[];
}

interface SpeciesResp {
  genera: { genus: string; language: { name: string } }[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
  evolution_chain: { url: string };
}

interface EvoNode {
  species: { name: string; url: string };
  evolves_to: EvoNode[];
}

interface EvoChainResp {
  chain: EvoNode;
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

function dexFromSpeciesUrl(url: string): number | null {
  const m = url.match(/\/pokemon-species\/(\d+)\/?$/);
  if (!m) return null;
  const dex = parseInt(m[1]!, 10);
  return dex >= 1 && dex <= 1025 ? dex : null;
}

function flattenChain(node: EvoNode, depth = 0, acc: number[][] = []): number[][] {
  const dex = dexFromSpeciesUrl(node.species.url);
  if (dex != null) {
    if (!acc[depth]) acc[depth] = [];
    acc[depth].push(dex);
  }
  for (const child of node.evolves_to) flattenChain(child, depth + 1, acc);
  return acc;
}

function genFromDex(dex: number): number {
  if (dex <= 151) return 1;
  if (dex <= 251) return 2;
  if (dex <= 386) return 3;
  if (dex <= 493) return 4;
  if (dex <= 649) return 5;
  if (dex <= 721) return 6;
  if (dex <= 809) return 7;
  if (dex <= 905) return 8;
  return 9;
}

function artworkUrl(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
}

async function fetchOne(dex: number, name: string): Promise<SpeciesEntry> {
  const [pokemon, species] = await Promise.all([
    fetchJson<PokemonResp>(`${POKEAPI}/pokemon/${dex}`),
    fetchJson<SpeciesResp>(`${POKEAPI}/pokemon-species/${dex}`),
  ]);
  const evo = await fetchJson<EvoChainResp>(species.evolution_chain.url);
  const evolutionChain = flattenChain(evo.chain);

  const genus =
    species.genera.find((g) => g.language.name === "en")?.genus ?? "Pokémon";
  const flavor =
    species.flavor_text_entries
      .find((e) => e.language.name === "en")
      ?.flavor_text.replace(/[\f\n\r]+/g, " ")
      .trim() ?? "";

  return {
    dex,
    name,
    genus,
    heightDm: pokemon.height,
    weightHg: pokemon.weight,
    types: pokemon.types.map((t) => capitalise(t.type.name)),
    abilities: pokemon.abilities.map((a) => ({
      name: capitalise(a.ability.name.replace(/-/g, " ")),
      hidden: a.is_hidden,
    })),
    evolutionChain,
    flavorText: flavor,
    generation: genFromDex(dex),
    artworkUrl: artworkUrl(dex),
  };
}

function capitalise(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function fetchSpecies(pokedex: PokedexEntry[]): Promise<SpeciesIndex> {
  const out: SpeciesIndex = {};
  let nextIndex = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= pokedex.length) return;
      const entry = pokedex[i]!;
      try {
        out[entry.dex] = await fetchOne(entry.dex, entry.name);
      } catch (err) {
        console.warn(`[species] failed dex=${entry.dex}: ${(err as Error).message}`);
      }
      done++;
      if (done % 50 === 0 || done === pokedex.length) {
        console.log(`[species] ${done}/${pokedex.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return out;
}
