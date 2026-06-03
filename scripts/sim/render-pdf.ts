// Render analysis/pack-strategy/report.html → report.pdf via headless Chrome.
// No npm dependency: we drive the locally-installed Chrome binary directly.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "Could not find a Chrome/Chromium binary. Set CHROME_PATH to your browser executable.",
  );
}

function main(): void {
  const outDir = process.argv[2] ?? path.join(process.cwd(), "analysis", "pack-strategy");
  const htmlPath = path.resolve(outDir, "report.html");
  const pdfPath = path.resolve(outDir, "report.pdf");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing ${htmlPath} — run scripts/sim/report.ts first.`);
  }

  const chrome = findChrome();
  // Isolated profile so a running Chrome instance doesn't conflict.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sim-pdf-"));

  const baseArgs = [
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=10000",
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ];

  const produced = () => fs.existsSync(pdfPath) && fs.statSync(pdfPath).size >= 2000;
  const run = (headlessFlag: string) =>
    execFileSync(chrome, [headlessFlag, ...baseArgs], { stdio: "pipe", timeout: 60_000 });

  // Start clean so a stale PDF can't masquerade as success.
  fs.rmSync(pdfPath, { force: true });

  try {
    // Chrome occasionally exits non-zero (GPU/teardown noise) AFTER writing a
    // perfectly good PDF, so we judge success by the output file, not the exit
    // code. Try modern headless, then legacy headless.
    for (const flag of ["--headless=new", "--headless"]) {
      try {
        run(flag);
      } catch {
        /* fall through to the file check */
      }
      if (produced()) break;
    }
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }

  if (!produced()) {
    throw new Error(`PDF render produced no/insufficient output at ${pdfPath}`);
  }
  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`Report PDF written → ${pdfPath} (${kb} KB)`);
}

main();
