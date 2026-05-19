"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CardEntry } from "@/lib/data/types";

interface CardPreviewCtx {
  activeCard: CardEntry | null;
  /** The rect of the element that triggered the preview, in viewport coords.
   * Used by the overlay to morph from the trigger into the centered preview.
   * Null when the preview is opened without a trigger (e.g. cold-load URL). */
  originRect: DOMRect | null;
  loading: boolean;
  open: (arg: CardEntry | string, originRect?: DOMRect | null) => void;
  close: () => void;
  /** Ordered card ids the overlay should walk for prev/next when set.
   * Used by virtualized views (e.g. /cards) where only a window of tiles
   * is mounted, so DOM-order walking would skip across most of the list.
   * When null, the overlay falls back to walking `[data-preview-trigger]`
   * in DOM order. */
  navigationList: string[] | null;
  setNavigationList: (ids: string[] | null) => void;
}

const Ctx = createContext<CardPreviewCtx | null>(null);

// Card IDs are "<setId>-<number>". Set IDs are lowercase alphanumeric and never
// contain a hyphen (verified across lib/data/cardIndex.json); numbers may
// contain a prefix like "SM198" but no hyphens. So splitting on the first
// hyphen is unambiguous.
function setIdFromCardId(cardId: string): string | null {
  const i = cardId.indexOf("-");
  if (i <= 0) return null;
  return cardId.slice(0, i);
}

export function CardPreviewProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlCardId = searchParams.get("card");

  const [activeCard, setActiveCard] = useState<CardEntry | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [loading, setLoading] = useState(false);
  const [navigationList, setNavigationListState] = useState<string[] | null>(null);
  const cacheRef = useRef<Map<string, CardEntry>>(new Map());

  // Stable setter so callers can pass it to effects without retriggering.
  const setNavigationList = useCallback((ids: string[] | null) => {
    setNavigationListState(ids);
  }, []);

  // Mirror activeCard in a ref so callbacks and the URL effect can read it
  // without depending on it. Without this, the URL effect fires every time we
  // toggle activeCard ourselves — and because router.replace lags behind
  // setState by a render or two, the effect sees stale `urlCardId` paired
  // with fresh `activeCard` and "resolves" the stale URL, re-opening the
  // preview we just closed.
  const activeCardRef = useRef<CardEntry | null>(activeCard);
  activeCardRef.current = activeCard;

  const writeUrl = useCallback(
    (cardId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (cardId) params.set("card", cardId);
      else params.delete("card");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Pre-decode the hi-res image before mounting the overlay so the FLIP
  // measures a fully-laid-out img and there's no blurry-to-sharp swap.
  // Returns instantly from cache after the first preview of a given card.
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
    async (arg: CardEntry | string, rect?: DOMRect | null) => {
      setOriginRect(rect ?? null);
      if (typeof arg !== "string") {
        cacheRef.current.set(arg.id, arg);
        await decode(arg.imageLarge);
        setActiveCard(arg);
        setLoading(false);
        writeUrl(arg.id);
        return;
      }
      const cardId = arg;
      const cached = cacheRef.current.get(cardId);
      if (cached) {
        await decode(cached.imageLarge);
        setActiveCard(cached);
        setLoading(false);
        writeUrl(cardId);
        return;
      }
      const setId = setIdFromCardId(cardId);
      if (!setId) return;
      setLoading(true);
      writeUrl(cardId);
      try {
        const r = await fetch(`/api/cards-by-set/${setId}`);
        const cards = r.ok ? ((await r.json()) as CardEntry[]) : null;
        if (!cards) {
          setLoading(false);
          writeUrl(null);
          return;
        }
        for (const c of cards) cacheRef.current.set(c.id, c);
        const found = cacheRef.current.get(cardId) ?? null;
        if (found) {
          await decode(found.imageLarge);
          setActiveCard(found);
        } else {
          writeUrl(null);
        }
        setLoading(false);
      } catch {
        setLoading(false);
        writeUrl(null);
      }
    },
    [decode, writeUrl],
  );

  const close = useCallback(() => {
    // Re-measure the origin tile right now: it may have scrolled since open,
    // and a stale rect would land the close animation in the wrong place.
    // Read the current card via ref (not via state) so this stays a single,
    // synchronous step — putting setOriginRect inside a setActiveCard
    // updater is fragile because React may call updaters twice (strict mode
    // / concurrent), each firing a fresh measurement.
    const current = activeCardRef.current;
    if (current && typeof document !== "undefined") {
      const el = document.querySelector<HTMLElement>(
        `[data-preview-trigger="${current.id}"]`,
      );
      if (el) setOriginRect(el.getBoundingClientRect());
    }
    setActiveCard(null);
    setLoading(false);
    writeUrl(null);
  }, [writeUrl]);

  // Reconcile state when the URL changes — cold-load deep links, browser
  // back/forward, and Link-driven navigation that drops the ?card param.
  // Our own writes also pass through here, but they're idempotent: by the
  // time the URL settles, activeCardRef already matches.
  useEffect(() => {
    const current = activeCardRef.current;
    if (!urlCardId) {
      if (current) setActiveCard(null);
      return;
    }
    if (current?.id === urlCardId) return;
    let cancelled = false;
    const activate = async (c: CardEntry) => {
      await decode(c.imageLarge);
      if (!cancelled) setActiveCard(c);
    };
    const cached = cacheRef.current.get(urlCardId);
    if (cached) {
      void activate(cached);
      return () => {
        cancelled = true;
      };
    }
    const setId = setIdFromCardId(urlCardId);
    if (!setId) return;
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/cards-by-set/${setId}`);
        const cards = r.ok ? ((await r.json()) as CardEntry[]) : null;
        if (cancelled) return;
        if (!cards) {
          setLoading(false);
          return;
        }
        for (const c of cards) cacheRef.current.set(c.id, c);
        const found = cacheRef.current.get(urlCardId) ?? null;
        if (found) await activate(found);
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCardId, decode]);

  // Body scroll lock is handled by CardPreviewOverlay — keeping it there
  // means it stays in sync with the overlay's phase machine (lock through
  // enter + open + exit, not just while activeCard is set). A duplicate
  // lock here would race with the overlay's: when the overlay restored
  // overflow="", this one would capture "" as its "prev" — then on the
  // next phase change the overlay would capture "hidden" and never let go.

  const value = useMemo<CardPreviewCtx>(
    () => ({
      activeCard,
      originRect,
      loading,
      open,
      close,
      navigationList,
      setNavigationList,
    }),
    [activeCard, originRect, loading, open, close, navigationList, setNavigationList],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCardPreview() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCardPreview must be inside CardPreviewProvider");
  return ctx;
}
