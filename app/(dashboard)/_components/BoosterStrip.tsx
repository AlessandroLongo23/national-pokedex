import type { BoosterWrapper } from "@/lib/data/types";

type Size = "hero" | "compact";

/**
 * Horizontal row of booster-pack artwork with a hover lift. Shared by the
 * "best pack" hero (large) and the set detail header (compact cluster).
 */
export function BoosterStrip({
  wrappers,
  setName,
  size = "hero",
}: {
  wrappers: BoosterWrapper[];
  setName: string;
  size?: Size;
}) {
  // Solo wrapper: center it, slightly larger. Multi: row with consistent gaps.
  const solo = wrappers.length === 1;
  const compact = size === "compact";
  const heightClass = compact
    ? solo
      ? "h-28 md:h-32"
      : "h-24 md:h-28"
    : solo
      ? "h-44 md:h-56"
      : "h-36 md:h-44";
  const gapClass = solo ? "justify-start gap-0" : compact ? "gap-2 md:gap-3" : "gap-3 md:gap-4";

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <ul className={["flex w-max items-end pl-1", gapClass].join(" ")}>
        {wrappers.map((w, i) => (
          <li key={w.title} className="group relative" style={{ zIndex: wrappers.length - i }}>
            <div
              title={solo ? setName : `${setName} — ${w.name}`}
              className="block transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:-translate-y-1.5 group-hover:scale-[1.03]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={w.url}
                alt={solo ? `${setName} booster pack` : `${setName} — ${w.name} booster pack`}
                loading="lazy"
                draggable={false}
                referrerPolicy="no-referrer"
                width={w.width}
                height={w.height}
                className={[
                  "block w-auto rounded-md bg-bg/60 shadow-[0_12px_26px_-12px_rgba(0,0,0,0.7)] ring-1 ring-black/40 transition-shadow group-hover:shadow-[0_22px_36px_-12px_rgba(0,0,0,0.8)]",
                  heightClass,
                ].join(" ")}
              />
            </div>
            {!solo && !compact && (
              <span className="mt-2 block max-w-[6.5rem] truncate text-center text-[10px] uppercase tracking-wider text-muted md:max-w-[8rem]">
                {w.name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
