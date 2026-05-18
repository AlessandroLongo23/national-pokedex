# National Pokédex Binder Project

A long-term collecting project: acquire one Pokémon TCG card per National
Pokédex entry (#1–1025, Gen 1–9) and house them in a physical binder.

Last updated: 2026-05-17.

## Goal

One card per Pokémon, any printing counts (base form, V, VMAX, ex, regional
variant, etc. all count toward the same dex number). The collection is for
personal display, not resale, so condition/rarity is not the priority — coverage
is.

## Physical setup

- **Binder:** Vault X 16-pocket (4×4) XXL.
- **Placeholder PDF:** `pokedex_full.pdf` (not currently in this folder — was
  generated previously with PokeAPI official artwork via ReportLab). Layout is
  **3×3 per A4 page** (114 pages, all 1025 Pokémon). The 3×3 layout is
  intentional: A4 fits 9 card-sized images cleanly, so the workflow is to
  print on A4, **cut each placeholder out**, and insert it behind the real
  card sleeve in the 4×4 binder. The printed layout deliberately does NOT
  match the binder layout — do not "fix" this.

## Acquisition strategy

1. **Phase 1 (current):** Buy ~1 booster pack per week. Vary the set each week
   to reduce duplicate probability across packs.
2. **Phase 2:** When duplicate rate becomes high (most pulls already owned),
   switch to buying singles / trading for the remaining missing Pokémon.

## What's in this folder

```
National Pokédex/
├── README.md                       ← this file
└── SV_ME_Coverage_Dashboard.html   ← interactive coverage dashboard
```

`pokedex_full.pdf` (the placeholder PDF) was uploaded into a previous Cowork
session but is not stored in this folder. If you want to keep it as the
canonical source, drop a copy here.

## What's done so far

### 1. Placeholder PDF (done outside this repo)

Generated a 114-page A4 PDF with every Pokémon #1–1025 in 3×3 grid using
PokeAPI artwork. To print/cut/insert when the Vault X binder arrives.

### 2. Coverage analysis (this session)

Pulled the full set/card catalog from
[`PokemonTCG/pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data)
and computed which dex numbers are obtainable from currently-released
booster packs. Two TCG eras were analyzed:

- **Scarlet & Violet** series — 18 sets, Mar 2023 → Jul 2025
- **Mega Evolution** series — 4 sets, Sept 2025 → Mar 2026

**Combined headline numbers:**

| Metric | Value |
| --- | --- |
| National Pokédex total (Gen 1–9) | 1,025 |
| Obtainable from SV + ME boosters | **917 (89.5%)** |
| Missing (need singles / trade) | **108** |
| Added by ME era over SV alone | +36 |

**Coverage by generation:** Gens 1, 5, 9 are at 100%. Gen 7 is the worst
(~60%) — all 11 Ultra Beasts, Solgaleo, Lunala, Necrozma, Marshadow not
covered.

### 3. Interactive dashboard

`SV_ME_Coverage_Dashboard.html` is a single-file dashboard. Open it directly
in a browser. Features:

- Headline stats and per-generation bars.
- Section listing the 36 Pokémon the ME era added over SV.
- 1,025-cell grid (color-coded covered/missing). **Click a cell to mark
  that Pokémon as "owned"** — state persists in browser localStorage under
  key `sv_me_owned_v1`. Filter buttons: All / Covered / Missing / Owned /
  Still Needed.
- Sortable table of all 22 sets with distinct-Pokémon and unique-to-set
  counts.
- "Optimal buying order" — greedy ordering showing how many *new* Pokémon
  each set adds when bought in order. Top set: Ascended Heroes (+174).
- Searchable list of the 108 missing Pokémon.

## Data sources & methodology

- **Card data:** `PokemonTCG/pokemon-tcg-data` GitHub repo. JSON per set
  under `cards/en/<setid>.json`. Filter cards where
  `supertype == "Pokémon"`, then union `nationalPokedexNumbers`.
- **Dex # → name mapping:** Parsed
  `smogon/pokemon-showdown/data/pokedex.ts`. Filtered out alt-forme
  entries (those with a `baseSpecies` field) to keep one canonical name
  per dex number.
- **Series filter:** `series in {"Scarlet & Violet", "Mega Evolution"}`.
  Excluded the `sve` ("Scarlet & Violet Energies") set since it contains
  no Pokémon cards.

The analysis JSON blobs (raw extraction, intermediate stats, embed data)
live in the temporary outputs folder used during the Cowork session — they
were not copied here because the dashboard already has the embedded data.
If you need to re-derive anything, re-clone the source repo and re-run.

## Upcoming sets to incorporate (as of 2026-05-17)

These are announced/scheduled but not yet released, so not in the dashboard:

| Set | Era | Release date |
| --- | --- | --- |
| Chaos Rising | Mega Evolution | **2026-05-22** (5 days from now) |
| Pitch Black | Mega Evolution | 2026-07-17 |
| Storm Emerald | Mega Evolution | Aug/Sept 2026 |
| 30th Celebration (all-foil) | Special | 2026-09-18 |

Once Chaos Rising drops and the data repo ingests it, the dashboard should
be regenerated.

## Possible next steps

Pick whichever fits the next session:

1. **Regenerate dashboard with Chaos Rising** once it's in
   `pokemon-tcg-data`. The script needs to:
   - `git clone --depth=1 https://github.com/PokemonTCG/pokemon-tcg-data`
   - filter sets by `series in {"Scarlet & Violet", "Mega Evolution"}`
   - extract `nationalPokedexNumbers` from each Pokémon card
   - recompute totals, per-gen, per-set, greedy order
   - rewrite the HTML with the new embed JSON
2. **Export an Excel tracker** mirroring the dashboard's grid — useful
   for offline edits and printable lists of "missing" Pokémon to bring
   to a card shop. (`xlsx` skill is available.)
3. **Per-Pokémon cheapest-card lookup** — for each owned/needed Pokémon,
   find the cheapest currently-listed printing. Would require pricing
   data (`pokemontcg.io` has TCGplayer prices; Cardmarket prices are also
   available there).
4. **Print-ready singles checklist** — generate a compact PDF of just the
   108 missing Pokémon to take to a card shop or convention.
5. **Sync the dashboard's "owned" state to a real file** so it's not
   trapped in browser localStorage and can be version-controlled.

## Source / regeneration notes for Claude Code

The dashboard is a single self-contained HTML file with all data inlined
in a `const DATA = {...}` blob. Total size ~67 KB. The "owned" tracker uses
`localStorage` key `sv_me_owned_v1` (migrated from older `sv_owned_v1`).

If reading the dashboard programmatically, the embed JSON can be extracted
with a regex like `const DATA = (\{.*?\});\nconst TOTAL_COVERED`.

The `series` field in `pokemon-tcg-data` is the authoritative grouping for
"TCG era" — do not try to parse era from set ID or name.
