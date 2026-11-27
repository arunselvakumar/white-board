# CM-0054 — Labour, Site Engineer and Vendor are default Roles under Human Resources; Site Supervisor is removed

- Status: accepted (2026-11-26, the owner asked for it)
- Date: 2026-11-26
- Amends: [CM-0030](CM-0030-users-and-roles.md) §5 (the seed Roles), [CM-0050](CM-0050-role-department.md) §1 (default Roles started under no Department)
- Relates to: [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) (the Staff group: Labour, Site Engineer, Vendor), [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) (default Roles keep their name and are never deleted), [CM-0049](CM-0049-manage-departments.md) (Human Resources is a system Department)

## Context

The Staff group under Human Resources has a page each for Labour, Site Engineer and Vendor (CM-0036), and a Role may now be under a Department (CM-0050). The owner asked for four changes:

1. Remove the default **Site Supervisor** Role, in existing Companies too.
2. The default **Site Engineer** Role is under **Human Resources**.
3. Add a default **Labour** Role, and a default **Vendor** Role, both under Human Resources, in existing Companies too.
4. Add and Edit Labour, Site Engineer and Vendor show a **Role assignment** card with two disabled dropdowns: Department (Human Resources) and Role (Labour, Site Engineer or Vendor). It is for show and is not saved.

## Decision

### 1. The seed set

`seeds/roles.json` (version 3) holds eleven Roles: Admin, Project Manager, Site Engineer, **Labour**, **Vendor**, Store Keeper, Accountant, Quality Control, Structural Engineer, HRMS Staff, Marketing. Site Supervisor is gone.

A seed may name a system Department (`"department": "Human Resources"`). A new Company makes its system Departments first, then its Roles, so Site Engineer, Labour and Vendor start under Human Resources.

**Labour and Vendor hold no Permission Matrix cells.** Labours and Vendors are records, not Team Members: they do not sign in, so the Role gives no access. Like every default Role, their name is locked and they cannot be deleted (CM-0037 §4); an admin can still edit the description and matrix, or move them to another Department.

### 2. The backfill (migration `construction_organization_hr_roles`)

In every existing Company:

- **Labour and Vendor** are added as default Roles under Human Resources, unless the Company already has a live Role of that name (any case): it keeps its own and gets no default one, as with the Marketing Role (CM-0040 §3).
- **Site Engineer** goes under Human Resources, unless the Company already put it under another Department (CM-0050 shipped earlier the same day): that choice stands.
- **Site Supervisor** is removed. Its live Team Members move to the Company's **Site Engineer** Role first, the closest default (as seeded, it holds every Site Supervisor cell but Labour Categories read, plus Drawings, Testing Reports, Progress Reports, the procurement entries and a few more Masters reads; a Company that edited either matrix may differ). Then the Role is soft-deleted; its row and matrix stay for the record. A Company with no live Site Engineer Role keeps Site Supervisor as it is, rather than leave its staff on no Role.

Back-dated Entry override lists that named Site Supervisor keep its id, as after an ordinary Role delete; it no longer matches anyone.

Every change writes the audit event the screens write: `role.created`, `role.updated` (`departmentId`), `team_member.role_changed`, and `role.deleted` (with `movedTo`). The migration touches only `construction_organization` (ADR-0030).

### 3. Role assignment on the Labour, Site Engineer and Vendor forms

- A **Role assignment** card on Add and Edit of each, after the first card (Basic, Details): **Department** shows Human Resources and **Role** shows Labour, Site Engineer or Vendor, both disabled. The hint reads "The default Department and Role for a Labour. Shown for reference; not saved.", since an admin may have moved the Role (or, for Site Engineer, kept it under another Department in the backfill).
- The values are fixed in the page, not read from the Company's Roles, and nothing is sent or saved. A Site Engineer's sign-in is on the Site Engineer Role already (CM-0037 §1); Labours and Vendors have no Role field.

## Consequences

- Role Management lists eleven default Roles. Labour and Vendor show 0 users and can be picked for Office Staff, where they give no access.
- Staff who were on Site Supervisor can do slightly more on Site Engineer. An admin who wants the old access duplicates Site Engineer, compares its matrix with Site Supervisor's (the migration keeps it on the deleted Role), removes the extra cells and adds the missing ones: as seeded, Labour Categories read.
- The Role assignment card can disagree with the data: if an admin moves the Labour Role to another Department, the card still says Human Resources. Making it read the Role, or saving a Role on Labours and Vendors, is a later decision.
