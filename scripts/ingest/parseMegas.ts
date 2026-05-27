import { genOf, type CardEntry, type MegaForm, type MegaIndex } from "@/lib/data/types";

// Trailing card-product suffixes that need to be stripped before we extract
// the form. The historical TCG has cycled through "-EX", " GX", " V",
// " VMAX", " VSTAR" (uppercase) and the modern " ex" (lowercase).
const TRAILING_PRODUCT_SUFFIX = /[-\s]+(EX|GX|V|VMAX|VSTAR|ex)\s*$/;

// Names containing " & " are tag-team / LEGEND cards (e.g. "Mega Sableye &
// Tyranitar-GX"). They carry the MEGA subtype but are not single-Pokémon
// Megas, so we exclude them — they keep contributing to all dex# in their
// `dex` array regardless of the toggle.
const TAG_TEAM_SENTINEL = " & ";

const MEGA_PREFIX = /^Mega\s+/i;
const M_PREFIX = /^M\s+/;
const PRIMAL_PREFIX = /^Primal\s+/i;

export function normalizeMegaName(
  rawName: string,
): { formKey: string; displayName: string; isPrimal: boolean } | null {
  if (rawName.includes(TAG_TEAM_SENTINEL)) return null;

  let name = rawName.trim();
  // Strip stacked product suffixes (rare, but defensive — e.g. some custom
  // variant could be "M Charizard EX ex").
  while (TRAILING_PRODUCT_SUFFIX.test(name)) {
    name = name.replace(TRAILING_PRODUCT_SUFFIX, "").trim();
  }

  let displayName: string;
  let isPrimal = false;
  if (MEGA_PREFIX.test(name)) {
    displayName = "Mega " + name.replace(MEGA_PREFIX, "").trim();
  } else if (M_PREFIX.test(name)) {
    displayName = "Mega " + name.replace(M_PREFIX, "").trim();
  } else if (PRIMAL_PREFIX.test(name)) {
    displayName = "Primal " + name.replace(PRIMAL_PREFIX, "").trim();
    isPrimal = true;
  } else {
    // MEGA-subtype card whose name doesn't start with M/Mega/Primal — data
    // anomaly. Skip it.
    return null;
  }

  const formKey = displayName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return { formKey, displayName, isPrimal };
}

interface MegaDiscovery {
  megas: MegaForm[];
  cardIndexByMega: MegaIndex;
}

export function discoverMegas(cardsBySet: Record<string, CardEntry[]>): MegaDiscovery {
  const byKey = new Map<
    string,
    { form: MegaForm; cardIds: string[]; baseDexes: Set<number> }
  >();

  for (const cards of Object.values(cardsBySet)) {
    for (const card of cards) {
      if (!card.megaFormKey) continue;
      const baseDex = card.dex[0];
      if (baseDex === undefined) continue;
      const normalized = normalizeMegaName(card.name);
      if (!normalized) continue;

      let entry = byKey.get(card.megaFormKey);
      if (!entry) {
        entry = {
          form: {
            formKey: card.megaFormKey,
            displayName: normalized.displayName,
            baseDex,
            gen: genOf(baseDex),
            isPrimal: normalized.isPrimal,
          },
          cardIds: [],
          baseDexes: new Set<number>(),
        };
        byKey.set(card.megaFormKey, entry);
      }
      entry.cardIds.push(card.id);
      entry.baseDexes.add(baseDex);
    }
  }

  // Warn (and pick lowest) if a single formKey aggregates cards from
  // disagreeing baseDexes — almost certainly a data anomaly we want to know
  // about during ingest.
  for (const entry of byKey.values()) {
    if (entry.baseDexes.size > 1) {
      const dexes = [...entry.baseDexes].sort((a, b) => a - b);
      console.warn(
        `[ingest] mega "${entry.form.formKey}" spans multiple baseDexes: ${dexes.join(", ")} — using ${dexes[0]}`,
      );
      entry.form.baseDex = dexes[0]!;
      entry.form.gen = genOf(dexes[0]!);
    }
  }

  const megas = [...byKey.values()]
    .map((e) => e.form)
    .sort((a, b) => a.baseDex - b.baseDex || a.formKey.localeCompare(b.formKey));

  const cardIndexByMega: MegaIndex = {};
  for (const entry of byKey.values()) {
    cardIndexByMega[entry.form.formKey] = entry.cardIds;
  }

  return { megas, cardIndexByMega };
}
