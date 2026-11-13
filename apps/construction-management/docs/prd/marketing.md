---
title: Construction Management — Marketing
docs: ../README.md
created: 2026-11-12
status: draft (the owner accepted the recommended defaults on 2026-11-12, see §7; not yet broken into milestones)
status_values:
  - todo
  - in_progress
  - blocked
  - done
---

# Marketing

The owner asked for one feature (2026-11-12):

1. A new main-menu item, **Marketing**.
2. A new system Role, **Marketing**.
3. A **Dashboard** and **Visit Details**: who from the marketing team is visiting, the date, the company visited, the point of contact there, and other details.
4. On each visit: notes, photos and follow-up updates.
5. The marketing people themselves are managed from this menu.

The client is a civil and steel-fabrication contractor. Its marketing people visit companies to win construction contracts. This document is the owner's request plus the additions agreed in review (§7).

Read first: [CM-0034](../adr/CM-0034-hr-main-menu.md) (main-menu shape), [CM-0030](../adr/CM-0030-users-and-roles.md) and [CM-0037](../adr/CM-0037-site-engineer-page-sign-in-and-default-roles.md) §default Roles (Roles, locked seeds), [CM-0003](../adr/CM-0003-permission-matrix.md) (menus, flags, View All), [CM-0024](../adr/CM-0024-new-menus-reach-existing-designations.md) (new menus reach existing Roles), [CM-0014](../adr/CM-0014-attachments-and-gallery-index.md) (attachments), [CM-0022](../adr/CM-0022-sales-crm-product-decisions.md) (Sales CRM, which this is not), [CM-0027](../adr/CM-0027-projects-grouped-by-client.md) (a Project's client name).

## 1. What exists today

| Thing       | Today                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main menu   | Dashboard, Projects, Human Resources, Workspace, Masters, Settings (CM-0034). No Marketing.                                                                                             |
| Roles       | Seeded default Roles (`src/organization/infrastructure/role-seeds.ts`) cannot be renamed or deleted; their Permission Matrix is editable (CM-0037). There is no Marketing Role.         |
| Sales CRM   | Inquiries and Bookings are **Project** modules that sell units to buyers, with per-Project Funnel Stages and Lead Sources (CM-0022). Nothing tracks Company-level business development. |
| Clients     | A Project carries a free-text `clientName` in its contract details; the Projects home groups by it (CM-0027). There is no Client record.                                                |
| Photos      | The attachments kernel service handles direct upload, type and size checks, plan storage and browser-made thumbnails (CM-0014). Each context keeps its own file rows.                   |
| Own entries | Without the `view_all` flag on a menu, list queries return only what the member created (`ownEntriesOnly`, CM-0003).                                                                    |
| Staff       | Office Staff sign in on a Role, managed at `/app/staff` under Human Resources. Site Engineers are a record of their own (CM-0037).                                                      |

## 2. Words

| Word                 | Meaning                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Marketing**        | The main-menu item and the context. Company-level, not inside a Project.                                             |
| **Prospect Company** | A company the marketing team visits to win work. Not a Client until a Project is created for it.                     |
| **Contact**          | A person at a Prospect Company. One is the primary Contact.                                                          |
| **Visit**            | One planned or completed visit by one or more marketing people to a Prospect Company.                                |
| **Follow-up**        | Something owed after a Visit: a call, a return visit, an email, a quotation to send. It has an owner and a due date. |
| **Stage**            | Where a Prospect Company stands: New, Contacted, Requirement received, Quotation sent, Negotiation, Won, Lost.       |
| **Marketing Person** | An Office Staff member on the Marketing Role. Not a new kind of record.                                              |

"Lead", "Inquiry" and "Booking" stay Sales CRM words and are not used on Marketing screens.

## 3. Requirements

### 3.1 Main menu and Role

- The main menu becomes **Dashboard, Projects, Marketing, Human Resources, Workspace, Masters, Settings**.
- Marketing has a submenu (CM-0020 style, not a tab row): **Dashboard, Visits, Follow-ups, Companies, Team, Reports**.
- Marketing shows only to members who hold Read on at least one Marketing menu. It opens on the Marketing Dashboard.
- New menus in the Permission Matrix, category **Marketing**, all Company-level:

  | Menu                   | Flags                                                            |
  | ---------------------- | ---------------------------------------------------------------- |
  | `marketing.dashboard`  | read, view_all                                                   |
  | `marketing.visits`     | create, read, update, delete, view_all, export, report           |
  | `marketing.follow_ups` | create, read, update, delete, view_all, notification             |
  | `marketing.companies`  | create, read, update, delete, view_all, transfer, export, import |
  | `marketing.team`       | read, update                                                     |

- A new seeded default Role, **Marketing**: create, read and update on Visits, Follow-ups and Companies; read on the Dashboard; `notification` on Follow-ups; **no `view_all`**, no delete, nothing outside Marketing. Like every default Role it cannot be renamed or deleted, and its matrix can be edited.
- There is one Marketing Role. A marketing manager is a Role the Owner duplicates from it and gives `view_all`, `transfer`, delete and `marketing.team`. The Owner sees everything.
- A migration seeds the Role in every existing Company and gives the new menus to no other Role (CM-0024 pattern).

### 3.2 Marketing People (Team)

- A Marketing Person is added under Human Resources → Staff, on the Marketing Role, as any Office Staff member is. There is no second profile form.
- **Marketing → Team** lists everyone on a Role that holds `marketing.visits` create: name, mobile, active or not, visits this month against target, follow-ups overdue, date of last visit. A row links to that person's Visits and Follow-ups, filtered.
- **Add Marketing Person** on this page opens Add Staff with the Marketing Role preselected.
- With `marketing.team` update, a monthly **visit target** (a whole number, optional) can be set per person. A change takes effect from the current month; past months keep the target they had.
- Deactivating a Staff member does not change their Visits. Their open Follow-ups and Prospect Companies show in a "needs reassigning" list for anyone with `transfer`.

### 3.3 Prospect Companies and Contacts

- **Companies** lists Prospect Companies: name, city, Stage, assigned Marketing Person, last visit, next Follow-up. Search by name, city, Contact name or mobile. Filter by Stage, assigned person and industry.
- A Prospect Company has: name (required; unique among live rows in the Company, ignoring case and spacing), industry, address, city, state, PIN, phone, email, website, GSTIN (optional, format checked), source (Reference, Cold call, Tender notice, Existing client, Exhibition, Online, Other), assigned Marketing Person (defaults to the creator), Stage, remarks.
- **Contacts**: any number per Prospect Company. Name (required), job title, mobile, email, remarks. Exactly one is primary once any exist.
- A Prospect Company and a Contact can be created inline from the Visit form, so a first visit is one form.
- The **company page** has the details, Contacts, and one timeline of every Visit, note, photo and Follow-up, newest first.
- **Stage**: New (on creation), Contacted (set on the first completed Visit), Requirement received, Quotation sent, Negotiation, Won, Lost. Moved by hand except the first two. Lost needs a **Lost Reason** (Price, Went to a competitor, No requirement now, Not reachable, Other with text). Every change is kept with who and when. Stages are fixed in code in this round.
- **Won**: the page offers **Create Project**, which opens the Project wizard with the client name filled in. The Prospect Company stays in Marketing, shows the Projects whose client name matches, and can still be visited.
- **Reassign** (needs `transfer`): moves a Prospect Company, and its open Follow-ups, to another Marketing Person. Past Visits keep their visitors.
- Delete is a tombstone and is refused while the Prospect Company has Visits.
- **Import** from Excel: name, city, phone, primary Contact name and mobile. Duplicates by name are reported, not created.

### 3.4 Visits

- **Visits** has a list and a calendar (month and week). Filters: date range, Marketing Person, Prospect Company, status, purpose, interest. Without `view_all` a member sees the Visits they created or are a visitor on.
- A Visit has:

  | Field            | Rule                                                                                                                        |
  | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
  | Visit No.        | From a numbering sequence (`MV-0001`), set in Settings like the others.                                                     |
  | Prospect Company | Required. Pick or create inline.                                                                                            |
  | Point of contact | One or more Contacts of that company; pick or create inline. Required to complete a Visit, optional to plan one.            |
  | Visited by       | One or more Marketing People. Defaults to the creator. A member without `view_all` must include themselves.                 |
  | Date and time    | Required. Company time zone. A planned Visit can be in the future; a completed one cannot.                                  |
  | Status           | Planned, Completed, Cancelled (reason required). Rescheduling changes the date and keeps the old date in the history.       |
  | Purpose          | Cold call, Introduction, Requirement discussion, Quotation, Negotiation, Relationship, Payment follow-up, Other.            |
  | Location         | Free text, defaults to the Prospect Company's address.                                                                      |
  | Discussion       | Notes on what was said. Required to complete.                                                                               |
  | Outcome          | Short text.                                                                                                                 |
  | Interest         | Hot, Warm, Cold. Optional.                                                                                                  |
  | Requirement      | Optional: type of work (Civil, PEB, Steel fabrication, Shed erection, Other), approximate value in ₹, expected start month. |
  | Next Follow-up   | Optional date, type and note. Saving creates a Follow-up (§3.5).                                                            |
  | Photos and files | §3.6.                                                                                                                       |

- **Check-in** (optional): on a phone, a **Check in** button on a planned Visit records the time and the GPS position, and **Check out** the end time. The Visit shows a "checked in at the site" mark and a map link. A Visit can be completed without it. If the browser refuses location, the check-in is saved with the time only and says so.
- **Notes after the visit**: anyone who can update the Visit can add dated notes to it. Notes are never edited, only added, and show who wrote them.
- **Back-dated entry**: a completed Visit can be logged with a past date within the Company's Back-dated Entry setting for this menu (default 7 days).
- **Lock**: a completed Visit can be edited by its creator for 7 days, then only by someone with `view_all` and update. Notes and Follow-ups can still be added.
- Every create, change, cancel and reschedule is written to the audit trail.
- A planned Visit whose date passed and is neither completed nor cancelled shows as **Missed** in lists and on the Dashboard. Missed is shown, not stored.

### 3.5 Follow-ups

- A Follow-up has: Prospect Company (required), the Visit it came from (optional), type (Call, Visit, Email, Send quotation, Other), due date (required), owner (a Marketing Person, default the creator), note, status (Open, Done, Cancelled), and on Done a result note and done date.
- **Follow-ups** opens on **Mine**, in three groups: Overdue, Today, Upcoming. With `view_all`, a switch shows everyone's and a filter by owner.
- Marking a Visit-type Follow-up Done offers **Log the visit**, which opens a new Visit with the company, Contact and visitor filled in.
- Completing a Visit with a Next Follow-up creates the Follow-up in the same save.
- Notifications, to owners with the `notification` flag: on the morning of the due date, and once when a Follow-up becomes overdue. They use the existing in-app notifications (CM-0021).

### 3.6 Photos and files

- A Visit takes up to 20 photos and files: images, and PDF for a visiting card scan, brochure or requirement sheet. Images at most 10 MB, PDFs at most 25 MB.
- Uploads go through the attachments kernel service with a new purpose, `marketing_visit`; thumbnails are made in the browser. The marketing context keeps its own file rows.
- On a phone the picker offers the camera.
- Each photo can have a caption. A file is served through the Visit's own route, which checks permission on the Visit.
- These files are not in any Project's Gallery: a Visit belongs to no Project.

### 3.7 Marketing Dashboard

Without `view_all` every figure is the member's own. With it, the figures are the team's, with a filter by Marketing Person. A period switch: this week, this month, last month, custom.

- **Totals**: Visits completed, Visits planned, Visits missed, Follow-ups due today, Follow-ups overdue, new Prospect Companies, Prospect Companies won.
- **Today**: my planned Visits and my Follow-ups due, each a link.
- **Visits per Marketing Person**: completed against the monthly target (`view_all` only).
- **Companies by Stage**: counts per Stage, and Won against Lost in the period.
- **Visits over time**: per day for a week, per week for longer periods.
- **Recent activity**: the latest Visits, notes, Stage changes and Follow-ups done.
- **Hot companies with no Follow-up**: Prospect Companies marked Hot at their last Visit that have no open Follow-up.

### 3.8 Reports

- **Visit register**: one row per Visit for a date range, filtered by person, company, status and purpose. Excel and PDF.
- **Marketing Person summary**: per person for a month: target, Visits completed, missed, new companies, Follow-ups done and overdue, companies won.
- **Company pipeline**: Prospect Companies with Stage, assigned person, last Visit, next Follow-up, approximate value.
- Reports need the `report` flag on Visits and follow the caller's `view_all`.

## 4. Not in this round

- A quotation or estimate builder. "Quotation sent" is a Stage, not a document.
- Travel expense claims and conveyance.
- Live route tracking, geo-fencing or distance travelled. Check-in records one position.
- WhatsApp, SMS or email sent from the app.
- A Client master. Won still ends in a Project's free-text client name.
- Editable Stages, purposes and Lost Reasons. They are fixed lists in code.
- A link between Marketing and the per-Project Sales CRM.
- A mobile app. The screens must work in a phone browser.

## 5. Notes for the implementer

- A new context: `src/marketing/{domain,application,infrastructure}`, Postgres schema `construction_marketing`, Prisma prefix `ConstructionMarketing`, API prefix `/api/construction/marketing`. Every table carries `workspace_id` so the Company purge finds it.
- Tables (suggested): `prospect_companies`, `contacts`, `visits`, `visit_visitors`, `visit_contacts`, `visit_notes`, `visit_files`, `follow_ups`, `stage_changes`, `visit_targets`.
- A visitor and a Follow-up owner are Team Member ids. The marketing context reads names through the organization context's query, not its tables.
- "Own entries" here is wider than `ownEntriesOnly`'s "created by me": a member also sees Visits they are a visitor on, and Follow-ups and Prospect Companies assigned to them. The ADR must say how that rule is expressed.
- Menus and flags are code (CM-0003): add them in `src/shared-kernel/access`, and the Role in `role-seeds.ts` with the migration that seeds existing Companies.
- The main menu grows to seven items; check the sidebar at narrow widths.
- Dashboard counts are queries over the marketing tables; no stored totals.
- GPS position is personal data: store latitude, longitude and accuracy only at check-in and check-out, never in between.

## 6. Tickets

Sequential. Update the Status column.

| #   | Ticket                                                                                         | Status |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| 1   | ADR CM-0040: Marketing main menu, context and schema, the Marketing Role, the own-entries rule | done   |
| 2   | Menus and flags, Marketing default Role and its migration, main-menu item and submenu          | done   |
| 3   | Prospect Companies and Contacts: list, form, company page, Stage and its history               | done   |
| 4   | Visits: form, list, statuses, notes, numbering, back-dated and lock rules, audit               | todo   |
| 5   | Visit photos and files on the attachments service                                              | todo   |
| 6   | Follow-ups: list, Done and Log the visit, creation from a Visit, notifications                 | todo   |
| 7   | Visit calendar and check-in / check-out                                                        | todo   |
| 8   | Team page, visit targets, reassign and the "needs reassigning" list                            | todo   |
| 9   | Marketing Dashboard                                                                            | todo   |
| 10  | Won → Create Project, and the Projects shown on the company page                               | todo   |
| 11  | Reports and exports; Prospect Company import                                                   | todo   |
| 12  | e2e tests (`e2e-tests.md`), `modules/` spec for Marketing, README table of contents            | todo   |

## 7. Questions the owner answered

Answered on 2026-11-12 by accepting the recommended default for each.

| Question                                                               | Answer                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Is a Marketing Person an Office Staff member or a record of their own? | **Office Staff on the Marketing Role.** Marketing → Team lists them; there is no second profile.   |
| One Role or a separate Marketing Manager Role?                         | **One seeded Role.** A manager is a duplicate with `view_all`; the Owner sees everything.          |
| Is the company a list of its own or typed on each Visit?               | **A Prospect Company list** with Contacts, created inline from the Visit form.                     |
| Are Stages and Won → Client in the first version?                      | **Yes.** Fixed Stages; Won offers Create Project with the client name filled in. No Client master. |
| GPS check-in?                                                          | **Optional.** A Visit can be completed without it.                                                 |
| Monthly visit targets?                                                 | **Yes**, a simple count per person per month.                                                      |
| Are Visits planned ahead or only logged afterwards?                    | **Both.** Planned Visits show on a calendar; a past Visit can be logged directly as completed.     |

### Still open

1. Should a Marketing Person see other people's Prospect Companies (read only) to avoid two people chasing the same company? This document says no; duplicates are caught by the unique name instead.
2. Is 7 days right for both the back-dated limit and the edit lock?
3. Does the client want the approximate value hidden from Marketing People (the `financial` flag) or visible to all? This document shows it to everyone who can read the Visit.
