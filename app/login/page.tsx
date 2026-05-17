import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-3xl font-bold">
        National <span className="text-accent">Pokédex</span>
      </h1>
      <p className="mb-8 text-sm text-muted">
        Enter your email to get a magic link. The link signs you in to your binder tracker.
      </p>
      <form action={sendMagicLink} className="space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-md border border-border bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg hover:opacity-90"
        >
          Send magic link
        </button>
      </form>
      {params.sent && (
        <p className="mt-4 text-sm text-covered">Check your email for the sign-in link.</p>
      )}
      {params.error && <p className="mt-4 text-sm text-missing">Error: {params.error}</p>}
    </main>
  );
}
