# The sidebar carries the shell: no top bar, the switcher inside, a glide on hover

## Context

ADR-0049 made the sidebar a dark, floating panel in both apps. The page beside it kept a light top bar from before: the sidebar trigger, the product mark, the Workspace or Company switcher, the notification bell. Next to the new panel it read as a leftover from another design, and it split the shell's identity across two surfaces.

Hovering a sidebar row swapped its background instantly and played a per-icon micro-animation (#114, `sidebar-icon-motion.css`). Our menus do something calmer: in the dropdown menu and the Select one highlight pill glides between rows under the pointer (React Bits' Glide Select, #115, #132). The sidebar should feel like the same product.

## Decision

**No top bar from `md` up.** The sidebar holds everything the bar held:

- **The switcher row first**: the product mark, the Active Workspace or Company as the name, the product's name under it, and chevrons that open the switcher menu (`SidebarSwitcher` in `sidebar-chrome`). Whiteboard lists the User's Workspaces and makes one active; Construction Management lists the Companies, switches, and offers Create a Company.
- **The account row second**, as in ADR-0049, with the notification bell beside the `…` account menu where the app has one.
- **The search**, then the menu, the meter card, the footer rows.

Page-level chrome that sat under the bar stays at the top of the page: Whiteboard's breadcrumbs, Construction Management's plan and deletion banners.

**One slim bar on a phone only.** Below `md` the sidebar is a sheet, so a `SidebarPhoneBar` (trigger, mark and name, bell) stays. It renders nothing wider than that.

**A glide pill on hover.** `SidebarGlide` wraps a run of menus and moves one highlight pill under the hovered row, with the menus' `--ease-glide` curve and timings: moving between rows glides; arriving from outside, or by keyboard focus, jumps and fades in; leaving fades it out. Rows draw no hover background of their own; the active row keeps its solid primary pill, which paints over the glide. The content and the footer each get their own `SidebarGlide`, since the content scrolls.

**The icon hover motion goes.** `sidebar-icon-motion.css` and the stories that asserted a named motion per icon are removed. One motion on hover is enough, and it is the pill.

## Consequences

- `SidebarTrigger`, the switchers and the bells leave the apps' headers; the `banner` landmark exists on a phone only, so tests find the bell and the switcher by name, not by landmark.
- The Storybook shell contracts move with the chrome: the "Active Company" and "Account menu for …" buttons live in the sidebar, which a phone-width story opens first.
- New icons need no CSS rule to join the sidebar.
