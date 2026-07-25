import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/cards/search/route";

async function search(params: string) {
  const res = await GET(new Request(`http://localhost/api/cards/search?${params}`));
  return (await res.json()) as {
    results: { id: string; name: string }[];
    total: number;
  };
}

describe("GET /api/cards/search", () => {
  it("returns every match for a specific name, not a fixed page of them", async () => {
    const { results, total } = await search("q=charizard");
    // The old route capped at 20 and, worse, stopped scanning the
    // catalogue at card 17329 of 20428 — so this count was unreachable.
    expect(total).toBeGreaterThan(100);
    expect(results.length).toBe(total);
  });

  it("includes matches that live at the very end of the catalogue", async () => {
    const { results } = await search("q=charizard");
    const ids = new Set(results.map((c) => c.id));
    // Late-catalogue prints the old early-break could never reach.
    for (const id of ["sv4pt5-234", "me2-13", "me2pt5-22"]) {
      expect(ids).toContain(id);
    }
  });

  it("caps enormous result sets but reports the true total", async () => {
    const { results, total } = await search("q=ch");
    expect(total).toBeGreaterThan(1000);
    expect(results.length).toBe(500);
    expect(results.length).toBeLessThan(total);
  });

  it("honours an explicit smaller limit while still reporting the total", async () => {
    const { results, total } = await search("q=pikachu&limit=5");
    expect(results.length).toBe(5);
    expect(total).toBeGreaterThan(100);
  });

  it("ranks prefix matches ahead of substring matches", async () => {
    const { results } = await search("q=charizard");
    const firstSubstring = results.findIndex(
      (c) => !c.name.toLowerCase().startsWith("charizard"),
    );
    const lastPrefix = results.reduce(
      (acc, c, i) => (c.name.toLowerCase().startsWith("charizard") ? i : acc),
      -1,
    );
    if (firstSubstring !== -1) expect(lastPrefix).toBeLessThan(firstSubstring);
  });

  it("returns nothing for a one-character query", async () => {
    const { results, total } = await search("q=c");
    expect(results).toEqual([]);
    expect(total).toBe(0);
  });
});
