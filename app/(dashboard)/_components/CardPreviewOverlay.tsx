"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CardEntry } from "@/lib/data/types";
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
  const { activeCard, originRect, close } = useCardPreview();

  // Mirror the context state into local state so we can keep rendering the
  // card during the exit animation (after activeCard has gone null in the
  // context).
  const [card, setCard] = useState<CardEntry | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [phase, setPhase] = useState<Phase>("closed");

  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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
  // dimensions on its first paint.
  useEffect(() => {
    if (activeCard && phase === "closed") {
      setCard(activeCard);
      setOrigin(originRect);
      setPhase("entering");
    } else if (!activeCard && (phase === "entering" || phase === "open")) {
      // Pick up the freshly-measured origin rect (close() updated it before
      // nulling activeCard).
      if (originRect) setOrigin(originRect);
      setPhase("exiting");
    }
  }, [activeCard, originRect, phase]);

  // FLIP enter: render at the source rect first, then transition to identity.
  useLayoutEffect(() => {
    if (phase !== "entering") return;
    const img = imageRef.current;
    const root = rootRef.current;
    if (!img || !root) return;

    if (reduced.current || !origin) {
      root.style.opacity = "0";
      img.style.opacity = "0";
      void root.offsetHeight;
      root.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
      img.style.transition = `opacity ${ENTER_MS}ms ${EASE}`;
      root.style.opacity = "1";
      img.style.opacity = "1";
      return;
    }

    const final = img.getBoundingClientRect();
    if (final.width === 0 || final.height === 0) {
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

    root.style.opacity = "0";
    img.style.transition = "none";
    img.style.transformOrigin = "center center";
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;

    void root.offsetHeight;

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
      if (e.target !== root || e.propertyName !== "opacity") return;
      if (phase === "entering") {
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

  // Keyboard: Esc closes.
  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStable();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, closeStable]);

  // Focus management — capture and restore around the open cycle.
  useEffect(() => {
    if (phase === "entering") {
      restoreFocusRef.current = document.activeElement;
      rootRef.current?.focus();
    } else if (phase === "closed") {
      const el = restoreFocusRef.current;
      if (el && el instanceof HTMLElement) el.focus();
    }
  }, [phase]);

  // Body scroll lock for the lifetime of any non-closed phase.
  const locked = phase !== "closed";
  useEffect(() => {
    if (!locked) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [locked]);

  if (phase === "closed" || !card) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
      tabIndex={-1}
      onClick={closeStable}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-md focus:outline-none"
      style={{ willChange: "opacity" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={card.imageLarge}
        alt={card.name}
        decoding="sync"
        onClick={closeStable}
        className="rounded-lg object-contain shadow-2xl"
        // Size locked to TCG card aspect ratio (245:342) capped by viewport.
        style={{
          width: "min(92vw, calc(92vh * 245 / 342))",
          height: "min(92vh, calc(92vw * 342 / 245))",
          willChange: "transform",
        }}
      />
    </div>
  );
}
