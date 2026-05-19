"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

interface Props {
  userId: string;
}

// Subscribes to all ledger-relevant tables for this user and triggers a
// router.refresh() whenever a change lands. This keeps the /transactions
// page (and PSA detail pages) live even when changes come from another
// tab or from cascading FK deletes (e.g. deleting a pack auto-removes
// its pack_purchase row). One row per subscription channel; cheaper
// than three channels.
//
// Renders nothing — it's a side-effect island.
export function LedgerRealtime({ userId }: Props) {
  const router = useRouter();
  // Coalesce a burst of events into one refresh — useful when a single
  // user action produces multiple table writes (e.g. an edit changes
  // transactions AND owned_cards).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, 120);
    };

    const channel = supabase
      .channel("ledger_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "psa_submissions",
          filter: `user_id=eq.${userId}`,
        },
        schedule,
      )
      // psa_submission_cards has no user_id column, so we can't filter
      // server-side. RLS already restricts what the client receives;
      // unfiltered subscription is safe.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "psa_submission_cards",
        },
        schedule,
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
