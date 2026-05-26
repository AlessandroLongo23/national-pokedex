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

// pokemontcg.io setId → Bulbapedia category name. Promo sets that don't have
// retail boosters are excluded entirely.
const SET_CATEGORY: Record<string, string> = {
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
  me1: "Mega Evolution",
  me2: "Phantasmal Flames",
  me2pt5: "Ascended Heroes",
  me3: "Perfect Order",
  me4: "Chaos Rising",
};

// Boosters yes, ancillary product no. "Booster" is the modern convention;
// SV1 (Scarlet & Violet base set) instead uses lowercase " pack ".
const KEEP_RE = /\b(?:Booster|pack)\b/;
const DROP_RE = /\b(Bundle|Display|Box|Tin|Half|ETB|Elite|Collection|Premium|Logo|Symbol|SetSymbol)\b/i;
// JP/KR variants — keep English only.
const NON_EN_RE = /\b(Japanese|Korean|JP|KR|JPN)\b/i;

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
  // Strip common prefixes like "SV8 Booster ", "ME1 Booster ".
  const prefix = s.match(/^[A-Z]+\d+(?:\.\d+)?(?:\s+[A-Z]{2,3})?\s+(?:Booster|pack)\s+/i);
  if (prefix) s = s.slice(prefix[0].length);
  // "EN" alone after stripping = single-variant pack; use the set name.
  if (/^EN$/i.test(s) || s.trim() === "") s = category.replace(/\s*\(TCG\)$/i, "");
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
