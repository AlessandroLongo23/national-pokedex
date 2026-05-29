"use client";

import { createContext, useContext, useMemo } from "react";
import type {
  DisplayConversion,
  PriceSource,
} from "@/lib/pricing/pokemontcg";
import type { Currency } from "@/lib/pricing/currencies";
import type { MegaPlacement } from "./mega-prefs";

interface UserCtx {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  // Memoized bundle for passing into formatPrice/formatPriceCompact.
  display: DisplayConversion;
  isGuest: boolean;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  displayCurrency,
  latestRatesFromEur,
  children,
}: {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  children: React.ReactNode;
}) {
  const display = useMemo<DisplayConversion>(
    () => ({ displayCurrency, latestRatesFromEur }),
    [displayCurrency, latestRatesFromEur],
  );
  return (
    <Ctx.Provider
      value={{
        userId,
        email,
        priceSource,
        treatMegasAsSeparate,
        megaPlacement,
        displayCurrency,
        latestRatesFromEur,
        display,
        isGuest: !userId,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
}
