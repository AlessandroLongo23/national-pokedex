import type { CardPayload } from "@/lib/placeholders/build-print-items";

/** Card-scan placeholder — the actual TCG card image at real size (the cell is
 * 63×88 mm, the exact card ratio), optionally desaturated to black & white. The
 * `opacity` fades the image toward the white cell behind it, which lightens the
 * dark (ink-heavy) regions the most and leaves white areas untouched — a true
 * ink-saver, unlike `brightness` which can't lighten pure black. CSS `filter`
 * on a plain cross-origin <img> is CORS-safe (no canvas read) and, with the
 * white composite, survives print under `print-color-adjust: exact`. */
export function CardScan({
  card,
  grayscale,
  opacity = 1,
}: {
  card: CardPayload;
  grayscale: boolean;
  opacity?: number;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={card.imageLarge || card.imageSmall}
      alt={card.name}
      loading="eager"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src !== card.imageSmall && card.imageSmall) img.src = card.imageSmall;
        else img.style.visibility = "hidden";
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: grayscale ? "grayscale(1)" : "none",
        opacity,
      }}
    />
  );
}
