"use client";

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
  const { email } = useUser();
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
