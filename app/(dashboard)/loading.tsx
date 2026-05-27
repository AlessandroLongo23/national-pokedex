// Shown while the active route's server component is still resolving.
// Without this file, App Router renders nothing during navigation — the
// browser silently sits on the previous page until the new RSC payload is
// ready, which on Vercel can be several seconds when a page is blocked on
// upstream price fetches.

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div className="mb-6 space-y-2 md:mb-8">
        <div className="h-3 w-24 animate-pulse rounded bg-panel-2" />
        <div className="h-8 w-56 animate-pulse rounded bg-panel-2" />
        <div className="h-4 w-80 animate-pulse rounded bg-panel-2/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border border-border bg-panel"
          />
        ))}
      </div>
    </div>
  );
}
