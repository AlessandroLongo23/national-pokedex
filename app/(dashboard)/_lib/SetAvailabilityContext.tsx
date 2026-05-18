"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { SETS } from "@/lib/data";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { DEV_USER_ID } from "./dev";
import { setSetAvailability } from "./availability-actions";

// Sets released within this window are auto-flagged as buyable locally.
const RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30 * 18; // ~18 months

interface AvailabilityCtx {
  overrides: Map<string, boolean>;
  isAvailable: (setId: string) => boolean;
  hasOverride: (setId: string) => boolean;
  set: (setId: string, available: boolean | null) => void;
  availableSetIds: Set<string>;
  isPending: boolean;
}

const Ctx = createContext<AvailabilityCtx | null>(null);

function parseDate(s: string): number {
  // Source data uses YYYY/MM/DD.
  const parts = s.split("/");
  if (parts.length !== 3) return 0;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return new Date(y, m, d).getTime();
}

function defaultAvailable(setId: string): boolean {
  const info = SETS.find((s) => s.id === setId);
  if (!info) return false;
  const released = parseDate(info.releaseDate);
  if (!released) return false;
  return Date.now() - released <= RECENCY_WINDOW_MS;
}

export function SetAvailabilityProvider({
  initial,
  children,
}: {
  initial: { setId: string; available: boolean }[];
  children: React.ReactNode;
}) {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(
    () => new Map(initial.map((r) => [r.setId, r.available])),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("set_availability_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "set_availability",
          filter: `user_id=eq.${DEV_USER_ID}`,
        },
        (payload) => {
          setOverrides((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              const sid = (payload.old as { set_id: string }).set_id;
              next.delete(sid);
            } else {
              const row = payload.new as { set_id: string; available: boolean };
              next.set(row.set_id, row.available);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isAvailable = useCallback(
    (setId: string) => {
      const o = overrides.get(setId);
      if (o !== undefined) return o;
      return defaultAvailable(setId);
    },
    [overrides],
  );

  const hasOverride = useCallback((setId: string) => overrides.has(setId), [overrides]);

  const setOverride = useCallback(
    (setId: string, available: boolean | null) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        if (available === null) next.delete(setId);
        else next.set(setId, available);
        return next;
      });
      startTransition(async () => {
        try {
          await setSetAvailability(setId, available);
        } catch (err) {
          console.error("setSetAvailability failed", err);
        }
      });
    },
    [],
  );

  const availableSetIds = useMemo(() => {
    const out = new Set<string>();
    for (const s of SETS) if (isAvailable(s.id)) out.add(s.id);
    return out;
  }, [isAvailable]);

  return (
    <Ctx.Provider
      value={{
        overrides,
        isAvailable,
        hasOverride,
        set: setOverride,
        availableSetIds,
        isPending,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSetAvailability() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSetAvailability must be inside SetAvailabilityProvider");
  return ctx;
}
