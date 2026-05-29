"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

// A breadcrumb override for a single URL path segment. `label` replaces the
// segment's derived name; `detail` renders alongside it in a secondary color
// (e.g. a card's set + number); `href` overrides the link target for segments
// whose own route isn't navigable (e.g. /packs/[packId] has no index page).
export type BreadcrumbCrumb = {
  label: string;
  detail?: string;
  href?: string;
};

type Ctx = {
  overrides: Record<string, BreadcrumbCrumb>;
  setOverride: (segment: string, crumb: BreadcrumbCrumb | null) => void;
};

const PageTitleContext = createContext<Ctx | null>(null);

const EMPTY: Record<string, BreadcrumbCrumb> = {};

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, BreadcrumbCrumb>>(
    EMPTY,
  );

  const setOverride = useCallback(
    (segment: string, crumb: BreadcrumbCrumb | null) => {
      setOverrides((prev) => {
        if (!crumb) {
          if (!(segment in prev)) return prev;
          const next = { ...prev };
          delete next[segment];
          return next;
        }
        const existing = prev[segment];
        if (
          existing &&
          existing.label === crumb.label &&
          existing.detail === crumb.detail &&
          existing.href === crumb.href
        ) {
          return prev;
        }
        return { ...prev, [segment]: crumb };
      });
    },
    [],
  );

  const value = useMemo(() => ({ overrides, setOverride }), [
    overrides,
    setOverride,
  ]);

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function useBreadcrumbOverrides(): Record<string, BreadcrumbCrumb> {
  return useContext(PageTitleContext)?.overrides ?? EMPTY;
}

// Register a breadcrumb override for an explicit path segment (the raw URL
// segment value). Clears itself on unmount so stale crumbs don't linger
// across navigation. An empty label is a no-op — the segment falls back to
// its derived route label.
export function useSetCrumb(
  segment: string | null | undefined,
  crumb: BreadcrumbCrumb,
) {
  const ctx = useContext(PageTitleContext);
  const setOverride = ctx?.setOverride;
  const { label, detail, href } = crumb;

  useEffect(() => {
    if (!setOverride || !segment || !label) return;
    setOverride(segment, { label, detail, href });
    return () => setOverride(segment, null);
  }, [setOverride, segment, label, detail, href]);
}

// Convenience wrapper: override the breadcrumb for the *current* page (the
// last path segment). This is what PageHeader and most detail pages use.
export function useSetPageTitle(title: string, detail?: string) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  useSetCrumb(lastSegment, { label: title, detail });
}
