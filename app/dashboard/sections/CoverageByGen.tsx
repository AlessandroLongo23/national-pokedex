import { COVERAGE } from "@/lib/data";
import type { Generation } from "@/lib/data/types";

export function CoverageByGen() {
  const gens = [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[];

  return (
    <section className="my-8">
      <h2 className="mb-4 text-xl font-semibold">Coverage by Generation</h2>
      <div className="rounded-xl border border-border bg-panel p-5">
        {gens.map((g) => {
          const { covered, total } = COVERAGE.byGen[g];
          const pct = total === 0 ? 0 : Math.round((covered / total) * 100);
          return (
            <div
              key={g}
              className="my-2 grid grid-cols-[60px_1fr_110px] items-center gap-3 text-sm"
            >
              <span className="text-muted tabular-nums">
                <strong className="mr-1 text-text">Gen</strong>
                {g}
              </span>
              <div className="relative h-[22px] overflow-hidden rounded bg-missing-dark">
                <div
                  className="h-full bg-covered transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-white mix-blend-difference">
                  {pct}%
                </span>
              </div>
              <span className="text-right text-xs tabular-nums text-muted">
                {covered} / {total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
