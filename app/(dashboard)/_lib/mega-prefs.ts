// Client-safe constants and types for the "treat Megas as separate" feature.
// Kept separate from `user-preferences.ts` because that file imports the
// server-only Supabase client and can't be loaded by client components.

export const MEGA_PLACEMENTS = ["appended", "inline", "separate"] as const;
export type MegaPlacement = (typeof MEGA_PLACEMENTS)[number];
