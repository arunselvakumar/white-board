# CM-0036 — One Staff group under Human Resources, all under `/app/staff`, and Supervisors become Site Engineers

- Status: accepted (2026-11-10, the owner's request)
- Date: 2026-11-10
- Amended by: [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) (a Site Engineer has a page, a full profile and a sign-in)
- Supersedes: the Staff and Labour groups of Human Resources in [CM-0034](CM-0034-hr-main-menu.md) §2 and [CM-0035](CM-0035-labour-reports-to-and-labour-categories-in-masters.md), and CM-0034's choice to keep the old page addresses
- Relates to: [CM-0030](CM-0030-users-and-roles.md) (Team Members or Role Management Read gates Staff and Roles), [CM-0032](CM-0032-staff-and-salary.md) (screens say Staff), `modules/08`

The owner asked for two changes:

1. Labour, Supervisors and Vendors sat in their own **Labour** group under Human Resources, beside a **Staff** group (Staff, Role Management). The owner wants one **Staff** group: **Labour, Site Engineer, Vendor, Office Staff, Role Management**, in that order. What was "Staff" is now **Office Staff**.
2. **Supervisor** is renamed **Site Engineer** everywhere a user reads it.

## Decision

### 1. One Staff group, and its pages under `/app/staff`

Human Resources has two groups: **Staff** and **HRMS**. Every Staff page moves under `/app/staff`:

| Entry           | Was                | Now                         |
| --------------- | ------------------ | --------------------------- |
| Labour          | `/app/labours/…`   | `/app/staff/labours/…`      |
| Site Engineer   | `/app/supervisors` | `/app/staff/site-engineers` |
| Vendor          | `/app/vendors/…`   | `/app/staff/vendors/…`      |
| Office Staff    | `/app/staff/…`     | `/app/staff/office-staff/…` |
| Role Management | `/app/roles/…`     | `/app/staff/roles/…`        |

The app is not in production, so the old addresses get **no redirects**. `/app/staff` itself sends you to Labour. The older `/app/masters/team-members/…` redirect now points at `/app/staff/office-staff/…`.

Without Team Members or Role Management Read, the Staff group keeps Labour, Site Engineer and Vendor and leaves out Office Staff and Role Management. The Human Resources link then opens HRMS, as before. With them, it opens Labour.

The sidebar entries are singular (Labour, Site Engineer, Vendor) as the owner wrote them. Page titles stay plural (Labours, Site Engineers, Vendors), and the Staff list's heading is **Office Staff**.

### 2. Site Engineer on screen; `supervisor` in code and data

Labels, headings, filters, placeholders, empty states, error messages, report and Excel column headers, and the OpenAPI descriptions say Site Engineer. That includes the Equipment Usage sheet's supervisor and its column setting. The labour Excel import reads columns by header, so it still accepts a **Supervisor** column from templates downloaded before this change.

The code, the API paths (`/api/construction/masters/supervisors`), the Prisma model `ConstructionMastersSupervisor`, the `supervisors` table and `supervisor_id` columns, and audit actions (`supervisor.created`, …) keep **supervisor**. Renaming them needs a migration and touches about 550 references for no change a user sees. A later ADR can do it on its own.

The seeded **Site Supervisor** Role is a different thing (a Role, not this list) and keeps its name. A **Site Engineer** Role already exists among the seeds, so renaming it would make two Roles with one name.

## Consequences

- Bookmarks to the old addresses return 404.
- The e2e page objects, Storybook stories and nav tests use the new paths and labels.
- Seeing "Site Engineer" on the list and the Role picker can mean two things: the Site Engineer list (people Labours report to) and the Site Engineer Role (access). They were already apart as Supervisor and Site Engineer; the owner accepted the overlap.
