"use client";

import { memo } from "react";
import { useOwned } from "../OwnedContext";

interface Props {
  dex: number;
  isCovered: boolean;
  hidden: boolean;
}

function CellBase({ dex, isCovered, hidden }: Props) {
  const { isOwned, toggle } = useOwned();
  const owned = isOwned(dex);

  const cls = [
    "relative flex aspect-square items-center justify-center rounded text-[9px] tabular-nums select-none",
    "cursor-pointer transition-transform duration-75 hover:z-10 hover:scale-[1.4] hover:shadow-lg",
    hidden ? "invisible" : "",
    owned
      ? "bg-owned text-black/70 shadow-[inset_0_0_0_2px_var(--color-owned-dark)]"
      : isCovered
        ? "bg-covered text-black/55"
        : "bg-missing text-white/65",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      data-dex={dex}
      onClick={() => toggle(dex)}
      className={cls}
      aria-label={`Toggle owned for #${dex}`}
    >
      {dex}
    </button>
  );
}

export const PokemonCell = memo(CellBase);
