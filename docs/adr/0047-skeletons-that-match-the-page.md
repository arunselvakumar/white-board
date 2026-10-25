# Skeletons that match the page, in a primary tint

## Context

Almost every loading state in Construction Management was a stack of grey boxes. The root `QuerySuspense` in `app/app/layout.tsx` fell back to `PageFallback`: one bar and one 128 px block, whatever the page. About 17 copies of a local `ListSkeleton` drew three full-width bars where a table with a header row would appear. Around 60 more fallbacks were inline `<Skeleton>` boxes, and about 25 places showed "Loading…" or nothing. When the data arrived the page jumped: the header, filters and columns appeared all at once, in a different place than the boxes.

The skeleton colour was `bg-muted` (`#eef0f8`), which reads as grey next to the primary `#595fae`.

## Decision

**Render the real page and skeleton only the data.** A page's fallback renders everything it can know without fetching (the page title, back link, actions, tabs, filter bar and table column headers) as the real components, and draws tinted bars only where fetched data will appear. A detail page whose title is data uses `PageHeaderSkeleton`, which keeps the real back link and actions.

**A skeleton kit in `@repo/ui`**, mirroring the blocks pages are built from, so a page's skeleton is a few lines:

| Kit piece              | Mirrors                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SkeletonText`         | a line of text at a given width                                                                                        |
| `TableSkeleton`        | a bordered `Table` with the real column headers and placeholder cells shaped per column (text, number, badge, actions) |
| `ItemListSkeleton`     | a list of `Item` rows: optional media, two lines, optional trailing badge                                              |
| `MetricGridSkeleton`   | a grid of `MetricCard`s: icon and label, figure, caption                                                               |
| `FormSkeleton`         | label and control pairs                                                                                                |
| `TabsSkeleton`         | a tab list over a panel                                                                                                |
| `CardGridSkeleton`     | a grid of cards (report cards, project tiles)                                                                          |
| `CalendarGridSkeleton` | a month or attendance grid                                                                                             |

Construction Management adds `PageHeaderSkeleton` and a better root `PageFallback` (a page header and a table) in `components/`. Each product area keeps its skeletons in one `*-skeletons.tsx` file beside its pages.

**One tint for both apps.** `--skeleton` is the primary mixed 16% into transparent (20% in dark mode, where the primary is `#7b82c4`). Because the mix is into transparent, a bar looks right on the page background and on a card. The Whiteboard app's existing skeletons pick it up too; only Construction Management gets the layout work now.

**A soft shimmer, not a pulse.** A lighter band sweeps across every bar about every 1.8 s. The background is fixed to the viewport, so all bars on a page sweep together as one wave instead of each bar flashing on its own. With `prefers-reduced-motion` the bars are still.

**Don't show a skeleton for a fast load.** Bars fade in after 150 ms. The real chrome around them renders at once, so a quick load shows the page with no flash of bars.

**Keep content while filters change.** Changing a filter, search or page on a list keeps the old rows on screen (dimmed) until the new ones arrive (`useTransition` / `useDeferredValue`), instead of dropping back to the skeleton.

**A guard against drift.** Lint forbids importing `Skeleton` from `@repo/ui/components/skeleton` in Construction Management outside `*-skeletons.tsx` files and the kit, so a new generic box has to be a named skeleton in the area's file. `QuerySuspense`'s fallback is still optional, because the root layout needs a default.

## Amendment (2026-10-25): no generic skeleton before the page's own

Opening a page used to show the root `PageFallback` (a header and a table) first, and only then the page's own skeleton.

There were two reasons:

- `QuerySuspense` was keyed by the path, so every link click remounted the root boundary, which then fell back.
- The server sent `PageFallback` in the first HTML.

Now:

- The boundary stays mounted, and a navigation is a transition. The current page stays until the next one shows its own skeleton, and an error is cleared when the path changes. The HRMS shell's access boundary and Whiteboard's `QuerySuspense` do the same.
- The root layout's server fallback is empty (`serverFallback={null}`), so a full page load shows the app shell, then the page's own skeleton.
- Opening a Project (`/app/projects/[id]`) draws nothing while it forwards to the first module, so that module's skeleton is the only one.

## Considered options

- **A hand-drawn skeleton per page.** This is the most exact, but it means about 150 components that drift as soon as a page changes.
- **Auto-generated skeletons** (render the real component with placeholder data under a "skeleton" CSS mode). The match is perfect, but every query needs fixture data, and it doesn't fit `useSuspenseQuery`.
- **A tint scoped to Construction Management only.** This would mean two skeleton colours across the product for no reason.
- **Keep the pulse.** With the new tint, the opacity pulse made the whole page breathe. The shimmer reads calmer.

## Known limits

- Rows in a `TableSkeleton` have fixed widths per column type. They can't know a column's real text lengths.
- Column headers live in two places, the page and its skeleton, unless the page extracts them into a constant. Area files do that where a table has more than a few columns.
- `background-attachment: fixed` is ignored by iOS Safari. Bars there still shimmer, each on its own.
- Hover-prefetching a module's data from the sidebar is not part of this change.
