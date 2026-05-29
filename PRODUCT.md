# PRODUCT.md

## Product Purpose

A binder tracker for Pokémon TCG collectors. Users build any number of binders — a National Pokédex run, a master set, an artist deep-dive, every card with an apple in the illustration — and the app keeps live, Supabase-backed track of what's owned, what's missing, what's wishlisted, and what the whole collection is worth.

The project started as a single-collector tool for one specific goal (one card per National Pokédex entry #1–1025, housed in a 4×4 Vault X binder — see [README.md](README.md)). It's now generalising into a multi-user product, with that original goal becoming one binder shape among many.

Working name: *Pocket Binder* / *Pocket Bind* (TBD — see [BACKLOG.md](BACKLOG.md) §1).

## Register

`product` — the design serves the tool. This is utility UI for collectors who already know the domain, not a marketing site. Information density and quick scanning matter more than persuasion. It's a collector's tool that happens to support many collectors, not a SaaS dashboard.

## Users

Pokémon TCG collectors. Comfortable with set codes (`sv1`, `me2pt5`), rarity tiers, dex numbering, artist names. The product assumes domain literacy — it doesn't teach what an "Illustration Rare" is or what `nationalPokedexNumbers` means.

Collectors are creative about what a "binder" is. The app supports that creativity rather than forcing one taxonomy:

- A binder might be a master set of `sv1`.
- A binder might be every printing of Charizard.
- A binder might be every card by a specific illustrator.
- A binder might be every card whose artwork contains an apple.
- A binder might be every card sharing a position across sets ("the 3rd card in every set").

Primary contexts of use:

- **Desktop**, planning mode — choosing the next pack, scanning a binder's missing list, reviewing portfolio value over time.
- **Phone**, logging mode — sitting at the kitchen table after opening a pack, marking cards owned with two thumbs in weak indoor light.
- **Phone / desktop**, trading context (later) — checking if anyone nearby has the cards a binder still needs.

Touch parity is not optional. Hover-only affordances actively block the phone context.

## Brand & tone

Quiet, dense, slightly nerdy. Treats users like peers who already know TCG. Type-led, not graphic-led — the card art does the heavy visual lifting; product chrome stays out of the way. No marketing-speak, no exclamation points, no friendly tutorialese.

Aesthetic: full light and dark themes with a real token-driven design system (see [BACKLOG.md](BACKLOG.md) §1 — currently dark-only and being rebuilt). Tinted neutrals, never `#000` or `#fff`. Accent in the cool blue-purple family. Type-led product chrome, art-led content surfaces.

State color system. Distinct collecting states get distinct colors. Each state gets one color, never two stacked on the same element.

- **Owned (amber, `--color-owned` ≈ #fbbf24).** A count of physical cards held. Used on per-card quantity badges, per-set owned counts, and progress bars that read "X of Y cards". Amber communicates "tracked, in progress" without implying completion.
- **Covered (emerald, `--color-covered` ≈ #34d399).** A binary fulfilment signal: this entry is satisfied (≥1 owned card meets it). Used on Pokémon-level dex completion, artist coverage, and any place where the question is "done or not done?". Emerald is the moment-of-celebration color.
- **Wanted (red, `--color-missing` ≈ #f87171).** The "I don't have this and I want it" signal, shared by two faces of one idea: explicit **wishlist** (the heart on a card you don't own) and **missing** coverage gaps. Red reads as desire and need here, not alarm. Genuine errors are rare in this UI and reuse the same red; they are separated by context and timing and never sit on the same element as a wishlist heart.
- **Favorite (gold, `--color-favorite` ≈ #fcd34d).** The star on a card you already own and love. A warm gold kept deliberately distinct from owned-amber so the two warm signals don't read as the same thing. (Currently hardcoded in [CardActionsBar](app/(dashboard)/cards/[cardId]/_components/CardActionsBar.tsx); should be tokenized.)
- **Accent (blue-purple, `--color-accent` ≈ #60a5fa).** Selection and primary actions only. Not a collecting-state color, not decoration.

## What this is

- A **multi-binder tracker** — N binders per user, each with its own scope, auto-filled where the data allows.
- A **collection ledger** — spent on packs/singles/grading, earned on sales, current portfolio value over time.
- A **price-aware tool** — uses a free pricing API to show how much each binder and the overall collection is worth.
- A **catalog for the whole card universe** — Pokémon, Trainers, Items, Energies — because binders span all card types.
- A **public-API surface** (planned) — read access to data so other people can build on top of it.

## What this is not

- **A polished SaaS dashboard.** Don't pretend this is a Stripe metrics page. It's a collector's tool that happens to support many collectors.
- **A deck-builder or competitive-play tool.** Card text matters for collecting context, not gameplay.
- **An AI-assistant boilerplate clone.** No gradient text, no glass cards, no hero-metric tiles, no identical icon-headline-paragraph card grids.
- **A general marketplace.** The trading-community layer (see [BACKLOG.md](BACKLOG.md) §15) is about matching local collectors with mutual trade compatibility, not running listings, escrow, or payments. Money moves between people, not through the product.

## Strategic principles

1. **The card art leads.** The most beautiful thing on screen is the Pokémon TCG card itself. Product chrome stays type-led and quiet so the art breathes. If a frame or chip is competing with the art for attention, the frame is wrong.
2. **Binders are the unit.** Everything — progress, value, missing lists, wishlist — is scoped to a binder first, aggregated across binders second. The "global" view is a roll-up, not the primary view.
3. **Plan / log / trade are equal contexts.** Desktop planning, phone logging, and (later) trading checks all need to work well. If a feature works on one but not the others, it's not done.
4. **Density is fine, noise is not.** A 6×N grid of card variants is correct — collectors compare variants in parallel. But every label, chip, and badge must earn its pixels.
5. **State signals graduate, not stack.** Owned, wishlisted, willing-to-trade, selected — each state gets one strong signal, not three competing ones. Triple-encoding (border + badge + button-fill, all the same color) is failure.
6. **Server is the source of truth, optimism is the UX.** Toggles are optimistic, write to Supabase, reconcile via realtime — never wait on the network to update the UI.
7. **Free data only.** Card and price data come from `pokemontcg.io` or the static `pokemon-tcg-data` GitHub repo. Paid endpoints (e.g. Scrydex) are off-limits — see [CLAUDE.md](CLAUDE.md).
