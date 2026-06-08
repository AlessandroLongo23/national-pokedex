"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { GEN_NAMES, GEN_RANGES, type Generation, type PokedexEntry, type SetInfo } from "@/lib/data/types";
import {
  SUBTYPE_SCOPE_VALUES,
  SUBTYPE_SCOPE_LABEL,
  type ScopeType,
  type SubtypeScopeValue,
} from "@/lib/data/binder-scope";
import { createBinder } from "../../_lib/binder-actions";
import { typeBackground } from "../../_components/pokemonTypeColors";

const TCG_TYPES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Dragon",
  "Colorless",
  "Fairy",
] as const;

// TCG type name → closest video-game-type palette key in pokemonTypeColors.
const TYPE_COLOR_ALIAS: Record<string, string[]> = {
  Grass: ["Grass"],
  Fire: ["Fire"],
  Water: ["Water"],
  Lightning: ["Electric"],
  Psychic: ["Psychic"],
  Fighting: ["Fighting"],
  Darkness: ["Dark"],
  Metal: ["Steel"],
  Dragon: ["Dragon"],
  Colorless: ["Normal"],
};

const SCOPE_OPTIONS: { value: ScopeType; label: string; blurb: string }[] = [
  { value: "pokedex", label: "Pokédex", blurb: "One card per species across a dex range or region." },
  { value: "master_set", label: "Master set", blurb: "Every card in one TCG set." },
  { value: "pokemon", label: "By Pokémon", blurb: "Every card for one Pokémon." },
  { value: "subtype", label: "By category", blurb: "All Trainers, Items, Stadiums, Energies, etc." },
  { value: "named_card", label: "By card name", blurb: "Every printing of one Trainer or Energy card." },
  { value: "artist", label: "By artist", blurb: "Every card by one illustrator." },
  { value: "type", label: "By type", blurb: "Every card of a TCG type." },
  { value: "position", label: "By position", blurb: 'Every card matching a number, e.g. "1" across sets.' },
  { value: "custom", label: "Custom", blurb: "A hand-picked list. Add cards on the binder page." },
];

const REGION_PRESETS: { key: string; label: string; range: [number, number] }[] = [
  { key: "national", label: "National (1–1025)", range: [1, 1025] },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]).map((g) => {
    const [a, b] = GEN_RANGES[g];
    return { key: `gen-${g}`, label: `${GEN_NAMES[g]} (${a}–${b})`, range: [a, b] as [number, number] };
  }),
];

interface Props {
  sets: SetInfo[];
  pokedex: PokedexEntry[];
  artists: string[];
  cardNames: string[];
}

export function NewBinderFlow({ sets, pokedex, artists, cardNames }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [scopeType, setScopeType] = useState<ScopeType>("pokedex");
  const [setId, setSetId] = useState<string>("");
  const [dexInput, setDexInput] = useState<string>("");
  const [artist, setArtist] = useState<string>("");
  const [typeName, setTypeName] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [subtypeValue, setSubtypeValue] = useState<SubtypeScopeValue | "">("");
  const [cardName, setCardName] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [nameTouched, setNameTouched] = useState(false);
  const [dexRangePreset, setDexRangePreset] = useState<string>("national");
  const [dexFrom, setDexFrom] = useState<number>(1);
  const [dexTo, setDexTo] = useState<number>(1025);

  function applyPreset(key: string) {
    setDexRangePreset(key);
    const preset = REGION_PRESETS.find((p) => p.key === key);
    if (preset) {
      setDexFrom(preset.range[0]);
      setDexTo(preset.range[1]);
    }
  }

  const sortedSets = useMemo(
    () => [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
    [sets],
  );

  // Parse "Pikachu" or "25" or "25 · Pikachu" → matched PokedexEntry.
  const matchedDex = useMemo<PokedexEntry | null>(() => {
    const raw = dexInput.trim();
    if (!raw) return null;
    const asNum = Number(raw);
    if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 1025) {
      return pokedex.find((p) => p.dex === asNum) ?? null;
    }
    const m = raw.match(/^(\d+)\b/);
    if (m && m[1]) {
      const n = Number(m[1]);
      const hit = pokedex.find((p) => p.dex === n);
      if (hit) return hit;
    }
    const lc = raw.toLowerCase();
    return pokedex.find((p) => p.name.toLowerCase() === lc) ?? null;
  }, [dexInput, pokedex]);

  const suggestedName = useMemo<string>(() => {
    switch (scopeType) {
      case "master_set": {
        const s = sets.find((x) => x.id === setId);
        return s ? `Master set · ${s.name}` : "";
      }
      case "pokemon":
        return matchedDex ? `Pokémon · ${matchedDex.name} #${matchedDex.dex}` : "";
      case "artist":
        return artist ? `Artist · ${artist}` : "";
      case "type":
        return typeName ? `Type · ${typeName}` : "";
      case "position":
        return position ? `Position · #${position}` : "";
      case "custom":
        return "New custom binder";
      case "pokedex": {
        const preset = REGION_PRESETS.find(
          (p) => p.range[0] === dexFrom && p.range[1] === dexTo,
        );
        return preset
          ? `Pokédex · ${preset.label.replace(/\s*\([^)]*\)\s*$/, "")}`
          : `Pokédex · #${dexFrom}–${dexTo}`;
      }
      case "subtype":
        return subtypeValue ? SUBTYPE_SCOPE_LABEL[subtypeValue] : "";
      case "named_card":
        return cardName ? `Card · ${cardName}` : "";
    }
  }, [scopeType, setId, sets, matchedDex, artist, typeName, position, dexFrom, dexTo, subtypeValue, cardName]);

  const effectiveName = nameTouched || !suggestedName ? name : suggestedName;

  const isValid = useMemo<boolean>(() => {
    if (!effectiveName.trim()) return false;
    switch (scopeType) {
      case "master_set":
        return Boolean(setId && sets.some((s) => s.id === setId));
      case "pokemon":
        return Boolean(matchedDex);
      case "artist":
        return artists.includes(artist);
      case "type":
        return (TCG_TYPES as readonly string[]).includes(typeName);
      case "position":
        return position.trim().length > 0;
      case "custom":
        return true;
      case "pokedex":
        return (
          Number.isInteger(dexFrom) &&
          Number.isInteger(dexTo) &&
          dexFrom >= 1 &&
          dexTo >= 1 &&
          dexFrom <= 1025 &&
          dexTo <= 1025 &&
          dexFrom <= dexTo
        );
      case "subtype":
        return (SUBTYPE_SCOPE_VALUES as readonly string[]).includes(subtypeValue);
      case "named_card":
        return cardNames.includes(cardName);
    }
  }, [scopeType, effectiveName, setId, sets, matchedDex, artist, artists, typeName, position, dexFrom, dexTo, subtypeValue, cardName, cardNames]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValid) return;
    start(async () => {
      try {
        const payload = buildPayload();
        if (!payload) return;
        const { id } = await createBinder({ ...payload, name: effectiveName.trim() });
        router.push(`/binders/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create binder");
      }
    });
  }

  function buildPayload():
    | { scopeType: "master_set"; setId: string }
    | { scopeType: "pokemon"; dex: number }
    | { scopeType: "artist"; artist: string }
    | { scopeType: "type"; type: string }
    | { scopeType: "position"; number: string }
    | { scopeType: "custom" }
    | { scopeType: "pokedex"; dexFrom: number; dexTo: number }
    | { scopeType: "subtype"; subtype: SubtypeScopeValue }
    | { scopeType: "named_card"; name: string }
    | null {
    switch (scopeType) {
      case "master_set":
        return { scopeType, setId };
      case "pokemon":
        return matchedDex ? { scopeType, dex: matchedDex.dex } : null;
      case "artist":
        return { scopeType, artist };
      case "type":
        return { scopeType, type: typeName };
      case "position":
        return { scopeType, number: position.trim() };
      case "custom":
        return { scopeType };
      case "pokedex":
        return { scopeType, dexFrom, dexTo };
      case "subtype":
        return subtypeValue ? { scopeType, subtype: subtypeValue } : null;
      case "named_card":
        return cardName ? { scopeType, name: cardName } : null;
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-[11px] uppercase tracking-wider text-muted">Scope</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SCOPE_OPTIONS.map((opt) => {
            const active = opt.value === scopeType;
            return (
              <label
                key={opt.value}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition",
                  active
                    ? "border-accent bg-panel-2"
                    : "border-border bg-panel hover:border-border-strong",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="scope"
                  value={opt.value}
                  checked={active}
                  onChange={() => setScopeType(opt.value)}
                  className="sr-only"
                />
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="mt-0.5 text-xs text-muted">{opt.blurb}</div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-lg border border-border bg-panel p-4">
        {scopeType === "master_set" && (
          <label className="block space-y-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">Set</span>
            <select
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
            >
              <option value="">Choose a set…</option>
              {sortedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.series})
                </option>
              ))}
            </select>
          </label>
        )}

        {scopeType === "pokemon" && (
          <label className="block space-y-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Pokémon (name or dex number)
            </span>
            <input
              list="pokedex-list"
              value={dexInput}
              onChange={(e) => setDexInput(e.target.value)}
              placeholder="e.g. Pikachu or 25"
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
            />
            <datalist id="pokedex-list">
              {pokedex.map((p) => (
                <option key={p.dex} value={`${p.dex} · ${p.name}`} />
              ))}
            </datalist>
            {dexInput && !matchedDex && (
              <p className="text-xs text-missing">No match. Pick a name or dex# from the list.</p>
            )}
          </label>
        )}

        {scopeType === "artist" && (
          <label className="block space-y-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">Artist</span>
            <input
              list="artist-list"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Start typing an illustrator name…"
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
            />
            <datalist id="artist-list">
              {artists.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            {artist && !artists.includes(artist) && (
              <p className="text-xs text-missing">No match. Pick an artist from the list.</p>
            )}
          </label>
        )}

        {scopeType === "type" && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">TCG type</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TCG_TYPES.map((t) => {
                const active = t === typeName;
                const colorTypes = TYPE_COLOR_ALIAS[t] ?? [t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeName(t)}
                    className={[
                      "rounded-md border px-2 py-2 text-sm font-medium transition",
                      active ? "border-accent" : "border-border hover:border-border-strong",
                    ].join(" ")}
                    style={{ background: typeBackground(colorTypes, active ? 0.55 : 0.3) }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {scopeType === "position" && (
          <label className="block space-y-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Card number (exact match across sets)
            </span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder='e.g. "1", "1a", "TG01"'
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
            />
            <p className="text-xs text-muted">
              Matches every card with this exact number — e.g. {'"'}1{'"'} returns the #1 of every
              set.
            </p>
          </label>
        )}

        {scopeType === "custom" && (
          <p className="text-sm text-muted">
            A custom binder starts empty. After creating it, use the binder page to add cards.
          </p>
        )}

        {scopeType === "subtype" && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">Category</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUBTYPE_SCOPE_VALUES.map((v) => {
                const active = v === subtypeValue;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSubtypeValue(v)}
                    className={[
                      "rounded-md border px-3 py-2 text-sm font-medium transition",
                      active
                        ? "border-accent bg-panel-2"
                        : "border-border bg-panel hover:border-border-strong",
                    ].join(" ")}
                  >
                    {SUBTYPE_SCOPE_LABEL[v]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              Filters every card of the chosen category across every set.
            </p>
          </div>
        )}

        {scopeType === "named_card" && (
          <label className="block space-y-2 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Card name (Trainer or Energy)
            </span>
            <input
              list="card-name-list"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="e.g. Professor's Research"
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
            />
            <datalist id="card-name-list">
              {cardNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {cardName && !cardNames.includes(cardName) && (
              <p className="text-xs text-missing">No match. Pick a Trainer or Energy name from the list.</p>
            )}
            <p className="text-xs text-muted">
              Matches every printing of this card by exact name. For Pokémon, use the
              {" "}<em>By Pokémon</em> scope instead.
            </p>
          </label>
        )}

        {scopeType === "pokedex" && (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Region</div>
            <div className="flex flex-wrap gap-2">
              {REGION_PRESETS.map((p) => {
                const active = dexRangePreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className={[
                      "rounded-md border px-2.5 py-1 text-xs transition",
                      active
                        ? "border-accent bg-panel-2"
                        : "border-border bg-panel hover:border-border-strong",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setDexRangePreset("custom")}
                className={[
                  "rounded-md border px-2.5 py-1 text-xs transition",
                  dexRangePreset === "custom"
                    ? "border-accent bg-panel-2"
                    : "border-border bg-panel hover:border-border-strong",
                ].join(" ")}
              >
                Custom range…
              </button>
            </div>
            {dexRangePreset === "custom" && (
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1">
                  <span className="text-xs text-muted">From</span>
                  <input
                    type="number"
                    min={1}
                    max={1025}
                    value={dexFrom}
                    onChange={(e) => setDexFrom(Number(e.target.value) || 0)}
                    className="w-20 rounded-md border border-border bg-panel-2 px-2 py-1 text-base md:text-sm"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-xs text-muted">To</span>
                  <input
                    type="number"
                    min={1}
                    max={1025}
                    value={dexTo}
                    onChange={(e) => setDexTo(Number(e.target.value) || 0)}
                    className="w-20 rounded-md border border-border bg-panel-2 px-2 py-1 text-base md:text-sm"
                  />
                </label>
                {dexFrom > dexTo && (
                  <span className="text-xs text-missing">From must be ≤ To.</span>
                )}
              </div>
            )}
            <p className="text-xs text-muted">
              {dexTo - dexFrom + 1} species in this range. Progress counts species you own
              (any card of that Pokémon).
            </p>
          </div>
        )}
      </div>

      <label className="block space-y-2 text-sm">
        <span className="text-[11px] uppercase tracking-wider text-muted">Name</span>
        <input
          type="text"
          value={effectiveName}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
          maxLength={80}
          placeholder={suggestedName || "Name your binder"}
          className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base md:text-sm"
        />
      </label>

      {error && (
        <p className="rounded-md border border-missing/40 bg-missing/10 px-3 py-2 text-sm text-missing">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={!isValid || pending}
          className="rounded-md border border-accent bg-accent/10 px-4 py-1.5 text-sm font-medium text-text transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create binder"}
        </button>
      </div>
    </form>
  );
}
