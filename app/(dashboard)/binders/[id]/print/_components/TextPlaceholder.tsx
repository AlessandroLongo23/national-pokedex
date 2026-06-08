/** Fallback placeholder when a cell has neither artwork nor a card image
 * (e.g. a Trainer/Energy card requested in artwork mode). Shows the name and a
 * sublabel centered in the dashed cut box. */
export function TextPlaceholder({ name, sub }: { name: string; sub?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "4mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000",
        gap: "1.5mm",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "11pt", lineHeight: 1.1 }}>{name}</div>
      {sub && (
        <div style={{ fontSize: "7pt", color: "#6b6b6b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
