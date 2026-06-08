import type { SpeciesPayload } from "@/lib/placeholders/build-print-items";
import { typeColor, GEN_BADGE_FILL, GEN_ROMAN } from "@/lib/placeholders/type-colors";

/** Official-artwork placeholder — a faithful port of the legacy ReportLab
 * `draw_card`: gen badge, name, #dex, centered artwork, type pills, and a
 * height / genus / weight footer, all inside a 63×88 mm cut box. */
export function ArtworkPlaceholder({ species }: { species: SpeciesPayload }) {
  const num = `#${String(species.dex).padStart(4, "0")}`;
  const nameSize = species.name.length > 11 ? 10.5 : species.name.length > 9 ? 12 : 13.5;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: "2.5mm",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {/* Gen badge, top-right */}
      <div style={{ display: "flex", justifyContent: "flex-end", height: "4.4mm" }}>
        {GEN_ROMAN[species.gen] && (
          <span
            style={{
              background: GEN_BADGE_FILL,
              color: "#fff",
              fontSize: "6.5pt",
              fontWeight: 700,
              lineHeight: 1,
              padding: "1.1mm 1.6mm",
              borderRadius: "1.6mm",
              whiteSpace: "nowrap",
            }}
          >
            GEN {GEN_ROMAN[species.gen]}
          </span>
        )}
      </div>

      {/* Name */}
      <div
        style={{
          marginTop: "1.2mm",
          textAlign: "center",
          fontWeight: 700,
          fontSize: `${nameSize}pt`,
          lineHeight: 1.05,
          color: "#000",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {species.name}
      </div>

      {/* Dex number */}
      <div
        style={{
          textAlign: "center",
          fontSize: "10.5pt",
          color: "#6b6b6b",
          marginTop: "0.4mm",
        }}
      >
        {num}
      </div>

      {/* Artwork */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1mm 0",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={species.artworkUrl}
          alt=""
          loading="eager"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Type pills */}
      {species.types.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "1.2mm",
            marginBottom: "1.2mm",
          }}
        >
          {species.types.map((t) => (
            <span
              key={t}
              style={{
                background: typeColor(t),
                color: "#fff",
                fontSize: "6pt",
                fontWeight: 700,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                lineHeight: 1,
                padding: "1mm 1.5mm",
                borderRadius: "1.6mm",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Height · genus · weight */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          fontSize: "6pt",
          color: "#4d4d4d",
          gap: "1mm",
        }}
      >
        <span style={{ flex: "0 0 auto" }}>
          {species.heightM > 0 ? `${species.heightM.toFixed(1)} m` : ""}
        </span>
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontStyle: "italic",
            color: "#595959",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {species.genus}
        </span>
        <span style={{ flex: "0 0 auto" }}>
          {species.weightKg > 0 ? formatWeight(species.weightKg) : ""}
        </span>
      </div>
    </div>
  );
}

function formatWeight(kg: number): string {
  return kg >= 100 ? `${kg.toFixed(0)} kg` : `${kg.toFixed(1)} kg`;
}
