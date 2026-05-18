"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { POKEDEX } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";

const MAX_DEX = POKEDEX[POKEDEX.length - 1]?.dex ?? 1025;
const NAME_BY_DEX: Record<number, string> = Object.fromEntries(
  POKEDEX.map((p) => [p.dex, p.name]),
);

interface Props {
  dex: number;
}

export function SpeciesPagination({ dex }: Props) {
  const router = useRouter();
  const prevDex = dex > 1 ? dex - 1 : null;
  const nextDex = dex < MAX_DEX ? dex + 1 : null;

  // Keyboard arrows for power-use. Ignore when typing in inputs / textareas /
  // contenteditable so we don't hijack search and form fields.
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft" && prevDex) router.push(`/pokedex/${prevDex}`);
      if (e.key === "ArrowRight" && nextDex) router.push(`/pokedex/${nextDex}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevDex, nextDex, router]);

  return (
    <nav
      aria-label="Pokédex navigation"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      className="relative flex items-center justify-between px-4 py-1 text-xs md:px-5"
    >
      {prevDex ? (
        <PagerLink dex={prevDex} name={NAME_BY_DEX[prevDex] ?? `#${prevDex}`} direction="prev" />
      ) : (
        <span aria-hidden className="w-32" />
      )}

      {nextDex ? (
        <PagerLink dex={nextDex} name={NAME_BY_DEX[nextDex] ?? `#${nextDex}`} direction="next" />
      ) : (
        <span aria-hidden className="w-32" />
      )}
    </nav>
  );
}

function PagerLink({
  dex,
  name,
  direction,
}: {
  dex: number;
  name: string;
  direction: "prev" | "next";
}) {
  const isPrev = direction === "prev";
  return (
    <Link
      href={`/pokedex/${dex}`}
      className="group/pager flex min-h-9 items-center gap-2 rounded-md px-2 py-1 text-muted transition hover:bg-panel-2 hover:text-text active:bg-panel-3 active:text-text"
      aria-label={`${isPrev ? "Previous" : "Next"}: ${name}`}
    >
      {isPrev && (
        <ArrowLeft
          aria-hidden
          className="h-4 w-4 transition-transform group-hover/pager:-translate-x-0.5"
        />
      )}
      {isPrev && (
        <Image
          src={officialArtworkUrl(dex)}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 object-contain opacity-80 group-hover/pager:opacity-100"
        />
      )}
      <span className="flex flex-col items-start leading-tight">
        <span className="eyebrow text-[10px] text-muted/70">#{dex}</span>
        <span className="text-xs font-medium">{name}</span>
      </span>
      {!isPrev && (
        <Image
          src={officialArtworkUrl(dex)}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 object-contain opacity-80 group-hover/pager:opacity-100"
        />
      )}
      {!isPrev && (
        <ArrowRight
          aria-hidden
          className="h-4 w-4 transition-transform group-hover/pager:translate-x-0.5"
        />
      )}
    </Link>
  );
}
