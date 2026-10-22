# CM-0020 — A Project's modules move from the tab bar to the sidebar

- Status: accepted; amended 2026-10-21 (§5: no Project home)
- Date: 2026-10-15
- Relates to: [CM-0013](CM-0013-projects-structure-product-decisions.md) §11 (Project home, modules, Hide / show modules, Arrange tiles)

Opening a Project showed a header and a bar of tabs: Home and up to 21 modules, each a page under `/app/projects/<id>/`. On a laptop the bar ran off the right edge, and on a phone it scrolled sideways, so people had to scroll through tabs to find a module. Payments, Materials, Attendance and Equipment then had a second row of tabs of their own.

The owner asked for the Project's modules to become the sidebar menu while a Project is open, with **Back to projects** at the top. The answers below are theirs (2026-10-15).

## Decisions

### 1. Inside a Project, the sidebar is the Project's menu

- On any page under `/app/projects/<id>` (not New Project), the sidebar swaps the three areas (Projects, Workspace, Masters) for the Project's menu. Back on `/app/projects`, the three areas return.
- The menu starts with **Back to projects**, then the Project's logo (or initials), name and Project Type.
- **My Profile** and **Your Subscription** stay at the foot of the sidebar.
- Every module is still its own page at the same URL. Nothing about routing, access checks or the APIs changes.

### 2. Fixed headings

The modules sit under seven fixed headings (`PROJECT_NAV_GROUPS`):

| Heading           | Modules                                                               |
| ----------------- | --------------------------------------------------------------------- |
| Overview          | Dashboard (Home until §5)                                             |
| Setup             | Wings or Locations, Amenities, Resources                              |
| Site work         | Attendance, Daily Worksheet, Tasks, Site Diary, Hindrances, Equipment |
| Materials & money | Materials, Payments                                                   |
| Quality           | Issues & Snags, Inspections, Testing Reports                          |
| Files             | Drawings, Documents, Gallery                                          |
| Reports           | Progress Reports, Reports                                             |

- A module shows when the member may open it and nobody hid it on the Project (the Project home's list, as before). A heading with no modules left is left out.
- Until the Project home loads, or if it cannot, the menu shows every module of the Project's structure; each page still checks access.
- **Arrange tiles** keeps ordering the tiles on the Project home. It no longer orders the menu: the headings and their order are fixed. **Hide / show modules** removes modules from the menu as it did from the tab bar. (Since §5 there are no tiles and no Arrange tiles.)
- A new module must be added under one heading; a unit test fails until it is.

### 3. Module tabs become submenus

- Attendance (Labour, Vendor), Payments (7 tabs), Materials (6) and Equipment (2) fold out into a submenu under their menu entry, like the Masters and Workspace submenus. Their in-page tab rows are gone.
- A submenu opens by itself on any of its module's pages and can be folded by hand.
- A submenu shows only the tabs the viewer may read. The access read for Payments, Materials and Equipment starts when the submenu opens, so a Project page does not make three extra requests up front; until it loads, every tab shows (as the tab rows did).
- Opening the module itself still lands on its first tab (Payments: the first the viewer may read).

### 4. A slim Project header

- Each Project page keeps a one-line header: the Project's name (the page's `h1`), status, Project Type, dates, the pin mark, **Edit** and the **Project options** menu (Pin, Hide / show modules, Backup; Arrange tiles until §5).
- On a phone the sidebar is a sheet, so the header also shows the logo there.
- The old "Back to Projects" link above the name is gone; Back to projects is in the sidebar.

### 5. No Project home (2026-10-21, issue #99)

Every Home tile was already an entry in the sidebar, so the Home page repeated the menu. The owner asked for it to go; the answers below are theirs.

- The menu has no **Home** entry. Overview holds Dashboard alone.
- Opening a Project (`/app/projects/<id>`, e.g. from the Projects list or after Edit) lands on the **first module in the member's menu**: Dashboard for most, the next module when Dashboard is hidden on the Project or not allowed. With no module to open, the page says so (and, for those who may show hidden modules, how).
- On Edit, and any page that is not a module, nothing in the menu is highlighted.
- **Arrange tiles** is gone from Project options: it only ordered the tiles. The stored tile order and its route stay but nothing on screen uses them; Hide / show modules lists modules in menu order.
- The Project's details that were only on Home move to the Project Dashboard's **Project summary**: the address and State, the **Contract** (Client, Order value with the Financial flag, the papers) and the **Additional details**, only what is filled in. Labour today was already the Dashboard's Attendance section, and Project Progress its Task section.
- A message for the next screen (files that failed to upload, a logo that did not save) now shows under the Project header on whichever page comes next.

## Consequences

- `ProjectShell` no longer renders navigation; `ProjectNavMenu` in the app shell does. Stories for the menu live in `components/app-shell/project-nav-menu.stories.tsx`.
- `PaymentsNav`, `MaterialsNav`, `EquipmentNav` and `AttendanceTabs` became link builders (`usePaymentsNavLinks`, `useMaterialsNavLinks`, `useEquipmentNavLinks`, `attendanceNavLinks`) that the submenus use.
