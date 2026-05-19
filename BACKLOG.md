# BACKLOG

Captured 2026-05-18. High-level wish list — not a plan, not prioritized, not estimated. Each item is context for tackling that piece of work later.

---

## 0. Product positioning (read this first)

The items in this backlog pivot the product from a single-collector tool into a multi-user binder tracker, with prices, a public API, and (later) a trading-community layer.

- [x] **Rewrite [PRODUCT.md](PRODUCT.md)** to reflect the multi-user, multi-binder, priced, API-exposing direction — done 2026-05-18. Preserved the "card art leads / quiet, dense, peer-to-peer" tone; reframed scope around binders-as-the-unit; removed the "just me / no prices / no social" stance; added strategic principles for binder-first thinking and free-data-only sourcing.

---

## 1. Identity & branding

- [ ] **Pick a product name.** Working candidates: *Pocket Binder*, *Pocket Bind*. The framing is "a tool for managing your own binder — a binder tracker."
- [ ] **Logo.** Either the Pokémon logo (if usable) or a custom logo we design specifically for this product.
- [ ] **Design system in light mode + dark mode.** Today the app is dark-only. Need a real system for both, with tokens, not ad-hoc styling.

---

## 2. Navigation & app shell

Sidebar lives in [app/(dashboard)/_components/Sidebar.tsx](app/(dashboard)/_components/Sidebar.tsx). Today: top nav = Dashboard / Pokédex / Sets / Packs / Wishlist; footer = an "Owned stats" card.

- [x] **Put the logo at the top of the sidebar** as the product mark / name.
- [x] **Reorganize pages**, moving more entries to the footer.
- [x] **Footer should host Settings + the user's account**, replacing the current "Owned stats" card.

---

## 3. Accounts & auth

Auth is currently bypassed for local dev — see [CLAUDE.md](CLAUDE.md) and [app/dashboard/dev.ts](app/dashboard/dev.ts), and the RLS-disabling migration referenced there.

- [x] **Real authentication on Supabase**, so anyone can create their own account and have their own binders.
- [x] **Per-user data isolation** — restore RLS + the FK to `auth.users` (the exact SQL to do this is already in the header comment of the dev-open-access migration).
- [x] Magic-link infra already exists ([scripts/dev/magic-link.ts](scripts/dev/magic-link.ts), `auth/`, `login/`) — confirm it's the path forward when restoring real auth.

---

## 4. Multi-binder system (the headline feature)

Today the app assumes one implicit binder: "one card per dex# in the National Pokédex." That's the most restrictive shape of a binder. The real product is **N binders per user**, each with its own scope. People are very creative with this.

- [x] **Users can create more than one binder.** Each binder has its own page, its own progress, its own target card list.
- [x] **Binder scope types** (this list is non-exhaustive — collectors invent new ones):
  - Master set of a specific TCG set
  - All cards of a specific Pokémon
  - All cards by a specific illustrator/artist
  - All cards of a specific Pokémon type
  - All cards that share a position across sets — e.g. "the 3rd card in every set"
  - All cards that share a visual motif — e.g. "every card with an apple in the illustration"
  - Fully custom user-defined list
- [ ] **Auto-fill the target card list on creation** where the scope is computable from the data:
  - Master set → all cards in that set.
  - One Pokémon → all cards for that dex#.
  - One artist → all cards with that `artist` field.
  - One type → all cards of that type.
  - "Custom / weird" scopes (apple in illustration, etc.) — manual list-building.

---

## 5. Per-binder & portfolio views

- [x] **A page per binder** showing how that specific binder is going (progress, missing cards, recent additions).
- [x] **A portfolio page** for the whole collection — how it's doing overall, including **collection value over time**, driven by the pack-purchase log.
- [x] **A collection browse page** for looking through everything you own, with highlight rails surfacing the top-N cards by personal favorites (user-tagged), rarity, price, and similar dimensions.

---

## 6. Card scope expansion

Today the data layer is narrowed twice: Pokémon-only (1,025 dex slots) *and* SV + Mega Evolution-only (the eras the original collector cared about). For a generalized binder tracker, neither restriction should leak into the UI.

- [ ] **Track Trainers, Items, Energies** — the entire card universe, not just Pokémon — so any binder scope is buildable.
- [ ] **Remove SV/ME-only framing from the UI.** Several components hard-code the original SV + Mega Evolution scope in user-facing copy — e.g. [Tooltip.tsx](app/(dashboard)/_components/Tooltip.tsx) ("SV/ME set", "Not in any SV/ME booster — singles only"), [pokedex/\[dex\]/page.tsx](app/(dashboard)/pokedex/[dex]/page.tsx) ("tracked sets (Scarlet & Violet · Mega Evolution)"), and [sets/page.tsx](app/(dashboard)/sets/page.tsx) ("X sets in Scarlet & Violet + Mega Evolution"). Generalize to whatever sets the user/binder cares about.

---

## 7. Card prices & valuation

- [x] **Find a free pricing API** for TCG cards. Using [pokemontcg.io](https://pokemontcg.io)'s `/v2/cards` endpoint — both `tcgplayer.prices` (USD) and `cardmarket.prices` (EUR) are returned per card. Fetched per-set on demand from [lib/pricing/pokemontcg.ts](lib/pricing/pokemontcg.ts) and cached by Next's fetch layer (24h revalidate). Source picker lives in Settings, backed by a new `user_preferences.price_source` row.
- [x] **Show "how much your binders are worth"** using those prices, both per-binder and as a portfolio total. Surfaced as a Portfolio Value KPI on `/portfolio`, a Value row on each binder detail, a value line on each `BinderListCard`, a price line on every `CardTile` rendered under a `CardPricesProvider`, and a "Collection value over time" chart (today's prices applied retroactively, since historical-price data isn't free — full historical MTM needs §9 pack-cost tracking too).

---

## 8. Quantity tracking

- [ ] **Track copies — when a user has more than one of the same card.** Today ownership is binary in `owned_pokemon`; needs to become a count.

---

## 9. Transactions ledger

Pack logging exists today. Expand it into a full money-in / money-out / value-held ledger:

- [ ] **Spent**: how much was paid for each pack; also singles purchases; PSA grading fees.
- [ ] **Earned**: how much was made when selling cards.
- [ ] **Worth now**: live value of cards currently held.
- [ ] **Log singles purchases** alongside pack purchases.
- [ ] **PSA / grading flow**: when cards were sent, which cards, what grade came back, value of the card before grading vs. after, fees paid.

---

## 10. Card component polish

[app/(dashboard)/_components/CardTile.tsx](app/(dashboard)/_components/CardTile.tsx) today overlays the owned toggle, wishlist button, and details link **on top of** the card art (hover-revealed).

- [ ] **Strip the card image clean** — nothing overlaid on the art.
- [ ] **Move all buttons below the card.**
- [ ] **Make the wishlist button clearer** in its idle state.
- [ ] **Make "in wishlist" and "owned" states visually distinct and unambiguous** — when a card is in the wishlist, it should be obviously in the wishlist; when it's owned, obviously owned. No quiet hover-only signals.

---

## 11. Set page header

[app/(dashboard)/sets/\[setId\]/page.tsx](app/(dashboard)/sets/[setId]/page.tsx) uses [PageHeader.tsx](app/(dashboard)/_components/PageHeader.tsx). The set's official logo is **not** currently shown in the header (it's only used in [BestPackHero.tsx](app/(dashboard)/_components/BestPackHero.tsx)).

- [ ] **Show the set logo in the header of the set page.**

---

## 12. Component library overhaul

- [ ] **Remove the AI-slop components** and replace them with our own deliberate component library. Audit [app/(dashboard)/_components/](app/(dashboard)/_components/) — KPI cards, generic page headers, generic hero blocks, tooltip, etc. — and decide what to keep, redesign, or delete.

---

## 13. Public API

- [ ] **Expose our data via a public API** so other people can build on top of it.

---

## 14. Full-screen card preview

Anywhere a card component appears — in a set, in a list of cards by a given artist, in a list of cards for a given Pokémon — there should be a way to preview the card full-screen.

- [x] **Full-screen card preview**, opened by tapping/clicking any card.
- [x] **Dark overlay around the previewed card** so the art pops.

---

## 15. Trading community *(later)*

The aspirational social layer — bringing the "trading" back into "trading card game." Bigger and further out than everything above.

- [ ] **Location on the account.** Users can set where they are.
- [ ] **See users in your area** based on that location.
- [ ] **Mark cards in your collection as "willing to trade."**
- [ ] **Mutual-compatibility matching**: if user A's wishlist intersects user B's willing-to-trade *and* B's wishlist intersects A's willing-to-trade, both get a notification — "this person nearby has what you want and wants what you have."
- [ ] This contradicts [PRODUCT.md](PRODUCT.md)'s "no community / social app, no sharing flows" stance even more sharply than multi-user accounts do — reinforces that PRODUCT.md needs a real rewrite rather than patches.

---

## Open questions (need a decision before scoping the above)

- **Product name** — *Pocket Binder*, *Pocket Bind*, or something else entirely?
- **Logo direction** — official Pokémon logo (licensing?) or a custom mark?
- **Pricing source** — which specific free API gets us prices for SV + Mega Evolution cards? `pokemontcg.io` exposes TCGplayer / Cardmarket prices on cards — confirm coverage and rate limits.
- **Migration story** — what happens to the existing single-user data (`DEV_USER_ID = "00000000-0000-0000-0000-000000000001"`) once real auth and per-user binders land?
- **Binder model in the DB** — when one user has many binders, the National Pokédex coverage we have today becomes one binder among many. How is "the original goal" represented?
- **API shape** — read-only? authenticated? what's the first use case that justifies building it?
- **Trading community: location granularity** — city, postal code, radius from a point, country only? What's the right unit for "people in your area"?
- **Trading community: privacy defaults** — is being discoverable opt-in or opt-out? Is a user's collection visible to nearby users, or only their willing-to-trade subset?
- **Trading community: notification delivery** — in-app only, email, push? How often / batched?
- **Trading community: safety** — anti-abuse, reporting, blocking, how meetups are coordinated (if at all in-product).
