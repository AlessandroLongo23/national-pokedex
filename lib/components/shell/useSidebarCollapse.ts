"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "pokedex-sidebar-collapsed";
const MEDIA_QUERY = "(max-width: 1023px)";

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}

function readSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return window.matchMedia(MEDIA_QUERY).matches;
}

function subscribe(listener: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener("change", listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapse() {
  const collapsed = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    if (typeof window === "undefined") return;
    const next = !readSnapshot();
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    emit();
  }, []);

  return { collapsed, toggle, hydrated: true };
}
