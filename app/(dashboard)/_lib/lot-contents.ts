// Pure contents-diff math for card lots, isolated from the server-action
// module so it stays unit-testable (a "use server" file may only export
// async functions).

export interface LotContentRow {
  cardId: string;
  quantity: number;
}

export interface LotContentsDiff {
  /** Cards in `next` whose quantity differs from `existing` (includes new). */
  upserts: LotContentRow[];
  /** Cards present in `existing` but absent from `next`. */
  removals: string[];
  /** Union of changed cards, parallel to `deltas`. */
  deltaCardIds: string[];
  /** Per-card owned-quantity delta: next - existing (existing 0 if new, -existing if removed). */
  deltas: number[];
}

export function diffLotContents(
  existing: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
): LotContentsDiff {
  const upserts: LotContentRow[] = [];
  const removals: string[] = [];
  const deltaCardIds: string[] = [];
  const deltas: number[] = [];

  for (const [cardId, qty] of next) {
    const prev = existing.get(cardId) ?? 0;
    if (qty !== prev) {
      upserts.push({ cardId, quantity: qty });
      deltaCardIds.push(cardId);
      deltas.push(qty - prev);
    }
  }
  for (const [cardId, prev] of existing) {
    if (!next.has(cardId)) {
      removals.push(cardId);
      deltaCardIds.push(cardId);
      deltas.push(-prev);
    }
  }
  return { upserts, removals, deltaCardIds, deltas };
}
