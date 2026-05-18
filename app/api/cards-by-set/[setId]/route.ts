import { NextResponse } from "next/server";
import { loadSetCards } from "@/lib/data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  if (!/^[a-z0-9]+$/i.test(setId)) {
    return NextResponse.json({ error: "invalid set id" }, { status: 400 });
  }
  try {
    const cards = await loadSetCards(setId);
    return NextResponse.json(cards);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
