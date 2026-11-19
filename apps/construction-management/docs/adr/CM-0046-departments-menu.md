# CM-0046 — Departments: Human Resources and Marketing as pages of cards

- Status: accepted (2026-11-19, the owner asked for it and chose the options below); the sidebar on a department's screens is changed by [CM-0047](CM-0047-department-sidebar-menus.md)
- Date: 2026-11-19
- Relates to: [CM-0034](CM-0034-hr-main-menu.md) (Human Resources in the main menu), [CM-0039](CM-0039-full-page-menu-layout.md) (the full-page menu), [CM-0040](CM-0040-marketing-context-role-and-own-entries.md) (Marketing's entries per Role); repo-wide [ADR-0049](../../../../docs/adr/0049-ink-sidebar.md) (the ink sidebar)

## Context

The main menu had seven areas: Dashboard, Projects, Marketing, Human Resources, Workspace, Masters and Settings. Marketing and Human Resources each folded out into a long submenu: six Marketing entries, and Human Resources' Staff (five entries) and HRMS (five). With both open, the sidebar scrolled.

The owner asked for one menu, **Departments**, holding Human Resources and Marketing. Clicking a department shows its screens as cards on the right, grouped as before (Staff and HRMS for Human Resources), and a card opens its screen. The owner also asked that the app show no version number anywhere.

## Decision

### 1. Departments replaces Marketing and Human Resources in the main menu

The main menu is Dashboard, Projects, **Departments**, Workspace, Masters, Settings. Departments folds out into two rows, Human Resources and Marketing. Marketing shows only when the Role opens one of its entries (CM-0040 §1); Human Resources shows for everyone, as before.

### 2. Each department is a page of cards

| Page            | Address                            | Cards                                                                                                                                                                           |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Departments     | `/app/departments`                 | one per department                                                                                                                                                              |
| Human Resources | `/app/departments/human-resources` | **Staff**: Labour, Site Engineer, Vendor, Office Staff, Role Management. **HRMS**: Dashboard, Attendance, Leave, Salary, Configuration (one card per HRMS area, not per screen) |
| Marketing       | `/app/departments/marketing`       | Dashboard, Visits, Follow-ups, Companies, Team, Reports                                                                                                                         |

Each card shows the screen's icon, name and description (the ones the submenus already defined), and the whole card is the link. The pages apply the same Role rules as the old submenus: Office Staff and Role Management need Team Members or Role Management Read (CM-0030); each Marketing card needs its entry. A Role with no Marketing entry gets "You don't have access to Marketing" on the Marketing page.

The screens keep their addresses (`/app/staff/...`, `/app/hrms/...`, `/app/marketing/...`); no redirects are needed. On any of them, the department's row under Departments stays lit.

### 3. The menu search still finds every screen

The submenu lists only the departments, so the search has its own rule for Departments (`departments-menu.ts`). "Departments" or a department's name shows the department rows. Otherwise the matching screens show under their department's name ("labour" gives Human Resources → Labour), and a group heading ("HRMS") shows that whole group.

### 4. The full-page menu mirrors the sidebar

In the full-page layout (CM-0039), Departments is a block with two tiles, Human Resources and Marketing, opening the same pages. Its search uses the rule in §3.

### 5. The name "Departments" is shared with a Masters list

Masters → Work → Departments already means a trade (RCC, Plumbing; `docs/00-overview.md`). The owner chose to keep both names: the new menu is navigation only and adds no data. Searching the menu for "Departments" shows both.

### 6. No version number

The sidebar's last line showed the app's version (`v0.1.0`, ADR-0049's `SidebarFootnote`). It is removed from both apps, with `NEXT_PUBLIC_APP_VERSION` and the `SidebarFootnote` part. The API documentation keeps the OpenAPI `info.version` the format requires.

## Consequences

- Reaching a screen takes one more click from the sidebar (Departments → Human Resources → Labour). The search, and the department row staying lit, make up for part of that.
- `human-resources-nav-menu.tsx` and `marketing-nav-menu.tsx` are gone. Department data lives in `lib/departments-nav.ts`, and the card is `MenuCard` (`menu-card.tsx`), which shares its icon chip with the full-page menu.
- `/app/staff` still opens Labour, and `/app/marketing` is still Marketing's Dashboard.
