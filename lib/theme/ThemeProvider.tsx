"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

export type Theme = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "pokedex-theme";

function readSystemPref(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === "system" ? readSystemPref() : theme;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const lastAppliedRef = useRef<ResolvedTheme | null>(null);

  const applyTheme = (t: Theme) => {
    const next: ResolvedTheme = resolve(t);
    const apply = () => {
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, t);
      setThemeState(t);
      setResolvedTheme(next);
      lastAppliedRef.current = next;
    };

    const doc = document as DocumentWithViewTransition;
    const skipTransition =
      !doc.startViewTransition ||
      document.visibilityState !== "visible" ||
      lastAppliedRef.current === null ||
      lastAppliedRef.current === next;

    if (skipTransition) {
      apply();
      return;
    }
    doc.startViewTransition!(apply);
  };

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const initial: Theme =
      raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    applyTheme(initial);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const stored = (localStorage.getItem(STORAGE_KEY) ?? "system") as Theme;
      if (stored === "system") applyTheme("system");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (t: Theme) => applyTheme(t);
  const toggleTheme = () => applyTheme(resolvedTheme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
