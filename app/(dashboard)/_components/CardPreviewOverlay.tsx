"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SETS } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { RARITY_LABEL } from "@/lib/data/types";
import { useCardPreview } from "../_lib/CardPreviewContext";

const ENTER_MS = 280;
const EXIT_MS = 220;
// ease-out-quint — decisive, no overshoot. Matches the "quiet, confident"
// motion register: a single committed move, not a bouncy reveal.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type Phase = "closed" | "entering" | "open" | "exiting";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CardPreviewOverlay() {
  const { activeCard, originRect, loading, open, close, navigationList } =
    useCardPreview();

  // Mirror the context state into local state so we can keep rendering the
  // card during the exit animation (after activeCard has gone null in the
  // context).
  const [card, setCard] = useState<CardEntry | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  // The current card's index among the on-page preview triggers, plus the
  // total count. Drives the prev/next chevrons and the "X / N" counter.
  // Computed once per card change, not per render.
  const [position, setPosition] = useState<{ index: number; total: number }>({
    index: -1,
    total: 0,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);
  const reduced = useRef<boolean>(false);

  // Capture motion preference once per open cycle.
  useEffect(() => {
    if (activeCard && phase === "closed") {
      reduced.current = prefersReducedMotion();
    }
  }, [activeCard, phase]);

  // Drive phase transitions off the context's activeCard. The context has
  // already pre-decoded imageLarge before flipping activeCard, so by the
  // time we mount the overlay the img element gets correct natural
  // dimensions on its first paint — no resize mid-FLIP, no blurry-to-sharp
  // swap.
  useEffect(() => {
    if (activeCard && phase === "closed") {
      setCard(activeCard);
      setOrigin(originRect);
      setPhase("entering");
    } else if (activeCard && card && activeCard.id !== card.id) {
      // Active card swapped while open (rare, e.g. URL navigation). Skip
      // animation and just swap the rendered card.
      setCard(activeCard);
      setOrigin(originRect);
      setPhase("open");
    } else if (!activeCard && (phase === "entering" || phase === "open")) {
      // Pick up the freshly-measured origin rect (close() updated it before
      // nulling activeCard).
      if (originRect) setOrigin(originRect);
      setPhase("exiting");
    }
  }, [activeCard, originRect, phase, card]);

  // FLIP enter: render at the source rect first, then transition to identity.
  useLayoutEffect(() => {
    if (phase !== "entering") return;
    const img = imageRef.current;
    const root = rootRef.current;
    if (!img || !root) return;

    if (reduced.current || !origin) {
      // No spatial morph — just a fade. Skip the FLIP math.
      root.style.opacity = "0";
      img.style.opacity = "0";
      // Force reflow so the transition has a starting frame.
      void root.offsetHeight;
      root.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
      img.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
      root.style.opacity = "1";
      img.style.opacity = "1";
      return;
    }

    // Measure the image's natural rect (centered, max-h/max-w applied).
    const final = img.getBoundingClientRect();
    if (final.width === 0 || final.height === 0) {
      // Image not laid out yet (still loading dimensions). Fade in and bail.
      root.style.opacity = "0";
      void root.offsetHeight;
      root.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
      root.style.opacity = "1";
      return;
    }

    const tx =
      origin.left + origin.width / 2 - (final.left + final.width / 2);
    const ty =
      origin.top + origin.height / 2 - (final.top + final.height / 2);
    const sx = origin.width / final.width;
    const sy = origin.height / final.height;

    // F + I: place the image visually at the source rect, with no transition.
    root.style.opacity = "0";
    img.style.transition = "none";
    img.style.transformOrigin = "center center";
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;

    // Force reflow so the next style change actually animates.
    void root.offsetHeight;

    // P: animate both backdrop opacity and image transform to target.
    root.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
    img.style.transition = `transform ${ENTER_MS}ms ${EASE}`;
    root.style.opacity = "1";
    img.style.transform = "translate(0px, 0px) scale(1, 1)";
  }, [phase, origin]);

  // FLIP exit: from identity back to the source rect, then unmount.
  useLayoutEffect(() => {
    if (phase !== "exiting") return;
    const img = imageRef.current;
    const root = rootRef.current;
    if (!img || !root) return;

    if (reduced.current || !origin) {
      root.style.transition = `opacity ${EXIT_MS}ms ${EASE}`;
      img.style.transition = `opacity ${EXIT_MS}ms ${EASE}`;
      root.style.opacity = "0";
      img.style.opacity = "0";
      return;
    }

    // The image is currently at identity (or about to be — clear any inline
    // transform that may have been left mid-enter).
    img.style.transition = "none";
    img.style.transform = "translate(0px, 0px) scale(1, 1)";
    void img.offsetHeight;

    const final = img.getBoundingClientRect();
    if (final.width === 0 || final.height === 0) {
      root.style.transition = `opacity ${EXIT_MS}ms ${EASE}`;
      root.style.opacity = "0";
      return;
    }

    const tx =
      origin.left + origin.width / 2 - (final.left + final.width / 2);
    const ty =
      origin.top + origin.height / 2 - (final.top + final.height / 2);
    const sx = origin.width / final.width;
    const sy = origin.height / final.height;

    root.style.transition = `opacity ${EXIT_MS}ms ${EASE}`;
    img.style.transition = `transform ${EXIT_MS}ms ${EASE}`;
    root.style.opacity = "0";
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  }, [phase, origin]);

  // Advance phase when the active animation finishes.
  useEffect(() => {
    if (phase !== "entering" && phase !== "exiting") return;
    const root = rootRef.current;
    if (!root) return;
    const onEnd = (e: TransitionEvent) => {
      // Only react to the root's opacity transition (one event per phase).
      if (e.target !== root || e.propertyName !== "opacity") return;
      if (phase === "entering") {
        // Clean up inline transforms so subsequent layout is natural.
        const img = imageRef.current;
        if (img) {
          img.style.transition = "";
          img.style.transform = "";
        }
        setPhase("open");
      } else {
        setPhase("closed");
        setCard(null);
        setOrigin(null);
        // Reset inline styles on the (about-to-unmount) nodes for safety.
        const img = imageRef.current;
        if (img) {
          img.style.transition = "";
          img.style.transform = "";
          img.style.opacity = "";
        }
      }
    };
    root.addEventListener("transitionend", onEnd);
    return () => root.removeEventListener("transitionend", onEnd);
  }, [phase]);

  const closeStable = useCallback(() => close(), [close]);

  // Walk the on-page preview triggers in DOM order and open the prev/next
  // one. Uses [data-preview-trigger] attributes set by CardTile and
  // PackHistory — so navigation naturally follows whichever grid the user
  // opened from. When a `navigationList` is registered on the context
  // (virtualized views like /cards), step through that list instead so we
  // can navigate across cards whose tiles aren't currently mounted.
  const navigate = useCallback(
    (direction: 1 | -1) => {
      if (!card) return;
      if (navigationList && navigationList.length > 0) {
        const idx = navigationList.indexOf(card.id);
        if (idx < 0) return;
        const targetId = navigationList[idx + direction];
        if (!targetId) return;
        const trigger = document.querySelector<HTMLElement>(
          `[data-preview-trigger="${targetId}"]`,
        );
        void open(targetId, trigger ? trigger.getBoundingClientRect() : null);
        return;
      }
      const triggers = Array.from(
        document.querySelectorAll<HTMLElement>("[data-preview-trigger]"),
      );
      const idx = triggers.findIndex(
        (el) => el.dataset.previewTrigger === card.id,
      );
      if (idx < 0) return;
      const target = triggers[idx + direction];
      if (!target) return;
      const targetId = target.dataset.previewTrigger;
      if (!targetId) return;
      void open(targetId, target.getBoundingClientRect());
    },
    [card, open, navigationList],
  );

  // Refresh position whenever the active card changes. Querying the DOM
  // each render would work too, but doing it once per card keeps the
  // render cheap and avoids layout reads during animation frames.
  useEffect(() => {
    if (!card) {
      setPosition({ index: -1, total: 0 });
      return;
    }
    if (navigationList && navigationList.length > 0) {
      const idx = navigationList.indexOf(card.id);
      setPosition({ index: idx, total: navigationList.length });
      return;
    }
    const triggers = document.querySelectorAll<HTMLElement>(
      "[data-preview-trigger]",
    );
    let idx = -1;
    for (let i = 0; i < triggers.length; i++) {
      const el = triggers[i];
      if (el && el.dataset.previewTrigger === card.id) {
        idx = i;
        break;
      }
    }
    setPosition({ index: idx, total: triggers.length });
  }, [card, navigationList]);

  const hasPrev = position.index > 0;
  const hasNext = position.index >= 0 && position.index < position.total - 1;

  // Keyboard: Esc closes, ← / → navigate.
  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStable();
      else if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, closeStable, navigate]);

  // Focus management.
  useEffect(() => {
    if (phase === "entering") {
      restoreFocusRef.current = document.activeElement;
      closeBtnRef.current?.focus();
    } else if (phase === "closed") {
      const el = restoreFocusRef.current;
      if (el && el instanceof HTMLElement) el.focus();
    }
  }, [phase]);

  // Body scroll lock for the lifetime of any non-closed phase. Derived
  // boolean so the effect only fires at the closed↔open boundary, not on
  // every entering→open→exiting step (each of those would cleanup+reapply,
  // and a stale captured "prev" could leave the body stuck at hidden).
  // Unconditional clear on cleanup is fine here: nothing else in the app
  // sets body.overflow.
  const locked = phase !== "closed";
  useEffect(() => {
    if (!locked) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [locked]);

  if (phase === "closed" || !card) return null;

  const set = SETS.find((s) => s.id === card.setId);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
      onClick={closeStable}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-md"
      style={{ willChange: "opacity" }}
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeStable();
        }}
        aria-label="Close preview"
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg/70 text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      {position.total > 1 && position.index >= 0 && (
        <div
          aria-live="polite"
          className="absolute top-4 left-4 rounded-full border border-border bg-bg/70 px-3 py-1.5 text-xs text-muted nums backdrop-blur-sm"
        >
          {position.index + 1} / {position.total}
        </div>
      )}

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(-1);
          }}
          aria-label="Previous card"
          className="absolute top-1/2 left-4 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg/70 text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(1);
          }}
          aria-label="Next card"
          className="absolute top-1/2 right-4 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg/70 text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 left-1/2 max-w-[92vw] -translate-x-1/2 rounded-full border border-border bg-bg/70 px-5 py-2 text-sm whitespace-nowrap text-text backdrop-blur-sm"
      >
        <span className="font-medium">{card.name}</span>
        {set && (
          <>
            <span aria-hidden className="mx-2.5 text-border-strong">·</span>
            <span className="text-muted">{set.name}</span>
          </>
        )}
        <span aria-hidden className="mx-2.5 text-border-strong">·</span>
        <span className="nums text-muted">#{card.number}</span>
        <span aria-hidden className="mx-2.5 text-border-strong">·</span>
        <span className="text-muted">{RARITY_LABEL[card.rarity]}</span>
        <span aria-hidden className="mx-2.5 text-border-strong">·</span>
        <Link
          href={`/cards/${encodeURIComponent(card.id)}`}
          onClick={closeStable}
          className="inline-flex items-center gap-0.5 text-muted underline-offset-2 transition hover:text-text hover:underline"
        >
          Details
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-x-0 top-4 text-center text-xs text-muted">
          Loading…
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={card.imageLarge}
        alt={card.name}
        decoding="sync"
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg object-contain shadow-2xl"
        // Size locked to TCG card aspect ratio (245:342) capped by viewport,
        // independent of the image's natural dimensions. The context awaits
        // .decode() before flipping activeCard, so the file is in cache by
        // the time we mount and getBoundingClientRect returns the right rect.
        // 87vw/87vh leaves room above and below for the counter + metadata
        // pill without overlapping the card.
        style={{
          width: "min(87vw, calc(87vh * 245 / 342))",
          height: "min(87vh, calc(87vw * 342 / 245))",
          willChange: "transform",
        }}
      />
    </div>
  );
}
