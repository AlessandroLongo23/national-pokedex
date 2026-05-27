"use client";

import { createContext, useContext } from "react";
import type { PriceSource } from "@/lib/pricing/pokemontcg";
import type { MegaPlacement } from "./mega-prefs";

interface UserCtx {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  isGuest: boolean;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  children,
}: {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  children: React.ReactNode;
}) {
  return (
    <Ctx.Provider
      value={{
        userId,
        email,
        priceSource,
        treatMegasAsSeparate,
        megaPlacement,
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
