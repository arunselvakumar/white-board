# The ink sidebar: one dark, floating panel in both apps

## Context

Whiteboard and Construction Management share the `Sidebar` kit in `@repo/ui`, and since #44 both drew it as a light, full-height column: a logo row, a "Main menu" label, the rows, and a footer. It read as a stock admin template, and the account (name, email, sign out) lived in the top bar as an avatar menu, so the sidebar carried no identity and no numbers.

We were shown a reference (a mail client) whose sidebar is a near-black rounded panel floating on a light page: the account at the top with its menu, a search pill, rows with a count at the right end, nested rows indented without a rule, small-caps section labels with actions, a meter card near the bottom, and Sign out as the last row.

## Decision

**Ink in both themes.** The `--sidebar*` tokens in `globals.css` are a near-black panel (`#13141b` in light, a step darker in dark) with the brand primary lifted to `#6b72dc` for the active row, in both themes. The page keeps its own theme; the sidebar does not follow it. A single set of tokens keeps the phone sheet (which portals outside the shell) the same colour as the desktop panel.

**A floating, rounded panel.** `Sidebar variant="floating"`, a 2xl radius, a 1 px border in the sidebar border colour, and the sidebar width raised to 17.5 rem so the panel inside its padding stays 16 rem.

**The same parts in both apps**, from `@repo/ui/components/sidebar-chrome`:

| Part                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `SidebarAccount`      | avatar, name, detail line, and the account menu as its action             |
| `SidebarSearch`       | the search pill; each app filters its own menu with it                    |
| `SidebarSectionLabel` | a small-caps label with optional actions at the right                     |
| `SidebarMenuCount`    | a figure (`muted`) or a red pill (`alert`) at the right end of a row      |
| `SidebarMeter`        | a ring meter with the figure in the middle                                |
| `SidebarMeterCard`    | the card near the bottom: a meter or icon, a title, a caption, and a link |
| `SidebarFootnote`     | the version line                                                          |

**Real numbers only.** A count on a row comes from a query the app already has (Whiteboard's Owner Dashboard; Construction Management's subscription), never from a placeholder, and the row shows no count while that query loads or fails. The search filters the menu rows by label; it is not a global search.

**The account moves into the sidebar** on desktop. The top bar keeps the sidebar trigger, the Workspace or Company switcher and the notification bell; the avatar menu stays in the top bar on a phone only, where the sidebar is a sheet.

## Consequences

- Both shells change together; the `Sidebar` kit does not.
- Submenus drop the left rule and sit indented, with the active child on the primary pill like a top-level row.
- `SidebarMenuButton variant="outline"` (Back to projects) no longer suits a dark panel and is replaced with the plain row.
- The Storybook shell stories keep their contract: the Main navigation, the "Account menu for …" button, and the Workspace or Company name stay reachable by role.
