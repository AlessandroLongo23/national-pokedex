"use client";

import { useState } from "react";
import { BestPackHero } from "../_components/BestPackHero";
import { RankLeaderboard } from "../_components/RankLeaderboard";
import { PackHistory, type PackHistoryItem } from "../_components/PackHistory";

interface Props {
  history: PackHistoryItem[];
}

export function PacksClient({ history }: Props) {
  const [filterAvailable, setFilterAvailable] = useState(true);

  return (
    <>
      <div className="sticky top-16 z-sticky flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel/90 p-3 backdrop-blur-md">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filterAvailable}
            onChange={(e) => setFilterAvailable(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
          />
          <span>Only show sets I can buy locally</span>
        </label>
        <p className="text-[11px] text-muted">
          Sets released in the last 18 months are flagged by default. You can override per-set on
          the Sets page.
        </p>
      </div>
      <BestPackHero filterAvailable={filterAvailable} />
      <RankLeaderboard filterAvailable={filterAvailable} />
      <PackHistory items={history} />
    </>
  );
}
