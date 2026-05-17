"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkImportOwned } from "../actions";

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setErr("That doesn't look like valid JSON.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setErr("Expected a JSON array of dex numbers.");
      return;
    }
    const nums = parsed.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 1025)) {
      setErr("All entries must be integers between 1 and 1025.");
      return;
    }
    startTransition(async () => {
      try {
        const { imported } = await bulkImportOwned(nums);
        router.push(`/dashboard?imported=${imported}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">Import owned Pokémon</h1>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Open the old <code className="rounded bg-panel px-1">SV_ME_Coverage_Dashboard.html</code>{" "}
        in any browser, open DevTools, and paste this in the console:
      </p>
      <pre className="mb-4 overflow-x-auto rounded-md border border-border bg-panel p-3 text-xs">
        {`copy(JSON.stringify([...JSON.parse(localStorage.getItem('sv_me_owned_v1') || '[]')]))`}
      </pre>
      <p className="mb-4 text-sm text-muted">
        Then paste the clipboard contents into the textarea below.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          rows={6}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="[1, 4, 7, 25, ...]"
          className="w-full rounded-md border border-border bg-panel p-3 font-mono text-sm focus:border-accent focus:outline-none"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      {err && <p className="mt-3 text-sm text-missing">{err}</p>}
    </main>
  );
}
