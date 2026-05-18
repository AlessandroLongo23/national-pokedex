export interface AcquisitionRow {
  acquired_at: string;
}

export interface CumulativePoint {
  date: string;
  count: number;
}

function toUtcDay(iso: string): string {
  return iso.slice(0, 10);
}

function addOneUtcDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function cumulativeByDay(rows: AcquisitionRow[]): CumulativePoint[] {
  if (rows.length === 0) return [];

  const perDay = new Map<string, number>();
  for (const r of rows) {
    const day = toUtcDay(r.acquired_at);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const days = [...perDay.keys()].sort();
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const out: CumulativePoint[] = [];
  let running = 0;
  let cursor = first;
  while (true) {
    running += perDay.get(cursor) ?? 0;
    out.push({ date: cursor, count: running });
    if (cursor === last) break;
    cursor = addOneUtcDay(cursor);
  }
  return out;
}
