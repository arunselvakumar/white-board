# 05 — Tasks, Issues & Snags, Inspection Requests

This module covers planning and quality control on a project, beyond the daily log:

- **Task.** The project schedule. Tasks and sub-tasks have assignees, location, department, contractor and tags. They carry baseline vs actual dates and a work quantity with price, which gives an **earned value**. Progress is updated over time, there is a Gantt view, and tasks can be imported from Excel. The Project Dashboard's progress gauge and "Value Earned By Task" come from here.
- **Issues & Snags.** The defect and problem register. Each issue has a priority, a category, an assignee, a due date and a location. People post progress updates with photos until it is marked **Solved**.
- **Inspection Request.** A numbered request from the site (usually for a contractor's work) asking an inspector to check work at a location. The inspector records observations with images, then **approves** or **rejects** it with a reason. The approval rate is a quality KPI.

**Who uses it**

| Role                                              | Use                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Project Manager / Planning (Planning department)  | Builds the task list and baseline, imports schedules, watches the Gantt, earned value and delays.                             |
| Site Engineer / Site Supervisor                   | Updates task progress, raises issues and snags, raises inspection requests, posts photo updates.                              |
| Contractor's representative                       | The party behind "Contractor" on tasks and inspections. They are not a User in legacy, but an inspection is about their work. |
| Quality Control / Structural Engineer / Architect | Assigned as the inspector. Records observations and approves or rejects. Assigned to design or quality issues.                |
| Owner / Admin                                     | Reads KPIs: Pending Issues & Snags, Pending Inspections, Success Rate, Project Progress %.                                    |
| Accountant                                        | Sees task prices and earned value only with the F permission (Task #53 carries F).                                            |

---

## Legacy behaviour

### Navigation

- Project Home tiles **Task** (menu #53), **Issues and snags** (#51) and **Inspection Request** (#54).
- Project Dashboard (`#/chartsDashboard`):
  - KPI tiles: **Pending Issues & Snags**, **Pending Inspections**.
  - **Task** section: Project Progress % gauge (start/end date), Value Earned By Task (task value vs earned value), Filtered By Status (counts for Not Started / In Progress / Delayed / Completed).
  - **Issue And Snag** section: status charts, Assignee-wise issue chart.
  - **Inspection Request** section: total / approved / pending / rejected, and a **Success Rate** gauge.
- Project Reports tile (#20) report set includes **Task Report**, **Issue & Snag**, **Inspection Request** (module 11).
- Master Records: **Issue Categories** (`#/addIssueSnagCat`, menu #72). Tags come from a Tag master (`Tag/Combo`); there is no Master tile for tags in the permission map, so tags are probably created inline (inferred).
- Settings: Sequence ID **InspectionRequest** (module 12). Back-dated control "Site" group: **Issues & Snags**, **Inspection Request**. Tasks are not listed in the back-dated groups.

### Task screens

| Route / screen                     | Behaviour                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task list                          | The project's tasks with Task No., name, assignees, dates, progress % and status. Supports **bulk delete** (`tasks/bulk-delete`) and **Import** from Excel (`tasks/import`). Filtering by status is implied by the dashboard (inferred).                                                                                          |
| `#/taskAddEdit`                    | Task Name\*, Description, Assign To (multi-select team members), Start Date, Due Date, Priority (High / Medium / Low), Location Type → Wing → Locations, Department, Contractor, Tags (multi-select, Tag master), **Total work** (quantity + unit), **Total Price**. Sub-task section: **Add Sub-Task** and **Paste Task below**. |
| Task detail                        | Task No., Status, Progress %, Baseline Start / End / Duration / Variance, Actual Start / End, Duration, Completed Work / Completed Price, sub-tasks, **Task activity feed**. Actions: **Update Task Progress**, **Mark As Completed**, Edit, Delete.                                                                              |
| Update Task Progress               | Records progress (percent or completed work quantity) at a point in time and adds an entry to the activity feed. Whether it accepts a photo or comment is not captured in the notes.                                                                                                                                              |
| `#/taskGantt` (`tasks/gantt`)      | Gantt chart of tasks and sub-tasks with baseline vs actual bars (inferred from the baseline fields).                                                                                                                                                                                                                              |
| Task Report / Task Progress Report | Task Report is in the project report set. The Task Progress Report (by location, percent) can also be generated asynchronously from Progress Report (module 04).                                                                                                                                                                  |

### Issues & Snags screens

| Route / screen            | Behaviour                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issues list               | Issues with priority colour chips, status (Pending / Delayed / Solved), assignee and due date. **Bulk mark resolved** (`IssueSnag/BulkMarkAsResolved`). Filters for status, priority, category, assignee and date are inferred from the report and chart dimensions.                                                            |
| `#/issuesSnagAddUpdate`   | Issue Date\*, Department, **Issue Assign To** (team member), Due Date, **Issue Details** (text), **Priority** (High = red `#F90B0B`, Medium = orange `#FF9900`, Low = yellow `#FCF200`), **Category** (Issue Categories master), Location Type / Location, Images, Attachment. Buttons: **Save** and **Save & Mark As Solved**. |
| Issue detail              | Created By, Assign to, **Progress / Add Update** (comment thread with images; `IssueSnag/Comment`), **Solved On**, status. Action **Mark As Solved** (`IssueSnag/MarkAsResolved`).                                                                                                                                              |
| Issue & Snag report       | Report set item (PDF/Excel).                                                                                                                                                                                                                                                                                                    |
| Assignee-wise issue chart | Dashboard chart: issues per assignee by status.                                                                                                                                                                                                                                                                                 |

### Inspection Request screens

| Route / screen            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspection list           | Requests with Request No, date, contractor, inspector and status. **Bulk approve / reject** (`InspectionRequest/BulkSetApprovalStatus`).                                                                                                                                                                                                                                                                         |
| `#/inspectionAddNew`      | Inspection Date\*, Inspection Time, Department, Contractor, **Request Assign To** (the inspector), **Description of work** (Work Details), Location Type / Location, **Upload Drawings and site photographs** (files; drawings may also be picked from project drawings through `Drawing/Combo` / `TestingItemDrawing/Combo`).                                                                                   |
| Inspection detail         | Request No (Sequence ID InspectionRequest), Status (**Pending for approval** / **Approved** / **Rejected**), Created On / By, Approved By / On, Rejected By / For / On, **Observations** (Observations By / On, Inspection Images, files), **Remarks list** (`InspectionRequest/Remark`), **Reject Reason**. Actions: Approve, Reject (`InspectionRequest/SetApprovalStatus`), add an observation, add a remark. |
| Inspection Request Report | Report set item.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Dashboard                 | total / approved / pending / rejected, Success Rate gauge.                                                                                                                                                                                                                                                                                                                                                       |

### Cross-cutting list behaviour

Assembled from the other legacy lists in the app; the notes do not capture these screens directly.

| Concern             | Task                                                                              | Issues & Snags                                                                                                 | Inspection Request                                                 |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Search              | Task name / Task No. (inferred)                                                   | Issue details (inferred)                                                                                       | Request No / description (inferred)                                |
| Status filter       | Not Started / In Progress / Delayed / Completed (shown on the dashboard)          | Pending / Delayed / Solved                                                                                     | Pending for approval / Approved / Rejected                         |
| Other filters       | Assignee, Priority, Tags, Department, Contractor, Location, date range (inferred) | Priority, Category, Assignee, Department, Location, date range (inferred from the report and chart dimensions) | Department, Contractor, Inspector, Location, date range (inferred) |
| Multi-select action | Bulk delete                                                                       | Bulk mark resolved                                                                                             | Bulk approve / reject                                              |
| Import              | Excel (`tasks/import`)                                                            | —                                                                                                              | —                                                                  |
| Alternative view    | Gantt (`#/taskGantt`)                                                             | Assignee-wise chart                                                                                            | Success-rate gauge                                                 |
| Numbering           | Task No. (internal)                                                               | none evidenced                                                                                                 | Sequence ID `InspectionRequest`                                    |
| Back-dated control  | not listed                                                                        | Site → Issues & Snags                                                                                          | Site → Inspection Request                                          |
| Comment / feed      | Task activity feed                                                                | Progress / Add Update (comments with images)                                                                   | Observations + Remarks list                                        |
| Visibility scoping  | V flag present (view all)                                                         | V flag present                                                                                                 | no V flag                                                          |

### Dashboard KPI definitions (as displayed; formulas inferred)

| KPI / chart               | Section            | Definition                                                                                                |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| Project Progress %        | Task               | A gauge between the project start and end dates. Value is the rollup of task progress % (weighting open). |
| Value Earned By Task      | Task               | Σ Total Price (task value) vs Σ Completed Price (earned value), per task.                                 |
| Filtered By Status        | Task               | Count of tasks per status.                                                                                |
| Pending Issues & Snags    | KPI tile           | Count of issues with status Pending or Delayed in the filter duration.                                    |
| Issue status charts       | Issue And Snag     | Count per status (and per priority / category, inferred).                                                 |
| Assignee-wise issue chart | Issue And Snag     | Per assignee: count by status.                                                                            |
| Pending Inspections       | KPI tile           | Count of requests with status Pending for approval.                                                       |
| Inspection totals         | Inspection Request | Total, Approved, Pending, Rejected.                                                                       |
| Success Rate              | Inspection Request | Approved ÷ (Approved + Rejected) × 100 (inferred, because pending requests have no outcome yet).          |

The dashboard filter duration defaults to the last 1 year and applies to every KPI above.

---

## Entities & fields

### Task

| Field                 | Type                                             | Required    | Notes                                                                                                        |
| --------------------- | ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------ |
| id                    | uuid                                             | yes         |                                                                                                              |
| projectId             | FK → Project                                     | yes         |                                                                                                              |
| taskNo                | string                                           | yes         | "Task No.". Not a configurable Sequence ID in module 12, so probably a plain per-project counter (inferred). |
| parentTaskId          | FK → Task                                        | no          | Set for sub-tasks. How deep nesting can go is open.                                                          |
| sortOrder             | int                                              | yes         | For "Paste Task below" and Gantt order (inferred).                                                           |
| name                  | string                                           | yes         | "Task Name\*".                                                                                               |
| description           | text                                             | no          |                                                                                                              |
| assigneeIds           | FK[] → TeamMember                                | no          | "Assign To" multi-select.                                                                                    |
| startDate             | date                                             | no          | Planned start. Doubles as the baseline start when the baseline is captured (inferred).                       |
| dueDate               | date                                             | no          | Planned end. Must be ≥ startDate.                                                                            |
| priority              | enum{High, Medium, Low}                          | no          |                                                                                                              |
| locationType          | enum{Wing, Amenity, CommonDevelopment}           | no          | As in module 04.                                                                                             |
| wingId                | FK → Wing                                        | no          |                                                                                                              |
| locationIds           | FK[] → Floor/Unit/Location                       | no          | "Locations" (plural).                                                                                        |
| departmentId          | FK → Department                                  | no          |                                                                                                              |
| contractorId          | FK → Contractor                                  | no          |                                                                                                              |
| tagIds                | FK[] → Tag                                       | no          | `Tag/Combo`.                                                                                                 |
| totalWorkQty          | decimal(14,3)                                    | no          | "Total work" quantity.                                                                                       |
| totalWorkUomId        | FK → MeasurementUnit                             | conditional | Required if qty is given (inferred).                                                                         |
| totalPrice            | decimal(14,2)                                    | no          | "Total Price". The planned value of the task. Visible only with F (inferred).                                |
| completedWorkQty      | decimal(14,3)                                    | derived     | Sum of progress updates (inferred).                                                                          |
| completedPrice        | decimal(14,2)                                    | derived     | Earned value = totalPrice × completedWorkQty ÷ totalWorkQty, or totalPrice × progress% (inferred).           |
| progressPct           | decimal(5,2)                                     | yes         | 0–100.                                                                                                       |
| baselineStart         | date                                             | no          |                                                                                                              |
| baselineEnd           | date                                             | no          |                                                                                                              |
| baselineDuration      | int (days)                                       | derived     | baselineEnd − baselineStart (+1, inferred).                                                                  |
| baselineVariance      | int (days)                                       | derived     | Actual or forecast end − baselineEnd (inferred).                                                             |
| actualStart           | date                                             | no          | Set at the first progress update (inferred).                                                                 |
| actualEnd             | date                                             | no          | Set by Mark As Completed (inferred).                                                                         |
| duration              | int (days)                                       | derived     |                                                                                                              |
| status                | enum{NotStarted, InProgress, Delayed, Completed} | yes         | Derived; see the rules.                                                                                      |
| createdById           | FK → TeamMember                                  | yes         | Shown in the activity feed (inferred).                                                                       |
| createdAt / updatedAt | datetime                                         | yes         |                                                                                                              |

### TaskProgressUpdate

| Field            | Type            | Required    | Notes                                  |
| ---------------- | --------------- | ----------- | -------------------------------------- |
| id               | uuid            | yes         |                                        |
| taskId           | FK → Task       | yes         |                                        |
| date             | date            | yes         | (inferred)                             |
| progressPct      | decimal(5,2)    | conditional |                                        |
| completedWorkQty | decimal(14,3)   | conditional | One of the two is required (inferred). |
| remark           | text            | no          | (inferred)                             |
| images           | file[]          | no          | (inferred)                             |
| byId             | FK → TeamMember | yes         |                                        |

### TaskActivity (activity feed)

| Field   | Type                                                                                 | Required | Notes                           |
| ------- | ------------------------------------------------------------------------------------ | -------- | ------------------------------- |
| id      | uuid                                                                                 | yes      |                                 |
| taskId  | FK → Task                                                                            | yes      |                                 |
| type    | enum{Created, Updated, ProgressUpdated, Completed, AssigneeChanged, SubTaskAdded, …} | yes      | Value set inferred.             |
| payload | json                                                                                 | no       | Before/after values (inferred). |
| byId    | FK → TeamMember                                                                      | yes      |                                 |
| at      | datetime                                                                             | yes      |                                 |

### Tag

| Field     | Type         | Required | Notes                          |
| --------- | ------------ | -------- | ------------------------------ |
| id        | uuid         | yes      |                                |
| companyId | FK → Company | yes      |                                |
| name      | string       | yes      | Unique per company (inferred). |

### TaskImportRow (Excel import template — columns inferred from the form)

| Field                                                                                                                        | Type       | Required | Notes                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------- |
| taskName                                                                                                                     | string     | yes      |                                        |
| parentTaskNo / level                                                                                                         | string/int | no       | To rebuild the hierarchy (inferred).   |
| description, startDate, dueDate, priority, assignees, department, contractor, location, tags, totalWorkQty, unit, totalPrice | various    | no       | Matched to masters by name (inferred). |

### IssueSnag

| Field                        | Type                           | Required       | Notes                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                           | uuid                           | yes            |                                                                                                                                                                                                       |
| projectId                    | FK → Project                   | yes            |                                                                                                                                                                                                       |
| issueNo                      | string                         | no             | No Sequence ID exists for issues. An internal id is likely shown (inferred).                                                                                                                          |
| issueDate                    | date                           | yes            | "Issue Date\*". Back-dated control: Issues & Snags.                                                                                                                                                   |
| departmentId                 | FK → Department                | no             |                                                                                                                                                                                                       |
| assigneeId                   | FK → TeamMember                | no             | "Issue Assign To" (single).                                                                                                                                                                           |
| dueDate                      | date                           | no             | ≥ issueDate (inferred). Drives the Delayed status.                                                                                                                                                    |
| details                      | text                           | yes (inferred) | "Issue Details". An issue with no text is meaningless.                                                                                                                                                |
| priority                     | enum{High, Medium, Low}        | no             | Colours: #F90B0B / #FF9900 / #FCF200.                                                                                                                                                                 |
| categoryId                   | FK → IssueCategory             | no             | Seed list: Client, Communication, Compliance, Design, Environmental, Financial, Management, Operational, Other, Quality, RFI, Safety, Supply, Technical. Disabled categories are hidden from pickers. |
| locationType + location refs | as module 04                   | no             | Wing/Floor/Unit, Amenity, Common Development.                                                                                                                                                         |
| images                       | file[] (image)                 | no             |                                                                                                                                                                                                       |
| attachments                  | file[]                         | no             | "Attachment".                                                                                                                                                                                         |
| status                       | enum{Pending, Delayed, Solved} | yes            | Delayed is derived (Pending and today > dueDate) (inferred).                                                                                                                                          |
| solvedOn                     | datetime                       | conditional    | Set when marked solved.                                                                                                                                                                               |
| solvedById                   | FK → TeamMember                | conditional    | (inferred)                                                                                                                                                                                            |
| createdById                  | FK → TeamMember                | yes            | "Created By".                                                                                                                                                                                         |
| createdAt / updatedAt        | datetime                       | yes            |                                                                                                                                                                                                       |

### IssueSnagUpdate (Progress / Add Update)

| Field   | Type            | Required    | Notes                               |
| ------- | --------------- | ----------- | ----------------------------------- |
| id      | uuid            | yes         |                                     |
| issueId | FK → IssueSnag  | yes         | `IssueSnag/Comment`.                |
| comment | text            | conditional | Text or images required (inferred). |
| images  | file[]          | no          | "comments with images".             |
| byId    | FK → TeamMember | yes         |                                     |
| at      | datetime        | yes         |                                     |

### IssueCategory (master, module 02 — referenced here)

| Field    | Type   | Required | Notes                    |
| -------- | ------ | -------- | ------------------------ |
| id       | uuid   | yes      |                          |
| name     | string | yes      |                          |
| disabled | bool   | yes      | `IssueCategory/Disable`. |

### InspectionRequest

| Field                        | Type                                         | Required       | Notes                                                                                                  |
| ---------------------------- | -------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| id                           | uuid                                         | yes            |                                                                                                        |
| projectId                    | FK → Project                                 | yes            |                                                                                                        |
| requestNo                    | string                                       | yes            | Sequence ID **InspectionRequest** (prefix / project id / start number, module 12). Unique per company. |
| inspectionDate               | date                                         | yes            | "Inspection Date\*". Back-dated control: Inspection Request.                                           |
| inspectionTime               | time                                         | no             |                                                                                                        |
| departmentId                 | FK → Department                              | no             |                                                                                                        |
| contractorId                 | FK → Contractor                              | no             | Whose work is inspected.                                                                               |
| inspectorId                  | FK → TeamMember                              | no             | "Request Assign To". Whether it is required is open.                                                   |
| workDescription              | text                                         | yes (inferred) | "Description of work (Work Details)".                                                                  |
| locationType + location refs | as module 04                                 | no             |                                                                                                        |
| drawingIds                   | FK[] → Drawing                               | no             | Linked project drawings (`Drawing/Combo`, `TestingItemDrawing/Combo`) (inferred).                      |
| files                        | file[]                                       | no             | "Upload Drawings and site photographs".                                                                |
| status                       | enum{PendingForApproval, Approved, Rejected} | yes            |                                                                                                        |
| createdById / createdAt      | FK → TeamMember / datetime                   | yes            | "Created On / By".                                                                                     |
| approvedById / approvedAt    | FK → TeamMember / datetime                   | conditional    | "Approved By / On".                                                                                    |
| rejectedById / rejectedAt    | FK → TeamMember / datetime                   | conditional    | "Rejected By / On".                                                                                    |
| rejectedFor / rejectReason   | text                                         | conditional    | "Rejected For", "Reject Reason". Required on reject (inferred).                                        |

### InspectionObservation

| Field               | Type                   | Required    | Notes                |
| ------------------- | ---------------------- | ----------- | -------------------- |
| id                  | uuid                   | yes         |                      |
| inspectionRequestId | FK → InspectionRequest | yes         |                      |
| observation         | text                   | conditional | (inferred)           |
| images              | file[]                 | no          | "Inspection Images". |
| files               | file[]                 | no          |                      |
| byId                | FK → TeamMember        | yes         | "Observations By".   |
| at                  | datetime               | yes         | "Observations On".   |

### InspectionRemark

| Field               | Type                   | Required | Notes                       |
| ------------------- | ---------------------- | -------- | --------------------------- |
| id                  | uuid                   | yes      |                             |
| inspectionRequestId | FK → InspectionRequest | yes      | `InspectionRequest/Remark`. |
| remark              | text                   | yes      |                             |
| byId                | FK → TeamMember        | yes      |                             |
| at                  | datetime               | yes      |                             |

---

## Workflows & states

### T1 — Plan tasks

1. Task tile → Add (`#/taskAddEdit`). Enter the name, assignees, dates, priority, location, department, contractor and tags, then the total work quantity and unit and the total price.
2. Add sub-tasks (**Add Sub-Task**), or use **Paste Task below** to insert a copied task after the current one.
3. Alternatively, **Import** an Excel schedule (`tasks/import`).
4. Capture the baseline: Baseline Start/End are recorded (from the planned dates, or entered separately; see Open questions).
5. View the plan on the **Gantt** (`#/taskGantt`).

### T2 — Execute and update

1. The assignee opens the task → **Update Task Progress**: percent and/or completed work quantity.
2. The first update sets Actual Start (inferred), and the status becomes In Progress.
3. Completed Work / Completed Price (earned value) recalculate. The dashboard's Value Earned By Task and Project Progress % update.
4. If today is past the Due Date and progress is below 100%, the status becomes **Delayed** (inferred).
5. **Mark As Completed** sets progress to 100%, sets Actual End, and the status becomes Completed. Baseline Variance is computed.
6. Every change is written to the Task activity feed.

```mermaid
stateDiagram-v2
    [*] --> NotStarted: created
    NotStarted --> InProgress: first progress update / actual start
    NotStarted --> Delayed: today > due date, progress 0 (inferred)
    InProgress --> Delayed: today > due date, progress < 100 (inferred)
    Delayed --> InProgress: due date extended (inferred)
    InProgress --> Completed: Mark As Completed / progress = 100
    Delayed --> Completed: Mark As Completed
    Completed --> InProgress: progress reduced / reopened (inferred)
    Completed --> [*]
```

### T3 — Bulk delete / report

1. Multi-select tasks → **Bulk delete** (`tasks/bulk-delete`) → confirmation. Behaviour for sub-tasks of a deleted parent is open.
2. Task Report (report set) or Task Progress Report (async, module 04).

### T4 — Import a schedule

1. Task list → Import. Download the sample, fill it in, and upload the `.xlsx` (`tasks/import`).
2. The server validates each row: name required, dates parse, masters (assignee, department, contractor, unit, tags) match by name (inferred).
3. Valid rows become tasks, with a hierarchy if the template carries parent references (inferred). Invalid rows are reported back.
4. Imported tasks start as Not Started. Baselines come from the imported dates (inferred).

### T5 — Work in the Gantt

1. Task → Gantt (`#/taskGantt`, data from `tasks/gantt`).
2. Bars show planned (or baseline) and actual spans for tasks and sub-tasks, coloured by status (inferred).
3. Whether you can drag to reschedule in the Gantt is not evidenced. Editing happens through `#/taskAddEdit`.

### I1 — Raise and resolve an issue or snag

1. Issues and snags → Add (`#/issuesSnagAddUpdate`). Enter Issue Date\*, details, priority, category, department, assignee, due date, location, images and attachments.
2. **Save** gives status Pending. **Save & Mark As Solved** records an issue that was fixed on the spot.
3. The assignee is notified (N flag) (inferred).
4. Participants **Add Update** (comment and images) on the Progress thread.
5. Past the due date, the status shows **Delayed**.
6. **Mark As Solved** sets Solved On and the status becomes Solved. Alternatively, multi-select → **bulk mark resolved**.

```mermaid
stateDiagram-v2
    [*] --> Pending: Save
    [*] --> Solved: Save & Mark As Solved
    Pending --> Delayed: today > due date (derived)
    Pending --> Solved: Mark As Solved / bulk resolve
    Delayed --> Solved: Mark As Solved / bulk resolve
    Solved --> Pending: reopen (not evidenced, inferred need)
    Solved --> [*]
```

### I2 — Review issues

1. Dashboard → Issue And Snag: status charts and the Assignee-wise chart show the backlog per person.
2. Reports → Issue & Snag report (PDF/Excel) for the chosen duration, with Organisation, Project and Address in the header.
3. Bulk-resolve closed-out items after a site walk (multi-select → bulk mark resolved).

### R1 — Inspection request

1. Inspection Request → Add (`#/inspectionAddNew`). Enter the date, time, department, contractor, inspector (Request Assign To), work description, location, and drawings/photos.
2. On save, a **Request No** is allocated from the InspectionRequest sequence and the status is **Pending for approval**. The inspector is notified (inferred).
3. The inspector records **Observations** (text, images, files). Anyone with access can add **Remarks**.
4. The inspector or an approver either **Approves** (Approved By/On is recorded) or **Rejects** with a reason (Rejected By/For/On and Reject Reason are recorded). Bulk approve/reject is available from the list.
5. After a rejection, the contractor fixes the work and a **new** request is raised (inferred; there is no resubmit state).
6. The dashboard Success Rate = Approved ÷ (Approved + Rejected) (inferred formula).

```mermaid
stateDiagram-v2
    [*] --> PendingForApproval: created (Request No allocated)
    PendingForApproval --> PendingForApproval: observation / remark added
    PendingForApproval --> Approved: approve (single or bulk)
    PendingForApproval --> Rejected: reject with reason (single or bulk)
    Approved --> [*]
    Rejected --> [*]
```

---

## Business rules & validations

**Task**

- Task Name is required. Due Date ≥ Start Date. Baseline End ≥ Baseline Start (inferred).
- If Total work quantity is entered, its unit is required. Completed work ≤ total work, unless overrun is allowed (open).
- Progress % is 0–100.
- Status derivation (inferred from the observed values):
  - Completed if progress = 100 or Mark As Completed.
  - Delayed if not completed and today > Due Date.
  - In Progress if progress > 0 or Actual Start is set.
  - Otherwise Not Started.
- Earned value (Completed Price) is proportional to completed work or progress. Project Progress % is a rollup of task progress, weighted by Total Price or by duration (open).
- Parent task progress and dates roll up from sub-tasks (inferred; legacy behaviour unknown).
- Total Price, Completed Price and Value Earned are gated by the Task F (financial) permission (inferred).
- Bulk delete needs D, and should require confirmation. Deleting a parent with sub-tasks must either cascade or be blocked (open).
- Import validates required columns and master-name matches, and reports per-row errors (inferred).
- Users without V (view all) see only the tasks assigned to or created by them (inferred from the V flag on #53).
- Tasks are **not** in back-dated entry control.

**Issues & Snags**

- Issue Date is required. Due Date ≥ Issue Date (inferred).
- Priority must be High, Medium or Low. Category must be an enabled Issue Category.
- Delayed is derived from the due date and is not set manually (inferred).
- Mark As Solved needs U, and possibly A (Issues #51 carries A and J; see Open questions). Bulk mark resolved is the same action over many issues.
- Solved On is set by the server at the time of marking.
- Back-dated control applies (Site → Issues & Snags).
- Users without V see only issues they created or are assigned to (inferred).

**Inspection Request**

- Inspection Date is required. The Request No is allocated on create from the **InspectionRequest** sequence: a project-specific rule if one exists, otherwise the default (for example `IR/26-27/PX/00001`). It is unique and never reused (inferred).
- Only users with Inspection Request A can approve, and only users with J can reject. Bulk approve and bulk reject check the same flags. A reject reason is required.
- Approved or Rejected requests are read-only, except for remarks (inferred).
- Bulk approve/reject applies one decision (and one reason for rejects) to every selected Pending request. Non-pending ones are skipped (inferred).
- Back-dated control applies (Site → Inspection Request).
- An Inspection Request should not be deletable once decided (inferred, for audit).

**Notifications (N flag; triggers inferred)**

- Task: someone is assigned (added to Assign To), progress is updated, the task becomes Delayed, or it is completed. Recipients are the assignees and the creator.
- Issue: it is assigned, an update or comment is added, it becomes Delayed (past the due date), or it is marked solved. Recipients are the assignee and the creator.
- Inspection: it is created (to the inspector), an observation or remark is added, or it is approved or rejected (to the creator).
- Only users who hold the module's N flag receive the module's push notifications.

**Common**

- Location pickers follow the module 03 hierarchy, and Location Type options depend on the project type (building vs location-based).
- Images and attachments use the shared upload service. File size limits are not captured (the profile photo limit is ≤10MB).
- Dirty-form guard ("Discard changes?") on add/edit screens (inferred legacy pattern).

---

## Permissions

Flags from the "Menu / permission map" in `_working-notes.md`:

| Letter | Meaning        | Letter | Meaning      |
| ------ | -------------- | ------ | ------------ |
| C      | create         | N      | notification |
| R      | read           | V      | view all     |
| U      | update         | T      | transfer     |
| D      | delete         | O      | report       |
| A      | approve        | F      | financial    |
| J      | reject         | E      | export       |
| P      | print/download | I      | import       |

| Menu (id)                | Flags                 | Effect                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task (#53)               | C R U D A J P N V O F | Create, view, edit, delete (including bulk delete and import; there is no separate I flag). **A** = approve, **J** = reject. Task approval is not otherwise evidenced in the UI; it may gate Mark As Completed or progress updates. **P** = download. **N** = assignment and progress notifications. **V** = see all tasks, not only own. **O** = Task Report. **F** = see Total Price, Completed Price and earned value. |
| Issues and snags (#51)   | C R U D A J P N V O   | Create, view, edit, delete. **A** = approve (probably Mark As Solved, inferred). **J** = reject (what it rejects is not evidenced). **P** = download, **N** = notifications, **V** = view all, **O** = Issue & Snag report.                                                                                                                                                                                               |
| Inspection Request (#54) | C R U D A J P N O     | Create, view, edit, delete. **A** = approve and **J** = reject, as separate grants (single and bulk). **P** = download, **N** = notifications, **O** = Inspection Request Report. No V.                                                                                                                                                                                                                                   |
| Issue Categories (#72)   | C R U D               | Master (module 02).                                                                                                                                                                                                                                                                                                                                                                                                       |
| Project Drawings (#21)   | C R U D N             | Drawing picker for inspections (module 03).                                                                                                                                                                                                                                                                                                                                                                               |
| Dashboard (#65)          | R                     | Task, Issue and Inspection dashboard sections and KPI tiles.                                                                                                                                                                                                                                                                                                                                                              |
| Reports (#20)            | R P                   | Task Report, Issue & Snag, Inspection Request reports.                                                                                                                                                                                                                                                                                                                                                                    |
| Progress Report (#73)    | C R D N F             | Task Progress Report generation (module 04).                                                                                                                                                                                                                                                                                                                                                                              |

---

## Relationships

- → depends on **01 Organization/Identity/Access**: team members (assignees, inspectors, creators), permission flags, notifications routing.
- → depends on **02 Master Records**: Departments, Contractors, Measurement Units, Issue Categories, Tags (Tag master), Designations (for back-dated overrides).
- → depends on **03 Projects/Structure/Drawings/Gallery**: project, wings/floors/units, amenities, common developments and locations; project drawings for inspections. Testing Reports (03) are the material-test counterpart to inspections. Issue and inspection images may surface in the Gallery (inferred).
- → depends on **12 Settings**: InspectionRequest numbering sequence; back-dated entry (Issues & Snags, Inspection Request).
- ← used by **04 Daily Site Work**: worksheets reference a task (TaskName column). The Task Progress Report is generated from Progress Report.
- ← used by **11 Reports/Dashboards/Backup**: Task Report, Issue & Snag report, Inspection Request Report, Project Dashboard KPIs and charts, project backup.
- ← used by **13 Chat/Notifications/Support**: assignment, due and approval notifications.
- ↔ **07 Payments & Accounting** (future): approved inspections and completed task quantities are the natural gate for contractor RA bills (see recommendations). Not linked in legacy.

---

## Reports & exports

| Report                    | Format                     | Content                                                                                                                                                                                                    |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task Report               | PDF / Excel                | Task list with Task No., name, assignees, dates (baseline / actual), progress %, status, location, department, contractor. Header with Organisation, Project, Address, Duration. Prices with F (inferred). |
| Task Progress Report      | PDF (async, via module 04) | Duration, location, task, progress %.                                                                                                                                                                      |
| Gantt                     | Screen                     | Baseline vs actual timeline (`tasks/gantt`). Export not evidenced.                                                                                                                                         |
| Task import sample        | Excel                      | Template for `tasks/import` (inferred from the import pattern used elsewhere, e.g. SampleExport).                                                                                                          |
| Dashboard — Task          | Charts                     | Project Progress % gauge, Value Earned By Task, Filtered By Status.                                                                                                                                        |
| Issue & Snag report       | PDF / Excel                | Issue list: date, details, priority, category, department, assignee, due date, location, status, solved on (inferred columns).                                                                             |
| Dashboard — Issue & Snag  | Charts                     | Status charts, Assignee-wise issue chart, KPI "Pending Issues & Snags".                                                                                                                                    |
| Inspection Request Report | PDF / Excel                | Request No, date/time, department, contractor, inspector, description, location, status, approved/rejected by and on, reason (inferred columns).                                                           |
| Dashboard — Inspection    | Charts                     | Total / approved / pending / rejected, Success Rate gauge, KPI "Pending Inspections".                                                                                                                      |

---

## Rebuild recommendations

1. **Tie tasks to BOQ and work orders.** The task fields "Total work (qty + unit) & Total Price" are a primitive BOQ line. In the rebuild, a task (or task line) should reference a BOQ item (DSR-coded, IS 1200 units) and, where relevant, the contractor work order at item rate. Completed work then becomes the Measurement Book quantity that drives RA bills: cumulative measured value − previous bills − deductions (research §3 "BOQ and rate analysis", "Measurement Book (MB) and RA bills", "Work orders with item rates"). Earned value then reconciles with billing.
2. **Joint measurement (JMR) sign-off on progress.** Let a progress update be co-signed by the contractor and the client engineer before it counts toward billing (research §3 "JMR").
3. **RERA physical progress.** Roll task progress up by Wing to produce the per-building % complete needed for the architect's Form 1 and the quarterly progress report, with state-configurable QPR deadlines (research §2 RERA, §5 "RERA: … quarterly physical/financial progress by wing"). Weight the rollup by price, not task count.
4. **Proper scheduling semantics.** Add predecessors/successors (FS/SS with lag) for the Gantt, a frozen **baseline snapshot** (and re-baselining with history) instead of editable baseline fields, and a working calendar (holidays from module 10). Make Delayed a forecast computed by the server (forecast end > baseline end), not only "today > due date".
5. **Inspection gates billing and the next activity.** An inspection request should link to the task or BOQ item and the location it covers, and an approved inspection should be the precondition for marking that task Completed or including it in an RA bill. A rejection should automatically create a linked Issue/Snag for the contractor, with a "re-inspection" request linked to the original.
6. **Checklists (ITPs) on inspections.** Add configurable inspection checklists per work type (e.g. pre-pour checklist) with pass/fail/NA items. For concrete pours, link to the pour → cube register in Testing Reports (module 03) (research §3 "Concrete testing (IS 456:2000 …)").
7. **DLP and handover for snags.** Add a phase (Construction / Pre-handover / DLP) and a per-unit handover date to Issues & Snags, so the 12-month contractual DLP and the RERA 5-year structural defect liability can be tracked separately. Optionally capture allottee-reported snags (research §2 RERA "5-year structural defect liability", §3 "Defect liability period"). Link snags to retention release (research §3 "Retention money").
8. **Explicit issue lifecycle.** Add **Reopen** and a **Verified/Closed** step (the raiser confirms the fix), plus SLA by priority. Keep "Delayed" as a derived flag rather than a stored status so that bulk-resolving does not lose history.
9. **Drawing-pinned issues and inspections.** Pin issues, snags and inspections to a point on a project drawing (research §4 item 8). Geo-tag and timestamp all photos.
10. **Offline and WhatsApp capture.** Raising a snag (photo + location + category) and approving an inspection are high-frequency field actions. Support offline queueing and WhatsApp-bot approval (research §4 items 1–2).
11. **Audit trail and soft delete.** Task, issue and inspection histories carry evidence for extension-of-time claims and disputes (the hindrance register, research §3). Store an append-only activity log for all three entities (the Task activity feed already exists in legacy). Soft-delete instead of hard-delete, and block deleting decided inspections.
12. **Define what approve and reject mean everywhere.** Legacy grants A (approve) and J (reject) on Task and Issues, but the UI shows no task or issue approval step. In the rebuild, either give these flags concrete actions (for example, approve task completion, verify a solved issue) or drop them.

---

## Open questions

1. Are Baseline Start/End entered separately or copied from Start/Due Date? Can a task be re-baselined?
2. Is **Delayed** a stored status or derived? For issues, is it set by a scheduled job or computed when read?
3. How is **Project Progress %** computed: a simple average of task progress, weighted by Total Price, or weighted by duration?
4. How is **Completed Price** (earned value) computed: from completed work qty ÷ total qty, or from progress %?
5. What do the **A** (approve) and **J** (reject) flags on Task (#53) and Issues (#51) control? Task completion approval? Verifying a solved issue?
6. Can a Rejected inspection request be resubmitted, or must a new one be raised?
7. How many levels of sub-tasks are allowed? What does "Paste Task below" copy (sub-tasks, assignees)?
8. What are the **task import** template columns and the matching rules (by name? by Task No.)?
9. Does Update Task Progress accept photos and comments? Is it the same as the activity feed?
10. Is the task-worksheet link (TaskName on worksheets) a real foreign key, and does worksheet work done update task progress?
11. What happens to sub-tasks when a parent is bulk-deleted?
12. Can a Solved issue be reopened in legacy?
13. Is the inspector (Request Assign To) required, and can someone other than the inspector approve?
14. Do issues have a user-visible number? There is no Sequence ID for them.
15. Exact column sets for the Task, Issue & Snag and Inspection Request reports.
16. Where are Tags managed? There is no Master tile in the permission map.

---

## Decisions for the build

The open questions above are answered in [ADR CM-0019](../adr/CM-0019-tracking-product-decisions.md). Rules the M8 build settled beyond the ADR are listed here by ticket.

### CM-801

- **Issue Categories follow the ADR, not the older seed rule.** A Default (seed) category can be renamed and, when no live issue names it, deleted — unlike Departments or Units, whose seeds are read-only. A snag raised from a rejected inspection looks up the live, enabled category named "Quality" (any case); when the Company renamed, disabled or deleted it, the snag has no category.
- **Tags are never disabled**; there is no disable route. `POST /api/construction/masters/tags/ensure` (Tags Create) returns the live tag of that name (200) or creates it (201): the Task form's inline create. Task and issue forms read their pickers (Tags, Issue Categories, Departments, Contractors, Units, Team Members, Drawings) through the tracking context's `TrackingDirectory.options`, so a member needs no Masters read to pick.
- **Masters lists of Issue Categories and Tags are whole lists, by name** (with `total`), like Departments and Payment Categories, and say per row whether it is `inUse` and per list what the caller `can` do.
- **Designation templates.** Project Manager: Issue Categories and Tags CRUD. Site Engineer: Issue Categories read, Tags create and read, Inspection Request CRU N. Site Supervisor: Task CRU N, Issues CRU N, Inspection Request CRU, Issue Categories and Tags read. **Quality Control** and **Structural Engineer** now carry templates: Inspection Request R U A J P report N, Issues and snags C R U A J P report V N, Task read, Drawings read, Testing Reports CRU.
- **Back-dated entry** checks an issue's `issueDate` (the field was named `reportedDate` before M8).
- **Files.** One table, `document_files`, for all three documents: task photos are images only and need Task **Update** (they come with progress); issue and inspection files take a PDF or an image and need Create or Update; Update removes any file, an uploader their own; Read serves them, with View all scoping on tasks and issues (own, created or assigned). An issue update's composer asks for photos only on the client; the server's policy for issues stays PDF-or-image. A document keeps at most 200 files (a task gathers every progress update's photos), an entry 10, 25 MB each. An entry's files are uploaded first and attached when the entry is posted (`attachEntryFiles`); deleting an entry tombstones its files (`tombstoneEntryFiles`) and takes them out of the Gallery.
- **Gallery.** Images and PDFs of tasks, issues and inspections join it (sources `task`, `issue`, `inspection`), and the viewer links back to the record (`/app/projects/<id>/tasks|issues|inspections/<recordId>`). Because tasks and issues scope Read by View all, the Gallery lists their files only to members with **View all**; inspection files to anyone with Inspection Request read.
- **Drawings.** A drawing a live Inspection Request links cannot be deleted (409 `DRAWING_IN_USE`, `details.inspectionCount`); a deleted request does not count. Albums need no check: only an empty album can be deleted.
- **Tracking access route** takes a required `projectId` and answers 404 `PROJECT_NOT_FOUND` for a Project that is not a live Project of the Company; it also returns the caller's **Tags** flags (Company-level) for the inline create.

### CM-802

- **Progress is cached at every level; planned dates, baseline and price roll up on read.** `recomputeTaskAndAncestors` (in the same transaction as every change that moves progress, edits included) rewrites `progress_pct`, `completed_work_qty`, `actual_start` and `actual_end` on the leaf and each ancestor. A summary task's own planned dates, work and price columns are kept but ignored: its dates and baseline are the span of its live leaf tasks', its Total Price and Completed Price the sum of theirs. A summary's `completed_work_qty` stays 0 (its leaves may use different units). Recomputing never moves `updated_at`, so it never makes an open form stale.
- **Price weighting needs every leaf priced and the prices to add up to more than ₹0**; otherwise duration weighting (planned days, both ends counted; a task without both dates weighs 1). A roll-up stays below 100 % until every leaf that weighs is at 100 %; percentages are rounded half up to two decimals.
- **A quantity task's progress below its total never rounds up to 100 %** (it shows 99.99 %). Overrun is allowed; progress stays 100 %.
- **Actual End is the date of the update from which the task has stayed at 100 %**; a percent task's progress is its latest update by date (same-day updates by when they were entered).
- **A task with progress updates cannot get sub-tasks, switch between quantity and percent, or change its unit** (409 `TASK_HAS_PROGRESS`): the figures would mix. Delete the updates first.
- **Re-baseline is for leaf tasks with both planned dates** (409 `TASK_IS_SUMMARY`, 400 `TASK_DATES_REQUIRED`); a summary's baseline is its sub-tasks' span. The automatic v1 has no reason ("Captured from the planned dates").
- **Update Task Progress, Mark As Completed and Re-baseline need Task Update.** An update can be edited or deleted by its author or anyone with Task Update; the edit can add photos, and photos are removed through the file's own × (its uploader or Update). Mark As Completed records the remaining quantity (or 100 %) as an ordinary update, so deleting that update reopens the task.
- **Without Financial, a Total Price sent on create, edit or import is not taken**: on create and edit it is ignored (an edit keeps the stored price); in the import it is a row error, so nobody sets prices they cannot see.
- **Visibility without View all:** own (created) and assigned tasks match; their ancestors come along greyed ("shown for context") and cannot be opened (404) or acted on. Sub-tasks of an assigned task are not shown unless they are the member's too. Filters match any level and bring the ancestors along (`matched: false`).
- **The list pages by top-level task** (bidirectional cursors on sort order and Task No.), each with its visible subtree; `total` counts matching tasks. The Gantt reads the whole visible tree in one call.
- **Other locations** must be of the main location's Location Type, and in its Wing when it is a Wing (`TASK_LOCATION_MISMATCH`); there are at most 20. The location filter matches a Wing, Amenity, Common Development or Location id in the main or another location.
- **The date-range filter** matches tasks whose planned span (rolled up for summaries) overlaps it; undated tasks do not match.
- **Copy task below** keeps each copied sub-task's order and gives every copy a new Task No.; leaf copies with both dates get their own baseline v1. Each copy's feed starts with `copied` (the original's Task No.).
- **Delete** (single and bulk) also tombstones the tasks' photos and takes them out of the Gallery. The 409 `TASK_IN_USE` lists each task in use with its worksheet count (`details.tasks`), and `details.worksheetCount` is the total. A rejected worksheet still names its task; deleting the worksheet frees it.
- **Import:** Ref / Parent Ref may come in any order; duplicates, unknown parents, circles and a fourth level are row errors. Masters match the pickers' lists (enabled Departments and Units, active Contractors on the Project, active Team Members on the Project); an assignee name shared by two members is refused. Unknown tags are created through the masters' `ensure` only after every row checks out, so a refused sheet creates nothing. Priority is High / Medium / Low in any case; dates as DD/MM/YYYY, YYYY-MM-DD or an Excel date; Total Price in rupees.
- **Events** `TaskAssigned` (newly added assignees, on create and edit), `TaskProgressRecorded` (record and edit), `TaskCompleted` (crossing to 100 %) carry the task's creator and assignees for M9.

### CM-803

- **Issue Date** cannot be after the Company's today (`ISSUE_DATE_IN_FUTURE`); back-dated control applies to it on create, edit (old and new date) and delete.
- **Delayed** is open and the Company's today after the Due Date. An issue due today is Pending; one without a Due Date is never Delayed. `issueStatus` (domain), `issueStatusSql` and `issueStatusWhere` (infrastructure) are tested against each other on Postgres.
- **Edit** only while open (Pending or Delayed); a solved or closed issue answers 409 `ISSUE_NOT_OPEN` until it is reopened. **Delete** works in any status with Delete.
- **Mark As Solved, Verify and Reopen** record server time and do not check the back-dated policy (they are not entries on the Issue Date). Verify keeps Solved On / By; Reopen clears Solved and Closed.
- **Bulk** Mark As Solved and Verify never refuse the batch: issues in another state, of another Project, deleted or hidden from the member are skipped and counted.
- **Without View all**, an issue the member did not raise and is not assigned to answers 404 on every route, as if it did not exist.
- Category, Department, Contractor and Assign To are checked only when set or changed: an unchanged disabled category or department, a Contractor taken off the Project, or an assignee who left stays on edit. A new Contractor must be active and on the Project; a new assignee an active Team Member on the Project (the Owner included).
- **Progress updates** can be posted in any status (closed included) by anyone who sees the issue and holds Update. Images are uploaded to the issue first and posted by id (the tracking entry files); the composer takes images only. Only the author deletes an update, within 24 hours, with Read alone; its images leave the Gallery.
- The issue's own **Images** and **Attachments** are both files of the issue (attachments also take PDFs). The new-issue form uploads them after the save; on an existing issue they are added and removed on its page, not on the edit form.
- **Events:** `IssueAssigned` on create with an assignee and on edit when the assignee changes to someone; `IssueSolved` on Mark As Solved (single or bulk) and Save & Mark As Solved; `IssueUpdated` when a Progress update is posted; `IssueReopened` with the reason. Verify raises none (not in CM-0019 §11).
- The list is newest recorded first. Status chips combine (Pending + Delayed); the Location filter picks a Wing, Amenity, Common Development or Location (any floor or unit of a Wing matches).
- History rows written by one command share a time; they read created, edited, assigned, solved, closed, reopened.
- The priority chip is filled with its colour and carries **black** text: white fails contrast on the red (#F90B0B) and the yellow (#FCF200).

### CM-804

- **Inspection Date may be a later day.** A request is often raised ahead of the visit; the back-dated policy (Site → Inspection Request) only limits how far back it goes. Edit checks the old and the new date; Delete checks the date under the edit limit; Approve and Reject are not back-dated entries and check nothing. Inspection Time is optional, `HH:MM` in 24 hours.
- **References are checked when set or changed.** The inspector must be an active Team Member on the Project (the Owner counts), a Department enabled, a Contractor active and assigned to the Project, each drawing a live Drawing of the same Project; an edited request may keep an unchanged pick that has since been disabled or left the Project. At most 50 linked drawings; Description of work up to 2,000 characters.
- **Bulk decisions skip and count** (CM-0019 §9), unlike the all-or-none bulk of Daily Worksheets: a selected request that is already decided, deleted or another Project's is skipped and counted, and the rest are decided in one transaction. A single Approve or Reject of a decided request is 409 `INSPECTION_NOT_PENDING`.
- **A snag from a rejection** is raised by the person who rejects, in the same transaction, through the shared Issue & Snag writer: Issue Date = the Company's today, category Quality when that enabled category exists (else none), the request's contractor, department and location copied as they are, no priority, due date or assignee, details "Inspection IR/… rejected: <reason>". Without Issues & Snags Create the server answers 403 `SNAG_NOT_ALLOWED` and nothing is rejected.
- **Re-inspection.** `GET /api/construction/tracking/inspections/{id}/reinspection` (Create) returns the prefill of a rejected request, keeping only what can still be picked (an inspector still on the Project, an enabled Department, a Contractor still assigned, live drawings, a location still on the Project); the Add page is `…/inspections/new?reinspect=<id>`. A rejected request has at most **one live re-inspection** (409 `INSPECTION_REINSPECTION_EXISTS`); a rejected re-inspection can be inspected again in turn, so they chain.
- **Observations** are added by the request's inspector (the caller's own Team Member) or anyone with Update, while pending; text up to 2,000 characters, or files only. Files are uploaded to the request first and attached to the observation when it is posted. The request's **inspector may upload** for this even with Read only (the files service grants them the upload right on that request while it is pending, and they may remove their own uploads); no one else gains a right. The author may delete their own observation while the request is pending (its files leave the Gallery). Observations and remarks do not change the request's `updatedAt`, so an open edit form is not made stale by them.
- **A decided request's files are final.** Once approved or rejected, the files service refuses uploading to the request or removing any of its files — its own and its observations' — with 409 `INSPECTION_DECIDED`, and reports `canUpload` / `canRemove` false. Task and issue files are not affected.
- **Remarks** are text up to 500 characters, by anyone with Read, at any time; they are a log and cannot be edited or deleted.
- **The list** is newest first (by when raised) and returns the counts by status under the other filters for the status chips; the location filter takes a Wing, Amenity, Common Development or Location.
- **Linked drawings open their album** in Project Drawings (`/app/projects/<id>/drawings/<albumId>`); the tracking context reads the album through its own `TrackingDrawingLinks` port.
- **Events:** `InspectionRequested` on every create (a re-inspection names the request it re-inspects); `InspectionDecided` once per decided request, with the snag's id when one was raised.
- **`successRate(approved, rejected)`** (`src/tracking/domain/inspection.ts`) is a percentage 0–100, unrounded, and `null` with no decided request; pending requests do not count.

### CM-805

- **Each dashboard section needs its menu's Read** on the Project besides Dashboard Read, like M7's Payments: Task needs Task Read, Issue & Snag Issues and snags Read, Inspection Request Inspection Request Read. Without it the section names the permission and its KPI tile shows "—". One read (`GET /api/construction/tracking/dashboard`) feeds the three sections and both tiles.
- **Without View all** the Task and Issue & Snag sections and Pending Issues & Snags count only what the member created or is assigned to, as their lists do; Inspection Request has no View all. **Project Progress %** is always the Project's (every live leaf task, whatever the duration), the same number as the Project card; the card says so ("Every task of the Project, whatever the period").
- **The duration filter** takes tasks by the date they were added (in the Company's time zone), issues by Issue Date and inspections by Inspection Date. Pending Inspections therefore leaves out a request raised for a day after the duration's end.
- **Counts by status** take every task added in the period, summary tasks included (as the task list counts them). **Most delayed tasks** lists leaf tasks only (a summary's delay is its late leaves'), at most five, by days late = the Company's today − Due Date, then by Task No.
- **Value Earned By Task** (Task Financial) draws the top-most tasks of the period with a price — tasks none of whose ancestors are counted, so with View all and the whole tree in the period, the top-level tasks — the ten largest by value, the rest counted ("And 2 more tasks"); the totals cover all of them. Without Financial the chart and its totals are not sent.
- **Issues by priority** add "No priority", by category "No category", by assignee "Not assigned"; a removed category or Team Member keeps its name. Every chart says its figures beside its colours.
- **The Project card's progress** is the Projects list item's `progress` (`{ pct, weighting }`, null without tasks), asked through the projects context's `ProjectProgressReader` port and answered by `src/composition/project-progress.ts` with the tracking roll-up. The Project home's Details shows it from the same list; a Project without tasks shows no bar.
- **The Task Report** lists the tasks added in the period (the dashboard's rule), in tree order with sub-tasks indented and their level; a summary row shows its rolled-up dates, progress and prices; the price totals count each priced leaf task once. Status and variance are as on the Company's today when the report is generated. Prices print only when the requester holds Task Financial, and such a file then needs Task Financial to download.
- **The Issue & Snag and Inspection Request Reports** take the period by Issue Date and Inspection Date, oldest first; Solved On, Closed On and Decided On are dates in the Company's time zone. Each report has a "By status" sheet; the Inspection Request Report notes the Success Rate ("—" with none decided). They print no money.
- **Without View all a Task or Issue & Snag report covers the requester's own and assigned rows**, fixed with the job; such reports — like any Task or Issue & Snag report — are listed and opened only by their requester and members with View all on the menu (as M7's Petty Cash report).
- **The tracking report PDFs use Noto fonts**, so names and remarks in Tamil, Hindi and the other Indian scripts, and ₹, print; the earlier table reports keep the standard fonts. They print on A3. Progress % is a new `percent` column kind (two decimals, never summed).
- **The Task Progress Report** is a Progress Report (Progress Report C / R / D, like the DPR), not a Reports-page report: a PDF for a period of at most 366 days ending today or earlier, with no number, no Filled By, no images and no money. It covers the Project's live **leaf** tasks planned to run in the period (either planned date in it, or a span across it) or with progress dated in it, grouped by their main location (by name, "No location" last). At start is the progress replayed from the updates dated before the period; At end, from those up to its last day; Work done sums the quantities dated in the period (a percent task shows the change in points); Updates counts them, saying how many came from Daily Worksheets. It does not check Task View all: like the DPR, it is a Project document.

### CM-806

- **One rule decides the posting, after every write:** create, edit, approve, reject and bulk decisions all end by making the task progress match the sheet. A sheet posts its Approx Work Done to its task when the task is a live leaf task with a Total work unit equal to the sheet's unit, the sheet has a quantity, and it is not rejected (pending, approved and "no approval" sheets count). Otherwise its update, if any, is removed. Deleting a sheet removes it. So editing a rejected sheet back to pending posts again.
- **Linked only, with the reason:** another unit (`linked_unit`), a task that tracks percent (`linked_percent`), or no Approx Work Done on the sheet (`linked_no_quantity`). The form says which before saving: "Will add 12.5 cum to T-7's progress" or "Linked only — …".
- **A newly named task must be a live leaf task of the sheet's Project:** 400 `WORKSHEET_TASK_NOT_FOUND` (missing, deleted or another Project's) or `WORKSHEET_TASK_IS_SUMMARY`. A sheet that already names a task keeps it on edit. Its task cannot get sub-tasks while the sheet names it (below). `taskId` left out of an edit keeps the sheet's task; null clears it.
- **Edits replace the update:** a new quantity or date changes the same row; another task loses the update (and is recomputed) and the new one gains it. Each change writes a `worksheet_progress` row in the task's feed (posted, replaced, or taken off). It also writes `completed` / `reopened` when the task crosses 100 %.
- **Duplicate copies the Task** along with the other fields. Save & Add New clears it.
- **The Task picker needs only Daily Worksheet read:** it names live leaf tasks of the Project, at most 50 per search, by Task No. or name. Worksheet detail and list link to the task page.
- A task named by a live Daily Worksheet cannot get sub-tasks (409 `TASK_IN_USE`, `details.worksheetCount`), even when the sheet only links it: a summary task takes no progress, so the sheet would post nowhere.
