import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { LinkedPokedexLogo } from "@/lib/components/ui/PokedexLogo";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-8">
        <LinkedPokedexLogo />
      </h1>
      <p className="mb-6 text-sm text-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <form action={requestPasswordReset} className="space-y-3">
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
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg hover:opacity-90"
        >
          Send reset link
        </button>
      </form>
      <div aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm">
        {params.sent && (
          <p className="text-covered">
            Check your email for the reset link.
          </p>
        )}
        {params.error && <p className="text-missing">Error: {params.error}</p>}
      </div>
      <p className="mt-6 text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
