# CM-0050 — A Role may be under a Department

- Status: accepted (2026-11-26, the owner asked for it)
- Date: 2026-11-26
- Amends: [CM-0049](CM-0049-manage-departments.md) §6 (a department was linked to nothing)
- Relates to: [CM-0030](CM-0030-users-and-roles.md) (Roles and the Permission Matrix)

## Context

Manage Departments (CM-0049) gave each Company a list of departments, Human Resources and Marketing among them, and left linking them to other records for later. The owner asked that a Role can be tagged with the department it belongs to: picked from a dropdown on Add Role, and optional, so a Role can also stay under no department.

## Decision

### 1. A Role is under one Department, or none

- `construction_organization.roles.department_id`, nullable, a foreign key to `departments`. Every existing Role starts under none; the default (seeded) Roles too.
- A Role has at most one Department. A Department has any number of Roles.
- The Department does not change what a Role may do: access still comes only from its Permission Matrix.

### 2. Add Role and Edit Role have a Department dropdown

- Under the Role name: **Department**, with no asterisk and the hint "Optional. The Department this Role belongs to." The list starts with **No department** (the default), then the Company's live departments by name.
- Edit Role shows the Role's Department and can change it or set it back to No department, default Roles included (their name stays locked, CM-0037). Without Update it is shown, disabled.
- Duplicate copies the Department with the matrix.
- Role Management shows the Department as a badge beside the Role's name, and the search matches Department names.

### 3. The API

- Add and Edit take `departmentId` (a uuid, or `null` for none). On Edit, leaving it out keeps the Role's Department, so older callers do not clear it.
- A Department that is not live in the Company (unknown, deleted, another Company's) is 400 `ROLE_DEPARTMENT_NOT_FOUND`, shown on the field.
- A Role answers `department: { id, name } | null`. Renaming a Department shows on its Roles at once.
- The departments list (`GET …/organization/departments`) is open to `organization.roles` read as well as `organization.departments` read, so whoever adds Roles can choose one. Adding, renaming and deleting departments still need the Departments cells.
- The audit snapshot of a Role carries `departmentId`.

### 4. A Department with Roles under it cannot be deleted

- Delete answers 409 `DEPARTMENT_IN_USE` with `{ roleCount }` while live Roles are under it; Manage Departments shows the message in its confirmation. Move those Roles to another Department, or to none, first. Deleted Roles do not count.
- This follows Role delete (409 `ROLE_IN_USE` while staff are on it) rather than silently untagging Roles.
- The check and the save cannot race: a Role save reads the Department `FOR SHARE` in its transaction, and a Department delete updates the row before counting Roles in its own.

## Consequences

- A Department now means something beyond its name: it groups Roles. It still has no screens, menu or permissions of its own, and Staff are linked to a Department only through their Role.
- Migration `construction_organization_role_department` touches only `construction_organization` (ADR-0030) and changes no data.
- Linking Departments to Staff or Projects directly, or giving a Company-made Department its own screens, remains a later decision.
