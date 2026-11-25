# CM-0048 — No Department master

- Status: accepted
- Date: 2026-11-25
- Supersedes: the Department master of `modules/02` (ticket CM-203), the Department on Work Types (CM-601), Daily Worksheets and Equipment Usage sheets ([CM-0016](CM-0016-daily-site-work-product-decisions.md)), Tasks, Issues & Snags and Inspection Requests ([CM-0019](CM-0019-tracking-product-decisions.md)), Material Requests (`modules/06`) and Contractor invoices ([CM-0017](CM-0017-finance-product-decisions.md))
- Amends: [CM-0046](CM-0046-departments-menu.md) §5 (the name "Departments" is no longer shared with a Masters list)
- Relates to: [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) (the last master removed the same way)

Masters → Work → Departments was a list of trades (RCC, Plumbing, Painting…), 53 of them seeded into every Company. Contractors, Work Types, Daily Worksheets, Equipment Usage sheets, Tasks, Issues & Snags, Inspection Requests, Material Requests and Contractor invoices were all filed under one.

The client reads "department" as an office unit (Accounts, Purchase, HR), and the main menu's **Departments** area (CM-0046) now means exactly that. The trade list confused them, and they do not use it to sort work. The owner asked for it to be removed everywhere, production data included.

## Decision

### 1. The Department master is gone

- Masters → Work → Departments, its API (`/api/construction/masters/departments…`), its OpenAPI components and its menu (`masters.departments`) are removed. The menu leaves every Role's Permission Matrix.
- A new Company is no longer seeded with the 53 Departments.
- The masters backup loses the Departments sheet. A backup job queued before the release that still names `masters.departments` skips it.
- The main menu's Departments area (Human Resources, Marketing; CM-0046, CM-0047) is unrelated and stays.

### 2. Contractors

- A Contractor has no Departments. The Contractor form loses the field and the list loses the column.
- Where a Contractor showed its Departments as a second line (Project Resources search, pickers), it shows its contact person, or else its mobile, as a Supplier does.

### 3. Work Types are one flat list

- A Work Type is a name and its assigned Materials. It has no Department.
- The seed Work Type **RCC** stays as it is (read-only name, never deleted).

### 4. Daily site work

- A **Daily Worksheet** is filed by Contractor, then Work Type (optional, as before). The Work Type picker offers every live Work Type, not those of one Department.
- An **Equipment Usage sheet** has no Department.
- The worksheet list loses its Department filter; worksheet detail, the Daily Worksheet report and the Daily Progress Report lose the Department column.
- The site-work dashboard sums labour **per Contractor**.

### 5. Tasks, Issues & Snags, Inspection Requests

- None of the three has a Department: not in their forms, filters, details, lists, reports or the re-inspection prefill.
- The task import workbook has no Department column. A workbook from before the release that still has one imports, and the column is ignored.

### 6. Procurement and finance

- A **Material Request** has no Department (form, detail, PDF).
- A **Contractor invoice** has no Department. The invoice form's options endpoint (`/api/construction/finance/parties/form-options`), which only served a Contractor's Departments, is removed.

### 7. The data is dropped, not kept

- One migration per schema (ADR-0030) drops the columns and tables: `department_id` on worksheets, equipment usage sheets, tasks, issues, inspections, material requests, invoices and work types; `contractor_departments`; `departments`. The masters migration runs last, after every reference is gone. The old migrations stay in history.
- **No audit record is kept.** Our data-deleting migrations usually copy what goes into `audit_events` first (CM-0033). The owner chose to drop the Departments outright: they carry no money or approval, and keeping history for a list being retired was not worth one event per worksheet, task and issue.
- Before the release reaches production, take a Neon branch of the production database. That branch, and Neon's point-in-time restore window, are the only way back.

## Consequences

- Fewer required fields on the Daily Worksheet; nothing on screen uses the word "Department" for a trade any more.
- Reports and backups that were sorted or totalled by Department lose that grouping. Work Type is the nearest replacement, and is optional.
- Rolling back means restoring the columns from the Neon branch; the application code for Departments would have to come back from git history.
