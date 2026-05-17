import { GREEDY, POKEDEX } from "@/lib/data";

export function GreedyOrder() {
  const total = POKEDEX.length;
  return (
    <section className="my-8">
      <h2 className="mb-2 text-xl font-semibold">Optimal buying order</h2>
      <p className="mb-3 text-sm text-muted">
        Greedy: at each step, buy the set that adds the most <em>new</em> Pokémon.
      </p>
      <div className="rounded-xl border border-border bg-panel p-4">
        {GREEDY.map((g) => {
          const pct = Math.round((g.cumulative / total) * 100);
          return (
            <div
              key={g.setId}
              className="grid grid-cols-[30px_1fr_auto] items-center gap-3 border-b border-border py-2 text-sm last:border-b-0"
            >
              <span className="text-base font-bold text-accent tabular-nums">{g.rank}</span>
              <div>
                <div className="font-medium">{g.setName}</div>
                <div className="text-[11px] text-muted">{g.releaseDate}</div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-panel-2">
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-covered tabular-nums">
                  +{g.newCount}
                </div>
                <div className="text-[11px] text-muted tabular-nums">{g.cumulative} cum</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
