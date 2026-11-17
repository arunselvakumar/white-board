# CM-0045 — Typed page links: typedRoutes and pageHref

- Status: accepted (2026-11-17, the owner chose typed routes with a checked builder)
- Date: 2026-11-17
- Relates to: [CM-0030](CM-0030-users-and-roles.md), [CM-0034](CM-0034-hr-main-menu.md) and [CM-0042](CM-0042-project-resources-become-teams.md) (pages that moved and left a redirect behind)

## Context

Construction Management has 246 pages, and they keep moving: Masters → Settings, Team Members → Office Staff, HRMS → Human Resources, a Project's Resources → Teams. `next.config.ts` carries seven redirects for old addresses. Nothing checked the app's own links, so a link to a page that moved only showed up at run time, as a redirect hop or a 404.

A review suggested Next's `typedRoutes`, which makes every `<Link href>`, `router.push` and `redirect` a type error when the route does not exist. Trying it showed two limits:

1. **It cannot check anything after a dynamic segment.** Next types `[id]` as "any text", slashes included, so `` `/app/projects/${id}/resources` `` still type-checks after Resources became Teams. 128 of the 246 pages sit under a dynamic segment, so plain typedRoutes misses most moved pages, including the one that prompted the review.
2. **Almost every link was typed `string`.** Props took `href: string`, and about a hundred `xPath(projectId, rest)` helpers glued paths together. Turning the flag on gave 351 errors and no broken link, because a `string` checks nothing.

## Decision

### 1. typedRoutes is on

`typedRoutes: true` in `next.config.ts`. A literal (`"/app/settings"`, `"/app/settings?tab=company"`) is checked against the pages Next generates.

### 2. A page with a dynamic segment is linked with `pageHref`

`lib/page-href.ts`:

```ts
pageHref("/app/projects/[id]/teams", { id: projectId });
pageHref(
  "/app/projects/[id]/worksheets/[worksheetId]",
  { id, worksheetId },
  "?uploaded=1",
);
```

The first argument is the page's folder pattern, checked against `AppRoutes` from `.next/types/routes.d.ts`, the list `next typegen` writes. The params are checked against that page's params (`ParamMap`). A moved or renamed page therefore fails `check-types` wherever it is linked. A redirect's old address (such as `/app/projects/[id]/resources`) is not a page, so a link to it fails too. pageHref URL-encodes each param.

### 3. Links are typed `AppHref`, not `string`

`AppHref` is any page address: a static page, or what pageHref returns, each with an optional `?…` or `#…`. Every prop, field and helper that holds a link uses it. A file download, an `/api/…` URL or an external link stays `string` and is rendered with `<a>`, not `<Link>`.

### 4. One escape hatch, for addresses the code did not build

`uncheckedHref(path)` is for the current URL with a new query string (`usePathname()`), a return path that `safeAppPath` accepted, and a link stored with a Notification. Each use says why in a comment. There is no `as Route` or `as AppHref` anywhere else.

### 5. Lint keeps it that way

`no-restricted-syntax` in `eslint.config.js` rejects a template literal under `/app/` or `/join/` with an expression in its path (before `?` or `#`) in app code. Tests and stories may build such addresses to assert on.

### 6. `lint` runs typegen first, like `check-types`

`pageHref`'s types import `.next/types/routes.d.ts`. CI lints a clean checkout, so `lint` is now `next typegen && eslint`. `check-types` already ran typegen.

## How it was migrated

A codemod rewrote 302 template literals and one-line path helpers into pageHref calls, matching each against the generated page list. A second pass followed each remaining "`string` is not a route" error back to its declaration and retyped it as `AppHref`. The rest were fixed by hand. URLs are unchanged, except that every param is now encoded (the ids are UUIDs, so in practice nothing changes).

## Consequences

- A page move now fails `check-types` at every link to it. The redirects in `next.config.ts` stay: they serve bookmarks and links outside the app, which no type can check.
- New code has one way to link to a dynamic page. A link in a test or an e2e spec is still a plain string.
- `routes.d.ts` is Next's generated file, not a public API. If a Next upgrade renames `AppRoutes` or `ParamMap`, only `lib/page-href.ts` changes.
- Whiteboard and the Marketing Site do not use this yet. The same file and lint rule would carry over.
