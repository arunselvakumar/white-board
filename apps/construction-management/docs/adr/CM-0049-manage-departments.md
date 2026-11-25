# CM-0049 — Manage Departments: the Company's list of departments

- Status: accepted (2026-11-25, the owner asked for it and chose the options below)
- Date: 2026-11-25
- Relates to: [CM-0046](CM-0046-departments-menu.md) (Departments in the main menu), [CM-0047](CM-0047-department-sidebar-menus.md) (a department's sidebar menu), [CM-0048](CM-0048-no-department-master.md) (the trade list called Departments, removed), [CM-0030](CM-0030-users-and-roles.md) (Roles and the Permission Matrix)

## Context

Departments in the main menu (CM-0046) lists Human Resources and Marketing, each with its screens. Both are fixed in code. The owner asked for a submenu, **Manage Departments**, that lists the Company's departments and lets a user add one. For now the list stands alone: a department is not linked to Staff, Projects, Roles or any other record. Human Resources and Marketing are in the list as **system departments** and cannot be deleted.

## Decision

### 1. Manage Departments is a row under Departments

- In the sidebar, Departments folds out into Human Resources, Marketing (when the Role opens one of its entries) and **Manage Departments**, last. In the full-page menu (CM-0039) it is a third tile.
- The Departments page of cards (`/app/departments`) shows it as a card after the departments.
- The page is `/app/departments/manage`. It keeps the main menu in the sidebar (it is not a department's screen, CM-0047), with Manage Departments lit.
- The menu search finds it by "manage" or "departments".

### 2. A department is a name

- `construction_organization.departments`: id, the Company, a name, `is_system`, and the usual created/updated/deleted columns. The organization context owns it, beside Roles; it is not a Masters list.
- The name is trimmed, at most 100 characters, and unique among the Company's live departments ignoring case (partial unique index): 409 `DEPARTMENT_NAME_TAKEN`.
- The list is in name order. Search filters it on the page.

### 3. Human Resources and Marketing are system departments

- Every Company has them: a new Company is created with both, and the migration adds them to every existing Company (any Company with a Team Member). A Company that already had a live department of that name cannot exist, since the table is new.
- They are marked **System** on the list. Their name cannot change (400 `DEPARTMENT_SYSTEM_LOCKED`) and they cannot be deleted (409 `DEPARTMENT_IS_SYSTEM`), like the seed Work Type RCC.
- The Departments menu still comes from code (`lib/departments-nav.ts`), not from this list; the two agree by name only.

### 4. A Company-made department can be renamed and deleted

- Rename sends the `updatedAt` the screen loaded; 409 `STALE_DEPARTMENT` when someone saved it since (optimistic concurrency, as Roles).
- Delete is a soft delete (`deleted_at`) after a confirmation. Nothing refers to a department, so nothing blocks it, and the name is free again.
- There is no Disable: with nothing to pick departments in, it would mean the same as Delete.
- Each add, rename and delete writes an audit event (`department.created`, `department.renamed`, `department.deleted`).

### 5. A Permission Matrix entry: Departments

- New menu `organization.departments` ("Departments", category Others, flags Create, Read, Update, Delete). Read shows the submenu row and the list; Create adds; Update renames; Delete deletes. The API checks each.
- Admin holds every cell, so a new Company's Admin has it from "ALL"; the migration gives the seeded Admin of every existing Company all four. No other default Role gets it; an admin ticks it for others. The Owner can do everything, as everywhere.

### 6. Isolated, for now

- Adding a department gives it no menu, page, card or screens. It is not offered in any picker and not in backups.
- Linking departments to Staff, Roles or Projects, or giving a Company-made department its own screens, is a later decision.

## Consequences

- One more row under Departments, and one more line in every Role's Permission Matrix.
- Human Resources and Marketing appear twice in the menu's sense: as the department rows (with screens) and in the list (as data). If the owner later renames a system department, both must change together.
- Migration `construction_organization_departments` touches only `construction_organization` (ADR-0030).
