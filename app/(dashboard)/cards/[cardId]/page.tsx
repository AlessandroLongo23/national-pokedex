import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSet, loadSetCards } from "@/lib/data";
import { RARITY_LABEL, type CardEntry } from "@/lib/data/types";
import {
  fetchPricesForCards,
  formatPrice,
  pickPrice,
  PRICE_SOURCE_CURRENCY,
  PRICE_SOURCE_LABEL,
} from "@/lib/pricing/pokemontcg";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "../../_lib/current-user";
import { loadUserPreferences } from "../../_lib/user-preferences";
import { CardActionsBar } from "./_components/CardActionsBar";

interface PageProps {
  params: Promise<{ cardId: string }>;
}

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

  const [ownedRes, priceMap] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("quantity")
      .eq("user_id", userId)
      .eq("card_id", card.id)
      .maybeSingle(),
    fetchPricesForCards([card.id]),
  ]);
  const ownedQty = (ownedRes.data?.quantity as number | null) ?? 0;
  const price = pickPrice(priceMap.get(card.id), prefs.priceSource);
  const currency = PRICE_SOURCE_CURRENCY[prefs.priceSource];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <Link
        href={`/sets/${setId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {set.name}
      </Link>

      <div className="grid gap-8 md:grid-cols-[minmax(260px,360px)_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageLarge}
            alt={card.name}
            className="w-full rounded-lg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]"
            style={{ aspectRatio: "245 / 342" }}
          />
        </div>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="eyebrow">
              <Link
                href={`/sets/${setId}`}
                className="underline-offset-2 hover:text-text hover:underline"
              >
                {set.name}
              </Link>{" "}
              · #{card.number}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-text">{card.name}</h1>
            <p className="text-sm text-muted">
              {RARITY_LABEL[card.rarity]}
              {card.supertype !== "Pokémon" && (
                <>
                  {" · "}
                  {card.supertype}
                </>
              )}
              {card.artist && (
                <>
                  {" · illus. "}
                  <span className="text-text">{card.artist}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-border py-4">
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
            ownedQty={ownedQty}
            suggestedUnitProceedsCents={price != null ? Math.round(price * 100) : null}
            defaultCurrency={currency}
          />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            {card.types.length > 0 && (
              <Field label="Type">{card.types.join(" / ")}</Field>
            )}
            {card.hp != null && <Field label="HP">{card.hp}</Field>}
            {card.subtypes.length > 0 && (
              <Field label="Subtypes">{card.subtypes.join(", ")}</Field>
            )}
            {card.regulationMark && <Field label="Regulation">{card.regulationMark}</Field>}
            {card.evolvesFrom && (
              <Field label="Evolves from">{card.evolvesFrom}</Field>
            )}
            {card.dex.length > 0 && (
              <Field label="National Pokédex">
                {card.dex.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ", "}
                    <Link
                      href={`/pokedex/${d}`}
                      className="underline-offset-2 hover:text-text hover:underline"
                    >
                      #{d}
                    </Link>
                  </span>
                ))}
              </Field>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}
