import Link from "next/link";
import { signUp } from "./actions";
import { LinkedPokedexLogo } from "@/lib/components/ui/PokedexLogo";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-start py-12 md:justify-center md:py-0 px-6">
      <h1 className="mb-8">
        <LinkedPokedexLogo />
      </h1>
      <form action={signUp} className="space-y-3">
        <label className="block">
          <span className="sr-only">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Password (min 6 characters)"
            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">Confirm password</span>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Confirm password"
            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground hover:opacity-90"
        >
          Create account
        </button>
      </form>
      <div aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm">
        {params.sent && (
          <p className="text-covered">
            Check your email to confirm your account.
          </p>
        )}
        {params.error && <p className="text-missing">Error: {params.error}</p>}
      </div>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="inline-block py-2 md:py-0 text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
