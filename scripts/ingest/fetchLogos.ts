/**
 * Fetch high-resolution set logos from the Bulbagarden Archives MediaWiki API.
 *
 * pokemontcg.io's `logo.png` is fine at small sizes but soft when blown up in
 * the set-detail hero (e.g. Lost Origin ships only 565x218). Bulbagarden hosts
 * a taller "<CODE> Logo EN" master for most expansions. For each set we already
 * map for boosters (see SET_CATEGORY), pick the best English logo, and keep it
 * ONLY when it is taller than the pokemontcg.io default — never a downgrade
 * (Base Set's pokemontcg logo is 2500px and stays).
 *
 * Run standalone: `npx tsx scripts/ingest/fetchLogos.ts`
 * Or import `fetchLogos()` from this module.
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { LogoManifest, SetInfo, SetLogoImage } from "@/lib/data/types";
import { SET_CATEGORY } from "./fetchBoosters";

const USER_AGENT = "national-pokedex/0.1 (https://github.com/local; longoa02@gmail.com)";
const API = "https://archives.bulbagarden.net/w/api.php";

const LOGO_RE = /\bLogo\b/i;
// Logo art only — not banners, symbols, expansion-series marks, or product shots.
const DROP_RE = /\b(Expansion|Series|Symbol|Banner|Booster|pack|Box|Deck|Promo|Sleeve|Old)\b/i;
const NON_EN_RE =
  /\b(Japanese|Korean|Chinese|Thai|German|French|Spanish|Italian|Portuguese|Dutch|Russian|Polish|Indonesian|JP|KR|JPN|BR|DE|ES|FR|IT|KO|ZH|NL|PT|RU|TW|PL|TH|ID)\b/;

// Cap stored logos to this rendered width. The hero shows them ~128px tall and
// up to ~480px wide; ~960px covers 2x displays with headroom while keeping the
// download small (some Bulbagarden masters are 4000-5600px / several MB).
const THUMB_WIDTH = 960;

interface ImageInfo {
  url: string;
  width: number;
  height: number;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
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
    query?: { categorymembers: { title: string }[] };
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

async function resolveImageInfo(titles: string[]): Promise<Map<string, ImageInfo>> {
  interface Resp {
    query?: { pages: { title: string; imageinfo?: ImageInfo[] }[] };
  }
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const resp: Resp = await callApi<Resp>({
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "url|size",
      iiurlwidth: String(THUMB_WIDTH),
    });
    for (const p of resp.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (info) out.set(p.title, info);
    }
  }
  return out;
}

/** Height of a remote PNG/JPEG by reading its header. Null if unreadable. */
async function remoteImageHeight(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // PNG: IHDR height is a big-endian uint32 at byte 20.
    if (buf.length > 24 && buf.toString("ascii", 12, 16) === "IHDR") {
      return buf.readUInt32BE(20);
    }
    // JPEG: walk segments to the first SOF marker; height precedes width.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1]!;
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return buf.readUInt16BE(i + 5);
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Best English logo in a category: prefer "Logo EN", then the tallest source. */
function pickLogo(infos: Map<string, ImageInfo>): [string, ImageInfo] | null {
  const candidates = [...infos.entries()].filter(
    ([t]) => LOGO_RE.test(t) && !DROP_RE.test(t) && !NON_EN_RE.test(t),
  );
  if (candidates.length === 0) return null;
  const en = candidates.filter(([t]) => /\bLogo\s+EN\b/i.test(t));
  const pool = en.length ? en : candidates;
  pool.sort((a, b) => b[1].height - a[1].height);
  return pool[0]!;
}

export async function fetchLogos(
  opts: { log?: boolean; sets?: SetInfo[] } = {},
): Promise<LogoManifest> {
  const log = opts.log ?? false;
  // Use freshly-built sets when called from the pipeline; otherwise read the
  // committed sets.json for standalone runs.
  const sets =
    opts.sets ??
    (JSON.parse(
      readFileSync(path.join(process.cwd(), "lib", "data", "sets.json"), "utf8"),
    ) as SetInfo[]);
  const byId = new Map(sets.map((s) => [s.id, s]));
  const manifest: LogoManifest = {};

  for (const [setId, category] of Object.entries(SET_CATEGORY)) {
    if (log) process.stdout.write(`${setId.padEnd(10)} ${category.padEnd(28)} `);
    try {
      const files = (await listCategoryFiles(category)).filter(
        (t) => LOGO_RE.test(t) && !DROP_RE.test(t) && !NON_EN_RE.test(t),
      );
      const infos = await resolveImageInfo(files);
      const picked = pickLogo(infos);
      if (!picked) {
        if (log) process.stdout.write("(no logo)\n");
        continue;
      }
      const [title, best] = picked;
      const current = byId.get(setId)?.logoUrl;
      const currentHeight = current ? await remoteImageHeight(current) : null;
      // Compare the full-res Bulbagarden source against the current logo; only
      // override on a real upgrade. If the current logo can't be measured,
      // require a comfortably large master (>=400px tall).
      const upgrade =
        currentHeight !== null ? best.height > currentHeight : best.height >= 400;
      if (!upgrade) {
        if (log) process.stdout.write(`keep pokemontcg (${best.height} <= ${currentHeight})\n`);
        continue;
      }
      // Store the width-capped thumbnail, not the (possibly multi-MB) original.
      const entry: SetLogoImage = {
        url: best.thumburl ?? best.url,
        width: best.thumbwidth ?? best.width,
        height: best.thumbheight ?? best.height,
      };
      manifest[setId] = entry;
      if (log) {
        process.stdout.write(
          `${entry.width}x${entry.height}  (src ${best.height}h, was ${currentHeight}h)  ${title.replace(/^File:/, "")}\n`,
        );
      }
    } catch (err) {
      if (log) process.stdout.write(`ERROR ${(err as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return manifest;
}

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
  fetchLogos({ log: true })
    .then(async (manifest) => {
      const outPath = path.join(process.cwd(), "lib", "data", "logos.json");
      await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`\nWrote ${outPath} (${Object.keys(manifest).length} overrides)`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
