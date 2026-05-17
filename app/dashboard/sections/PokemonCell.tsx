"use client";

import Image from "next/image";
import { memo, useRef } from "react";
import { spriteUrl } from "@/lib/pokeapi";
import { useOwned } from "../OwnedContext";
import { useTooltip } from "../TooltipContext";

interface Props {
  dex: number;
  isCovered: boolean;
  hidden: boolean;
}

function CellBase({ dex, isCovered, hidden }: Props) {
  const { isOwned, toggle } = useOwned();
  const { show, hide } = useTooltip();
  const owned = isOwned(dex);
  const ref = useRef<HTMLButtonElement>(null);

  const cls = [
    "relative flex aspect-square items-center justify-center rounded select-none p-0",
    "cursor-pointer transition-transform duration-75 hover:z-10 hover:scale-[1.5] hover:shadow-lg",
    hidden ? "invisible" : "",
    owned
      ? "bg-owned shadow-[inset_0_0_0_2px_var(--color-owned-dark)]"
      : isCovered
        ? "bg-covered"
        : "bg-missing",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type="button"
      data-dex={dex}
      onClick={() => toggle(dex)}
      onMouseEnter={() => ref.current && show(dex, ref.current.getBoundingClientRect())}
      onMouseLeave={hide}
      onFocus={() => ref.current && show(dex, ref.current.getBoundingClientRect())}
      onBlur={hide}
      className={cls}
      aria-label={`Toggle owned for #${dex}`}
    >
      <Image
        src={spriteUrl(dex)}
        alt=""
        width={32}
        height={32}
        unoptimized
        loading="lazy"
        className="pointer-events-none h-full w-full object-contain"
      />
    </button>
  );
}

export const PokemonCell = memo(CellBase);
