# CM-0047 — A department's own sidebar menu, as inside a Project

- Status: accepted (2026-11-19, the owner asked for it)
- Date: 2026-11-19
- Relates to: [CM-0046](CM-0046-departments-menu.md) (Departments as pages of cards), [CM-0020](CM-0020-project-sidebar-menu.md) (the Project's own sidebar menu), [CM-0039](CM-0039-full-page-menu-layout.md) (the full-page menu)

## Context

CM-0046 put Human Resources and Marketing under one main-menu entry, Departments, and gave each department a page of cards. That suits the full-page menu layout, where the menu is a page. In the sidebar layout the cards were the only way to a department's screens: the sidebar listed the departments, never their screens, so moving from Labour to Attendance went back through the cards.

Inside a Project the sidebar already works differently: opening a Project replaces the main menu with the Project's own menu, with **Back to projects** first (CM-0020). The owner asked for the same with departments: clicking Human Resources in the sidebar swaps the menu for Human Resources' own, and likewise for Marketing and any department added later.

## Decision

### 1. A department's page and screens swap the main menu for the department's menu

In the sidebar layout, on a department's page (`/app/departments/human-resources`) and on every screen of it (`/app/staff/...` and `/app/hrms/...` for Human Resources, `/app/marketing/...` for Marketing), the sidebar shows the department's menu in place of the main menu. As with a Project, the address decides it: there is no menu state to keep, a link or a reload lands on the right menu, and the menu search clears when the page changes.

The department menu is, top to bottom:

1. **Back to Main Menu**, linking to `/app/departments`, where the main menu shows with Departments open.
2. The department's icon and name, with "Department" under it (the Project's logo and name in CM-0020).
3. Its screens, from the same data as its page of cards (`lib/departments-nav.ts`):
   - A department with groups shows each group as a row that folds out into its screens: Human Resources has **Staff** (Labour, Site Engineer, Vendor, Office Staff, Role Management) and **HRMS** (Dashboard, Attendance, Leave, Salary, Configuration). Both start open; a group folded away opens again when one of its screens is opened, and while folded its row carries the highlight.
   - A department without groups (Marketing) lists its screens as plain rows: Dashboard, Visits, Follow-ups, Companies, Team, Reports.

The current screen is the one whose address is the longest the page is on or under, so `/app/hrms/attendance/team` lights Attendance, not the HRMS Dashboard at `/app/hrms`.

### 2. The same Role rules as the page of cards

The menu shows what the department's page shows: Office Staff and Role Management need Team Members or Role Management Read (CM-0030), and Marketing shows only the entries the Role opens (CM-0040 §1). A Role that opens no Marketing entry keeps the main menu on Marketing's addresses, where the screen says there is no access.

### 3. The menu search narrows the department's screens

Inside a department the search applies the shared rule (`menu-filter.ts`): the department's name keeps everything, a group's name ("HRMS") keeps that group, and otherwise a screen shows when its name matches. Back to Main Menu and the department's name always stay.

### 4. The full-page menu is unchanged

In the full-page layout (CM-0039) there is no sidebar outside a Project, so a department stays its page of cards, as in CM-0046.

### 5. Departments in the main menu are unchanged

The main menu still lists Departments with Human Resources and Marketing under it, and its search still finds a department's screens (CM-0046 §3). Choosing one opens the department, and the sidebar swaps.

## Consequences

- A new department needs only its entry in `lib/departments-nav.ts` (its addresses and card groups): its page of cards and its sidebar menu both follow. A labelled group can carry an `icon` for its sidebar row.
- The main menu's department rows are no longer seen lit on a department's screens, since the main menu is not shown there; `DepartmentsNavMenu` still lights them for a Role that lands on a department it cannot open.
- The sidebar menu is `DepartmentMenu` (`department-menu.tsx`), chosen in `AppShell` by `departmentMenuAt` after the Project check.
