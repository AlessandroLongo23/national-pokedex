import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSet, loadSetCards, SPECIES } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import {
  RARITY_LABEL,
  type CardEntry,
  type Generation,
} from "@/lib/data/types";
import {
  fetchPricesForCards,
  formatPrice,
  pickPrice,
  PRICE_SOURCE_CURRENCY,
  PRICE_SOURCE_LABEL,
} from "@/lib/pricing/pokemontcg";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { requireUserId } from "../../_lib/current-user";
import { loadUserPreferences } from "../../_lib/user-preferences";
import { Separator } from "../../_components/Separator";
import { CardActionsBar } from "./_components/CardActionsBar";
import { CardHeroImage } from "./_components/CardHeroImage";
import { CardStrip } from "./_components/CardStrip";
import {
  EvolutionRow,
  MetaPill,
  PokemonChip,
  RarityBadge,
  SetChip,
  TypeChip,
} from "./_components/CardChips";
import {
  AcquisitionLog,
  type AcquisitionEvent,
} from "./_components/AcquisitionLog";

interface PageProps {
  params: Promise<{ cardId: string }>;
}

const REGION_BY_GEN: Record<Generation, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

function setIdFromCardId(cardId: string): string | null {
  const idx = cardId.lastIndexOf("-");
  if (idx <= 0) return null;
  return cardId.slice(0, idx);
}

export default async function CardDetailPage({ params }: PageProps) {
  const { cardId } = await params;
  // card ids are URL-encoded on the way in; ensure we get the canonical form
  const decoded = decodeURIComponent(cardId);
  const setId = setIdFromCardId(decoded);
  if (!setId) notFound();

  const set = getSet(setId);
  if (!set) notFound();

  let card: CardEntry | undefined;
  try {
    const cards = await loadSetCards(setId);
    card = cards.find((c) => c.id === decoded);
  } catch {
    notFound();
  }
  if (!card) notFound();

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);

  const [ownedRes, priceMap, packRows, txRows, allCards] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("quantity, acquired_at")
      .eq("user_id", userId)
      .eq("card_id", card.id)
      .maybeSingle(),
    fetchPricesForCards([card.id]),
    supabase
      .from("pack_contents")
      .select(
        "pack_id, packs_opened!inner(id, user_id, set_id, opened_at, cost_cents, currency)",
      )
      .eq("card_id", card.id)
      .eq("packs_opened.user_id", userId),
    supabase
      .from("transactions")
      .select("kind, occurred_at, amount_cents, currency, quantity, note")
      .eq("user_id", userId)
      .eq("card_id", card.id)
      .in("kind", ["single_purchase", "sale", "psa_fee"]),
    getAllCards(),
  ]);
  const ownedQty = (ownedRes.data?.quantity as number | null) ?? 0;
  const acquiredAt = (ownedRes.data?.acquired_at as string | null) ?? null;
  const price = pickPrice(priceMap.get(card.id), prefs.priceSource);
  const currency = PRICE_SOURCE_CURRENCY[prefs.priceSource];

  const dex = card.dex[0];
  const species = dex != null ? SPECIES[dex] : undefined;
  const region = species
    ? (REGION_BY_GEN[species.generation as Generation] ??
      `Gen ${species.generation}`)
    : null;
  const abilities = species?.abilities.map((a) => a.name).join(", ") ?? "";
  const hasEvolution =
    species != null &&
    species.evolutionChain.flat().some((d) => d !== dex);

  const otherPrints =
    dex != null
      ? allCards
          .filter((c) => c.id !== card.id && c.dex.includes(dex))
          .sort((a, b) => {
            const ra = getSet(a.setId)?.releaseDate ?? "";
            const rb = getSet(b.setId)?.releaseDate ?? "";
            return rb.localeCompare(ra);
          })
      : [];

  const artist = card.artist?.trim();
  const artistCards = artist
    ? allCards
        .filter((c) => c.id !== card.id && c.artist === artist)
        .sort((a, b) => {
          const ra = getSet(a.setId)?.releaseDate ?? "";
          const rb = getSet(b.setId)?.releaseDate ?? "";
          return rb.localeCompare(ra);
        })
    : [];

  const stripIds = [
    ...new Set([
      ...otherPrints.map((c) => c.id),
      ...artistCards.map((c) => c.id),
    ]),
  ];
  let ownedSet = new Set<string>();
  if (stripIds.length > 0) {
    const { data: ownedRows } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", stripIds);
    ownedSet = new Set((ownedRows ?? []).map((r) => r.card_id as string));
  }
  const otherPrintsOwnedCount = otherPrints.filter((c) =>
    ownedSet.has(c.id),
  ).length;
  const artistOwnedCount = artistCards.filter((c) =>
    ownedSet.has(c.id),
  ).length;
  const otherPrintsSetCount = new Set(otherPrints.map((c) => c.setId)).size;

  const events: AcquisitionEvent[] = [
    ...(packRows.data ?? []).map((row) => {
      const pack = row.packs_opened as unknown as {
        id: string;
        set_id: string;
        opened_at: string;
        cost_cents: number | null;
        currency: string | null;
      };
      return {
        kind: "pack" as const,
        packId: pack.id,
        setId: pack.set_id,
        openedAt: pack.opened_at,
        costCents: pack.cost_cents,
        currency: (pack.currency as LedgerCurrency | null) ?? null,
      };
    }),
    ...(txRows.data ?? []).map((row) => ({
      kind: row.kind as "single_purchase" | "sale" | "psa_fee",
      occurredAt: row.occurred_at as string,
      amountCents: row.amount_cents as number,
      currency: row.currency as LedgerCurrency,
      quantity: (row.quantity as number | null) ?? null,
      note: (row.note as string | null) ?? null,
    })),
  ];

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link
        href={`/sets/${setId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {set.name}
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(260px,360px)_1fr]">
        <div>
          <CardHeroImage card={card} />
        </div>

        <div className="space-y-7">
          <div className="space-y-2.5">
            <p className="eyebrow">
              <Link
                href={`/sets/${setId}`}
                className="underline-offset-2 hover:text-text hover:underline"
              >
                {set.name}
              </Link>{" "}
              · #{card.number}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-text">
              {card.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
              <RarityBadge
                rarity={card.rarity}
                label={RARITY_LABEL[card.rarity]}
              />
              {card.supertype !== "Pokémon" && (
                <span className="text-xs uppercase tracking-wider">
                  {card.supertype}
                </span>
              )}
              {card.artist && (
                <span className="text-xs">
                  illus.{" "}
                  <span className="text-text">{card.artist}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-border py-4">
            <div>
              <p className="eyebrow">Owned</p>
              <p
                className={[
                  "text-2xl font-semibold tabular-nums",
                  ownedQty > 0 ? "text-covered" : "text-muted",
                ].join(" ")}
              >
                {ownedQty > 0 ? `× ${ownedQty}` : "—"}
              </p>
            </div>
            <div>
              <p className="eyebrow">Market price</p>
              <p
                className={[
                  "text-2xl font-semibold tabular-nums",
                  price != null ? "text-text" : "text-muted",
                ].join(" ")}
                title={`Market price — ${PRICE_SOURCE_LABEL[prefs.priceSource]}`}
              >
                {price != null ? formatPrice(price, prefs.priceSource) : "—"}
              </p>
              <p className="text-[11px] text-muted">
                via{" "}
                <Link
                  href="/settings"
                  className="underline decoration-border-strong underline-offset-2 hover:text-text"
                >
                  {PRICE_SOURCE_LABEL[prefs.priceSource]}
                </Link>
              </p>
            </div>
          </div>

          <CardActionsBar
            card={{
              id: card.id,
              name: card.name,
              setId: card.setId,
              number: card.number,
              imageSmall: card.imageSmall,
            }}
            suggestedUnitProceedsCents={
              price != null ? Math.round(price * 100) : null
            }
            defaultCurrency={currency}
          />

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm">
            {(card.types.length > 0 || card.hp != null) && (
              <Field label="Type">
                <div className="flex flex-wrap items-center gap-2">
                  {card.types.map((t) => (
                    <TypeChip key={t} type={t} />
                  ))}
                  {card.hp != null && (
                    <span className="ml-1 text-text nums">
                      <span className="font-semibold">{card.hp}</span>
                      <span className="ml-1 text-[11px] uppercase tracking-wider text-muted">
                        HP
                      </span>
                    </span>
                  )}
                </div>
              </Field>
            )}
            {card.subtypes.length > 0 && (
              <Field label="Subtypes">
                <div className="flex flex-wrap gap-1.5">
                  {card.subtypes.map((s) => (
                    <MetaPill key={s}>{s}</MetaPill>
                  ))}
                </div>
              </Field>
            )}
            {card.regulationMark && (
              <Field label="Regulation">
                <MetaPill>{card.regulationMark}</MetaPill>
              </Field>
            )}
            <Field label="Set">
              <SetChip setId={setId} setName={set.name} number={card.number} />
            </Field>
            {dex != null && (
              <Field label="Pokémon">
                <PokemonChip dex={dex} />
              </Field>
            )}
            {card.evolvesFrom && (
              <Field label="Evolves from">
                <span className="text-text">{card.evolvesFrom}</span>
              </Field>
            )}
            {species && hasEvolution && (
              <Field label="Evolution">
                <EvolutionRow
                  chain={species.evolutionChain}
                  currentDex={dex!}
                />
              </Field>
            )}
            {species && (
              <Field label="Pokédex">
                <p className="text-text nums">
                  <span>{species.genus}</span>
                  {region && (
                    <>
                      <Separator tone="muted" spaced />
                      <span>{region}</span>
                    </>
                  )}
                  <Separator tone="muted" spaced />
                  <span>{(species.heightDm / 10).toFixed(1)} m</span>
                  <Separator tone="muted" spaced />
                  <span>{(species.weightHg / 10).toFixed(1)} kg</span>
                  {abilities && (
                    <>
                      <Separator tone="muted" spaced />
                      <span className="text-muted">{abilities}</span>
                    </>
                  )}
                </p>
              </Field>
            )}
          </dl>

          {species?.flavorText && (
            <p className="max-w-[60ch] border-l border-border-strong/40 pl-4 text-sm leading-relaxed text-muted/85 italic">
              {species.flavorText}
            </p>
          )}
        </div>
      </div>

      {otherPrints.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">
              Other prints of{" "}
              {dex != null ? (SPECIES[dex]?.name ?? card.name) : card.name}
            </p>
            <p className="text-[11px] text-muted nums">
              {otherPrints.length} card{otherPrints.length === 1 ? "" : "s"} ·{" "}
              {otherPrintsSetCount} set{otherPrintsSetCount === 1 ? "" : "s"}
              {otherPrintsOwnedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-covered">
                    {otherPrintsOwnedCount} owned
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="mt-4">
            <CardStrip cards={otherPrints} />
          </div>
        </section>
      )}

      {(ownedQty > 0 || events.length > 0) && (
        <div className="mt-16">
          <AcquisitionLog
            events={events}
            ownedQty={ownedQty}
            acquiredAt={acquiredAt}
          />
        </div>
      )}

      {artistCards.length > 0 && (
        <section className="mt-16 mb-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">More by {artist}</p>
            <p className="text-[11px] text-muted nums">
              {artistCards.length} card{artistCards.length === 1 ? "" : "s"}
              {artistOwnedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-covered">{artistOwnedCount} owned</span>
                </>
              )}
            </p>
          </div>
          <div className="mt-4">
            <CardStrip cards={artistCards} />
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="pt-1 text-[11px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="text-text">{children}</dd>
    </>
  );
}
