"use client";

import { createContext, useContext } from "react";

interface UserCtx {
  userId: string;
  email: string;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({
  userId,
  email,
  children,
}: {
  userId: string;
  email: string;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={{ userId, email }}>{children}</Ctx.Provider>;
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
}
