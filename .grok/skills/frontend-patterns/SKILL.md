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

Authenticated chrome is `AppShell`: `Sidebar` + `SidebarInset` from `@repo/ui`. Nav items live in `lib/app-nav.ts` (Dashboard, Students, Courses, Batches, Fees). Wire each item with `SidebarMenuButton` and `render={<Link href={item.href} />}`. Do not use a native `<a>` or `<button>` for that nav.

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

Select `size` matches Input height: `sm` is `h-7`, `default` is `h-8`, `lg` is `h-10`. Use `size="lg"` next to auth/onboarding inputs. Height lives on the size variant so `className="h-10"` cannot lose to `data-[size=default]:h-8`.

Compact prefix selects (country code) use a fixed trigger width (`w-[7.5rem] shrink-0`) and `aria-label` when the visible label belongs to a sibling field.

## Forms

- `react-hook-form` + `zod` + `zodResolver`
- Field chrome: `Label` + control + `FieldError` in `space-y-4` / `space-y-1.5`
- `htmlFor` matches control `id`
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
