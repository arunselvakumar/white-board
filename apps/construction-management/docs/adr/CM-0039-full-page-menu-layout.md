# CM-0039 — The main menu can be a full page: a layout the User picks

- Status: accepted (2026-11-11; the owner asked for the full-page menu, then, with their designer, for it to be a choice beside the sidebar and kept in local storage)
- Date: 2026-11-11
- Relates to: [CM-0034](CM-0034-hr-main-menu.md) (the main menu's areas), [CM-0020](CM-0020-project-sidebar-menu.md) (the menu inside a Project), [CM-0028](CM-0028-settings-main-menu.md), repo ADR-0049 (ink sidebar, menu search), ADR-0050 (the sidebar carries the shell), ADR-0051 (Switch Company)

The main menu has six areas and, under Human Resources, Workspace and Masters, thirty-three entries. In the sidebar they sit behind three folded submenus. The owner wanted what an older product of theirs did: the whole menu laid out on one page. Their designer did not want that to replace the sidebar. So it is a second layout, and each User picks.

## Decision

### 1. Two menu layouts, sidebar by default

- **Sidebar** (the default): the app as it was. The ink sidebar is beside every page (ADR-0050).
- **Full-page menu**: outside a Project there is no sidebar. A top bar in the sidebar's ink has the Active Company, **Menu**, **Sidebar**, Switch Company, the notification bell and the account menu. Menu opens `/app`, the main menu on one page.
- A button beside the sidebar's menu search switches to the full-page menu and opens it. **Sidebar** in the top bar switches back. Nothing else about the app changes with the layout: addresses, pages and access are the same.

### 2. The choice is kept in the browser

- It is stored in `localStorage` under `construction-menu-layout` (`sidebar` or `full`), as the owner asked. It is per device and per browser, not per User or Company: a shared office computer keeps one layout for everyone who signs in on it, and a User's phone and laptop can differ.
- The server cannot read it, so a full page load renders the sidebar layout first and switches right after the page hydrates. Moving between pages inside the app does not flicker. If that first paint proves distracting, the fix is to mirror the choice in a cookie; the stored value and the switch stay the same.
- With storage blocked (a private window) the choice lasts until the tab closes.

### 3. `/app` is the main menu on one page

- `/app` used to redirect to Projects. It now shows the one-page areas (Dashboard, Projects, Settings) as cards, then Human Resources, Workspace and Masters each as a block with its groups and one icon tile per entry. Each tile is an ordinary link.
- It has a search box with the sidebar's matching rule (ADR-0049, `menu-filter.ts`): the same query shows the same entries in both places.
- In the sidebar layout the page still opens at `/app`, beside the sidebar. Nothing links to it there.
- An HRMS Team Member is sent from `/app` to HRMS, as from Projects: they have no Projects and work only in HRMS.

### 4. One list drives the page and the sidebar

- `mainMenuAreas()` builds the areas, groups and entries once; the sidebar's main menu and the page both render it. An entry added to `masters-nav.ts`, `staff-nav.ts`, `hrms-nav.ts` or the Workspace groups shows in both with no other change.
- The same two flags decide what shows: without Dashboard Read there is no Dashboard; without Team Members or Role Management Read there is no Office Staff or Role Management (CM-0030, CM-0034). Every page still checks its own access.

### 5. Inside a Project the sidebar stays

- The owner chose "main menu only". The menu inside a Project needs a Project to be chosen first and has its own grouped sidebar menu (CM-0020), so inside a Project both layouts show that sidebar. Its link back to Projects returns to the User's layout.

### 6. Sign-in lands where it did

- `APP_HOME` stays `/app/projects`. The server decides where sign-in lands and cannot read the layout, and Projects is the daily screen in both layouts. In the full-page layout the menu is one click away (Menu).

## Out of scope

- Advanced Settings entries are not on the page, because the sidebar does not list them: Settings is one row there (CM-0028).
- No per-entry permission filtering beyond §4. If the sidebar later hides entries by Role, the page follows.
- The full-page layout's top bar has no plan card (the sidebar's "Basic · 248 days left"). The plan banner still shows when a plan needs attention, and Your Subscription is in the account menu.
