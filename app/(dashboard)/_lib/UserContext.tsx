"use client";

import { createContext, useContext } from "react";
import type { PriceSource } from "@/lib/pricing/pokemontcg";

interface UserCtx {
  userId: string;
  email: string;
  priceSource: PriceSource;
  isGuest: boolean;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({
  userId,
  email,
  priceSource,
  children,
}: {
  userId: string;
  email: string;
  priceSource: PriceSource;
  children: React.ReactNode;
}) {
  return (
    <Ctx.Provider value={{ userId, email, priceSource, isGuest: !userId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
}
