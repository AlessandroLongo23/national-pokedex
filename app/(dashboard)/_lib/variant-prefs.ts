// Client-safe constants and types for the "treat regional variants as
// separate" feature. Kept separate from `user-preferences.ts` because that
// file imports the server-only Supabase client and can't be loaded by client
// components.

export const VARIANT_PLACEMENTS = ["appended", "inline", "separate"] as const;
export type VariantPlacement = (typeof VARIANT_PLACEMENTS)[number];
