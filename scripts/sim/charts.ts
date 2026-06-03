// Hand-rolled inline-SVG charts. No dependencies: each function is a pure
// (data) => "<svg>…</svg>" string that gets inlined into the HTML report and
// rendered to PDF by headless Chrome. Colours and fonts are inline so nothing
// is fetched from the network at print time.

export const PALETTE: Record<string, string> = {
  best: "#2563eb", // blue
  random: "#dc2626", // red
  least: "#16a34a", // green
};

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const AXIS = "#94a3b8";
const GRID = "#e2e8f0";
const INK = "#0f172a";
const MUTED = "#64748b";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function txt(
  x: number,
  y: number,
  s: string,
  o: { size?: number; fill?: string; anchor?: string; weight?: number } = {},
): string {
  const size = o.size ?? 12;
  const fill = o.fill ?? INK;
  const anchor = o.anchor ?? "start";
  const weight = o.weight ?? 400;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

function niceStep(range: number, targetTicks = 5): number {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

export interface SeriesCurve {
  key: string;
  label: string;
  mean: number[];
  ciLo: number[];
  ciHi: number[];
}

// ── Chart 1: mean distinct species vs packs opened (log-x), CI ribbons,
// ceiling reference lines, checkpoint gridlines. ───────────────────────────
export function speciesCurveChart(
  series: SeriesCurve[],
  opts: {
    budget: number;
    checkpoints: number[];
    achievableCeiling: number;
    catalogCeiling: number;
    nationalDex: number;
  },
): string {
  const W = 680;
  const H = 420;
  const padL = 52;
  const padR = 24;
  const padT = 46;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const budget = opts.budget;
  const logMax = Math.log(budget);
  const xOf = (pack: number) => padL + (Math.log(Math.max(1, pack)) / logMax) * plotW;

  const yMaxRaw = Math.max(opts.achievableCeiling, ...series.map((s) => Math.max(...s.ciHi)));
  const yStep = niceStep(yMaxRaw, 6);
  const yMax = Math.ceil(yMaxRaw / yStep) * yStep;
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);

  // y gridlines + labels
  for (let v = 0; v <= yMax + 0.5; v += yStep) {
    const y = yOf(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(txt(padL - 8, y + 4, String(v), { size: 11, fill: MUTED, anchor: "end" }));
  }
  // x gridlines at checkpoints + decade ticks
  const xticks = Array.from(new Set([1, 10, 100, ...opts.checkpoints, budget])).sort((a, b) => a - b);
  for (const t of xticks) {
    if (t > budget) continue;
    const x = xOf(t);
    const isCheckpoint = opts.checkpoints.includes(t);
    parts.push(
      `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="${isCheckpoint ? "#cbd5e1" : GRID}" stroke-width="1" ${isCheckpoint ? 'stroke-dasharray="3 3"' : ""}/>`,
    );
    parts.push(txt(x, padT + plotH + 16, String(t), { size: 11, fill: MUTED, anchor: "middle" }));
  }
  parts.push(txt(padL + plotW / 2, H - 8, "Packs opened (log scale)", { size: 12, fill: INK, anchor: "middle" }));
  parts.push(
    `<text x="14" y="${padT + plotH / 2}" font-family="${FONT}" font-size="12" fill="${INK}" text-anchor="middle" transform="rotate(-90 14 ${padT + plotH / 2})">Distinct species collected</text>`,
  );

  // ceiling lines
  const ceilY = yOf(opts.achievableCeiling);
  parts.push(
    `<line x1="${padL}" y1="${ceilY}" x2="${W - padR}" y2="${ceilY}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    txt(W - padR, ceilY - 6, `achievable ceiling · ${opts.achievableCeiling}`, {
      size: 10.5,
      fill: MUTED,
      anchor: "end",
    }),
  );

  // CI ribbons (skip pack 1..a few where variance can be jumpy — start at 1 anyway)
  const step = Math.max(1, Math.floor(budget / 240)); // cap path density
  for (const s of series) {
    const color = PALETTE[s.key] ?? INK;
    const up: string[] = [];
    const dn: string[] = [];
    for (let i = 0; i < s.mean.length; i += step) {
      const x = xOf(i + 1);
      up.push(`${x.toFixed(1)},${yOf(s.ciHi[i]!).toFixed(1)}`);
      dn.push(`${x.toFixed(1)},${yOf(s.ciLo[i]!).toFixed(1)}`);
    }
    dn.reverse();
    parts.push(`<polygon points="${up.concat(dn).join(" ")}" fill="${color}" fill-opacity="0.13" stroke="none"/>`);
  }
  // mean lines
  for (const s of series) {
    const color = PALETTE[s.key] ?? INK;
    const pts: string[] = [];
    for (let i = 0; i < s.mean.length; i += step) {
      pts.push(`${xOf(i + 1).toFixed(1)},${yOf(s.mean[i]!).toFixed(1)}`);
    }
    // ensure last point included
    const li = s.mean.length - 1;
    pts.push(`${xOf(li + 1).toFixed(1)},${yOf(s.mean[li]!).toFixed(1)}`);
    parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"/>`);
  }

  // legend (top-left)
  let lx = padL + 6;
  const ly = padT - 24;
  for (const s of series) {
    const color = PALETTE[s.key] ?? INK;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="14" height="4" rx="2" fill="${color}"/>`);
    parts.push(txt(lx + 20, ly - 4, s.label, { size: 12, fill: INK }));
    lx += 22 + s.label.length * 7.0;
  }

  parts.push(`</svg>`);
  return parts.join("");
}

// ── Chart 2: small-multiple dot-and-CI panels, one per checkpoint, each with a
// zoomed y-axis so differences are visible at every scale. ──────────────────
export interface CheckpointPanelDatum {
  key: string;
  label: string;
  short?: string; // compact tick label so the three don't collide
  mean: number;
  ciLo: number;
  ciHi: number;
}
export function checkpointDotPanels(
  panels: { pack: number; data: CheckpointPanelDatum[] }[],
): string {
  const W = 680;
  const H = 250;
  const n = panels.length;
  const gap = 18;
  const panelW = (W - gap * (n - 1)) / n;
  const padT = 30;
  const padB = 40;
  const plotH = H - padT - padB;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);

  panels.forEach((panel, pi) => {
    const x0 = pi * (panelW + gap);
    const cx = x0 + panelW / 2;
    const vals = panel.data.flatMap((d) => [d.ciLo, d.ciHi]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const padRange = (hi - lo) * 0.35 + 0.5;
    const yLo = lo - padRange;
    const yHi = hi + padRange;
    const yOf = (v: number) => padT + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

    // panel frame + title
    parts.push(`<line x1="${x0 + 12}" y1="${padT}" x2="${x0 + 12}" y2="${padT + plotH}" stroke="${AXIS}" stroke-width="1"/>`);
    parts.push(txt(cx, 16, `After ${panel.pack} packs`, { size: 12, fill: INK, anchor: "middle", weight: 600 }));

    const slotW = (panelW - 18) / panel.data.length;
    panel.data.forEach((d, di) => {
      const px = x0 + 18 + slotW * (di + 0.5);
      const color = PALETTE[d.key] ?? INK;
      // CI whisker
      parts.push(`<line x1="${px}" y1="${yOf(d.ciLo)}" x2="${px}" y2="${yOf(d.ciHi)}" stroke="${color}" stroke-width="2"/>`);
      parts.push(`<line x1="${px - 4}" y1="${yOf(d.ciHi)}" x2="${px + 4}" y2="${yOf(d.ciHi)}" stroke="${color}" stroke-width="2"/>`);
      parts.push(`<line x1="${px - 4}" y1="${yOf(d.ciLo)}" x2="${px + 4}" y2="${yOf(d.ciLo)}" stroke="${color}" stroke-width="2"/>`);
      // point
      parts.push(`<circle cx="${px}" cy="${yOf(d.mean)}" r="4.5" fill="${color}"/>`);
      // value label
      parts.push(txt(px, yOf(d.mean) - 9, d.mean.toFixed(0), { size: 11, fill: color, anchor: "middle", weight: 600 }));
      // strategy mini-label (compact, so the three don't collide)
      parts.push(txt(px, padT + plotH + 16, d.short ?? d.label.split(" ")[0]!, { size: 10, fill: MUTED, anchor: "middle" }));
    });
  });

  parts.push(`</svg>`);
  return parts.join("");
}

// ── Chart 3: marginal new species per pack (smoothed derivative of the mean
// curve), log-x. Shows diminishing returns and where best-pack's edge decays. ─
export function marginalCurveChart(
  series: { key: string; label: string; mean: number[] }[],
  opts: { budget: number; checkpoints: number[]; window?: number },
): string {
  const W = 680;
  const H = 360;
  const padL = 52;
  const padR = 24;
  const padT = 40;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const budget = opts.budget;
  const win = opts.window ?? 25;
  const logMax = Math.log(budget);
  const xOf = (pack: number) => padL + (Math.log(Math.max(1, pack)) / logMax) * plotW;

  // marginal[i] = (mean[i] - mean[i-win]) / win  (new species per pack, smoothed)
  const marg = series.map((s) => {
    const m: number[] = new Array(s.mean.length);
    for (let i = 0; i < s.mean.length; i++) {
      const j = Math.max(0, i - win);
      const span = i - j || 1;
      m[i] = (s.mean[i]! - s.mean[j]!) / span;
    }
    return { key: s.key, label: s.label, m };
  });

  const yMaxRaw = Math.max(...marg.flatMap((s) => s.m.slice(1)));
  const yStep = niceStep(yMaxRaw, 5);
  const yMax = Math.ceil(yMaxRaw / yStep) * yStep;
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  for (let v = 0; v <= yMax + 1e-9; v += yStep) {
    const y = yOf(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(txt(padL - 8, y + 4, v.toFixed(v < 1 ? 1 : 0), { size: 11, fill: MUTED, anchor: "end" }));
  }
  const xticks = Array.from(new Set([1, 10, 100, ...opts.checkpoints, budget])).sort((a, b) => a - b);
  for (const t of xticks) {
    if (t > budget) continue;
    const x = xOf(t);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(txt(x, padT + plotH + 16, String(t), { size: 11, fill: MUTED, anchor: "middle" }));
  }
  parts.push(txt(padL + plotW / 2, H - 8, "Packs opened (log scale)", { size: 12, fill: INK, anchor: "middle" }));
  parts.push(
    `<text x="14" y="${padT + plotH / 2}" font-family="${FONT}" font-size="12" fill="${INK}" text-anchor="middle" transform="rotate(-90 14 ${padT + plotH / 2})">New species per pack</text>`,
  );

  const stepd = Math.max(1, Math.floor(budget / 240));
  for (const s of marg) {
    const color = PALETTE[s.key] ?? INK;
    const pts: string[] = [];
    for (let i = win; i < s.m.length; i += stepd) {
      pts.push(`${xOf(i + 1).toFixed(1)},${yOf(s.m[i]!).toFixed(1)}`);
    }
    parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"/>`);
  }
  // legend
  let lx = padL + 6;
  const ly = padT - 18;
  for (const s of marg) {
    const color = PALETTE[s.key] ?? INK;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="14" height="4" rx="2" fill="${color}"/>`);
    parts.push(txt(lx + 20, ly - 4, s.label, { size: 12, fill: INK }));
    lx += 22 + s.label.length * 7.0;
  }
  parts.push(`</svg>`);
  return parts.join("");
}

// ── Horizontal bar chart (most-pulled species, rare-slot hit mix, …). ───────
export interface HBarItem {
  label: string;
  value: number;
  color?: string;
  valueText?: string;
}
export function hbarChart(
  items: HBarItem[],
  opts: { width?: number; labelW?: number; rowH?: number; barColor?: string; maxValue?: number },
): string {
  const W = opts.width ?? 680;
  const labelW = opts.labelW ?? 132;
  const rowH = opts.rowH ?? 22;
  const padT = 8;
  const padR = 52;
  const padB = 6;
  const H = padT + items.length * rowH + padB;
  const barColor = opts.barColor ?? "#2563eb";
  const max = opts.maxValue ?? Math.max(...items.map((i) => i.value), 1e-9);
  const plotW = W - labelW - padR;
  const xOf = (v: number) => labelW + (v / max) * plotW;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  items.forEach((it, i) => {
    const cy = padT + i * rowH + rowH / 2;
    const color = it.color ?? barColor;
    const w = Math.max(1, xOf(it.value) - labelW);
    parts.push(txt(labelW - 8, cy + 3.5, it.label, { size: 11.5, fill: INK, anchor: "end" }));
    parts.push(`<rect x="${labelW}" y="${cy - 7}" width="${w}" height="14" rx="3" fill="${color}"/>`);
    parts.push(txt(labelW + w + 6, cy + 3.5, it.valueText ?? it.value.toFixed(1), { size: 11, fill: MUTED, anchor: "start" }));
  });
  parts.push(`</svg>`);
  return parts.join("");
}

// ── Cost bar chart (log-x), for expected € to complete the Pokédex. ─────────
export interface CostBar {
  label: string;
  value: number; // euros
  color: string;
  valueText: string;
}
export function costBarChart(items: CostBar[], opts: { width?: number; labelW?: number }): string {
  const W = opts.width ?? 680;
  const labelW = opts.labelW ?? 188;
  const rowH = 34;
  const padT = 28;
  const padR = 78;
  const padB = 28;
  const H = padT + items.length * rowH + padB;
  const plotW = W - labelW - padR;
  // log scale across euros
  const min = Math.min(...items.map((i) => i.value));
  const max = Math.max(...items.map((i) => i.value));
  const lo = Math.pow(10, Math.floor(Math.log10(Math.max(1, min))));
  const hi = Math.pow(10, Math.ceil(Math.log10(max)));
  const xOf = (v: number) =>
    labelW + (Math.log10(Math.max(lo, v) / lo) / Math.log10(hi / lo)) * plotW;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  // decade gridlines
  for (let d = lo; d <= hi + 0.5; d *= 10) {
    const x = xOf(d);
    parts.push(`<line x1="${x}" y1="${padT - 6}" x2="${x}" y2="${padT + items.length * rowH}" stroke="${GRID}" stroke-width="1"/>`);
    const lbl = d >= 1000 ? `€${d / 1000}k` : `€${d}`;
    parts.push(txt(x, padT - 12, lbl, { size: 10, fill: MUTED, anchor: "middle" }));
  }
  items.forEach((it, i) => {
    const cy = padT + i * rowH + rowH / 2;
    const w = Math.max(2, xOf(it.value) - labelW);
    parts.push(txt(labelW - 8, cy + 4, it.label, { size: 11.5, fill: INK, anchor: "end" }));
    parts.push(`<rect x="${labelW}" y="${cy - 9}" width="${w}" height="18" rx="3" fill="${it.color}"/>`);
    parts.push(txt(labelW + w + 6, cy + 4, it.valueText, { size: 11.5, fill: INK, anchor: "start", weight: 600 }));
  });
  parts.push(`</svg>`);
  return parts.join("");
}

// ── Chart 4: fraction of packs "wasted" (zero new species) vs packs opened. ──
export function wastedFractionChart(
  series: { key: string; label: string; meanWastedCurve: number[] }[],
  opts: { budget: number; checkpoints: number[] },
): string {
  const W = 680;
  const H = 340;
  const padL = 52;
  const padR = 24;
  const padT = 40;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const budget = opts.budget;
  const logMax = Math.log(budget);
  const xOf = (pack: number) => padL + (Math.log(Math.max(1, pack)) / logMax) * plotW;

  // fraction[i] = cumulativeWasted[i] / (i+1)
  const frac = series.map((s) => ({
    key: s.key,
    label: s.label,
    f: s.meanWastedCurve.map((w, i) => w / (i + 1)),
  }));
  const yMax = 1;
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`);
  for (let v = 0; v <= 1.0001; v += 0.25) {
    const y = yOf(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(txt(padL - 8, y + 4, `${(v * 100).toFixed(0)}%`, { size: 11, fill: MUTED, anchor: "end" }));
  }
  const xticks = Array.from(new Set([1, 10, 100, ...opts.checkpoints, budget])).sort((a, b) => a - b);
  for (const t of xticks) {
    if (t > budget) continue;
    const x = xOf(t);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(txt(x, padT + plotH + 16, String(t), { size: 11, fill: MUTED, anchor: "middle" }));
  }
  parts.push(txt(padL + plotW / 2, H - 8, "Packs opened (log scale)", { size: 12, fill: INK, anchor: "middle" }));
  parts.push(
    `<text x="14" y="${padT + plotH / 2}" font-family="${FONT}" font-size="12" fill="${INK}" text-anchor="middle" transform="rotate(-90 14 ${padT + plotH / 2})">Share of packs with no new species</text>`,
  );

  const stepd = Math.max(1, Math.floor(budget / 240));
  for (const s of frac) {
    const color = PALETTE[s.key] ?? INK;
    const pts: string[] = [];
    for (let i = 0; i < s.f.length; i += stepd) {
      pts.push(`${xOf(i + 1).toFixed(1)},${yOf(s.f[i]!).toFixed(1)}`);
    }
    parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2"/>`);
  }
  let lx = padL + 6;
  const ly = padT - 18;
  for (const s of frac) {
    const color = PALETTE[s.key] ?? INK;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="14" height="4" rx="2" fill="${color}"/>`);
    parts.push(txt(lx + 20, ly - 4, s.label, { size: 12, fill: INK }));
    lx += 22 + s.label.length * 7.0;
  }
  parts.push(`</svg>`);
  return parts.join("");
}
