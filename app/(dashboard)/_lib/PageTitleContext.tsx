"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = {
  title: string;
  setTitle: (title: string) => void;
};

const PageTitleContext = createContext<Ctx | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string>("");
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(): string {
  return useContext(PageTitleContext)?.title ?? "";
}

export function useSetPageTitle(title: string) {
  const ctx = useContext(PageTitleContext);
  const setTitle = ctx?.setTitle;
  const apply = useCallback(() => {
    if (!setTitle) return;
    setTitle(title);
  }, [setTitle, title]);

  useEffect(() => {
    apply();
    return () => {
      setTitle?.("");
    };
  }, [apply, setTitle]);
}
