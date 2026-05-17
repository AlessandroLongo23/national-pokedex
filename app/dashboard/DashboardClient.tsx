"use client";

import { OwnedProvider } from "./OwnedContext";

export function DashboardClient({ initialOwned }: { initialOwned: number[] }) {
  return (
    <OwnedProvider initial={initialOwned}>
      <main className="mx-auto max-w-[1280px] px-6 py-8 pb-20">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-bold tracking-tight">
            National <span className="text-accent">Pokédex</span> tracker
          </h1>
          <p className="mt-1 text-sm text-muted">
            Scarlet &amp; Violet + Mega Evolution — your binder progress
          </p>
        </header>
        <p className="text-muted">Sections coming online…</p>
      </main>
    </OwnedProvider>
  );
}
