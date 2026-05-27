export default function CardDetailLoading() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="h-3 w-32 animate-pulse rounded bg-panel-2" />
      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(260px,360px)_1fr]">
        <div className="aspect-[5/7] w-full animate-pulse rounded-xl bg-panel-2" />
        <div className="space-y-5">
          <div className="space-y-2.5">
            <div className="h-3 w-40 animate-pulse rounded bg-panel-2" />
            <div className="h-8 w-64 animate-pulse rounded bg-panel-2" />
            <div className="h-4 w-48 animate-pulse rounded bg-panel-2/70" />
          </div>
          <div className="flex gap-8 border-y border-border py-4">
            <div className="space-y-1">
              <div className="h-3 w-12 animate-pulse rounded bg-panel-2" />
              <div className="h-6 w-16 animate-pulse rounded bg-panel-2" />
            </div>
            <div className="space-y-1">
              <div className="h-3 w-20 animate-pulse rounded bg-panel-2" />
              <div className="h-6 w-20 animate-pulse rounded bg-panel-2" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-panel-2/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
