import { NextResponse, type NextRequest } from "next/server";

// AUTH BYPASS: temporarily a no-op. Restore by re-adding updateSession()
// from lib/supabase/proxy.ts when bringing authentication back.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
