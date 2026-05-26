"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { CardEntry } from "@/lib/data/types";

interface CardPreviewCtx {
  activeCard: CardEntry | null;
  /** The rect of the element that triggered the preview, in viewport coords.
   * Used by the overlay to morph from the trigger into the centered preview. */
  originRect: DOMRect | null;
  open: (card: CardEntry, originRect?: DOMRect | null) => void;
  close: () => void;
}

const Ctx = createContext<CardPreviewCtx | null>(null);

export function CardPreviewProvider({ children }: { children: React.ReactNode }) {
  const [activeCard, setActiveCard] = useState<CardEntry | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  // Pre-decode the hi-res image before mounting the overlay so the FLIP
  // measures a fully-laid-out img and there's no blurry-to-sharp swap.
  const decode = useCallback(async (url: string): Promise<void> => {
    try {
      const img = new globalThis.Image();
      img.src = url;
      await img.decode();
    } catch {
      // Decode can fail on broken sources or detached docs — proceed
      // anyway; the img element will fall back to its own loading.
    }
  }, []);

  const open = useCallback(
    async (card: CardEntry, rect?: DOMRect | null) => {
      setOriginRect(rect ?? null);
      await decode(card.imageLarge);
      setActiveCard(card);
    },
    [decode],
  );

  const close = useCallback(() => {
    // Re-measure the origin trigger right now: it may have scrolled since
    // open, and a stale rect would land the close animation in the wrong
    // place.
    if (typeof document !== "undefined") {
      setActiveCard((current) => {
        if (current) {
          const el = document.querySelector<HTMLElement>(
            `[data-preview-trigger="${current.id}"]`,
          );
          if (el) setOriginRect(el.getBoundingClientRect());
        }
        return null;
      });
    } else {
      setActiveCard(null);
    }
  }, []);

  const value = useMemo<CardPreviewCtx>(
    () => ({ activeCard, originRect, open, close }),
    [activeCard, originRect, open, close],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCardPreview() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCardPreview must be inside CardPreviewProvider");
  return ctx;
}
