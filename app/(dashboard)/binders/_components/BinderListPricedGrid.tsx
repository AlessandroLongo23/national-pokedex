import { MEGAS, VARIANTS } from "@/lib/data";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import {
  fetchPricesForCards,
  sumPricesByQuantity,
  type DisplayConversion,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import { BinderListCard } from "../../_components/BinderListCard";

interface BinderRow {
  id: string;
  name: string;
  scope_type: ScopeType;
  scope_params: ScopeParams | Record<string, unknown>;
}

interface Props {
  binders: BinderRow[];
  customCardsByBinder: Map<string, string[]>;
  ownedQuantities: Map<string, number>;
  treatMegasAsSeparate: boolean;
  megaPlacement: "appended" | "inline" | "separate";
  treatVariantsAsSeparate: boolean;
  variantPlacement: "appended" | "inline" | "separate";
  priceSource: PriceSource;
  display: DisplayConversion;
}

// Async server component nested in <Suspense> on the binders index. The
// page renders the list with progress badges immediately; this component
// streams the value column once the (potentially-slow) cross-set price
// fetches resolve.
export async function BinderListPricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  priceSource,
  display,
}: Props) {
  const ownedIds = new Set(ownedQuantities.keys());
  const allCards = binders.length > 0 ? await getAllCards() : [];

  interface BinderCompute {
    id: string;
    name: string;
    scopeType: ScopeType;
    scopeParams: ScopeParams | Record<string, unknown>;
    targetCount: number;
    ownedCount: number;
    ownedCardIds: string[];
  }

  const computed: BinderCompute[] = binders.map((b) => {
    let targetCount: number;
    let ownedCount: number;
    const ownedIdsInBinder: string[] = [];
    if (b.scope_type === "pokedex") {
      const params = b.scope_params as { dexFrom: number; dexTo: number };
      const inRange = filterByScope(allCards, "pokedex", params);
      const cov = pokedexCoverage(
        params,
        ownedIds,
        inRange,
        { treatMegasAsSeparate, megaPlacement, megas: MEGAS },
        { treatVariantsAsSeparate, variantPlacement, variants: VARIANTS },
      );
      targetCount =
        cov.dexNumbers.length + cov.megaForms.length + cov.variantForms.length;
      ownedCount =
        cov.covered.size +
        cov.coveredMegaForms.size +
        cov.coveredVariantForms.size;
      for (const c of inRange) {
        if (ownedIds.has(c.id)) ownedIdsInBinder.push(c.id);
      }
    } else {
      const target =
        b.scope_type === "custom"
          ? filterCardsByIds(allCards, customCardsByBinder.get(b.id) ?? [])
          : filterByScope(allCards, b.scope_type, b.scope_params as ScopeParams);
      targetCount = target.length;
      ownedCount = 0;
      for (const c of target) {
        if (ownedIds.has(c.id)) {
          ownedCount += 1;
          ownedIdsInBinder.push(c.id);
        }
      }
    }
    return {
      id: b.id,
      name: b.name,
      scopeType: b.scope_type,
      scopeParams: b.scope_params,
      targetCount,
      ownedCount,
      ownedCardIds: ownedIdsInBinder,
    };
  });

  const allOwnedForPricing = new Set<string>();
  for (const c of computed) for (const id of c.ownedCardIds) allOwnedForPricing.add(id);
  const priceMap = await fetchPricesForCards(allOwnedForPricing);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {computed.map((c) => {
        const pairs: [string, number][] = c.ownedCardIds.map((id) => [
          id,
          ownedQuantities.get(id) ?? 1,
        ]);
        const { total } = sumPricesByQuantity(priceMap, pairs, priceSource);
        return (
          <BinderListCard
            key={c.id}
            id={c.id}
            name={c.name}
            scopeType={c.scopeType}
            scopeParams={c.scopeParams}
            targetCount={c.targetCount}
            ownedCount={c.ownedCount}
            value={total}
            priceSource={priceSource}
            display={display}
          />
        );
      })}
    </div>
  );
}

// Same grid but with no price fetch — used as the Suspense fallback so the
// list lights up immediately. Progress badges work without prices; the
// per-binder value row stays hidden (BinderListCard already gates it on
// `value > 0`) until the priced grid swaps in.
export function BinderListUnpricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  priceSource,
  display,
  allCards,
}: Props & { allCards: import("@/lib/data/types").CardEntry[] }) {
  const ownedIds = new Set(ownedQuantities.keys());

  const computed = binders.map((b) => {
    let targetCount: number;
    let ownedCount: number;
    if (b.scope_type === "pokedex") {
      const params = b.scope_params as { dexFrom: number; dexTo: number };
      const inRange = filterByScope(allCards, "pokedex", params);
      const cov = pokedexCoverage(
        params,
        ownedIds,
        inRange,
        { treatMegasAsSeparate, megaPlacement, megas: MEGAS },
        { treatVariantsAsSeparate, variantPlacement, variants: VARIANTS },
      );
      targetCount =
        cov.dexNumbers.length + cov.megaForms.length + cov.variantForms.length;
      ownedCount =
        cov.covered.size +
        cov.coveredMegaForms.size +
        cov.coveredVariantForms.size;
    } else {
      const target =
        b.scope_type === "custom"
          ? filterCardsByIds(allCards, customCardsByBinder.get(b.id) ?? [])
          : filterByScope(allCards, b.scope_type, b.scope_params as ScopeParams);
      targetCount = target.length;
      ownedCount = 0;
      for (const c of target) {
        if (ownedIds.has(c.id)) ownedCount += 1;
      }
    }
    return {
      id: b.id,
      name: b.name,
      scopeType: b.scope_type,
      scopeParams: b.scope_params,
      targetCount,
      ownedCount,
    };
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {computed.map((c) => (
        <BinderListCard
          key={c.id}
          id={c.id}
          name={c.name}
          scopeType={c.scopeType}
          scopeParams={c.scopeParams}
          targetCount={c.targetCount}
          ownedCount={c.ownedCount}
          value={0}
          priceSource={priceSource}
          display={display}
        />
      ))}
    </div>
  );
}
