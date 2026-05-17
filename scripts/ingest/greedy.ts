import type { GreedyEntry, SetInfo } from "@/lib/data/types";

export function computeGreedyOrder(sets: SetInfo[]): GreedyEntry[] {
  const remaining = new Map(sets.map((s) => [s.id, s]));
  const covered = new Set<number>();
  const result: GreedyEntry[] = [];

  while (remaining.size > 0) {
    let best: { set: SetInfo; newCount: number } | null = null;
    for (const set of remaining.values()) {
      const newCount = set.dexNumbers.filter((n) => !covered.has(n)).length;
      if (!best) {
        best = { set, newCount };
        continue;
      }
      if (newCount > best.newCount) {
        best = { set, newCount };
      } else if (newCount === best.newCount && set.releaseDate < best.set.releaseDate) {
        best = { set, newCount };
      }
    }
    if (!best) break;
    for (const n of best.set.dexNumbers) covered.add(n);
    result.push({
      rank: result.length + 1,
      setId: best.set.id,
      setName: best.set.name,
      newCount: best.newCount,
      cumulative: covered.size,
      releaseDate: best.set.releaseDate,
    });
    remaining.delete(best.set.id);
  }

  return result;
}
