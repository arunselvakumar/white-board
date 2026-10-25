# Microsoft-sized buttons and form controls in both apps

## Context

Buttons were 32 px tall with 14 px medium text, and small buttons were 28 px. Next to the 40 px tabs and the roomy cards, they looked tiny. Most search boxes and dropdowns were 32 px too. Forms raised their inputs to 40 px one by one (`className="h-10"`, `SelectTrigger size="lg"`), so the same control had different heights on different screens. Tabs and buttons showed the arrow cursor, so they didn't feel clickable.

## Decision

**Follow Microsoft's (Fluent) button sizes in `@repo/ui`; keep our colours and corner radius.**

| Size                           | Height                      | Text           | Sides | Icon                 |
| ------------------------------ | --------------------------- | -------------- | ----- | -------------------- |
| `default`                      | 40 px                       | 15 px semibold | 20 px | 18 px                |
| `sm`                           | 36 px                       | 14 px semibold | 16 px | 16 px                |
| `xs`                           | 32 px                       | 13 px semibold | 12 px | 14 px                |
| `lg`                           | 48 px                       | 16 px semibold | 28 px | 20 px                |
| `icon` / `-sm` / `-xs` / `-lg` | 40 / 36 / 32 / 48 px square |                |       | 18 / 16 / 14 / 20 px |

Each size sets its own text and icon size, so `buttonVariants()` on a link needs no class merging.

**Inputs, search boxes and dropdowns are 40 px by default, the height of a button**, so toolbars and forms line up. This covers `Input`, `InputGroup`, `SelectTrigger`, `NativeSelect`, `Combobox`, `Toggle` and the OTP slots. `SelectTrigger`'s `sm` / `default` / `lg` are 36 / 40 / 48 px, with list rows of 32 / 36 / 40 px.

**Screens drop their old size overrides.** `SelectTrigger size="lg"` (102 places) became the default. `h-8` / `h-9` on toolbar search boxes, filter dropdowns and small inline buttons were removed. Skeleton bars standing in for controls are now 40 px (36 px for small buttons).

**A pointer cursor on everything you can press:** buttons, tabs, toggles and dropdown triggers.

## Consequences

- Pages are taller: a form gains 8 px per row, and a toolbar 8 px.
- Deliberately dense grids keep their own sizes, such as the class-test marks grid in Whiteboard.
- Construction Management's attendance marking sheet keeps its 44 px controls, made bigger for gloved thumbs on site.

## Considered options

- **Buttons only.** Search boxes and dropdowns would have stayed 32 px beside 40 px buttons. The owner chose to grow them together.
- **Microsoft's 4 px corners.** Rejected: the owner asked for the size, not a new look.
