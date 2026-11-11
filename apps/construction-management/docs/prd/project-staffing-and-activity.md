---
title: Construction Management — Project staffing and Activity
docs: ../README.md
created: 2026-11-11
status: ready (the owner answered the six questions on 2026-11-11, see §6)
status_values:
  - todo
  - in_progress
  - blocked
  - done
---

# Project staffing and Activity

The client asked for one feature (2026-11-11):

1. On each **Project**, add and remove **Site Engineers** and **Labours**.
2. On each **Labour**'s profile, an **Activity** tab: a feed of when they were added to a Project, removed from one, and their attendance.
3. On each **Project**, an **Activity** entry next to Dashboard: a timeline of Site Engineers and Labours being added and removed.

Read first: [CM-0033](../adr/CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §4 (Labours on many Projects, transfers), [CM-0036](../adr/CM-0036-one-staff-group-and-site-engineers.md) and [CM-0037](../adr/CM-0037-site-engineer-page-sign-in-and-default-roles.md) (Site Engineers and their sign-in), [CM-0020](../adr/CM-0020-project-sidebar-menu.md) (the Project menu), [CM-0013](../adr/CM-0013-projects-structure-product-decisions.md) §6 and `modules/03` "Resources" (who is on a Project), [CM-0011](../adr/CM-0011-attendance-check-in-out-and-working-hours.md) (attendance), `modules/08`.

## 1. What exists today

| Thing                      | Today                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labour on a Project        | `construction_labour.labour_projects` holds who is on which Project now. Every add, remove and transfer appends a `labour_transfers` row (date, remark, `created_by`). Changed only from Add / Edit Labour and the Transfer dialog, never from the Project.                 |
| Site Engineer on a Project | Only through their sign-in (`team_members.site_engineer`, `team_member_projects`). They show among **Team Members** on Project → Resources. A Site Engineer with no sign-in (`signIn: none`) cannot be on a Project. Changes are audited as `team_member.projects_changed`. |
| Project → Resources        | Four sections: Team Members, Contractors, Suppliers, Vendors (`src/composition/project-resources.ts`, `app/app/projects/[id]/resources/`). No Labours, no Site Engineers section.                                                                                           |
| Labour profile             | `/app/staff/labours/[id]` is one page of cards (the form). No tabs. Transfer history is a slide-over.                                                                                                                                                                       |
| Attendance                 | One live row per Labour per Project per day (`labour_attendance`). Audited: `labour_attendance.marked`, `.updated`, `.paid_leave_changed`, `.cleared`.                                                                                                                      |
| Audit trail                | `construction_organization.audit_events` (actor, action, entity, before, after, time), written through `recordAudit`. Nothing on screen reads it as a feed.                                                                                                                 |

## 2. Requirements

### 2.1 Manage Site Engineers and Labours from the Project

- Project → Setup → **Resources** gains two sections, placed first: **Site Engineers**, then **Labours**. The other four follow as today.
- **Labours section**
  - Lists every Labour on the Project: name, Labour Id, Labour Category, "since" date, an Inactive badge. It has a search box (name, Labour Id, phone) and pages or virtualises: a Project can have hundreds of Labours.
  - **Add Labours** opens a picker of active Labours not yet on the Project: searchable, many can be ticked. It asks for a **From** date (default today, Company time zone) and an optional remark. One save adds them all.
  - **Remove** on a row asks for the **Last day** (default today) and an optional remark. Attendance, wages and payments already recorded stay as they are. The history row is dated the day after the Last day, its first day off the Project (CM-0033; [CM-0038](../adr/CM-0038-project-staffing-and-activity-feeds.md) §1).
  - Each add and remove writes the same `labour_projects` and `labour_transfers` rows that Edit Labour writes, so there is one history whichever screen was used. The domain's existing rules apply (`TRANSFER_BEFORE_LAST_TRANSFER`, `TRANSFER_BEFORE_ATTENDANCE` in `src/labour/domain/labour.ts`); the dialog shows the error on the date field and names the Labour it refused.
  - Transfer (move to another Project on a date) stays on the Labour page. A row's menu links to it.
- **Site Engineers section**
  - Lists the Site Engineers on the Project: name, mobile, employee code, a Disabled badge.
  - **Add Site Engineers** picks from enabled Site Engineers who have a sign-in and are not on the Project. **Remove** takes them off.
  - The assignment stays where it is: the Site Engineer's sign-in in `team_member_projects` (question 1). So adding one here also lets them see the Project when they sign in.
  - A Site Engineer no longer shows under **Team Members** on this page, so each person appears once.
  - A Site Engineer without a sign-in is listed in the picker as unavailable, with "Needs a sign-in" and a link to their page.
- **Concurrency** follows the page: `{ ids, expectedIds }` and 409 `PROJECT_RESOURCES_CHANGED` for Site Engineers; for Labours the add and remove are their own commands (each carries a date), refused when the Labour is already on, or already off, the Project.
- **Who may do it**: `projects.project` Read to see the sections, Update to change them, as for the rest of Resources. The Labour picker also needs `masters.labours` Read.
- **New Project, step 2** ("Assign resources") shows the two new sections too.

### 2.2 Labour → Activity tab

- The Labour page gets two tabs: **Details** (today's form, unchanged) and **Activity**. The tab is in the address (`?tab=activity`) so it can be linked and survives a reload. Add Labour has no tabs.
- Entries:

  | Entry                   | Sentence (example)                                             | Extra line                                  |
  | ----------------------- | -------------------------------------------------------------- | ------------------------------------------- |
  | Added to the register   | "Added to Labours"                                             | "Imported from Excel" when it was           |
  | Added to a Project      | "Added to **Sky Towers**"                                      | remark                                      |
  | Removed from a Project  | "Removed from **Sky Towers**"                                  | remark                                      |
  | Transferred             | "Transferred from **Sky Towers** to **Green Park**"            | remark                                      |
  | Attendance              | "**Present** at **Sky Towers**"                                | check-in – check-out, overtime hours, shift |
  | Attendance changed      | "Attendance at **Sky Towers** changed from Absent to Half Day" |                                             |
  | Attendance cleared      | "Attendance at **Sky Towers** cleared"                         |                                             |
  | Activated / deactivated | "Marked inactive"                                              |                                             |

- Every entry shows the day it applies to, and underneath "by _name_ · _when it was recorded_". A back-dated transfer therefore sits on its own date, not on the day someone typed it.
- Newest first, grouped by day, 30 entries at a time with **Load more**.
- Filters: **Type** (All, Projects, Attendance, Profile), **Project**, **date range**. Filters live in the address.
- Attendance statuses read as on the attendance sheet: Present, Half Day, Absent, On Leave, Paid Leave, Holiday.
- **No money** in the feed in this round: no wage, earned amount or overtime amount, so the Financial flag needs no handling here.
- A viewer sees entries only for Projects they may open; entries with no Project (added, activated) always show. A Project that was since deleted shows by name, without a link.
- The feed is read-only. Empty state: "Nothing yet. Adding this Labour to a Project or marking attendance will show here."
- Needs `masters.labours` Read.

### 2.3 Project → Activity

- A new module **Activity** in the Project menu, under **Overview**, right after **Dashboard** (`/app/projects/<id>/activity`, `PROJECT_NAV_GROUPS` in `src/projects/domain/project-nav-groups.ts`). It can be hidden with Hide / show modules like any other.
- Entries: Site Engineer **added**, Site Engineer **removed**, Labour **added**, Labour **removed**, Labour **transferred in** (from which Project), Labour **transferred out** (to which Project).
- Each entry: the person's name (a link to their page when the viewer may open it), Labour Category for a Labour, the effective date, remark, "by _name_ · _when_".
- When one save adds many Labours, the feed shows one entry ("12 Labours added") that opens to the names.
- Same layout as the Labour feed. Filters: **Who** (All, Site Engineers, Labours) and **date range**.
- A deleted Labour or Site Engineer keeps their name in the feed, without a link.
- Attendance is **not** in this feed (question 2).
- Needs `projects.project` Read, and the viewer must be on the Project, as for every Project page (question 6).

### 2.4 History from before this feature

Both feeds show history from day one, not from the day this ships:

- Labour and Project entries for Labours come from `labour_transfers` (complete since CM-0033) and the `labour.*` and `labour_attendance.*` audit events.
- Site Engineer entries come from `team_member.projects_changed` audit events of sign-ins marked `site_engineer`.

The feeds read these sources directly; there is no feed table ([CM-0038](../adr/CM-0038-project-staffing-and-activity-feeds.md) §1).

## 3. Not in this round

- Vendors, Contractors, Suppliers and Office Staff in the Project feed.
- Wage, category, Site Engineer and Reports To changes, wage payments and advances in the Labour feed (question 3).
- An Activity tab on the Site Engineer page (question 4).
- Exporting a feed, notifications about feed entries, comments on entries.
- Renaming `supervisor` in code and data (CM-0036 §2 still holds).

## 4. Notes for the implementer

- **No cross-context imports.** Labours and attendance are in `labour`, Site Engineers in `masters`, their sign-in and the audit trail in `organization`, the Project in `projects`. The feeds meet in `src/composition/`, as `project-resources.ts` and `site-engineers.ts` do.
- **Feed source (decide in the ADR).** Two ways: (a) read models that union `labour_transfers`, `labour_attendance` and `audit_events` at read time; (b) an append-only activity table per owning context, written in the same transaction as the change and back-filled once. (a) has no migration and history for free but pages across three sources and depends on audit payload shapes; (b) is one indexed read and easy to extend, at the cost of a back-fill and a write in every command. Whichever is chosen, entries are ordered by the effective date, then the recorded time, with a stable keyset cursor.
- **Attendance entries** should reflect the row as it stands, plus change and clear entries from the audit trail; a day re-marked three times is one attendance entry and two "changed" entries.
- **Names** of actors come from Team Members; a removed member's name is still shown (see `site-work-author-names.ts`, `finance-author-names.ts`).
- **Dates** are calendar dates in the Company's time zone; recorded times are instants shown in it.
- **HTTP**: Zod Request / Response models beside the routes, names carrying the context (`ConstructionProjectActivityResponseModel`, …). Server prefetch through the route handler per ADR-0052. Client reads with `queryOptions` + `useSuspenseQuery`; "Load more" is an infinite query.
- **Module registration**: a new Project module must sit under a heading or a unit test fails (CM-0020 §2); check Hide / show modules, the Permission Matrix mapping and CM-0024 (new menus reach existing Roles).
- **Docs in the same PR**: `modules/03` (Resources, the Activity module), `modules/08` (the Labour tabs and feed), `01-domain-model.md` if a table is added, `CONTEXT.md` for "Activity".
- **Tests**: unit tests for the handlers and feed ordering, HTTP tests for each route (including a member who is not on the Project and one without Read), Storybook stories for both feeds (empty, mixed, long) and the two Resources sections, one `@pr` e2e that adds a Labour from the Project and sees it in both feeds.

## 5. Tickets

Work top to bottom. One PR for the feature unless it passes CodeRabbit's file limit; then stack it (ADR + staffing, then the feeds).

| #   | Title                                                         | Status | Blocked by | Area             |
| --- | ------------------------------------------------------------- | ------ | ---------- | ---------------- |
| 1   | ADR CM-0038: owner's answers to §6, feed source, module rules | done   |            | Docs             |
| 2   | Labours on a Project: add and remove from the Project         | done   | 1          | Domain+HTTP      |
| 3   | Site Engineers on a Project: their own Resources section      | done   | 1          | Domain+HTTP      |
| 4   | Resources page: Site Engineers and Labours sections           | done   | 2, 3       | UI               |
| 5   | Labour activity feed: read model and route                    | done   | 1          | Data+Domain+HTTP |
| 6   | Labour page: Details and Activity tabs                        | done   | 5          | UI               |
| 7   | Project activity feed: read model and route                   | done   | 2, 3       | Data+Domain+HTTP |
| 8   | Project → Activity module and page                            | done   | 7          | UI               |
| 9   | History back-fill (or read-through), e2e, docs                | done   | 6, 8       | Data+Docs        |

### 1 — ADR CM-0038

**Done when:** the ADR records the owner's answer to each question in §6, the feed source with the option not chosen, where the Project Activity module sits and which permission gates it, and how Site Engineers leave the Team Members section. Check the next free ADR number against `main` before naming it.

### 2 — Labours on a Project: add and remove from the Project

**Done when:**

- `GET …/projects/{id}/resources` includes Labours (id, name, Labour Id, category, since, active), searchable and paged.
- `GET …/resources/labours/options` lists active Labours not on the Project, with search.
- `POST …/resources/labours` adds many with a From date and remark; `DELETE …/resources/labours/{labourId}` (or a remove command) takes a Last day and remark. Both write `labour_projects` and `labour_transfers` through the labour context's handlers, bump the Labour's `updatedAt`, and audit.
- Refusals: Labour not found or inactive, already on the Project, not on the Project, a date before the last transfer or before attendance. A batch add is all or nothing and names the Labour that failed.
- HTTP tests: happy paths, each refusal, a member not on the Project (404), no Update (403).

### 3 — Site Engineers on a Project

**Done when:**

- Resources returns a Site Engineers section and leaves Site Engineer sign-ins out of Team Members.
- Options list enabled Site Engineers, marking those without a sign-in as unavailable.
- `POST …/resources/site-engineers` with `{ ids, expectedIds }` changes the sign-ins' Projects through the organization context, with `PROJECT_RESOURCES_CHANGED` on a stale set.
- The Team Members save can no longer add or drop a Site Engineer sign-in by accident (its `expectedIds` ignores them).
- HTTP tests as for ticket 2.

### 4 — Resources page

**Done when:** both sections render as in §2.1 with their dialogs, errors show on the date field, New Project step 2 shows them, stories cover empty, a few and hundreds of Labours, and the page works at phone width.

### 5 — Labour activity feed

**Done when:**

- `GET /api/construction/labour/labours/{id}/activity?type=&projectId=&from=&to=&cursor=` returns entries as in §2.2, 30 a page, with a cursor.
- Entries for Projects the viewer may not open are left out; no amounts are returned.
- Ordering is by effective date then recorded time, and stable across pages (a test adds entries between two page reads).
- HTTP tests: every entry kind, each filter, a back-dated transfer, a re-marked and a cleared day, a deleted Project, a viewer on only one of two Projects.

### 6 — Labour page tabs

**Done when:** Details and Activity tabs with the tab in the address, the feed with filters, Load more, empty and error states, stories, and changes typed on Details survive switching tabs. (The Labour page had no unsaved-changes guard to keep; a leave-page prompt is a follow-up.)

### 7 — Project activity feed

**Done when:**

- `GET /api/construction/projects/projects/{id}/activity?who=&from=&to=&cursor=` returns entries as in §2.3, with a batch add as one entry carrying its names.
- A deleted person keeps their name and has no link target.
- HTTP tests: each entry kind, both filters, transfer in and out seen from both Projects, a batch, access (not on the Project, no Read).

### 8 — Project → Activity module

**Done when:** the module is under Overview after Dashboard, obeys Hide / show modules, the nav-groups unit test passes, existing Roles with Project Read see it (CM-0024), the page has stories, and opening a Project still lands on Dashboard.

### 9 — History, e2e, docs

**Done when:** both feeds show history from before the release on a database copied from before it (a migration test if a table is back-filled), the `@pr` e2e passes within the budget, and `modules/03`, `modules/08`, `01-domain-model.md` and `CONTEXT.md` are updated.

## 6. Questions the owner answered

The owner accepted the recommended answer to each (2026-11-11). Ticket 1 records them in the ADR.

| #   | Question                                                                                              | Answer                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Can a Site Engineer without a sign-in be put on a Project?                                            | No. The assignment stays on the sign-in, which decides the Projects they see. Older ones get a sign-in first. |
| 2   | Is attendance in the Project feed?                                                                    | No. The client listed people being added and removed. A daily one-line summary can come later.                |
| 3   | Do wage, category, Site Engineer and Reports To changes, payments and advances go in the Labour feed? | Not in this round. Build the feed so entry kinds can be added.                                                |
| 4   | Does the Site Engineer page get an Activity tab too?                                                  | Not in this round; it is the natural next step.                                                               |
| 5   | Removing a Labour with a Last day before attendance already marked on that Project?                   | Refuse and name the dates (the domain already does, `TRANSFER_BEFORE_ATTENDANCE`).                            |
| 6   | Who sees Project → Activity?                                                                          | Anyone with Read on the Project who is on it. No new Permission Matrix row.                                   |
