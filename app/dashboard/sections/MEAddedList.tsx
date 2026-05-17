import { COVERAGE, POKEDEX } from "@/lib/data";

export function MEAddedList() {
  const byDex = new Map(POKEDEX.map((p) => [p.dex, p]));
  const items = COVERAGE.meAdded
    .map((d) => byDex.get(d))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section className="my-8">
      <h2 className="mb-2 text-xl font-semibold">
        What the Mega Evolution era added{" "}
        <span className="ml-2 text-sm font-normal text-muted">({items.length})</span>
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        These Pokémon were <strong className="text-text">missing from every SV-era set</strong> and
        are now obtainable thanks to Mega Evolution sets.
      </p>
      <div className="rounded-xl border border-me-tint/25 bg-me-tint/[0.06] p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
          {items.map((p) => (
            <div
              key={p.dex}
              className="rounded border-l-2 border-me-tint bg-me-tint/10 px-2 py-1 text-xs"
            >
              <span className="mr-1 text-[10px] tabular-nums text-muted">#{p.dex}</span>
              {p.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
