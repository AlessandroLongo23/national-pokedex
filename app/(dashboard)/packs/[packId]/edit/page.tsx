import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import { requireUserId } from "../../../_lib/current-user";
import { PageHeader } from "../../../_components/PageHeader";
import { LogPackFlow } from "../../../_components/LogPackFlow";
import { SeriesBadge } from "../../../_components/SeriesBadge";

interface PageProps {
  params: Promise<{ packId: string }>;
}

export default async function EditPackPage({ params }: PageProps) {
  const { packId } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: pack, error } = await supabase
    .from("packs_opened")
    .select("id, set_id, opened_at")
    .eq("id", packId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pack) notFound();

  const { data: contents, error: contentsErr } = await supabase
    .from("pack_contents")
    .select("card_id")
    .eq("pack_id", pack.id);
  if (contentsErr) throw new Error(contentsErr.message);

  const setId = pack.set_id as string;
  const set = SETS.find((s) => s.id === setId);
  const initialPickedIds = (contents ?? []).map((r) => r.card_id as string);
  const date = new Date(pack.opened_at as string);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span>Edit pack</span>
            {set && <SeriesBadge series={set.series} />}
          </span>
        }
        title={set?.name ?? setId}
        subtitle={
          <>
            Opened {date.toLocaleDateString()}{" "}
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Toggle cards
            to add or remove them from this pack entry.
          </>
        }
        right={
          <Link
            href="/packs"
            className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
          >
            Back to history
          </Link>
        }
      />
      <LogPackFlow
        initialSetId={setId}
        editingPackId={pack.id as string}
        initialPickedIds={initialPickedIds}
        initialOpenedAt={pack.opened_at as string}
      />
    </div>
  );
}
