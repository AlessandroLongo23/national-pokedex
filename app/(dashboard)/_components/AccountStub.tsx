"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useUser } from "../_lib/UserContext";
import { signOut } from "../_lib/auth-actions";

function Avatar({ letter, size = 28 }: { letter: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-panel-3 text-[11px] font-semibold text-text"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {letter}
    </div>
  );
}

export function AccountStub({ variant }: { variant: "row" | "icon" }) {
  const { email, isGuest } = useUser();

  if (isGuest) {
    if (variant === "icon") {
      return (
        <Link
          href="/login"
          aria-label="Sign in"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-panel-3 text-muted transition hover:text-text"
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden />
        </Link>
      );
    }
    return (
      <div className="flex flex-col gap-1 px-3 py-2">
        <Link
          href="/login"
          className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-bg transition hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-accent hover:text-accent"
        >
          Create account
        </Link>
      </div>
    );
  }

  const letter = email ? email[0]!.toUpperCase() : "?";

  if (variant === "icon") {
    return (
      <div className="flex items-center" aria-label={`Account — ${email}`}>
        <Avatar letter={letter} size={28} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2"
      aria-label={`Account — ${email}`}
    >
      <Avatar letter={letter} size={28} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text">{email}</div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-[11px] text-muted transition hover:text-text"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
