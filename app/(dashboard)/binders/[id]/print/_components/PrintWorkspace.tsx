"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Printer, X } from "lucide-react";
import type { PrintItem, PrintStyle } from "@/lib/placeholders/build-print-items";
import { ArtworkPlaceholder } from "./ArtworkPlaceholder";
import { CardScan } from "./CardScan";
import { TextPlaceholder } from "./TextPlaceholder";
import styles from "./print.module.css";

interface Props {
  binderId: string;
  binderName: string;
  items: PrintItem[];
  defaultStyle: PrintStyle;
}

type Preset = "all" | "missing" | "owned" | "custom";
type CellStyle = "artwork" | "scan" | "text";

const PER_PAGE = 9;
const A4_WIDTH_PX = 793.7; // 210mm at 96dpi
const LARGE_JOB = 180;

function effectiveStyle(item: PrintItem, style: PrintStyle): CellStyle {
  if (style === "scan") return item.card ? "scan" : item.species ? "artwork" : "text";
  return item.species ? "artwork" : item.card ? "scan" : "text";
}

function imageReady(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    img.decode().then(finish).catch(finish);
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
    setTimeout(finish, 8000);
  });
}

export function PrintWorkspace({ binderId, binderName, items, defaultStyle }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<PrintStyle>(defaultStyle);
  const [grayscale, setGrayscale] = useState(true);
  // 0 = full ink (opacity 1), 1 = lightest (opacity 0.4). Fades B&W scans toward
  // the white sheet to save ink. Default ~mid for a noticeably lighter preview.
  const [lightness, setLightness] = useState(0.5);
  const bwOpacity = 1 - lightness * 0.6;
  const [preset, setPreset] = useState<Preset>("missing");
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(items.filter((i) => !i.owned).map((i) => i.key)),
  );
  const [preparing, setPreparing] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Escape returns to the binder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !preparing) router.push(`/binders/${binderId}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, binderId, preparing]);

  // Fit-to-width preview scaling (screen only).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth - 32; // canvas h-padding
      setPreviewScale(Math.min(1, Math.max(0.2, avail / A4_WIDTH_PX)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  const applyPreset = useCallback(
    (p: Exclude<Preset, "custom">) => {
      setPreset(p);
      if (p === "all") setIncluded(new Set(items.map((i) => i.key)));
      else if (p === "missing")
        setIncluded(new Set(items.filter((i) => !i.owned).map((i) => i.key)));
      else setIncluded(new Set(items.filter((i) => i.owned).map((i) => i.key)));
    },
    [items],
  );

  const toggleItem = useCallback((key: string) => {
    setPreset("custom");
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selected = useMemo(
    () => items.filter((i) => included.has(i.key)),
    [items, included],
  );
  const excluded = useMemo(
    () => items.filter((i) => !included.has(i.key)),
    [items, included],
  );
  const pages = useMemo(() => {
    const out: PrintItem[][] = [];
    for (let i = 0; i < selected.length; i += PER_PAGE) {
      out.push(selected.slice(i, i + PER_PAGE));
    }
    return out;
  }, [selected]);

  const onPrint = useCallback(async () => {
    if (selected.length === 0) return;
    setPreparing(true);
    const root = printRootRef.current;
    const imgs = root ? Array.from(root.querySelectorAll("img")) : [];
    await Promise.allSettled(imgs.map((img) => imageReady(img)));
    requestAnimationFrame(() => {
      window.print();
      setPreparing(false);
    });
  }, [selected.length]);

  if (!mounted) return null;

  const renderContent = (item: PrintItem) => {
    const eff = effectiveStyle(item, style);
    if (eff === "artwork") return <ArtworkPlaceholder species={item.species!} />;
    if (eff === "scan")
      return (
        <CardScan
          card={item.card!}
          grayscale={grayscale}
          opacity={grayscale ? bwOpacity : 1}
        />
      );
    return <TextPlaceholder name={item.card?.name ?? item.species?.name ?? "—"} />;
  };

  const workspace = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#e6e6ea]">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-panel px-4 py-2.5">
        <Link
          href={`/binders/${binderId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <span className="mr-1 max-w-[28ch] truncate text-sm font-semibold text-text" title={binderName}>
          {binderName}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">Style</span>
          <SegGroup>
            <SegBtn active={style === "artwork"} onClick={() => setStyle("artwork")}>
              Artwork
            </SegBtn>
            <SegBtn active={style === "scan"} onClick={() => setStyle("scan")}>
              Card scan
            </SegBtn>
          </SegGroup>
        </div>

        {style === "scan" && (
          <SegGroup>
            <SegBtn active={grayscale} onClick={() => setGrayscale(true)}>
              B&amp;W
            </SegBtn>
            <SegBtn active={!grayscale} onClick={() => setGrayscale(false)}>
              Color
            </SegBtn>
          </SegGroup>
        )}

        {style === "scan" && grayscale && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="uppercase tracking-wider">Lightness</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={lightness}
              onChange={(e) => setLightness(Number(e.target.value))}
              className="h-1 w-24 cursor-pointer"
              style={{ accentColor: "var(--primary)" }}
              aria-label="Black and white lightness"
            />
          </label>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">Show</span>
          <SegGroup>
            <SegBtn active={preset === "all"} onClick={() => applyPreset("all")}>
              All
            </SegBtn>
            <SegBtn active={preset === "missing"} onClick={() => applyPreset("missing")}>
              Missing
            </SegBtn>
            <SegBtn active={preset === "owned"} onClick={() => applyPreset("owned")}>
              Owned
            </SegBtn>
          </SegGroup>
        </div>

        <span className="text-xs tabular-nums text-muted">
          <span className="font-semibold text-text">{selected.length}</span>{" "}
          {selected.length === 1 ? "card" : "cards"} · {pages.length}{" "}
          {pages.length === 1 ? "page" : "pages"}
        </span>

        <button
          type="button"
          onClick={onPrint}
          disabled={selected.length === 0 || preparing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {preparing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </>
          )}
        </button>
      </div>

      {/* Body: excluded sidebar + sheet canvas */}
      <div className="flex min-h-0 flex-1">
        {/* Excluded sidebar (independently scrollable) */}
        <aside className="no-print flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold text-text">
            Excluded <span className="font-normal text-muted">({excluded.length})</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {excluded.length === 0 ? (
              <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-muted">
                Nothing excluded. Hover a card on the sheet and click ✕ to drop it here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {excluded.map((item) => {
                  const thumb = item.card?.imageSmall ?? item.species?.artworkUrl;
                  const label = item.card?.name ?? item.species?.name ?? "";
                  const sub = item.card
                    ? `${item.card.setCode} · ${item.card.number}`
                    : item.species
                      ? `#${String(item.species.dex).padStart(4, "0")}`
                      : "";
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => toggleItem(item.key)}
                        title={`Include ${label}`}
                        className="flex w-full items-center gap-2 rounded-md border border-transparent p-1 text-left transition hover:border-border hover:bg-panel-2"
                      >
                        <span className="relative aspect-[63/88] w-9 shrink-0 overflow-hidden rounded border border-border bg-panel-2">
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain opacity-70"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-text">
                            {label}
                          </span>
                          {sub && (
                            <span className="block truncate text-[10px] text-muted">{sub}</span>
                          )}
                        </span>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Sheet canvas */}
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={{ ["--preview-scale" as string]: String(previewScale) }}
        >
          {selected.length > LARGE_JOB && (
            <div className="no-print mx-auto mb-4 max-w-[210mm] rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text">
              Printing {selected.length} cards ({pages.length} pages). Large jobs can be
              slow to render and print — consider narrowing the selection.
            </div>
          )}

          {selected.length === 0 ? (
            <div className="no-print mx-auto mt-16 max-w-md rounded-lg border border-border bg-panel p-8 text-center text-sm text-muted">
              No cards selected. Pick <span className="font-medium text-text">All</span>,{" "}
              <span className="font-medium text-text">Missing</span>, or{" "}
              <span className="font-medium text-text">Owned</span> above, or re-include cards
              from the sidebar.
            </div>
          ) : (
            <div id="print-root" ref={printRootRef}>
              {pages.map((page, pi) => (
                <div key={pi} className={styles.sheetFrame}>
                  <div className={`print-sheet ${styles.sheet}`}>
                    {page.map((item) => (
                      <div key={item.key} className={`print-cell ${styles.cellWrap}`}>
                        {renderContent(item)}
                        <button
                          type="button"
                          onClick={() => toggleItem(item.key)}
                          className={`${styles.excludeBtn} no-print`}
                          aria-label="Exclude this card"
                          title="Exclude"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: PER_PAGE - page.length }).map((_, ei) => (
                      <div key={`empty-${ei}`} className="print-cell print-cell-empty" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(workspace, document.body);
}

function SegGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-panel-2 p-0.5">
      {children}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded px-2.5 py-1 text-xs font-medium transition",
        active ? "bg-primary text-primary-foreground" : "text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
