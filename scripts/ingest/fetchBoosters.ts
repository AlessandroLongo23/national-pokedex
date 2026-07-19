/**
 * Fetch booster-pack wrapper images from the Bulbagarden Archives MediaWiki API
 * and emit a manifest mapping pokemontcg.io set IDs to wrapper image URLs.
 *
 * Strategy per set:
 *   1. List members of the set's Bulbapedia category (mapped below).
 *   2. Keep File: pages titled "* Booster *" or "* pack *", excluding bundles/
 *      displays/etc.
 *   3. Resolve each to its hashed asset URL via prop=imageinfo (batched).
 *
 * Bulbapedia category names use the human set name (with occasional "(TCG)"
 * disambiguation), not pokemontcg.io IDs. Maintain the SET_CATEGORY map.
 *
 * Run standalone: `npx tsx scripts/ingest/fetchBoosters.ts`
 * Or import `fetchBoosters()` from this module.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoosterManifest, BoosterWrapper } from "@/lib/data/types";

const USER_AGENT = "national-pokedex/0.1 (https://github.com/local; longoa02@gmail.com)";
const API = "https://archives.bulbagarden.net/w/api.php";

// pokemontcg.io setId → Bulbapedia (Bulbagarden Archives) category name.
// Only retail sets whose category actually hosts single-pack wrapper art are
// listed; the map was verified by querying the Archives MediaWiki API. Sets
// omitted on purpose fall into three buckets:
//   - never had retail boosters: promos (*p), McDonald's (mcd*), POP league
//     sets, Trainer Kits (tk*), Trainer Galleries / shiny-vault subsets.
//   - had boosters but the Archives only hosts the sealed *box* art, not the
//     individual pack wrapper: most of the Sun & Moon era.
//   - pack art simply isn't on the wiki yet: base Diamond & Pearl, the XY
//     BREAK / Evolutions sets, the em-dash HS sets (Unleashed/Undaunted/…).
export const SET_CATEGORY: Record<string, string> = {
  // Base / Neo / Gym
  base2: "Jungle",
  base3: "Fossil",
  base4: "Base Set 2",
  base5: "Team Rocket (TCG)",
  gym1: "Gym Heroes",
  gym2: "Gym Challenge",
  neo1: "Neo Genesis",
  neo2: "Neo Discovery",
  neo3: "Neo Revelation",
  neo4: "Neo Destiny",
  // e-Card
  ecard1: "Expedition Base Set",
  ecard2: "Aquapolis",
  ecard3: "Skyridge",
  // EX (categories carry the "EX " prefix)
  ex1: "EX Ruby & Sapphire",
  ex2: "EX Sandstorm",
  ex3: "EX Dragon",
  ex4: "EX Team Magma vs Team Aqua",
  ex5: "EX Hidden Legends",
  ex6: "EX FireRed & LeafGreen",
  ex7: "EX Team Rocket Returns",
  ex8: "EX Deoxys",
  ex9: "EX Emerald",
  ex10: "EX Unseen Forces",
  ex11: "EX Delta Species",
  ex12: "EX Legend Maker",
  ex13: "EX Holon Phantoms",
  ex14: "EX Crystal Guardians",
  ex15: "EX Dragon Frontiers",
  ex16: "EX Power Keepers",
  // Diamond & Pearl / Platinum / HGSS (partial wiki coverage)
  dp4: "Great Encounters",
  dp7: "Stormfront",
  pl1: "Platinum",
  pl2: "Rising Rivals",
  pl4: "Arceus (TCG)",
  hgss1: "HeartGold & SoulSilver",
  // Black & White
  bw1: "Black & White",
  bw2: "Emerging Powers",
  bw3: "Noble Victories",
  bw4: "Next Destinies",
  bw5: "Dark Explorers",
  bw6: "Dragons Exalted",
  bw7: "Boundaries Crossed",
  bw8: "Plasma Storm",
  bw9: "Plasma Freeze",
  bw10: "Plasma Blast",
  bw11: "Legendary Treasures",
  // XY (early sets; BREAK-era pack art isn't on the wiki)
  xy1: "XY",
  xy2: "Flashfire",
  xy3: "Furious Fists",
  xy4: "Phantom Forces",
  xy5: "Primal Clash",
  xy6: "Roaring Skies",
  xy7: "Ancient Origins",
  // Sun & Moon (only sets whose single-pack art exists on the wiki)
  sm4: "Crimson Invasion",
  sm6: "Forbidden Light",
  sm8: "Lost Thunder",
  sm9: "Team Up",
  det1: "Detective Pikachu (TCG)",
  // Sword & Shield
  swsh1: "Sword & Shield",
  swsh2: "Rebel Clash",
  swsh3: "Darkness Ablaze",
  swsh35: "Champion's Path",
  swsh4: "Vivid Voltage",
  swsh45: "Shining Fates",
  swsh5: "Battle Styles",
  swsh6: "Chilling Reign",
  swsh7: "Evolving Skies",
  cel25: "Celebrations",
  swsh8: "Fusion Strike",
  swsh9: "Brilliant Stars",
  swsh10: "Astral Radiance",
  pgo: "Pokémon GO (TCG)",
  swsh11: "Lost Origin",
  swsh12: "Silver Tempest",
  swsh12pt5: "Crown Zenith",
  // Scarlet & Violet
  sv1: "Scarlet & Violet",
  sv2: "Paldea Evolved",
  sv3: "Obsidian Flames",
  sv3pt5: "151 (TCG)",
  sv4: "Paradox Rift",
  sv4pt5: "Paldean Fates",
  sv5: "Temporal Forces",
  sv6: "Twilight Masquerade",
  sv6pt5: "Shrouded Fable",
  sv7: "Stellar Crown",
  sv8: "Surging Sparks",
  sv8pt5: "Prismatic Evolutions",
  sv9: "Journey Together",
  sv10: "Destined Rivals",
  zsv10pt5: "Black Bolt",
  rsv10pt5: "White Flare",
  // Mega Evolution
  me1: "Mega Evolution",
  me2: "Phantasmal Flames",
  me2pt5: "Ascended Heroes",
  me3: "Perfect Order",
  me4: "Chaos Rising",
  me5: "Pitch Black",
};

// Boosters yes, ancillary product no. "Booster" is the modern convention;
// SV1 (Scarlet & Violet base set) instead uses lowercase " pack ".
const KEEP_RE = /\b(?:Booster|pack)\b/;
const DROP_RE =
  /\b(Bundle|Display|Box|Tin|Half|ETB|Elite|Collection|Premium|Logo|Symbol|SetSymbol|Deck|Blister|Sleeve|Mini)\b/i;
// Keep English only. Bulbapedia suffixes non-English wrappers with a language
// or country code (BR/DE/ES/FR/IT/KO/ZH/…), or spells the language out; the
// English print carries no marker.
const NON_EN_RE =
  /\b(Japanese|Korean|Chinese|Thai|German|French|Spanish|Italian|Portuguese|Dutch|Russian|Polish|Indonesian|JP|KR|JPN|BR|DE|ES|FR|IT|KO|ZH|NL|PT|RU|TW|PL|TH|ID)\b/;

interface CategoryMember {
  pageid: number;
  ns: number;
  title: string;
}

interface ImageInfo {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface ImageInfoPage {
  pageid?: number;
  title: string;
  imageinfo?: ImageInfo[];
}

async function callApi<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function listCategoryFiles(category: string): Promise<string[]> {
  interface Resp {
    query?: { categorymembers: CategoryMember[] };
    continue?: { cmcontinue: string };
  }
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  do {
    const resp: Resp = await callApi<Resp>({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "file",
      cmlimit: "500",
      ...(cmcontinue ? { cmcontinue } : {}),
    });
    for (const m of resp.query?.categorymembers ?? []) titles.push(m.title);
    cmcontinue = resp.continue?.cmcontinue;
  } while (cmcontinue);
  return titles;
}

async function resolveImageUrls(titles: string[]): Promise<Map<string, ImageInfo>> {
  interface Resp {
    query?: { pages: ImageInfoPage[] };
  }
  const out = new Map<string, ImageInfo>();
  // MediaWiki accepts up to 50 titles per request.
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const resp: Resp = await callApi<Resp>({
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "url|size",
    });
    for (const p of resp.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (info) out.set(p.title, info);
    }
  }
  return out;
}

function prettyName(title: string, category: string): string {
  // Strip "File:" prefix and ".png/.jpg" suffix.
  let s = title.replace(/^File:/, "").replace(/\.(png|jpg|jpeg|webp)$/i, "");
  s = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  // Drop English print-variant / housekeeping tails that aren't part of a name
  // ("Unlimited", "Shadowless", "Long", "EN", a trailing "copy").
  s = s.replace(/\b(Unlimited|Shadowless|Long|EN|copy)\b/gi, "").replace(/\s+/g, " ").trim();
  // Keep only what follows "Booster"/"pack" — drops the "SWSH11 Booster" /
  // "Neo Genesis Booster" prefix regardless of set-code shape.
  const m = s.match(/(?:Booster|pack)\s+(.+)$/i);
  s = m?.[1]?.trim() ?? "";
  // Solo pack with no per-variant suffix: fall back to the set name.
  if (s === "") s = category.replace(/\s*\(TCG\)$/i, "");
  return s.trim();
}

export async function fetchBoosters(opts: { log?: boolean } = {}): Promise<BoosterManifest> {
  const log = opts.log ?? false;
  const manifest: BoosterManifest = {};

  for (const [setId, category] of Object.entries(SET_CATEGORY)) {
    if (log) process.stdout.write(`${setId.padEnd(10)} ${category.padEnd(30)} `);
    try {
      const allFiles = await listCategoryFiles(category);
      const candidates = allFiles.filter(
        (t) => KEEP_RE.test(t) && !DROP_RE.test(t) && !NON_EN_RE.test(t),
      );
      if (candidates.length === 0) {
        if (log) process.stdout.write("(no boosters)\n");
        continue;
      }
      const urls = await resolveImageUrls(candidates);
      const entries: BoosterWrapper[] = [];
      for (const title of candidates) {
        const info = urls.get(title);
        if (!info) continue;
        // Packs are portrait. Anything landscape/square that slipped past the
        // title filters is a poster, sealed box, or multi-pack blister — drop it.
        if (info.height <= info.width) continue;
        entries.push({
          title,
          name: prettyName(title, category),
          url: info.url,
          width: info.width,
          height: info.height,
        });
      }
      entries.sort((a, b) => a.title.localeCompare(b.title));
      manifest[setId] = entries;
      if (log) process.stdout.write(`${entries.length} booster${entries.length === 1 ? "" : "s"}\n`);
    } catch (err) {
      if (log) process.stdout.write(`ERROR ${(err as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return manifest;
}

// Direct-execution entrypoint: `npx tsx scripts/ingest/fetchBoosters.ts`.
// Compared to ESM `import.meta.main` (which isn't widely available yet), this
// fileURL comparison works under tsx today.
const isMain = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return import.meta.url === new URL(`file://${argv1}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  fetchBoosters({ log: true })
    .then(async (manifest) => {
      const outPath = path.join(process.cwd(), "lib", "data", "boosters.json");
      await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`\nWrote ${outPath}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
