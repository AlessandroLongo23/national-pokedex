interface Props {
  totalCards: number;
  distinctSpecies: number;
  packsOpened: number;
  favoritesCount: number;
}

export function PortfolioStats({
  totalCards,
  distinctSpecies,
  packsOpened,
  favoritesCount,
}: Props) {
  const items = [
    { label: "Cards owned", value: totalCards },
    { label: "Species owned", value: distinctSpecies },
    { label: "Packs opened", value: packsOpened },
    { label: "Favorites", value: favoritesCount },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-md border border-border bg-panel p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">{i.label}</div>
          <div className="nums mt-1 text-2xl font-semibold tabular-nums">
            {i.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
