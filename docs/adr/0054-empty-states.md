# Empty states: one component, a coloured duotone icon in an orbit

## Context

Empty lists, tabs and pages in Whiteboard and Construction Management were built from the shadcn `Empty` primitives, each screen composing its own. About half showed a small grey Lucide icon in a tile, the rest only a line of text, and some screens wrote their own `<p>No … yet</p>` instead. The owner found them flat and asked for one reusable component modelled on a reference design: a centre icon inside faint concentric rings, with small file-like tiles sitting on the rings, a title, a description and buttons.

The owner wanted the centre icon in colour. Lucide icons are a single stroke and cannot carry a second tone. React Icons was considered, but its only multicolour set (Flat Color Icons) has fixed colours that ignore the theme and dark mode, and swapping the apps' Lucide icons for its copy of Lucide would rename imports in hundreds of files for no visible gain.

## Decision

**One component, `EmptyState` in `@repo/ui`** (`@repo/ui/components/empty-state`), built on the `Empty` primitives. It takes `icon`, `title`, `description`, `actions`, `children`, `tone`, `size` and `orbit`. Every empty state in both apps uses it, including the shared wrappers (`MasterEmpty`, `HrmsEmpty`, `StructureEmpty`, both apps' `PagePlaceholder`). The primitives stay in `@repo/ui` but screens no longer compose them.

**Icons are Phosphor, duotone.** `@phosphor-icons/react` is added to `@repo/ui` and both apps. `icon` takes a Phosphor component and the component draws it with `weight="duotone"`: the outline in the tone's colour and the back layer the same hue, lighter. Screens import icons from `@phosphor-icons/react/ssr`. The default entry reads a React context, so it cannot render in a Server Component, and about a dozen empty states are Server Components. Lucide stays the icon set everywhere else.

**How it is drawn.**

- The centre icon is bare: no tile, border or filled circle behind it. 48px for a page (`lg`), 40px in a card (`md`), 32px in a table, sheet or dialog (`sm`).
- At `md` and `lg` the icon sits in an SVG orbit: four rings and eight small tiles in a 320 × 200 box. Each tile is placed by its ring and angle (`x = cx + r·cos θ`), so it is always centred on the ring's line. The whole orbit scales with its width and a radial mask fades the outer rings. `sm` has no orbit.
- The title overlaps the faded lower part of the orbit, as in the reference.
- The orbit and the icon are `aria-hidden`. The orbit is hidden in print. Nothing moves.

**Colour by subject.** `tone` takes a meaning (`brand`, `neutral`, `success`, `warning`, `danger`) or a hue (`red`, `orange`, `amber`, `green`, `teal`, `sky`, `blue`, `violet`, `pink`). Only the icon takes the colour. The same subject has the same colour on every screen:

| Subject                                                          | Tone     |
| ---------------------------------------------------------------- | -------- |
| Projects, structure, documents, drawings, photos                 | `blue`   |
| People: Labour, team members, Site Engineers, Students, Teachers | `violet` |
| Money: payments, receipts, fees, wallets, salary                 | `green`  |
| Materials, procurement, equipment, Suppliers, Vendors            | `orange` |
| Time: attendance, leave, shifts, history, visits, locations      | `teal`   |
| Work, learning and reports: tasks, homework, tests, charts       | `sky`    |
| Conversations: notifications, follow-ups, enquiries, remarks     | `pink`   |
| Masters lists and problems: issues, hindrances, tags             | `amber`  |

A search or filter that matched nothing, no access, not found and placeholders are `neutral`. Load errors are `danger` with no orbit, and so are no-access and not-found screens.

**Copy.** Titles and descriptions kept their words. An empty state that had only a sentence gained a short title ("No Students yet" above "Add the first Student this centre admits."); a few two-sentence messages were split into title and description where no test asserts the whole sentence.

**What stays as text.** Inline captions on KPI tiles and charts, hints under a form field that stand in for a picker, single table cells, and "none" items in selects and comboboxes are not empty states and keep their paragraph.

## Consequences

- A new empty state uses `EmptyState` with a Phosphor `/ssr` icon and the tone for its subject. The frontend-patterns skill carries the size, tone and subject table.
- Screens that read their icon from a config (Masters lists, Teams sections, amenities) carry a `tone` next to the `icon`.
- Lucide icon components type-check as Phosphor's `Icon`, so passing one by mistake compiles but draws a single-tone glyph. Review catches it.
- Tests that need the parts find `[data-slot="empty-state-icon"]` and `[data-slot="empty-state-orbit"]`; the root keeps `data-slot="empty"`.
- `EmptyState` stories in each app (`components/ui/empty-state.stories.tsx`) cover the sizes, tones, dark mode and phone width.
