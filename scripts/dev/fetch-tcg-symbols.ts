/**
 * Download the authentic Pokémon TCG **energy type symbols** — the colored
 * circular disc icons printed on the cards (Grass = green leaf, Fire = flame,
 * Water = droplet, Lightning = bolt, Psychic = eye, Fighting = fist, …) — into
 * `public/types/`, keyed by the TCG energy-type names that appear in
 * `card.types` (lowercased).
 *
 * Source: the energy-disc PNGs from `Oscar-Raygoza/clean-architecture--vue-3`
 * (270×270, the highest-resolution complete set found, all 11 types incl.
 * Fairy + Dragon, on a hot-linkable host). These are the literal card energy
 * symbols, not the Scarlet/Violet videogame type gems.
 *
 * The PNGs are vendored into the repo (committed), so the app does not depend
 * on the upstream repo staying alive. Re-run only to refresh the set:
 *
 *   npx tsx scripts/dev/fetch-tcg-symbols.ts
 *
 * Equivalent complete sets, if this source ever moves (same 11 names):
 *   - glossy/embossed 72px: raw.githubusercontent.com/Chrollo0070/Pokemon-Pack-Sim/main/client/public/assets/energy/<type>.png
 *   - PTCGO flat 104px webp: raw.githubusercontent.com/the-epsd/twinleafgg/main/ptcg-play-react/public/assets/energy-icons/<type>.webp
 *   - card-maker (dark.png for darkness): raw.githubusercontent.com/karl/pokecardmaker.net/master/public/assets/icons/types/<type>.png
 *
 * Rarity symbols are rendered as inline SVG glyphs in the app (see RarityBadge
 * in cards/[cardId]/_components/CardChips.tsx) — no download.
 */
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE =
  "https://raw.githubusercontent.com/Oscar-Raygoza/clean-architecture--vue-3/main/src/app/assets/static/energy/";

// card.types values (TCG energy types), lowercased. The source names them
// identically, so no per-type remapping is needed.
const TYPES = [
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "metal",
  "fairy",
  "dragon",
  "colorless",
];

async function download(type: string, dir: string): Promise<void> {
  const res = await fetch(`${BASE}${type}.png`);
  if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 300) throw new Error(`${type}: suspiciously small (${buf.length}b)`);
  // PNG magic number guard
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw new Error(`${type}: not a PNG`);
  await writeFile(join(dir, `${type}.png`), buf);
  console.log(`  ✓ public/types/${type}.png (${buf.length} bytes)`);
}

async function run() {
  const dir = join(ROOT, "public", "types");
  await mkdir(dir, { recursive: true });

  // Clear any prior assets (e.g. the old .svg set) so the directory only
  // holds the current symbol set.
  for (const f of await readdir(dir).catch(() => [])) {
    if (f.endsWith(".svg") || f.endsWith(".png")) await unlink(join(dir, f));
  }

  console.log("TCG energy disc symbols → public/types/");
  const results = await Promise.allSettled(TYPES.map((t) => download(t, dir)));
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.error("  ✗", (f as PromiseRejectedResult).reason.message);
  if (failed.length) {
    console.error(`\n${failed.length} download(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll energy symbols downloaded.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
