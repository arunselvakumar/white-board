# One `<main>` per page, and `jsx-a11y` in the shared ESLint configs

From [issue #73](https://github.com/arunselvakumar/white-board/issues/73).

## Decision

**Landmarks.** Every page has exactly one `<main>`, and the shell that owns the page renders it:

- Inside AppShell (Whiteboard and Construction Management): sidebar `<nav>`, then the top bar `<header>`, then `<main id="main-content">` around the page only. The first focusable element is a **Skip to content** link (`SkipLink` in `@repo/ui`) that jumps to `#main-content`.
- `SidebarInset` in `@repo/ui` is a `<div>`, not shadcn's `<main>`. The inset holds the top bar too, so a `<main>` there would put the header and breadcrumbs inside the main landmark, and Skip to content would land on the top bar.
- Screens render a `<div>`, never `<main>`. Before this change ~35 Whiteboard screens did, giving a `<main>` inside AppShell's `<main>` on almost every page.
- The sign-in and onboarding shells render their own `<main>` around the form. Whiteboard's had none.

**Lint.** `eslint-plugin-jsx-a11y`'s recommended rules apply to every React app and `packages/ui`, from `@repo/eslint-config/a11y` (used by `next-js` and `react-internal`). The rules are errors, tuned for how this codebase writes components:

- `aria-role` ignores components: our `role` prop is a Whiteboard Role (`role="parent"`), not an ARIA role.
- `no-noninteractive-tabindex` allows `role="region"`: wide tables scroll inside a labelled region with `tabIndex={0}` so keyboard users can scroll them.
- `label-has-associated-control` knows our `Label`, `FieldLabel` and form controls.

A rule is never turned off for the whole repo. Where a rule is wrong for one line, that line gets `eslint-disable-next-line <rule> -- <reason>`. The recurring cases:

- **Base UI `render={<a href=… />}`** (`anchor-has-content`): the parent's children become the link text, which the rule can't see.
- **`autoFocus`** on a page or step whose only task is that field (sign-in, a verification code the user just asked for, the first onboarding question).
- **The `Label` and `FieldLabel` primitives**: callers supply `htmlFor` or nest the control.

A `<Label>` that captions a group or a non-input (Timings, Teacher photo, Paid by) is a `FieldTitle` instead. When it names a group, the group gets `role="group"` and `aria-labelledby`.

## Known limits

- `eslint-plugin-jsx-a11y@6.10.2` declares ESLint `^9` as its peer; we run ESLint 10. It runs cleanly, as `eslint-plugin-react@7.37.5` already does. Revisit if a rule crashes on an ESLint upgrade.
- Lint checks one file at a time from source. It can't see a `<main>` nested across files, colour contrast, or names computed at runtime. Those are for Storybook's axe checks ([#74](https://github.com/arunselvakumar/white-board/issues/74)) and a guard against `<main>` in screens ([#75](https://github.com/arunselvakumar/white-board/issues/75)).

## Considered options

- **Wrap AppShell's children in another `<main>`** (the original ticket): AppShell already had one through `SidebarInset`, so this would have nested three deep.
- **Keep `SidebarInset` as the `<main>` and drop the screens' `<main>`:** fewer changes, but the top bar and breadcrumbs stay inside the main landmark and Skip to content skips nothing.
- **Land the rules as warnings first:** of ~75 findings, six needed code changes; the rest were config or reasoned disables. Lint already runs with `--max-warnings 0`, so warnings would fail CI anyway.
