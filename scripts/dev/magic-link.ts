/**
 * Generate a one-shot magic-link URL via Supabase Admin API.
 * Use when Supabase's built-in email rate limit is exhausted, or just to
 * skip the email step entirely during local dev / testing.
 *
 * Usage:
 *   npx tsx scripts/dev/magic-link.ts you@example.com
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path: string) {
  try {
    const txt = readFileSync(path, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // file missing — silently skip
  }
}

loadEnv(".env");
loadEnv(".env.local");

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/dev/magic-link.ts <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local.",
  );
  process.exit(1);
}

async function main() {
  const admin = createClient(url!, serviceRole!);
  const redirectTo = process.env.MAGIC_LINK_REDIRECT_TO ?? "http://localhost:3000/auth/callback";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error) {
    console.error("Failed to generate link:", error.message);
    process.exit(1);
  }

  const link = data.properties?.action_link;
  if (!link) {
    console.error("No action_link in response.");
    process.exit(1);
  }

  console.log("\nPaste this into your browser to sign in:\n");
  console.log(link);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
