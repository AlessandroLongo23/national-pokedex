"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  count: number;
  expiresAt: number;
  onUndo: () => void;
  /** Optional message. When omitted, falls back to the count-based
   * "N transaction(s) deleted" copy so existing call sites are unchanged. */
  label?: string;
}

export function UndoToast({ count, expiresAt, onUndo, label }: Props) {
  const [mounted, setMounted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    computeSecondsLeft(expiresAt),
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setSecondsLeft(computeSecondsLeft(expiresAt));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [expiresAt]);

  if (!mounted) return null;

  const node = (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-panel-2 px-4 py-3 text-sm text-text shadow-lg"
    >
      <span>
        {label ?? `${count} transaction${count === 1 ? "" : "s"} deleted`}{" "}
        <span className="text-muted">· Undo {secondsLeft}s</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="ml-3 font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Undo
      </button>
    </div>
  );

  return createPortal(node, document.body);
}

function computeSecondsLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - performance.now()) / 1000));
}
