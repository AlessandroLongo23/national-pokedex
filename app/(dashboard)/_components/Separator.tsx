interface Props {
  tone?: "strong" | "muted";
  spaced?: boolean;
}

export function Separator({ tone = "strong", spaced = false }: Props) {
  const toneClass = tone === "muted" ? "text-muted/40" : "text-border-strong";
  return (
    <span aria-hidden className={[spaced ? "mx-2" : "", toneClass].filter(Boolean).join(" ")}>
      ·
    </span>
  );
}
