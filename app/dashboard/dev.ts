// AUTH BYPASS: every owned_pokemon row is keyed to this fixed UUID until
// authentication is re-added. To restore auth, delete this file and use
// supabase.auth.getUser() in page.tsx and actions.ts.
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
