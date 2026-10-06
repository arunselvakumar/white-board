# Marketing Site — design brief

This file is the single source of taste for `apps/marketing`. Every section component follows it. Product words come from [`CONTEXT.md`](../../CONTEXT.md); do not invent synonyms.

## Who this page is for

A Training Institute owner in India — a CSC-style computer centre, a home-tuition tutor, a spoken-English or skill centre. They run the business from a paper register and a spreadsheet. They lose dues, double-book the 9 o'clock Tally batch, and cannot say who is in this morning's DCA batch without flipping pages.

The page has one job: get that owner to create a Workspace at `/app/signup`.

## Direction: "The register, lifted"

Editorial and technical. The paper register is the object we replace, so the page is built like a register that becomes software. One memorable thing: **a 3D register that opens and whose rows lift into the product**. Everything else is quiet.

What this is not: a centred hero with a gradient blob, three feature cards in a row, a testimonial carousel, a pricing table, a purple gradient on white, an all-caps eyebrow above every heading.

## Colour (no new colours; these already exist in `@repo/ui/globals.css`)

| Role              | Token / value                                                                                                                      | Use                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Paper             | `bg-background` `#f6f7fb`                                                                                                          | Default page surface                                             |
| Ink               | `text-foreground` `#16182a`                                                                                                        | Body and display text                                            |
| Violet            | `bg-primary` / `text-primary` `#595fae`                                                                                            | Buttons, links, the logo plate, one solid highlight per section  |
| Night             | `#201a3e` → `#100e22` (see `.surface-night`)                                                                                       | Dark sections; same radial as the Whiteboard sign-in brand panel |
| Haze              | `bg-secondary` `#eef0f8`                                                                                                           | Second light surface, mock UI chrome                             |
| Line              | `border-border` `#e2e4ef`, `brand-200` `#d1d6ec`                                                                                   | Ruled lines of the register, dividers                            |
| Muted ink         | `text-muted-foreground` `#6b6f8c`                                                                                                  | Secondary copy, mock UI labels                                   |
| Data colours only | `chart-3` green `#2f9e61` paid · `chart-4` amber `#c7900a` due · `chart-5` red `#d24a36` overdue · `chart-2` blue `#2a7dbf` online | Only inside mock product UI, only where they carry meaning       |

Rules: violet is a solid plate or ink, never a gradient on paper. The only gradient on the site is the night radial. No `rgba(0,0,0,.1)` drop shadows on everything; a shadow is allowed only on the 3D objects (register pages, receipt), where it describes depth.

## Type (ADR-0003: Urbanist 300 / 400 / 600 only)

- Display: Urbanist **300**, `clamp(2.75rem, 7vw, 6.5rem)`, `tracking-[-0.03em]`, `leading-[0.95]`. Light weight at large size is the signature. Sentence case. No single word in a different colour or italic.
- Section headings: Urbanist 300, `clamp(2rem, 4vw, 3.5rem)`, `tracking-[-0.02em]`, `leading-[1.02]`.
- Body: Urbanist 400, `1.0625rem` / `1.6`, max `60ch`. Lead paragraphs `1.25rem`.
- Strong / buttons / nav: Urbanist 600.
- Data only: Geist Mono (`font-mono`) for amounts, receipt numbers, times, dates inside mock UI. Never for labels or eyebrows.
- No all-caps labels anywhere. No `·` separators. No `→` glued to link text.

## Layout

- Container `mx-auto w-full max-w-[1280px] px-6 md:px-10`. Twelve columns on `lg`.
- Text is left-aligned. The hero is asymmetric: copy in columns 1–5, the 3D scene in 6–12 bleeding off the right edge.
- Sections are separated by surface changes (paper → night → paper → haze) and by vertical rhythm, not by boxes: section padding `py-24 md:py-32 lg:py-40`.
- A 1px ruled line is the page's structural device, because a register is ruled. Use it for row lists and dividers. Do not add borders to blocks that are not rows.
- Numbered markers are allowed in exactly one place: the six-step register loop, because it is a real sequence.

## Motion (GSAP 3.15, `@gsap/react`)

Import only from `@/lib/gsap` (it registers `useGSAP`, `ScrollTrigger`, `SplitText`). Components that animate are `"use client"`.

Three orchestrated moments on the whole page, nothing else moves on its own:

1. **Hero load**: the register opens and its rows lift into a product table. One timeline, ~2.4s, eased, starts after mount.
2. **Register loop**: a pinned, scrubbed sequence of six 3D cards, one per step.
3. **Receipt print**: a receipt slides out of a 3D plate when the fees section enters.

Everything else: no fade-up-on-scroll per section, no hover lift on every block. Hover is only on links and buttons.

Use `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)`; under reduced motion render the final state with no tweens. All 3D is CSS 3D (`perspective`, `rotateX/Y`, `translateZ`, `transform-style: preserve-3d`) driven by GSAP; no WebGL. Set initial hidden states in CSS classes (or `gsap.set` inside `useGSAP`) so the server and client markup match.

Keep ScrollTrigger pins inside the section's own wrapper; use `scope` on `useGSAP`; never leak triggers (the hook cleans up).

## Copy voice

Plain, specific, sentence case, from the owner's point of view. Use the product words: Student, Course, Batch, Enrollment, Timings, Class Mode, Fee Plan, Fee Payment, Receipt, Owner Dashboard, Calendar, Student Home, Parent Home, Workspace, Training Institute. Indian vernacular where it is natural: DCA, Tally, Python, ₹, UPI, "the 9 o'clock batch".

A CTA names what happens: "Create your Workspace", "Sign in". No "Get started", no "Learn more".

Do not fabricate: no customer logos, no testimonials, no user counts, no prices, no "trusted by". Mock product UI shows plausible sample data (a Student named Priya Nair, a Course called DCA, a Batch "DCA Weekday 9–11", a Receipt `R-0042`) and is labelled as the product, not as a customer.

Only describe features that exist on `main`: Students, Courses, Batches, Enrollment with inherited or Student-specific Timings and Class Mode (Offline, Online, Hybrid), Fee Plans (one-time, monthly, installments), partial Fee Payments (Cash, UPI, Card, Other), numbered printable Receipts, Owner Dashboard, Calendar with Cancelled and Moved Classes and Holidays, Student Home and Parent Home, Whiteboard-hosted online classes with recordings. Institution Types other than Training Institute are "Coming soon".

## Components

- Buttons: `Button` from `@repo/ui/components/button` with `render={<a href="/app/signup" />}` for links. Marketing site has no Session: links to `/app/login` and `/app/signup` are plain anchors into Whiteboard.
- `cn` from `@repo/ui/lib/utils`. Icons from `lucide-react` only inside mock UI.
- Mock product UI is hand-built DOM with the tokens above (paper card, haze chrome, ruled rows). Keep it small and legible; it is an illustration of the product, not a screenshot.

## Quality floor

Responsive down to 360px with no horizontal scroll. Visible keyboard focus (the `Button` already has it; add `focus-visible:ring-3 focus-visible:ring-ring/50` to custom links). Semantic landmarks: one `<h1>`, `<header>`, `<main>`, `<section aria-labelledby>`, `<footer>`. `aria-hidden` on purely decorative 3D scenes and give them a visually hidden text alternative when they convey content. Contrast at least 4.5:1 for body text on every surface. `prettier` formatting (`bun run format`), `eslint --max-warnings 0`, `tsc` clean.

## File ownership

| File                                                                                                                   | Owner        |
| ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| `app/layout.tsx`, `app/page.tsx`, `app/marketing.css`, `lib/gsap.ts`                                                   | orchestrator |
| `components/site-header.tsx`, `components/site-footer.tsx`, `components/closing-cta.tsx`, `components/who-section.tsx` | agent: shell |
| `components/hero.tsx`, `components/register-scene.tsx`                                                                 | agent: hero  |
| `components/register-loop.tsx`                                                                                         | agent: loop  |
| `components/fees-section.tsx`, `components/morning-section.tsx`                                                        | agent: fees  |

An agent edits only its own files. Anything shared that is missing goes in a note to the orchestrator, not into `marketing.css` or `layout.tsx`.
