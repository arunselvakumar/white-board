---
name: frontend-patterns
description: Whiteboard UI conventions — use @repo/ui (shadcn/Base UI) components instead of native HTML controls, wire Select with Controller, keep forms on react-hook-form and zod. Use when adding or changing screens, forms, inputs, selects, dropdowns, buttons, dialogs, checkboxes, or Storybook play functions in apps/whiteboard or packages/ui.
---

# Frontend patterns

Product copy lives in `CONTEXT.md`. Visual tokens live in `docs/adr/0002` and `0003`. This skill is how those screens are built.

## Components

Import from `@repo/ui/components/<name>`. Do not render native `<select>`, `<input>`, `<textarea>`, or raw `<button>` for product chrome.

| Need                               | Use                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Text                               | `Input` (`className="h-10"` on auth/onboarding)                                                            |
| Password                           | `PasswordField` in auth; otherwise `Input`                                                                 |
| Pick one stored value              | `Select`                                                                                                   |
| Searchable long list               | `Combobox`                                                                                                 |
| Actions on a target (edit, delete) | `DropdownMenu`                                                                                             |
| Long text                          | `Textarea`                                                                                                 |
| On/off                             | `Checkbox` or `Switch`                                                                                     |
| Click / submit                     | `Button` (`variant="link"` or `"ghost"` for text actions; `size="icon"` + `variant="ghost"` for icon-only) |
| Overlay                            | `Dialog` / `AlertDialog` / `Sheet`                                                                         |

`NativeSelect` exists in `@repo/ui` and is not used in Whiteboard. Prefer `Select`.

A missing component is added to the shared kit, not invented in the app:

```sh
bunx --bun shadcn@latest add <name> -c apps/whiteboard
```

## App shell

Authenticated chrome is `AppShell`: `Sidebar` + `SidebarInset` from `@repo/ui`. AppShell renders the page's only `<main id="main-content">` and a Skip to content link; a screen's outer element is a `<div>`, never `<main>` (ADR-0044). Nav items live in `lib/app-nav.ts` (Dashboard, Students, Courses, Batches, Fees). Wire each item with `SidebarMenuButton` and `render={<Link href={item.href} />}`. Do not use a native `<a>` or `<button>` for that nav.

The shell stays mounted while a page loads. Put `QuerySuspense` around `{children}` in the in-app layout, not around the sidebar.

Empty titled pages use `PagePlaceholder` (`Empty` from `@repo/ui`). Page reads use `useSuspenseQuery` — see the `tanstack-query` skill.

## Select

`register()` does not work on Select. Use `Controller`. Item `value`s must be unique (do not key US and CA both as `"1"`). Pass `items` (`{ value, label }[]` or a value→label record) so `SelectValue` shows the label, not the stored value.

```tsx
<Controller
  name="institutionType"
  control={control}
  render={({ field }) => (
    <Select
      items={OPTIONS}
      value={field.value}
      onValueChange={(value) => {
        if (value == null) return;
        field.onChange(value);
      }}
    >
      <SelectTrigger id="institutionType" size="lg" className="w-full min-w-0">
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
/>
```

Select follows React Bits' Glide Select (issue #113), and its `size` matches Input height: `sm` is 28 px (`h-7`), `default` 32 px (`h-8`), `lg` 40 px (`h-10`, not Glide's 44 px), with rows of 26 / 30 / 40 px in the menu. Use `size="lg"` next to `h-10` inputs (forms, auth, onboarding). Height lives on the size variant so `className="h-10"` cannot lose to `data-[size=default]:h-8`. The menu drops 6 px below the trigger from its corner (`align="start"`, `alignItemWithTrigger={false}` are the defaults now) and is 176 px wide, never narrower than the trigger. `SelectItem` takes an optional `tag` for secondary text (`<SelectItem value="dca" tag="6 months">DCA</SelectItem>`).

A compact trigger (`w-32`, a filter) still gets the 176 px menu; Base UI shifts it to stay inside the viewport on a phone. Give a Select an `aria-label` when its visible label belongs to a sibling field.

## Forms

- `react-hook-form` + `zod` + `zodResolver`
- Field chrome: `Label` + control + `FieldError` in `space-y-4` / `space-y-1.5`
- `htmlFor` matches control `id`
- A field the Zod schema requires gets `<Label required>` (red asterisk) and `aria-required` on its control; a conditional one gets `required={…}` from the watched value. Groups put `<RequiredIndicator />` (or `FieldLegend required`) after the legend. The asterisk is CSS on an empty `aria-hidden` span, so `getByLabelText("Name")` still matches. For an either/or pair, mark only the primary field, while the other is blank. Leave existing "(optional)" labels as they are.
- `noValidate` on `<form>`; Zod owns messages
- Submit is `Button type="submit"`

## Storybook

Select options portal to `document.body`, so `canvas.getByRole("option")` misses them.

```ts
await userEvent.click(
  canvas.getByLabelText("What kind of institution is this?"),
);
await userEvent.click(
  await within(canvasElement.ownerDocument.body).findByRole("option", {
    name: "School",
  }),
);
```
