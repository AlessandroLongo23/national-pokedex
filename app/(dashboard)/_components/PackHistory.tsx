"use client";

import Link from "next/link";
import { useTransition } from "react";
import { SETS } from "@/lib/data";
import { deletePack } from "../_lib/pack-actions";
import { SeriesBadge } from "./SeriesBadge";

// One TCG card aspect ratio (~245 × 342). Bumping the thumbnail to make
// individual pulls easy to identify at a glance.
const CARD_W = 90;
const CARD_H = 126;

export interface PackHistoryCard {
  cardId: string;
  imageSmall: string;
  name: string;
}

export interface PackHistoryItem {
  id: string;
  setId: string;
  openedAt: string;
  cards: PackHistoryCard[];
  newWhenOpened: number;
}

export function PackHistory({ items }: { items: PackHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-panel/50 p-6 text-center text-sm text-muted">
        No packs logged yet. Open your first pack to refine the recommendation with your real
        pull history.
      </section>
    );
  }

  const totalCards = items.reduce((acc, p) => acc + p.cards.length, 0);
  const totalNew = items.reduce((acc, p) => acc + p.newWhenOpened, 0);
  const avgNew = items.length === 0 ? 0 : totalNew / items.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Pack history</h2>
        <div className="text-[11px] text-muted nums">
          <span className="text-text font-semibold">{items.length}</span> packs ·{" "}
          <span className="text-text">{totalCards}</span> cards ·{" "}
          <span className="text-owned font-semibold">{totalNew}</span> new ·{" "}
          <span className="text-text">{avgNew.toFixed(2)}</span> avg new / pack
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const set = SETS.find((s) => s.id === item.setId);
          const setName = set?.name ?? item.setId;
          return (
            <Row key={item.id} item={item} setName={setName} series={set?.series ?? "Other"} />
          );
        })}
      </ul>
    </section>
  );
}

function Row({
  item,
  setName,
  series,
}: {
  item: PackHistoryItem;
  setName: string;
  series: string;
}) {
  const [pending, start] = useTransition();
  const date = new Date(item.openedAt);
  return (
    <li className="rounded-lg border border-border bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SeriesBadge series={series} />
          <Link href={`/sets/${item.setId}`} className="text-sm font-medium hover:underline">
            {setName}
          </Link>
          <span className="text-[11px] text-muted nums">
            {date.toLocaleDateString()}{" "}
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {item.newWhenOpened > 0 ? (
            <span className="rounded-full bg-owned/15 px-2.5 py-1 text-xs font-semibold text-owned nums">
              +{item.newWhenOpened} new
            </span>
          ) : (
            <span className="text-[11px] text-muted">no new</span>
          )}
          <Link
            href={`/packs/${item.id}/edit`}
            className="text-[11px] text-muted transition hover:text-accent"
          >
            Edit
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this pack entry? Cards already owned stay owned.")) return;
              start(async () => deletePack(item.id));
            }}
            className="text-[11px] text-muted transition hover:text-missing disabled:opacity-50"
            aria-label="Delete pack entry"
          >
            {pending ? "…" : "Delete"}
          </button>
        </div>
      </div>
      {item.cards.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {item.cards.map((c) => (
            <Link
              key={c.cardId}
              href={`/cards/${encodeURIComponent(c.cardId)}`}
              prefetch={false}
              aria-label={`Open ${c.name}`}
              title={c.name}
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imageSmall}
                alt={c.name}
                loading="lazy"
                className="rounded-md bg-panel-2 object-cover"
                style={{ width: CARD_W, height: CARD_H }}
              />
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}
