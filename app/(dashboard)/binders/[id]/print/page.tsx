import { notFound } from "next/navigation";
import { requireUserId } from "../../../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { loadUserPreferences } from "../../../_lib/user-preferences";
import { MEGAS } from "@/lib/data";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import {
  buildPrintItems,
  printDefaultStyle,
  deriveOwnedSpecies,
  deriveOwnedMegaForms,
} from "@/lib/placeholders/build-print-items";
import { PrintWorkspace } from "./_components/PrintWorkspace";

export default async function BinderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: binder } = await supabase
    .from("binders")
    .select("id, name, scope_type, scope_params")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!binder) notFound();

  const scopeType = binder.scope_type as ScopeType;
  const scopeParams = binder.scope_params as ScopeParams;
  const prefs = await loadUserPreferences(userId);
  const allCards = await getAllCards();

  let cards;
  if (scopeType === "custom") {
    const { data: rows } = await supabase
      .from("binder_cards")
      .select("card_id")
      .eq("binder_id", id);
    cards = filterCardsByIds(allCards, (rows ?? []).map((r) => r.card_id as string));
  } else {
    cards = filterByScope(allCards, scopeType, scopeParams);
  }

  const { data: ownedRows } = await supabase
    .from("owned_cards")
    .select("card_id")
    .eq("user_id", userId);
  const ownedCardIds = new Set((ownedRows ?? []).map((r) => r.card_id as string));
  const ownedSpecies = deriveOwnedSpecies(ownedCardIds, prefs.treatMegasAsSeparate);
  const ownedMegaForms = deriveOwnedMegaForms(ownedCardIds);

  // Pokedex-only: dex range, cell overrides, and (matching the binder's own
  // rule) the Mega forms that fall in range.
  let dexRange: { from: number; to: number } | undefined;
  let overrides: Record<number, string> | undefined;
  let megasInRange = undefined as typeof MEGAS | undefined;
  if (scopeType === "pokedex") {
    const p = scopeParams as { dexFrom: number; dexTo: number };
    dexRange = { from: Math.min(p.dexFrom, p.dexTo), to: Math.max(p.dexFrom, p.dexTo) };

    const { data: rows } = await supabase
      .from("binder_cell_overrides")
      .select("dex, card_id")
      .eq("binder_id", id);
    overrides = {};
    for (const r of rows ?? []) overrides[r.dex as number] = r.card_id as string;

    const includeMegas =
      prefs.treatMegasAsSeparate && prefs.megaPlacement !== "separate";
    if (includeMegas) {
      megasInRange = MEGAS.filter(
        (m) => m.baseDex >= dexRange!.from && m.baseDex <= dexRange!.to,
      );
    }
  }

  const items = buildPrintItems({
    scopeType,
    cards,
    ownedCardIds,
    ownedSpecies,
    ownedMegaForms,
    dexRange,
    overrides,
    megasInRange,
    treatMegasAsSeparate: prefs.treatMegasAsSeparate,
  });

  return (
    <PrintWorkspace
      binderId={binder.id as string}
      binderName={binder.name as string}
      items={items}
      defaultStyle={printDefaultStyle(scopeType)}
    />
  );
}
