# CM-0032 — Staff & Roles: screens say Staff, and a staff member can have a monthly salary

- Status: accepted
- Date: 2026-10-25
- Amends: [CM-0030](CM-0030-users-and-roles.md) §2 (the menu, the page and its address, the words on screen)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix, Financial), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (grant migrations), [CM-0012](CM-0012-hrms-product-decisions.md) (HRMS salary set-up)

The client reviewed Users & Roles. To a builder, "User" reads as software jargon: the people they add are their **staff**. They asked for the menu to be **Staff & Roles**, and for every screen that said User to say Staff.

They also asked for a salary when adding a staff member, "just like" Add Labour has a wage, and optional.

HRMS already holds a salary for each Team Member: a Salary Structure, a base monthly amount and a start date (CM-315). The salary run reads it. The owner was offered three choices on 2026-10-25: save the amount as that HRMS salary set-up, which needs a Salary Structure; keep a simple amount on the staff record; or change HRMS so a salary works without a structure. They chose the simple amount. They also chose to move the pages to `/app/staff`, with no redirect from `/app/users`.

## Decision

### 1. Screens say Staff

- The main-menu item is **Staff & Roles**. Its submenu is **Staff** (`/app/staff`) and **Role Management** (`/app/roles`). `/app/users` is gone with no redirect; the old `/app/masters/team-members/…` redirect now points to `/app/staff/…`.
- On those screens: **Staff** (the list and its heading, Search Staff, No Staff yet), **Add Staff**, **Edit Staff**, Back to Staff. Counts read "1 Staff member" and "3 Staff" (Staff list, Role Management, a Role's form).
- The Permission Matrix row for `organization.team_members` is labelled **Staff**.
- In code, APIs, audit events and other modules' screens it stays **Team Member** (`/api/construction/organization/team-members`, HRMS, Tasks, Project Resources). A **User** is still the person who signs in.
- "Designation" stays: it is the job title, as before.

### 2. An optional monthly salary on the staff record

- `team_members.monthly_salary`: integer paise, nullable. 0 or empty is none. At most ₹2 crore a month, the same cap as a Labour's wage (`SALARY_INVALID` otherwise).
- Add Staff and Edit Staff have a **Salary** card with one optional field, **Salary per month** in rupees, between the details and Sign-in. It is a monthly amount only. Staff have no daily wage or overtime.
- **It is separate from HRMS.** The salary run and payslips still read the HRMS salary set-up. This amount does not feed them, and HRMS → Employees does not show it. Joining the two is a later decision.
- Changes are in the audit event (`monthlySalary` in `team_member.invited` and `team_member.updated`), and the company backup has a **Monthly Salary (₹)** column.

### 3. Financial on Staff guards the salary

- `organization.team_members` gains **Financial** (`CRUDF`), like Labours. Without it, responses carry `monthlySalary: null`, the Salary card says "You cannot see salaries. Ask the Owner for the Financial right on Staff.", and the API ignores a salary sent on create or update. An update that leaves it out keeps it, and null clears it.
- The Owner has it. The migration ORs it into each Company's seeded **Admin** Role, as the seeds give a new Company's Admin (CM-0024). Other Roles get it only when an Owner ticks it in Role Management.

## Consequences

- Bookmarks to `/app/users` stop working.
- Two places can now hold a staff member's pay: this amount, and the HRMS salary set-up. Until they are joined, the payslip amount comes only from HRMS.
- Messages from the server still say "Team Member" in a few places (for example "This Team Member has already joined."). Renaming the word across the product is a separate decision.

## Considered options

- **Save it as the HRMS salary set-up.** One source of pay, and it feeds the salary run. But it needs a Salary Structure before the first staff member can have a salary, which is not what Add Labour asks. Not chosen.
- **HRMS salary without a structure.** Also one source. But it needs a schema change and a change to the salary run. Not chosen for now.
- **Keep `/app/users` with a redirect.** Not wanted: the client does not use the old address.
