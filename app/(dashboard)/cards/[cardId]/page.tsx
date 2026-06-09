import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Ruler, Weight } from "lucide-react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { getSet, loadSetCards, SPECIES } from "@/lib/data";
import {
  getAllCards,
  filterByScope,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import {
  RARITY_LABEL,
  type CardEntry,
  type Generation,
} from "@/lib/data/types";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { LedgerCurrency } from "@/lib/ledger/money";
import type { Currency } from "@/lib/pricing/currencies";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { getOptionalUser } from "../../_lib/current-user";
import { loadUserPreferences } from "../../_lib/user-preferences";
import { SetPageTitle } from "../../_components/SetPageTitle";
import { Separator } from "../../_components/Separator";
import { CardActionsBar } from "./_components/CardActionsBar";
import { BinderMembership } from "./_components/BinderMembership";
import { CardHeroImage } from "./_components/CardHeroImage";
import { CardStrip } from "./_components/CardStrip";
import {
  EvolutionRow,
  MetaPill,
  RarityBadge,
  SetChip,
  TypeChip,
} from "./_components/CardChips";
import {
  AcquisitionLog,
  type AcquisitionEvent,
} from "./_components/AcquisitionLog";
import { MarketPriceBlock, MarketPriceFallback } from "./_components/MarketPriceBlock";

// Allow longer cold-cache loads to complete instead of timing out at the
// platform default (10s on Vercel Hobby). With the price block now
// streamed via Suspense the shell HTML still ships fast, but the function
// itself must stay alive until the upstream price fetch resolves.
export const maxDuration = 60;

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

  const user = await getOptionalUser();
  const supabase = await getSupabaseServer();
  const prefs = user
    ? await loadUserPreferences(user.id)
    : {
        priceSource: "tcgplayer" as const,
        displayCurrency: "USD" as Currency,
      };

  const [ownedRes, packRows, txRows, allCards, latestRatesFromEur] =
    await Promise.all([
      user
        ? supabase
            .from("owned_cards")
            .select("quantity, acquired_at")
            .eq("user_id", user.id)
            .eq("card_id", card.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from("pack_contents")
            .select(
              "pack_id, packs_opened!inner(id, user_id, set_id, opened_at, cost_cents, currency, rate_to_eur)",
            )
            .eq("card_id", card.id)
            .eq("packs_opened.user_id", user.id)
        : Promise.resolve({ data: [] }),
      user
        ? supabase
            .from("transactions")
            .select(
              "kind, occurred_at, amount_cents, currency, rate_to_eur, quantity, note",
            )
            .eq("user_id", user.id)
            .eq("card_id", card.id)
            .in("kind", ["single_purchase", "sale", "psa_fee"])
        : Promise.resolve({ data: [] }),
      getAllCards(),
      getLatestRatesFromEur(),
    ]);
  const ownedQty = (ownedRes.data?.quantity as number | null) ?? 0;
  const acquiredAt = (ownedRes.data?.acquired_at as string | null) ?? null;
  // Defaults for the singles purchase/sale modals — pick the user's
  // chosen display currency so logging matches what they see.
  const currency = prefs.displayCurrency;

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
  if (user && stripIds.length > 0) {
    const { data: ownedRows } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", user.id)
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

  // Which of the user's binders contain this card. Membership reuses the
  // canonical scope logic — for non-custom scopes we run `filterByScope` on a
  // single-element array and check whether the card survives; for custom
  // scopes (which `filterByScope` returns [] for) we consult the
  // `binder_cards` join populated only for that scope type.
  const matchedBinders: {
    id: string;
    name: string;
    href: string;
    coverageRange: { from: number; to: number } | null;
  }[] = [];
  if (user) {
    const [bindersRes, binderCardRes] = await Promise.all([
      supabase
        .from("binders")
        .select("id, name, scope_type, scope_params")
        .eq("user_id", user.id),
      supabase.from("binder_cards").select("binder_id").eq("card_id", card.id),
    ]);
    const customBinderIds = new Set(
      (binderCardRes.data ?? []).map((r) => r.binder_id as string),
    );
    for (const b of bindersRes.data ?? []) {
      const scopeType = b.scope_type as ScopeType;
      const included =
        scopeType === "custom"
          ? customBinderIds.has(b.id as string)
          : filterByScope([card], scopeType, b.scope_params as ScopeParams)
              .length > 0;
      if (included) {
        // Pokedex-scope binders track coverage at the species level: owning any
        // card for an in-range dex# satisfies that slot, so a different print of
        // a Pokémon you already have is "covered", not "needed". Pass the range
        // so the client can compute species coverage live. Other scopes collect
        // each specific card, so they stay per-card (coverageRange = null).
        let coverageRange: { from: number; to: number } | null = null;
        if (scopeType === "pokedex") {
          const p = b.scope_params as { dexFrom: number; dexTo: number };
          coverageRange = { from: p.dexFrom, to: p.dexTo };
        }
        matchedBinders.push({
          id: b.id as string,
          name: b.name as string,
          href: `/binders/${b.id}`,
          coverageRange,
        });
      }
    }
  }

  const events: AcquisitionEvent[] = [
    ...(packRows.data ?? []).map((row) => {
      const pack = row.packs_opened as unknown as {
        id: string;
        set_id: string;
        opened_at: string;
        cost_cents: number | null;
        currency: string | null;
        rate_to_eur: number | string | null;
      };
      const rateToEur =
        pack.rate_to_eur == null ? null : Number(pack.rate_to_eur);
      return {
        kind: "pack" as const,
        packId: pack.id,
        setId: pack.set_id,
        openedAt: pack.opened_at,
        costCents: pack.cost_cents,
        currency: (pack.currency as LedgerCurrency | null) ?? null,
        rateToEur: Number.isFinite(rateToEur) ? rateToEur : null,
      };
    }),
    ...(txRows.data ?? []).map((row) => {
      const rateRaw = (row as { rate_to_eur: number | string | null }).rate_to_eur;
      const rateToEur = rateRaw == null ? null : Number(rateRaw);
      return {
        kind: row.kind as "single_purchase" | "sale" | "psa_fee",
        occurredAt: row.occurred_at as string,
        amountCents: row.amount_cents as number,
        currency: row.currency as LedgerCurrency,
        rateToEur: Number.isFinite(rateToEur) ? rateToEur : null,
        quantity: (row.quantity as number | null) ?? null,
        note: (row.note as string | null) ?? null,
      };
    }),
  ];

  return (
    <div className="mx-auto max-w-[1280px]">
      <SetPageTitle title={card.name} detail={`${set.name} · #${card.number}`} />

      <div className="grid gap-8 md:grid-cols-[minmax(260px,360px)_1fr]">
        <div>
          <CardHeroImage card={card} />
        </div>

        <div className="flex flex-col gap-7">
          {/* Identity header — official artwork beside the name/rarity rows,
              with the type symbol(s) sitting by the name like a card's title
              bar. The sprite links to the species page (the role the old
              "Pokémon" details row used to play). */}
          <div className="flex items-start gap-4">
            {dex != null && (
              <Link
                href={`/pokedex/${dex}`}
                aria-label={SPECIES[dex]?.name ?? `#${dex}`}
                className="shrink-0 transition hover:opacity-80"
              >
                <Image
                  src={officialArtworkUrl(dex)}
                  alt=""
                  width={112}
                  height={112}
                  unoptimized
                  className="h-[104px] w-[104px] object-contain"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="eyebrow">
                <Link
                  href={`/sets/${setId}`}
                  className="underline-offset-2 hover:text-text hover:underline"
                >
                  {set.name}
                </Link>{" "}
                · #{card.number}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-3xl font-semibold tracking-tight text-text">
                  {card.name}
                </h1>
                {card.types.length > 0 && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {card.types.map((t) => (
                      <TypeChip key={t} type={t} />
                    ))}
                  </div>
                )}
              </div>
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
          </div>

          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-border py-4">
            {user && (
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
            )}
            <div>
              <p className="eyebrow">Market price</p>
              <Suspense
                fallback={
                  <MarketPriceFallback
                    priceSource={prefs.priceSource}
                    isAuthed={!!user}
                  />
                }
              >
                <MarketPriceBlock
                  cardId={card.id}
                  priceSource={prefs.priceSource}
                  displayCurrency={prefs.displayCurrency}
                  isAuthed={!!user}
                />
              </Suspense>
            </div>
          </div>

          {user && (
            <CardActionsBar
              card={{
                id: card.id,
                name: card.name,
                setId: card.setId,
                number: card.number,
                imageSmall: card.imageSmall,
              }}
              suggestedUnitProceedsCents={null}
              defaultCurrency={currency}
            />
          )}

          {user && matchedBinders.length > 0 && (
            <BinderMembership
              binders={matchedBinders}
              cardId={card.id}
              dexNumbers={card.dex}
              megaFormKey={card.megaFormKey ?? null}
              variantFormKey={card.variantFormKey ?? null}
            />
          )}

          {/* Collecting data — what a collector actually tracks. Type moved
              to the header; the Pokémon sprite moved to the header; HP dropped. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm">
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
              <SetChip setId={setId} setName={set.name} number={card.number} symbolUrl={set.symbolUrl} />
            </Field>
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
          </dl>

          {/* Pokédex flavour — demoted to a quiet footer pinned to the bottom
              of the column so the right side ends level with the card art. */}
          {species && (
            <p className="mt-auto border-t border-border pt-3 text-xs text-muted nums">
              <span>{species.genus}</span>
              {region && (
                <>
                  <Separator tone="muted" spaced />
                  <span>{region}</span>
                </>
              )}
              <Separator tone="muted" spaced />
              <span className="inline-flex items-center gap-1 align-middle">
                <Ruler aria-hidden className="h-3.5 w-3.5 text-muted" />
                {(species.heightDm / 10).toFixed(1)} m
              </span>
              <Separator tone="muted" spaced />
              <span className="inline-flex items-center gap-1 align-middle">
                <Weight aria-hidden className="h-3.5 w-3.5 text-muted" />
                {(species.weightHg / 10).toFixed(1)} kg
              </span>
              {abilities && (
                <>
                  <Separator tone="muted" spaced />
                  <span>{abilities}</span>
                </>
              )}
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
            displayCurrency={prefs.displayCurrency}
            latestRatesFromEur={latestRatesFromEur}
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
