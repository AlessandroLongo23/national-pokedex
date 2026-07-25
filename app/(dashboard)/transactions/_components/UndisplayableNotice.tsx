import { AlertTriangle } from "lucide-react";

// Last-resort visibility for transaction rows the ledger table cannot
// render — an unrecognised `kind` or a currency outside the supported
// set. Nothing the app writes can produce these, so this normally
// renders nothing; when it does render, the point is that the rows
// exist and are excluded from every total on this page, rather than
// having vanished without a trace.
export function UndisplayableNotice({
  rows,
}: {
  rows: readonly { id: string; reason: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">
            {rows.length} transaction{rows.length === 1 ? "" : "s"} can&apos;t be
            displayed
          </p>
          <p className="mt-1 text-[13px] text-muted">
            These rows are stored but excluded from the table and from every
            total above.
          </p>
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="text-[11px] text-muted tabular-nums">
                <span className="font-mono">{r.id}</span>
                <span className="ml-2 font-sans">— {r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
