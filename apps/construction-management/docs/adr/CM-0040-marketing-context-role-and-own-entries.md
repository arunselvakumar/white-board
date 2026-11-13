# CM-0040 — Marketing: a Company-level main-menu item, its own context, one default Role, and own entries that include what is yours by assignment

- Status: accepted (2026-11-12, the owner accepted it as written)
- Date: 2026-11-12
- PRD: [Marketing](../prd/marketing.md)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (menus, flags, View All), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments), [CM-0020](CM-0020-project-sidebar-menu.md) (submenus), [CM-0021](CM-0021-reporting-notifications-backups-product-decisions.md) (reports, notifications, the daily drain, the Company purge), [CM-0022](CM-0022-sales-crm-product-decisions.md) (Sales CRM, which this is not), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (grant migrations), [CM-0027](CM-0027-projects-grouped-by-client.md) (client names), [CM-0030](CM-0030-users-and-roles.md) and [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) (Roles, locked defaults), [CM-0034](CM-0034-hr-main-menu.md) and [CM-0039](CM-0039-full-page-menu-layout.md) (the main menu), ADR-0030 (one schema per context)
- Numbering: the PRD called this CM-0039; #176 merged CM-0039 (the full-page menu) first.

The owner asked for a **Marketing** main-menu item, a **Marketing** Role, and a register of Visits to Prospect Companies with notes, photos and Follow-ups, managed by the marketing team itself. The PRD lists what was agreed on 2026-11-12. This ADR settles how it fits the product: where it sits in the menu, which cells it adds to the Permission Matrix, the Role and its migration, the context and its tables, and what "own entries" means here, which is wider than `ownEntriesOnly`.

## Decision

### 1. Marketing is a main-menu area, at Company level

- The main menu becomes **Dashboard, Projects, Marketing, Human Resources, Workspace, Masters, Settings**. Marketing sits after Projects: for the people who use it, it is the daily screen.
- It is one area in `mainMenuAreas()` (CM-0039 §4) with one group of six entries, so the sidebar and the full-page menu show it from the same list:

  | Entry      | Address                     | Shown when the member may      |
  | ---------- | --------------------------- | ------------------------------ |
  | Dashboard  | `/app/marketing`            | read `marketing.dashboard`     |
  | Visits     | `/app/marketing/visits`     | read `marketing.visits`        |
  | Follow-ups | `/app/marketing/follow-ups` | read `marketing.follow_ups`    |
  | Companies  | `/app/marketing/companies`  | read `marketing.companies`     |
  | Team       | `/app/marketing/team`       | read `marketing.team`          |
  | Reports    | `/app/marketing/reports`    | `report` on `marketing.visits` |

- In the sidebar it folds out like Human Resources (CM-0020 §3), not as a tab row.
- Unlike Human Resources, **Marketing is left out of the menu for a member who may open none of its entries**. It opens on the Dashboard, or on the first entry the member may open when the Dashboard is not one of them. Every page and route still checks its own access.
- Marketing is not inside a Project. The Project sidebar (CM-0020) does not change.
- With seven items, the sidebar is checked at laptop width and in the phone sheet, and the full-page menu at both.

### 2. Five Company-level menus in a new Marketing category

| Menu                   | Label      | Letters    | Flags                                                            |
| ---------------------- | ---------- | ---------- | ---------------------------------------------------------------- |
| `marketing.dashboard`  | Dashboard  | `RV`       | read, view_all                                                   |
| `marketing.visits`     | Visits     | `CRUDVEO`  | create, read, update, delete, view_all, export, report           |
| `marketing.follow_ups` | Follow-ups | `CRUDVN`   | create, read, update, delete, view_all, notification             |
| `marketing.companies`  | Companies  | `CRUDVTEI` | create, read, update, delete, view_all, transfer, export, import |
| `marketing.team`       | Team       | `RU`       | read, update                                                     |

- None is project-scoped. A new category `marketing` ("Marketing") goes in `MENU_CATEGORIES` right after Project Management, so the Permission Matrix reads in main-menu order. A new push-mute group, **Marketing**, goes in `NOTIFICATION_GROUPS`; no existing notification moves, so no mute is copied.
- What the flags mean here:
  - **view_all**: see everyone's records (§5) and the team's figures; on Visits, also edit a Visit past its lock (§7).
  - **transfer** (Companies): Reassign, and the "needs reassigning" list.
  - **export**: Excel of the Visits and Companies lists. **report** (Visits): the three Reports. **import** (Companies): the Excel import.
  - **notification** (Follow-ups): the due and overdue notifications (§8).
  - **Team read** shows the Team page with every Marketing Person's counts; **Team update** sets visit targets. A row's link to that person's Visits still shows only what the viewer's own scope allows.
- There is no `financial` flag on these menus. The approximate value on a Visit is shown to everyone who can read the Visit (open question 3).

### 3. One default Marketing Role; Admin keeps every cell

- `seeds/roles.json` gains **Marketing**: create, read and update on Visits, Follow-ups and Companies; read on the Dashboard; notification on Follow-ups. No view_all, delete, transfer, export, import, report or Team, and nothing outside Marketing. The seed version goes up by one.
- It is a default Role (`is_seed`): its name is locked and it cannot be deleted (CM-0037 §4); its description and matrix are edited like any other. `MARKETING_ROLE = "Marketing"` in `role-seeds.ts` is how Add Marketing Person finds it.
- A marketing manager is a Role the Owner makes with **Duplicate** and gives view_all, transfer, delete, report, export and Team. There is no second default Role.
- The migration `…_construction_organization_marketing_role` makes the Role, with its cells, in every existing Company, and writes a `role.created` audit event by `system` for each. A Company that already has a live Role named "Marketing" (ignoring case) is skipped: its own Role is left alone, it has no default Marketing Role, and Add Marketing Person preselects nothing there. Nothing else depends on the name: Team and the pickers go by the cells a Role holds (§4).
- **Admin also gets the Marketing cells.** Admin is seeded as "every cell" (`"ALL"`, CM-0030 §5), so a Company created after this ships gets them on Admin with no further change. The same migration ORs them into the seeded Admin of existing Companies, so old and new Companies match; that mismatch is what CM-0024 was written to prevent. **No other Role gets any Marketing cell.** This is the one place this ADR goes beyond the PRD's "no other Role"; the alternative is in Considered options.
- The grant rule applies (CM-0030 §1, `assertCanGrant`): putting someone on the Marketing Role needs every cell of it. Someone who manages Staff but holds no Marketing cells cannot add a Marketing Person; the Owner and Admin can.

### 4. Marketing People are Office Staff; Team reads them from the organization context

- There is no new record. A **Marketing Person** is a Team Member whose Role holds `marketing.visits` create, or the Owner (who holds every cell, CM-0003). Site Engineers are always on the Site Engineer Role (CM-0037), which holds no Marketing cell, so they never qualify.
- The organization context gets one query, "Team Members whose Role holds this cell" (active and inactive, with name, mobile and status). Marketing never reads organization tables. Team, the pickers (Visited by, Follow-up owner, assigned person, Reassign to) and the per-person reports are put together in `src/composition/marketing-team.ts` from that query and marketing's own counts. Pickers offer active Marketing People only. A person who leaves the Role or is deactivated keeps their name on past records (`userNamesInCompany`).
- **Add Marketing Person** opens Add Staff (`/app/staff/office-staff/new?roleId=…`) with the Marketing Role preselected.
- **Visit targets** are rows in `visit_targets (member_id, effective_month, target)`. The target for a month is the latest row whose `effective_month` is on or before it. A change writes or replaces the row for the current month, so earlier months keep the target they had. An empty target is a row with `target = null`.
- **Needs reassigning** lists Prospect Companies and Open Follow-ups whose assigned person or owner is inactive or has left. It is shown to members with `transfer` on Companies.

### 5. Own entries: what you created, and what is yours by assignment

Without `view_all` on the record's menu, a member sees:

| Record                                           | When                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| Visit                                            | they created it, **or** they are one of its visitors |
| A Visit's notes, files, check-in and history     | they can see the Visit                               |
| Follow-up                                        | they created it, **or** they own it                  |
| Prospect Company, its Contacts and Stage changes | they created it, **or** it is assigned to them       |
| Dashboard figures, Reports, Team-row links       | computed over exactly the records above              |

**How it is expressed.**

- `MemberAccess` gains `memberId: string | null`: the caller's Team Member id, read in the query `loadMemberAccess` already runs. The visitor, owner and assigned person are Team Member ids, while `created_by` is a User id, so the rule needs both.
- `src/shared-kernel/access` gains `OwnScope = { userId: string; memberId: string | null } | null` and `ownScope(member, menu)`: null with `view_all`, the caller's two ids without it. `ownEntriesOnly` stays as it is for every other context. Sales' `InquiryVisibility` (CM-0022) already has this shape; moving Sales onto the kernel type is not part of this work.
- The marketing domain has one predicate per record (`isVisitVisible`, `isFollowUpVisible`, `isProspectCompanyVisible`), used for single-record reads and before every write. Its infrastructure has one Prisma `where` per record built from the same scope (`visitVisibleWhere` = created by the user **or** a `visit_visitors` row for the member), used by every list, count, calendar, dashboard figure and report. A domain unit test covers each predicate, and an HTTP test per route family checks that a member without `view_all` gets their own records of each kind and not a colleague's.
- A record the member may not see answers **404** for reads and writes alike (`VISIT_NOT_FOUND`, …), as another Company's record does, so its existence is not confirmed.

**Where the lines meet.**

- A Visit shows its Prospect Company's name and its points of contact, and a Follow-up shows its company's name, even when the member cannot open that company (a co-visitor on a colleague's company). The response says whether the name links to the company page (`canOpenCompany`).
- Pickers list only the Prospect Companies the member can see. **Log the visit** carries the Follow-up's company. On a write the server accepts any live Prospect Company in the Company: writing a Visit against one grants nothing beyond that Visit.
- Without `view_all`, the member must be among a Visit's visitors (`VISITOR_SELF_REQUIRED`), so they cannot make a Visit they then cannot see. They may make a Follow-up owned by a colleague; they keep seeing it as its creator.
- The unique-name check runs across all of the Company's live Prospect Companies whatever the scope (`PROSPECT_COMPANY_NAME_IN_USE`). The error says the name is taken, not by whom (open question 1).
- **Reassign moves the assignment, not the creator.** Someone who created a Prospect Company keeps seeing it after it is reassigned away from them. See Considered options.

### 6. A `marketing` context with its own schema

- `src/marketing/{domain,application,infrastructure}`, Postgres schema `construction_marketing`, Prisma file `construction-marketing.prisma` with the `ConstructionMarketing` prefix, API prefix `/api/construction/marketing`, HTTP models prefixed `ConstructionMarketing…`. One migration per schema (ADR-0030).
- Tables, each with `workspace_id`, created and updated stamps, and a tombstone where the PRD allows delete:

  | Table                | Holds                                                                                                                                                               |
  | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `prospect_companies` | the PRD's fields, `name_key` (lower case, spaces collapsed; partial unique on live rows), `assigned_member_id`, `stage`, `lost_reason`, `lost_reason_text`          |
  | `contacts`           | name, job title, mobile, email, remarks, `is_primary` (partial unique: one primary per company)                                                                     |
  | `stage_changes`      | append-only: from, to, Lost Reason, who, when                                                                                                                       |
  | `visits`             | number and sequence, company, `visit_at` (an instant), status, cancel reason, purpose, location, discussion, outcome, interest, requirement, check-in and check-out |
  | `visit_visitors`     | visit, Team Member                                                                                                                                                  |
  | `visit_contacts`     | visit, Contact                                                                                                                                                      |
  | `visit_notes`        | append-only: text, who, when                                                                                                                                        |
  | `visit_files`        | key, thumbnail key, name, content type, bytes, caption                                                                                                              |
  | `follow_ups`         | company, Visit (optional), type, `due_date` (a calendar date), owner, note, status, result note, done date, `due_notified_on`, `overdue_notified_at`                |
  | `visit_targets`      | §4                                                                                                                                                                  |

- The Company purge needs no change: it deletes every `construction_*` table with a `workspace_id` and follows their foreign keys.
- Other contexts are referred to by id only. Names come from the organization context in the composition root.

### 7. Visits

- **Visit No.** comes from the sequence kernel with a new module `marketing_visit` (default prefix `MV`, padding 4: `MV-0001`), listed in Settings → Manage Sequence IDs. A Visit has no Project, so only the module's default rule applies. The number is taken when the Visit is created, planned or completed.
- **Time.** `visit_at` is stored as an instant and entered and shown in the Company time zone. A completed Visit's time cannot be in the future.
- **Statuses.** Planned → Completed (needs one or more points of contact and the Discussion), Planned → Cancelled (needs a reason), and Reschedule (a Planned Visit's new time, the old one kept in its history; not once it is checked in, §10). Completed and Cancelled are final.
- **Missed** is read, never stored: Planned, `visit_at` before now, and not checked in (§10). Lists can filter by it.
- **Back-dated entry.** A new back-dated module `marketing_visit` (menu `marketing.visits`, date field `visit_at`) in a new **Marketing** group, with its own default of **7 days** for create and edit, where every other module defaults to no limit. It applies to the Visit's date whenever a Visit is saved as Completed, including completing a planned one. A Missed Visit older than the limit is cancelled or rescheduled, or completed by someone the Company's setting lets past it.
- **Lock.** A Completed Visit can be changed by its creator for **7 days** after it was completed, then only by someone with `view_all` and update on Visits (`VISIT_LOCKED`). Notes, files and Follow-ups can be added at any time by anyone who can update and see it. A Planned Visit can be changed by anyone who can update and see it. The lock is a constant in code (open question 2); the back-dated limit is the Company's setting.
- **Delete** is a tombstone and needs Visits delete; a Completed Visit keeps its lock and the back-dated edit limit; it writes `visit.deleted`. In the same transaction its live files are tombstoned and their `stored_files` rows (file and thumbnail) are marked deleted, so they stop counting towards the Company's storage; `visit.deleted` lists the removed file ids. The objects are deleted after the commit, best effort, and the daily orphan job catches any left.
- **Completing a Visit**, in one transaction: the Prospect Company moves from **New** to **Contacted** if it is still New, writing a Stage change; a Next Follow-up becomes a Follow-up; the audit event is written.
- **Audit**: `visit.created`, `.updated`, `.completed`, `.rescheduled`, `.cancelled`, `.note_added`, `.file_added`, `.file_removed`, `.checked_in`, `.checked_out`. A Visit's history reads them through the shared audit reader (CM-0038 §1).

### 8. Follow-ups and their notifications

- Overdue, Today and Upcoming are worked out from `due_date` and the Company's today; nothing is stored.
- **Notifications** run in the daily drain (CM-0021 §3, 07:00 in India). Marketing raises one event for each Open Follow-up due today that has not had its due notice today, and one for each Open Follow-up first found overdue (`overdue_notified_at` is null). Messaging's listener sends each to **the Follow-up's owner only**, and only while the owner holds `notification` and read on Follow-ups (CM-0021 §6). A change of due date or of owner clears both marks, so the new day or the new owner is told. The daily query reads only Follow-ups that may still owe a notice: overdue ones not yet told, and ones due today not yet told today.
- A Follow-up is not notified when it is created or reassigned. The PRD does not ask for that.

### 9. Photos and files

- A new attachments purpose, `marketing_visit`, accepts PDF or image. The upload policy gains an optional per-kind limit, so images stop at 10 MB and PDFs at 25 MB, checked at start from the declared type and at complete from the sniffed one.
- Up to 20 live files per Visit, counted at start and again at complete with the live Visit row locked (`VISIT_FILE_LIMIT`; a Visit deleted meanwhile answers `VISIT_NOT_FOUND`, and a key already recorded is a retry, checked before the limit). Keys are `companies/<workspaceId>/marketing_visit/<visitId>/…`. `visit_files` rows are written in marketing's transaction with the `stored_files` row and the audit event. Thumbnails are made in the browser and are taken only while the key awaits completion; once the file is saved, a thumbnail is refused (409 `VISIT_FILE_ALREADY_SAVED`).
- A file is served by `GET /api/construction/marketing/visits/{id}/files/{fileId}`, which checks read and the scope on the Visit (§5) and then streams the bytes itself, with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and a strict Content-Security-Policy (`default-src 'none'`). There is no signed download URL. Its thumbnail (`…/thumbnail`) goes through the same checks and is streamed the same way, kept by the browser for at most 5 minutes.
- Deleting a Visit removes its files with it (§7): tombstones, `stored_files` rows marked deleted, objects deleted after the commit.
- Marketing raises no `ProjectMediaAttached`: these files are in no Project's Gallery.
- On a touch screen (a phone or a tablet) the picker offers **Take photo** (the camera) beside **Choose file**. Both ask for exactly the accepted types (Take photo: JPEG, PNG, WebP), so iOS hands over a JPEG; HEIC is not converted, and a HEIC photo that still arrives is refused in the browser with a message.

### 10. Check-in and check-out

- **Check in** shows on a Planned Visit dated today, to its visitors. It records the time, who checked in, and, if the browser gives one, latitude, longitude and accuracy from a single position request. **Check out** records the end time the same way. Nothing is read in between, and there is no `watchPosition`. Each request asks for a fresh position (`maximumAge: 0`), never a cached one.
- **Today** is the Company time zone's date of the moment the request is handled. That one instant decides the day and is saved as the check-in or check-out time.
- **Check out** is for a visitor, after the check-in, once, and only on the Visit's day, the same as check-in (400 `CHECK_OUT_NOT_TODAY`). A Cancelled Visit cannot be checked out.
- **A checked-in Visit is never Missed.** It stays Planned until someone completes it (or cancels it), and the list shows it as checked in. There is no separate status for it.
- **No Reschedule after check-in.** The check-in proves someone was at the site on that day, so moving the Visit to another day would make the record wrong and hide a missed Visit. Reschedule answers 409 `VISIT_CHECKED_IN` ("This Visit is checked in. Complete it instead."), and the screen does not offer it.
- If the browser refuses or cannot get a position, the check-in is saved with the time only and says why (`location: "refused" | "unavailable"`).
- The position is kept with the Visit and goes when it goes. It is not in the Visit register or any export. The map link is an ordinary link the person chooses to open.

### 11. Prospect Companies and Stages

- **Stages** are fixed in code: New and Contacted are set by the system (§7). The others (Requirement received, Quotation sent, Negotiation, Won, Lost) are set by hand, in any order. **Lost** needs a Lost Reason ("Other" needs text), and leaving Lost clears it. A Lost company can be moved to Lost again only to change the reason. Every change is a `stage_changes` row and an audit event.
- **GSTIN** is checked with the tax-ids kernel; PIN is six digits.
- **Delete** is a tombstone, refused while the company has live Visits (`PROSPECT_COMPANY_HAS_VISITS`). Its Contacts and all its Follow-ups, open or closed, are tombstoned with it in the same transaction, and `prospect_company.deleted` lists the Follow-up ids. Every Follow-up read (the list, one Follow-up, the company page, the reminders) also takes only those of a live company.
- **Reassign** (`transfer`) moves the assigned person and the owner of every Open Follow-up of the company to the new person in one transaction. Past Visits keep their visitors.
- **Import** reads Excel through the xlsx guard: name, city, phone, primary Contact name and mobile. Valid rows are created, assigned to the importer. Duplicate names, within the file or against live companies, and invalid rows are reported, not created.
  As built: "assigned to the importer" follows create's rule, so an importer who is not an active Marketing Person leaves the rows unassigned. Each row is its own create and transaction, so a name taken while the import runs makes only that row a duplicate; at most 500 rows, and a workbook with macros is refused.

### 12. Won → Create Project

- On a Won company, **Create Project** (for members who may create Projects) opens the Project wizard with the client name filled in from the company's name.
- The company page lists the Projects whose client name matches by CM-0027's rule (case, spacing and accents ignored), and only those the viewer may open. The match is read in the composition root through the projects context's query. Nothing is stored, as there is still no Client master.

### 13. Dashboard and Reports

- Every figure is a query over the marketing tables through §5's `where`, scoped to the member or, with `view_all` on the Dashboard, to the team or one person. Weeks start on Monday in the Company time zone. Nothing is stored.
- The three Reports run as report jobs (CM-0021) and land in Downloads. They need `report` on Visits and follow the caller's `view_all` on each record's menu. The Visit register is Excel and PDF; the summary and pipeline are Excel and PDF too.
- As built: the Reports are Company-level report kinds hosted by Marketing → Reports (no Project, no Central Reports Read), and the caller's scope on Visits, Companies and Follow-ups (all, own, or none without read) is fixed with the job. They print the approximate value for everyone (open question 3), so they never need Financial.
- **Visit register**: filters by visitor, Prospect Company, status (Planned, Missed, Completed, Cancelled; Missed as on the moment the report is made, §7 and §10) and purpose. Its next Follow-up is the earliest Open one made from the Visit that the caller may see.
- **Marketing Person summary**: a row for every active Marketing Person and for anyone else with a figure in the month; without `view_all` on Visits, only the caller's own row. Follow-ups done are those marked Done in the month; overdue are those due in the month and still Open after their due date; companies won are those assigned to the person now and moved to Won in the month, counted once.
- **Company pipeline**, as on a day: live companies created by then, their Stage that day (from the Stage changes), the latest Completed Visit up to then, the earliest Follow-up Open that day, and the approximate value of the latest non-cancelled Visit up to then that has one. The assigned person is today's.
- **Exports** (`export`): the Visits and Companies lists' current filters in the caller's scope; the Visits sheet adds each Visit's next Open Follow-up, the Companies sheet the primary Contact's mobile. Neither has a check-in position (§10).

### Open questions, as built

1. **Others' Prospect Companies** are not readable without `view_all`. Duplicates are caught by the unique name (§5).
2. **7 days** for both the back-dated limit (the Company's setting, default 7) and the edit lock (a constant).
3. **Approximate value** is shown to everyone who can read the Visit; there is no `financial` flag on Marketing.

Changing 1 means another scope rule for companies (read-only rows). Changing 2 means changing the default or the constant. Changing 3 means adding `F` to `marketing.visits` with a grant migration.

## Consequences

- Kernel changes, each with tests: `MemberAccess.memberId` and `ownScope`; a menu category; a notification group; a sequence module; a back-dated module and group with a non-zero default; a per-kind size limit in the upload policy.
- One migration in each of two schemas: the marketing tables, and the organization Role with Admin's new cells. The CM-0024 unit test compares the migration's cells to `roles.json`.
- The Owner is a Marketing Person by definition, so a small Company whose Owner does the visiting needs no Role change.
- A creator keeps seeing a Prospect Company or Follow-up that was reassigned away from them (§5). A manager who wants it gone from their list moves them to a Role without that menu, or the rule changes (Considered options).
- Delivery is a stack of pull requests, one per ticket or small group, each under 100 files.

## Considered options

- **Reuse `ownEntriesOnly` (created by me).** A co-visitor would not see the Visit they went on, and a reassigned company would not show for the person now chasing it. Rejected.
- **Visibility by assignment only** (assigned company, owned Follow-up, visitor on a Visit; creator not counted). Reassign would move a record off the old person's lists, which is what a manager reassigning a territory expects. Not chosen because the PRD says "also sees". It is a one-line change per predicate if the owner prefers it.
- **Resolve the visible ids first and filter `id IN (…)`.** Unbounded lists and a second query on every read. Rejected in favour of a `where`.
- **Give Admin nothing.** Follows the PRD to the letter, but Admin in a new Company would hold the cells and Admin in an old one would not, which is the gap CM-0024 closed. Rejected.
- **A Marketing Person record of its own**, or **a separate Marketing Manager Role**: the owner chose Office Staff on one Role (PRD §7).
- **Build on the Sales CRM.** Inquiries and Bookings are per-Project unit sales with per-Project lists (CM-0022); Marketing is Company-level business development. Kept apart, with no link in this round.
- **Store Missed** with a nightly job. Gains nothing a read cannot work out, and is wrong between runs. Rejected.
- **Put Visit photos in the Gallery.** A Visit belongs to no Project. Rejected.
