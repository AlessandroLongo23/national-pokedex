import { redirect } from "next/navigation";
import { updatePassword } from "./actions";
import { getSupabaseServer } from "@/lib/supabase/server";
import { LinkedPokedexLogo } from "@/lib/components/ui/PokedexLogo";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-8">
        <LinkedPokedexLogo />
      </h1>
      <p className="mb-6 text-sm text-muted">
        Choose a new password for <strong>{user.email}</strong>.
      </p>
      <form action={updatePassword} className="space-y-3">
        <label className="block">
          <span className="sr-only">New password</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="New password (min 6 characters)"
            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">Confirm new password</span>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Confirm new password"
            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg hover:opacity-90"
        >
          Set new password
        </button>
      </form>
      <div aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm">
        {params.error && <p className="text-missing">Error: {params.error}</p>}
      </div>
    </main>
  );
}
