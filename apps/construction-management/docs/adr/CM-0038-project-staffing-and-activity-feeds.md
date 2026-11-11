# CM-0038 — Site Engineers and Labours managed from the Project, and Activity feeds read from the history we already keep

- Status: accepted (2026-11-11, the owner's answers to the PRD's six questions)
- Date: 2026-11-11
- PRD: [Project staffing and Activity](../prd/project-staffing-and-activity.md)
- Relates to: [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §4 (Labours on many Projects, the transfer history), [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) §2 and [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) (Site Engineers and their sign-in), [CM-0020](CM-0020-project-sidebar-menu.md) §2 (the Project menu), [CM-0013](CM-0013-projects-structure-product-decisions.md) §6 (Project Resources), [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) (attendance), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (new menus reach existing Roles), ADR-0052 (server prefetch)

The client asked for three things: add and remove Site Engineers and Labours on a Project, an **Activity** tab on each Labour, and an **Activity** page on each Project that shows people being added and removed.

## Questions the owner answered

The owner accepted the recommended answer to each question on 2026-11-11.

| #   | Question                                                                                              | Answer                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Can a Site Engineer without a sign-in be put on a Project?                                            | No. The assignment stays on the sign-in, which decides the Projects they see. Older ones get a sign-in first. |
| 2   | Is attendance in the Project feed?                                                                    | No. The client listed people being added and removed. A daily one-line summary can come later.                |
| 3   | Do wage, category, Site Engineer and Reports To changes, payments and advances go in the Labour feed? | Not in this round. The feed is built so entry kinds can be added.                                             |
| 4   | Does the Site Engineer page get an Activity tab too?                                                  | Not in this round; it is the natural next step.                                                               |
| 5   | Removing a Labour with a Last day before attendance already marked on that Project?                   | Refused, naming the date (`TRANSFER_BEFORE_ATTENDANCE`, as today).                                            |
| 6   | Who sees Project → Activity?                                                                          | Anyone with Read on the Project who is on it. No new Permission Matrix row.                                   |

## Decision

### 1. The feeds read the history we already keep; there is no activity table

Both feeds are **read models assembled at read time** from three sources that already hold every fact they show:

| Entry                                                       | Source                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Labour added to, removed from, transferred between Projects | `construction_labour.labour_transfers` (append-only, complete since CM-0033)                                                      |
| Attendance (the day as it stands)                           | `construction_labour.labour_attendance`, the live row                                                                             |
| Attendance changed, attendance cleared                      | `labour_attendance.updated`, `.paid_leave_changed` and `.cleared` audit events, found by the attendance rows' ids                 |
| Added to Labours, imported, marked inactive or active       | `labour.created`, `labour.imported` (`after.labourIds`), `labour.activated` and `labour.deactivated` audit events                 |
| Site Engineer added to or removed from a Project            | the `team_member.*` audit events of the Site Engineer's sign-in, comparing each event's `after.projectIds` with the one before it |
| "by _name_"                                                 | `userNamesInCompany` (a removed Team Member keeps their name)                                                                     |

Each owning context reads its own tables (labour: transfers, attendance and the labourer's audit events; organization: a sign-in's Project history). The feeds meet in `src/composition/` (`labour-activity.ts`, `project-activity.ts`), which also resolves Project names, people's names and what the viewer may open. Audit events are read through one shared-kernel reader beside `recordAudit`, so the payload fields a feed relies on are named in one place and covered by tests that write them through the real commands.

**Order and paging.** Entries are ordered by the **effective date** (newest first), then the **recorded time**, then a kind rank and the source row id, so the order is total. The cursor is that tuple, opaque to the client. Each source is read with the same keyset (`< cursor`, limit 31), the composition merges them and keeps 30. An entry recorded after a page was read sorts by its own date, so reading the next page never repeats or skips one that was already on screen.

**Effective dates.**

- Added to a Project, transferred: the transfer row's date (the first day on the new Project).
- Removed from a Project: the **last day** on it, which is the row's date minus one day. The row keeps its meaning ("the first day off", CM-0033), so the Remove dialog's **Last day** _D_ writes a row dated _D_ + 1, and Edit Labour's untick (dated today) reads as "last day yesterday".
- Attendance, changed, cleared: the attendance day.
- Added to Labours, imported: the joining date. Marked inactive or active: the day it was recorded, in the Company's time zone.
- Site Engineer added or removed: the day it was recorded, in the Company's time zone. Their sign-in has no effective date of its own.

**Batches in the Project feed.** One command that moves many Labours writes all its transfer rows in one transaction with the same `created_at`, `created_by`, date and remark. The Project feed groups rows that share those four and the same direction into one entry ("12 Labours added") carrying the names. The add and remove commands of §2 keep that true; Edit Labour and the Transfer dialog already do.

**Who sees what.** The Labour feed leaves out entries for Projects the viewer may not open; entries with no Project (added, imported, marked inactive or active) always show, and a deleted Project shows by name without a link. The Project feed needs the viewer on the Project, like every Project page. No amounts are returned: no wage, earned amount or overtime amount, so the Financial flag plays no part.

### 2. Labours are added and removed from the Project through the labour context

- `LabourHandlers.addToProject` takes many Labours, a **From** date and a remark; `LabourHandlers.removeFromProject` takes one Labour, a **Last day** and a remark. Each writes `labour_projects` and `labour_transfers` exactly as Edit Labour does (no "from" when adding, no "to" when removing), bumps the Labour's `updatedAt` and records `labour.projects_changed` audit events in the same transaction.
- The existing rules apply per Labour: `TRANSFER_BEFORE_LAST_TRANSFER` (the date must not come before their last move), `TRANSFER_BEFORE_ATTENDANCE` on removal (the last day must be on or after every attendance day on that Project), plus `LABOUR_NOT_FOUND`, `LABOUR_INACTIVE` (adding only), `LABOUR_ALREADY_ON_PROJECT`, `LABOUR_NOT_ON_PROJECT` and a From date before the joining date. A batch is all or nothing; the error names the Labour (`details.labourId`, `details.field`).
- They are commands of their own, not a replace-the-set save, because each carries a date. Two people adding the same Labour meet `LABOUR_ALREADY_ON_PROJECT`, the compare-and-set on the labourer's `updatedAt` catches a concurrent Edit Labour.
- Transfer stays on the Labour page (CM-0033 §4); the Resources row links to it.

### 3. Site Engineers have their own Resources section; the assignment stays on their sign-in

- A Site Engineer is on a Project when their sign-in is (`team_member_projects`), as before (question 1). The Site Engineers section lists the Site Engineers whose sign-in is on the Project; **Add Site Engineers** offers enabled Site Engineers with a sign-in who are not on it, and lists those without one as unavailable ("Needs a sign-in"). The write goes through the organization context's Team Member handlers, so the change is audited as `team_member.projects_changed` and the Site Engineer sees the Project at their next request.
- It uses the Resources page's concurrency: `{ ids, expectedIds }`, 409 `PROJECT_RESOURCES_CHANGED` on a stale set.
- **Each person appears once.** The Team Members section leaves out every sign-in a Site Engineer row points at (their own `site_engineer` sign-in, and an Office Staff sign-in linked before CM-0037). The Team Members save ignores those sign-ins in both `ids` and `expectedIds`, so it can neither add nor drop one by accident. The composition (`src/composition/project-resources.ts`) finds them through `site-engineers.ts`; masters and organization still meet only there.

### 4. Project → Activity is a module under Overview, gated by the Project menu

- `activity` is a new Project module (`/app/projects/<id>/activity`) under **Overview**, right after **Dashboard**. Its menu is `projects.project` (Read), like Amenities and Resources, so Hide / show modules covers it and no Permission Matrix cell is added.
- Because no cell is added, CM-0024's grant migration has nothing to grant: every existing Role with Project Read sees the module the day it ships.
- Opening a Project still lands on the first module in the member's menu: Dashboard for most, Activity when Dashboard is hidden or not allowed.

### 5. The Labour page gets tabs; the Labour feed needs Labours Read

- `/app/staff/labours/<id>` has **Details** (the form, unchanged) and **Activity** tabs, the tab kept in the address (`?tab=activity`). Its filters (`type`, `projectId`, `from`, `to`) are in the address too. Add Labour has no tabs.
- The feed needs `masters.labours` Read, like the page.

## Consequences

- No migration and no back-fill: both feeds show history from the first day, and a database copied from before this release shows the same entries as one made after it.
- Audit payloads become something the feeds read. Each field they use (`after.projectIds` on `team_member.*`, `after.labourIds` on `labour.imported`, `status` and `isPaidLeave` in the attendance snapshots) is written by an existing command and covered by a test that runs that command and reads the feed. Changing one of those payloads means changing the reader in the same PR.
- A feed page costs a few indexed queries (transfers by labourer or by Project, attendance by labourer and date, audit events by entity) instead of one. The indexes exist: `labour_transfers (labour_id, transfer_date)`, `(workspace_id, to_project_id)`, `(workspace_id, from_project_id)`, `labour_attendance (labour_id, attendance_date)`, `audit_events (workspace_id, entity_type, entity_id)`.
- A new entry kind (question 3) is one more source in the owning context and one more case in the composition, plus a test that its command writes what the reader expects.
- Site Engineer entries come from comparing a sign-in's Project sets over time. An event without `after.projectIds` (a photo change, for example) changes nothing, and `team_member.removed` takes the sign-in off every Project it was on. Every command that changes a sign-in's Projects has written the set since the Team Member aggregate shipped (2026-10-08), so no history is missing.
- The Site Engineer page's Activity tab (question 4) can reuse the Project feed's Site Engineer source.

## Considered options

- **An append-only activity table per owning context, written in the same transaction as each change and back-filled once.** One indexed read per page, and payload shapes stop mattering after the back-fill. Not chosen: every command that moves a Labour or marks attendance (Add, Edit and Import Labour, Transfer, the attendance sheet's mark, copy, paid-leave and clear, the Team Members, Site Engineer and Resources saves) would need a second write, and a missed one leaves a silent gap that a read-through cannot have. Attendance entries show the day as it stands, which an append-only row would have to rewrite. The back-fill would have to read the same audit payloads anyway, once, with no test that keeps them readable afterwards. We can still add the table later if a feed gets slow; the read models would then be its back-fill.
- **Site Engineers managed only from the Site Engineer page.** Less to build, but the client asked to staff a Project from the Project. Not chosen.
- **Labours on the Project as a replace-the-set save, like the other Resources.** Simpler client, but a set carries no date or remark per change, and the transfer history needs both. Not chosen.
- **Attendance in the Project feed.** Hundreds of rows a day on a large Project would bury the additions and removals the client asked for (question 2). Not chosen.
