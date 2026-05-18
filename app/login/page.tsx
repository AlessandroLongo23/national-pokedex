import { sendMagicLink } from "./actions";
import { Logo } from "@/app/(dashboard)/_components/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-8">
        <Logo />
      </h1>
      <p className="mb-8 text-sm text-muted">
        Enter your email and we&apos;ll send you a one-time sign-in link.
      </p>
      <form action={sendMagicLink} className="space-y-3">
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
          Send magic link
        </button>
      </form>
      <div aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm">
        {params.sent && (
          <p className="text-covered">Check your email for the sign-in link.</p>
        )}
        {params.error && <p className="text-missing">Error: {params.error}</p>}
      </div>
    </main>
  );
}
