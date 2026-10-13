# Satoshi in Whiteboard and Construction Management

Supersedes [ADR-0003](./0003-urbanist-three-weights.md) for the two apps. The Marketing Site keeps Urbanist.

## Decision

Whiteboard and Construction Management use **Satoshi** (Indian Type Foundry) for all UI text. Geist Mono stays the monospace font. The weights stay 300 / 400 / 600, so no `font-*` utility changes.

The owner chose Satoshi on 2026-10-13, while the dashboard cards were being restyled after a reference design ([PR #69](https://github.com/arunselvakumar/white-board/pull/69)). It was the closest match to the font in that design.

## How it loads

Satoshi is **loaded from Fontshare's servers**, not self-hosted:

- `SatoshiStylesheet` in `@repo/ui` links `https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap`. That is the variable font, weights 300–900, so 600 is a true weight rather than synthesised.
- The `typeface-satoshi` class on `<html>` points `--font-sans` at it. Both root layouts and both Storybook previews render the component and set the class.

Satoshi is free under the ITF Free Font License, which allows self-hosting. It also forbids making the font files available through any publicly accessible repository, and this repository is public. Committing the `.woff2` would break the licence; loading through the Fontshare API is explicitly allowed. `next/font/google` can't serve it because Satoshi isn't on Google Fonts.

**Cost:** one extra origin at first paint, and the font shows with `font-display: swap`, so text renders in the system font until Satoshi arrives. If the repository goes private, the variable `.woff2` can move into the repo and load through `next/font/local`, with no other change.

## Considered options

- **Satoshi from Fontshare (chosen):** matches the reference and is allowed by the licence.
- **Satoshi self-hosted:** better loading, but not allowed while the repository is public.
- **Figtree from Google Fonts:** a close look-alike that loads the way Urbanist does, but not the font the owner picked.
- **Keep Urbanist:** the cards already used it. The difference the owner saw was the typeface itself, not only the weights.
