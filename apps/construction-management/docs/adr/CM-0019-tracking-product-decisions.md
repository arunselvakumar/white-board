# CM-0019 — Tasks, Issues & Snags and Inspection Requests: product decisions for M8

- Status: accepted
- Date: 2026-10-14
- Tickets: CM-801 … CM-806 (M8)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0013](CM-0013-projects-structure-product-decisions.md) (`LocationRef`, structure usage, drawings, dashboard shell), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments, Gallery), [CM-0016](CM-0016-daily-site-work-product-decisions.md) (worksheets, numbering, back-dated entry)

`modules/05` ends with sixteen open questions, and its "Rebuild recommendations" ask for more than the legacy product did. The owner answered four before M8 started:

- **Baseline and progress** (open questions 1, 3, 4): a **frozen baseline** with re-baselining and its history; earned value from completed quantity; Project Progress % **weighted by Total Price** (§3, §4).
- **Worksheets feed tasks** (open question 10): a Daily Worksheet can name a Task, and its work quantity counts as progress when the units match (§6).
- **Approve and Reject** (open questions 5, 12): on Issues & Snags they **verify** a solved issue or **reopen** it; on Tasks they gate nothing (§8).
- **Rejected inspections** (open question 6): final; the page offers **Raise re-inspection**, and the reject dialog can **also raise a snag** (§10).

Every other question is answered here with the default we recommend; the M8 handoff lists them again for the owner.

**Delivery.** One milestone, built on one branch and opened as a native GitHub stack of pull requests of at most 300 files each (CodeRabbit's limit), like M5–M7.

## Decisions

### 1. A `tracking` context; Issue Categories and Tags are masters

- Tasks, Issues & Snags and Inspection Requests live in `src/tracking`, Postgres schema `construction_tracking`, API prefix `/api/construction/tracking`, Prisma prefix `ConstructionTracking` (`03-target-architecture`).
- **Issue Categories** are a master in `construction_masters` (menu `masters.issue_categories`, already in the matrix). Every Company is seeded with the 14 of `modules/05`: Client, Communication, Compliance, Design, Environmental, Financial, Management, Operational, Other, Quality, RFI, Safety, Supply, Technical. A data migration seeds existing Companies. Categories can be renamed, disabled (they leave the pickers, old issues keep them) and deleted when unused (open question 16's twin).
- **Tags** are a master in `construction_masters` with a new menu **Tags** (`masters.tags`, CRUD) under Master records (open question 16). Names are unique per Company among live rows, case-insensitive. The Task form's tag picker can **create a tag inline** when the member holds Tags Create; otherwise it only picks.

### 2. Tasks: numbers, hierarchy, copy (open questions 7, 11)

- **Task No.** is a plain counter per Project (`1, 2, 3 …`, shown as `T-12`), never reused. It is not a numbering rule in Settings: legacy had none and nobody prints it on paper.
- **Three levels:** a task, its sub-tasks, and their sub-tasks. A fourth level is refused (`TASK_TOO_DEEP`). Order among siblings is `sort_order`.
- **A task with sub-tasks is a summary task.** Its dates, Total Price, progress and status roll up from its sub-tasks (the same weighting as §3); its own work quantity, price and progress are not entered and the form hides them. Progress updates go on leaf tasks only (`TASK_IS_SUMMARY`).
- **Copy task** ("Paste Task below" in legacy) inserts a copy right after the original at the same level: every field and its sub-tasks, with progress, activity, actuals and the baseline left out (the copy gets its own baseline from its dates).
- **Delete** (single or bulk, Task Delete) is soft and takes the task's sub-tasks with it; the confirmation names how many. A task named by a Daily Worksheet cannot be deleted (409 `TASK_IN_USE`, `details.worksheetCount`): unlink the worksheets first. Bulk delete is all or none and the 409 lists every task in use.

### 3. Baseline, actuals, status (owner; open questions 1, 2)

- **Planned dates** are Start Date and Due Date (Due ≥ Start). They stay editable.
- **The baseline is frozen.** When a task first has both planned dates, its baseline is copied from them and does not move when the planned dates change. **Re-baseline** (Task Update, with a reason) copies the current planned dates into a new baseline; every baseline is kept in `task_baselines` with its version, reason, who and when, and the task shows the latest. A summary task's baseline is the span of its sub-tasks' baselines.
- **Baseline Duration** = baseline end − start + 1 (calendar days). **Variance** = (actual end, or the forecast end = the later of today and the due date while open) − baseline end, in days; positive is late.
- **Actual Start** is the date of the first progress update; **Actual End** is the date the task reached 100 % or was marked completed. Reopening clears Actual End.
- **Status is derived on read, never stored** (open question 2): Completed when progress is 100 %; otherwise **Delayed** when the Company's today is after the Due Date; otherwise In Progress when progress > 0; otherwise Not Started. "Delayed" therefore never loses history, and no job has to flip it. Filters and dashboard counts compute it in SQL from the same rule (`taskStatusSql`).
- **Tasks are not in back-dated entry control** (as legacy), but a progress update cannot be dated in the future.

### 4. Progress and earned value (owner; open questions 3, 4, 9)

- **A task with a work quantity** (Total work + unit) takes progress as **work done in this update** (an increment in the task's unit). Completed Work = Σ updates; progress % = min(100, Completed Work ÷ Total work × 100). Work beyond the total is allowed (an overrun is shown, progress stays 100 %).
- **A task without a work quantity** takes progress as the **new percentage** (0–100) on each update.
- **Mark As Completed** records an update that brings the task to 100 % on the chosen date (default today): the remaining quantity for a quantity task, 100 for a percent task. A completed task **reopens** when its progress falls below 100 %: a lower percentage on a percent task, or an edited or deleted update on a quantity task.
- **Completed Price (earned value)** = Total Price × progress %. Prices are paise; Total Price, Completed Price and every value total need the Task **Financial** flag (null without it).
- **Project Progress %** = Σ (weight × progress %) ÷ Σ weight over the Project's live **leaf** tasks, where the weight is the Total Price **when every leaf task has one**, and otherwise the planned duration in days (a task without dates weighs 1). The dashboard says which weighting it used. A Project with no tasks has no progress (the card shows no bar, as in CM-0013).
- **A progress update** has a date, the quantity or percentage, a remark and photos (images only, through the attachments service; they join the Gallery). Updates can be edited or deleted by their author or a member with Task Update; totals recompute.
- **The activity feed** (`task_activities`) is written by the server on every change: created, edited (with the fields that changed), assignees changed, re-baselined, progress recorded / edited / deleted, completed, reopened, sub-task added, copied, and progress from a worksheet. It is append-only.

### 5. Task fields and visibility

- Fields: name (required), description, assignees (Team Members on the Project), Start / Due Date, Priority (High / Medium / Low), a `LocationRef` (CM-403) plus extra **locations** of the same Wing (`modules/05` "Locations" plural: a list of refs), Department, Contractor, Tags, Total work (quantity + unit; the unit is required with a quantity), Total Price.
- **View all (V):** without it a member sees only the tasks they created or are assigned to, and the ancestors of those (shown greyed so the tree makes sense).
- **Approve (A) and Reject (J) on Task gate nothing** in M8 (owner). They stay in the matrix for task-completion approval, should it come.

### 6. Daily Worksheets name a Task and feed its progress (owner; open question 10)

- A Daily Worksheet gets an optional **Task** picker: live **leaf** tasks of the worksheet's Project, searchable by number and name. The id is stored on `construction_site_work.worksheets.task_id` without a foreign key (different schema).
- **When the task has a work quantity and the worksheet's Approx Work Done is in the same unit**, the worksheet posts a progress update (source `worksheet`, the worksheet's id, its date and quantity) in the same transaction, through a `TaskProgressPosting` port that `src/composition` implements on the tracking tables. Editing the worksheet replaces its update; deleting or **rejecting** it removes it; un-rejecting (editing back to pending) posts it again. Pending and approved sheets count.
- Otherwise the worksheet is only **linked**: the form says "Linked only — the unit differs from the task's (cum)" or "Linked only — the task tracks percent".
- Worksheet-sourced updates appear in the task's feed with the worksheet number and cannot be edited on the task.

### 7. Issues & Snags (open questions 12, 14)

- **Numbers:** a new numbering module **Issue & Snag (ISS)** in Settings → Sequence IDs, like Hindrances in M6 (open question 14).
- Fields: Issue Date (required, back-dated control Site → Issues & Snags), Details (required), Priority (High `#F90B0B`, Medium `#FF9900`, Low `#FCF200`, shown with a label, never colour alone), Category (an enabled Issue Category), Department, **Contractor** (new: whose work the snag is; optional), Assign To (one Team Member on the Project), Due Date (≥ Issue Date), a `LocationRef`, images and attachments.
- **Stored status:** `open`, `solved`, `closed`. **Delayed is derived** on read: open and the Company's today is after the Due Date (open question 2). The screens show Pending / Delayed / Solved / Closed.
- **Save** creates it `open`; **Save & Mark As Solved** (Create + Update) creates it `solved`.
- **Updates** (the Progress thread): a comment, images, or both; anyone who can read the issue and holds Update can post one. Editing is not offered (it is a log); the author can delete their own within 24 hours.

### 8. Issue verification: Approve closes, Reject reopens (owner; open questions 5, 12)

- **Mark As Solved** (Update; single or bulk) records Solved On (server time) and Solved By. Bulk applies to every selected open issue; issues already solved or closed are skipped and counted.
- **Verify** (Approve flag): `solved → closed`, recording Closed On / By. Single or bulk.
- **Reopen** (Reject flag) with a required reason: `solved` or `closed` → `open`, clearing Solved / Closed and keeping the history in the feed (`issue_events`).
- Without V a member sees only issues they created or are assigned to.

### 9. Inspection Requests (open question 13)

- **Request No** from the existing **InspectionRequest** numbering module (`IR/26-27/00001`, project rules honoured), unique and never reused.
- Fields: Inspection Date (required, back-dated control Site → Inspection Request), Inspection Time (optional), Department, Contractor, **Inspector** (Request Assign To: a Team Member on the Project; **optional**, open question 13), Description of work (required), a `LocationRef`, **linked Drawings** of the Project (picked from Project Drawings), and drawings / site photographs as files.
- **Status:** Pending for approval → Approved | Rejected. **Anyone with Approve** may approve and anyone with Reject may reject — not only the inspector (open question 13). A reason is required to reject. Bulk approve and bulk reject apply one decision (and one reason) to the selected **pending** requests; others are skipped and counted.
- **Observations** (text, images, files; by, on) can be added while pending by the inspector or anyone with Update. **Remarks** (text) can be added at any time by anyone who can read it.
- A decided request is read-only except for remarks, and **cannot be deleted** (409 `INSPECTION_DECIDED`); a pending one can be deleted with Delete. Inspection Request has no V flag: every member with Read sees all of a Project's requests.
- A linked drawing cannot be deleted while a live inspection names it (409, as CM-0013 promised for albums), through a `DrawingUsage` port the projects context asks and `src/composition` answers.

### 10. After a rejection: re-inspection and a snag (owner; open question 6)

- A rejected request stays **Rejected**. Its page offers **Raise re-inspection** (Create): a new request, prefilled from the rejected one (department, contractor, inspector, description, location, linked drawings; not files or observations), linked by `reinspection_of_id`. Each page links to the other.
- The reject dialog has **Also raise a snag** (shown when the member holds Issues & Snags Create): one issue in the same transaction, category **Quality**, the inspection's contractor, department, location, today's date, details = "Inspection IR/… rejected: <reason>", assigned to nobody, linked by `source_inspection_id`. In bulk reject, one snag per rejected request.

### 11. Shared pieces

- **Files** on all three use the attachments service (CM-0014) with the `images` policy for photos and `pdf_or_image` for attachments, recorded in `construction_tracking.document_files` (one table, keyed by document type and id, optionally an update / observation id). Images and PDFs join the Project **Gallery** through `ProjectMediaAttached` / `ProjectMediaRemoved`, with source modules `task`, `issue` and `inspection`.
- **Structure usage:** floors, units, Wings and Locations named by a live task, issue or inspection can no longer be removed (`PrismaStructureUsage` grows). Departments, Contractors, Measurement Units, Issue Categories and Tags that tracking uses cannot be deleted (they can be disabled where the master allows).
- **Events** (in-process, no listeners until M9 notifications): `TaskAssigned`, `TaskProgressRecorded`, `TaskCompleted`, `IssueAssigned`, `IssueUpdated`, `IssueSolved`, `IssueReopened`, `InspectionRequested`, `InspectionDecided`. They carry the ids M9 needs to notify the people `modules/05` names.
- **Audit:** every command writes an audit event, like earlier contexts.

### 12. Gantt (T5)

- A **read-only Gantt** on the Task page: rows are the task tree (expand / collapse), bars are planned dates; the baseline is a thin bar beneath; the actual span is shaded to the progress %; Today is a line. Day / Week / Month scales. Clicking a row opens the task. Built in the app (CSS grid + SVG), no Gantt library.
- No dependencies (predecessors / successors), no drag-to-reschedule, no export in M8 (recommendation 4 is a later milestone).
- On a phone the chart scrolls sideways inside its card; the page does not.

### 13. Import (open question 8)

- **Import** (Task Create) takes the sample `.xlsx` the page offers. Columns: **Ref**, **Parent Ref**, **Task Name\***, Description, Start Date, Due Date, Priority, Assignees (names, comma-separated), Department, Contractor, Tags (comma-separated), Total Work, Unit, Total Price.
- Ref / Parent Ref are any text unique within the file and rebuild the hierarchy (at most three levels). Masters match **by name, case-insensitive**; an assignee must match exactly one Team Member on the Project. Unknown tags are created when the member holds Tags Create, else refused.
- **All or nothing**, at most 1,000 rows: any error returns every row's errors and nothing is saved (like M7's transaction import). Imported tasks start Not Started with their baseline from their dates. Locations are not imported.

### 14. Dashboard and reports (open question 15)

- **Project Dashboard** (the M4 stubs go): the KPI tiles **Pending Issues & Snags** (open, including delayed) and **Pending Inspections**; a **Task** section (Project Progress % gauge with the weighting named, Value Earned By Task with Financial, counts by status, the most delayed tasks); an **Issue & Snag** section (by status, by priority, by category, assignee-wise by status); an **Inspection Request** section (total / approved / pending / rejected and the **Success Rate** = Approved ÷ (Approved + Rejected), shown as "—" with no decided request). All follow the dashboard's duration filter (by created date for tasks, Issue Date, Inspection Date).
- **Project card** progress bar (CM-0013 waited for this): Project Progress % from §4.
- **Reports** (Excel + PDF, report jobs like M6/M7): **Task Report** (Task No., name, level, assignees, planned / baseline / actual dates, variance, progress %, status, location, department, contractor; prices with Financial), **Issue & Snag** (number, date, details, priority, category, department, contractor, assignee, due date, location, status, solved on / by, closed on), **Inspection Request** (number, date / time, department, contractor, inspector, description, location, status, decided by / on, reason, re-inspection of).
- **Task Progress Report** in Progress Reports (the M6 placeholder): a PDF per Project for a date range, grouped by location, each task's progress at the start and end of the range and the work done in it.

### 15. Not in M8

- Predecessors / successors, a working calendar, drag-to-reschedule, Gantt export (recommendation 4).
- BOQ items, Measurement Book, JMR sign-off, RA bills, and inspections gating task completion or bills (recommendations 1, 2, 5; M11).
- Inspection checklists / ITPs and the cube register link (recommendation 6).
- DLP phase, handover dates, allottee snags (recommendation 7; M10–M12).
- Pinning issues or inspections to a point on a drawing (recommendation 9).
- Notifications and the "became delayed" push (M9), offline capture and WhatsApp approval (M12).
- SLA by priority (recommendation 8).
- Wing-level RERA progress (recommendation 3; M11), though §4's rollup makes it a query.

## Consequences

- Status and Delayed are never stale and need no job, at the cost of computing them in every list query; `taskStatusSql` and `issueStatusSql` keep the SQL and the TypeScript rule in one place and are tested against each other.
- Price weighting falls back to duration as soon as one leaf task has no price, so a Project's progress number can change weighting when someone adds an unpriced task. The dashboard names the weighting so the change is visible.
- The worksheet roll-up crosses two contexts in one transaction through a port, like M7's account posting; site-work never reads tracking tables.
- A task named by a worksheet cannot be deleted, so cleaning up a schedule may mean unlinking worksheets first.

## Considered options

- **Editable baseline fields** (legacy): rejected by the owner; a baseline you can edit is not a baseline.
- **Simple average for Project Progress %**: rejected by the owner; a slab and a door would count the same.
- **Storing Delayed** with a nightly job: rejected; the status would be wrong between runs and bulk updates would overwrite history.
- **Legacy-only A / J on issues** (A = Mark As Solved, no reopen): rejected by the owner in favour of verify / reopen.
- **Approval of task completion** (Task A / J): not chosen by the owner for M8.
- **A Gantt library** (dhtmlx, frappe-gantt): rejected; a read-only chart is small, and the libraries bring their own styling and licences.
