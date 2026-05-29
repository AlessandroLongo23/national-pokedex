// Card-printing variants recorded on single_purchase / sale ledger
// rows. Kept in its own module rather than alongside the server actions
// because transaction-actions.ts is a "use server" file, which only
// permits async-function exports — type + const + type-guard utilities
// would error there.

export const CARD_VARIANTS = ["normal", "holofoil", "reverseHolofoil"] as const;
export type CardVariant = (typeof CARD_VARIANTS)[number];

export function isCardVariant(value: unknown): value is CardVariant {
  return (
    typeof value === "string" &&
    (CARD_VARIANTS as readonly string[]).includes(value)
  );
}
