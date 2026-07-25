// Held value = current market worth of everything in the collection. It
// is the one number on the Transactions page that needs live pricing,
// and pricing is by far the slowest thing the page does: pokemontcg.io
// answers in 4-11s per set (measured), the user owns cards across ~22
// sets, and sets missing a TCGplayer price pay a second tcgcsv trip on
// top. Awaiting that inline used to block the entire render — ledger
// included — for 17-30s on a cold cache.
//
// So this is deliberately packaged as a promise the page kicks off but
// never awaits: the ledger streams immediately and the two priced hero
// numbers fill in under Suspense when the API finally answers.
//
// It never rejects. A pricing outage should degrade the hero to zero,
// not blow up the page, and an unawaited rejection would surface as an
// unhandled promise rejection before Suspense ever gets to render.

import { getSupabaseServer } from "@/lib/supabase/server";
import {
  fetchPricesForCards,
  PRICE_SOURCE_CURRENCY,
  sumPricesByQuantity,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import {
  convertCents,
  getLatestRatesFromEur,
} from "@/lib/pricing/exchange-rates";
import type { Currency } from "@/lib/pricing/currencies";

export async function computeHeldValueCents(
  userId: string,
  priceSource: PriceSource,
  displayCurrency: Currency,
): Promise<number> {
  try {
    const supabase = await getSupabaseServer();
    const { data: owned } = await supabase
      .from("owned_cards")
      .select("card_id, quantity")
      .eq("user_id", userId);

    const ownedQuantities = new Map<string, number>();
    for (const r of owned ?? []) {
      ownedQuantities.set(r.card_id as string, (r.quantity as number | null) ?? 1);
    }
    if (ownedQuantities.size === 0) return 0;

    const [priceMap, latestRatesFromEur] = await Promise.all([
      fetchPricesForCards(ownedQuantities.keys()),
      getLatestRatesFromEur(),
    ]);

    const { total: heldValueUnits } = sumPricesByQuantity(
      priceMap,
      ownedQuantities,
      priceSource,
    );
    const nativeCents = Math.round(heldValueUnits * 100);

    // Prices arrive in the marketplace's native currency (USD for
    // TCGplayer, EUR for Cardmarket). Convert at today's rate so the KPI
    // sums with ledger totals, which are already in displayCurrency.
    const heldValueCurrency = PRICE_SOURCE_CURRENCY[priceSource];
    return (
      convertCents(
        nativeCents,
        heldValueCurrency,
        displayCurrency,
        // No snapshot — market values are always "as of now".
        heldValueCurrency === "EUR"
          ? 1
          : 1 / (latestRatesFromEur[heldValueCurrency] ?? 1),
        latestRatesFromEur,
      ) ?? nativeCents
    );
  } catch (err) {
    console.warn("[transactions] held value unavailable:", err);
    return 0;
  }
}
