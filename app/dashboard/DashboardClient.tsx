"use client";

import { OwnedProvider } from "./OwnedContext";
import { TooltipProvider } from "./TooltipContext";
import { Tooltip } from "./sections/Tooltip";
import { HeadlineStats } from "./sections/HeadlineStats";
import { CoverageByGen } from "./sections/CoverageByGen";
import { MEAddedList } from "./sections/MEAddedList";
import { PokedexGrid } from "./sections/PokedexGrid";
import { SetsTable } from "./sections/SetsTable";
import { GreedyOrder } from "./sections/GreedyOrder";
import { MissingList } from "./sections/MissingList";

export function DashboardClient({ initialOwned }: { initialOwned: number[] }) {
  return (
    <OwnedProvider initial={initialOwned}>
      <TooltipProvider>
        <main className="mx-auto max-w-[1280px] px-6 py-8 pb-20">
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              National <span className="text-accent">Pokédex</span> tracker
            </h1>
            <p className="mt-1 text-sm text-muted">
              Scarlet &amp; Violet + Mega Evolution — your binder progress
            </p>
          </header>
          <HeadlineStats />
          <CoverageByGen />
          <MEAddedList />
          <PokedexGrid />
          <SetsTable />
          <GreedyOrder />
          <MissingList />
        </main>
        <Tooltip />
      </TooltipProvider>
    </OwnedProvider>
  );
}
