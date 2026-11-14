# CM-0041 — A Labour's Site Engineers come from their Projects, not from the Labour

- Status: accepted (2026-11-14, the owner's answers to six questions)
- Date: 2026-11-14
- Amends: [CM-0035](CM-0035-labour-reports-to-and-labour-categories-in-masters.md) (the Labour form kept a Supervisor beside Reports To), [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) §2 (Site Engineer on the Labour form, list, Excel and attendance)
- Relates to: [CM-0038](CM-0038-project-staffing-and-activity-feeds.md) §3 (Site Engineers put on a Project from the Project), [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §4 (Labours on many Projects), [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) (attendance)

The owner, on the Add Labour form: "a site engineer should be assigned to the project, and the laborer reports to the site engineer who is assigned to the project. There shouldn't be a direct assignment of labor to a site engineer."

Since CM-0038, Site Engineers are put on a Project from the Project, and Labours are put on Projects through the transfer history. The Labour's own Site Engineer (`labours.supervisor_id`, a pick on the Labour form) was a second, separate answer to "who looks after this Labour". The two could disagree: a Labour moved from Project A to Project B kept A's Site Engineer until someone remembered to edit them.

## Questions the owner answered

The owner accepted the recommended answer to each question on 2026-11-14.

| #   | Question                                                                | Answer                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A Project can have several Site Engineers. Who does a Labour report to? | All the Site Engineers on the Project. Nothing is stored on the Labour, so nothing goes stale when people move. (Not a "lead" Site Engineer per Project, not a pick per Labour.)             |
| 2   | A Labour on two Projects at once?                                       | They report to the Site Engineers of both.                                                                                                                                                   |
| 3   | Attendance history?                                                     | Days already marked keep the Site Engineer saved with them. New days save none. The sheet's Site Engineer filter goes; where a day has no saved one, the Project's Site Engineers are shown. |
| 4   | Labours already linked to a Site Engineer?                              | The link is dropped (kept as an audit event), not turned into Project staffing. Staffing a Project stays a deliberate step on the Project.                                                   |
| 5   | The Labours list and Excel?                                             | The Site Engineer filter becomes a Project filter. The export's column is "Site Engineers", from the Labour's current Projects. The import ignores a Site Engineer or Supervisor column.     |
| 6   | Reports To (one Labour answering to another)?                           | Unchanged.                                                                                                                                                                                   |

## Decision

### 1. `labours.supervisor_id` is dropped

- One migration in `construction_labour`. It first keeps every link as a `labour.site_engineer_removed` audit event (`before: { supervisorId, supervisorName }`), then drops the column. The audit log is the shared kernel's (`construction_organization.audit_events`), which every context already writes through `recordAudit`; the insert reads only `construction_labour.labours` and `construction_masters.supervisors`.
- The Labour domain, Request and Response models, repository, read model and audit snapshots lose `supervisorId` / `supervisor`. A request that still sends `supervisorId` is accepted and ignored (Zod strips unknown keys), so an open form from before the release still saves.
- `SUPERVISOR_NOT_FOUND` is no longer a Labour error.

### 2. A Labour's Site Engineers are read, not stored

A Labour's Site Engineers are the enabled Site Engineers whose sign-in is on one of the Labour's current Projects (CM-0038 §3: the sign-in's `team_member_projects`). The Owner is on every Project without being a Site Engineer, so the Owner never counts. A Site Engineer without a sign-in is on no Project, so they are no one's Site Engineer.

- The labour context reads them through its `SupervisorDirectory` (`onProjects(workspaceId, projectIds)` → Site Engineers by Project), a plain read of the masters and organization tables like its other directories. No context imports another.
- The Labour Response gains `siteEngineers: { id, name }[]`, from the Labour's current Projects, by name. The Labour form shows it read-only under the Projects field ("Site Engineers on their Projects: …", or that none of their Projects has one yet), so the owner sees who the Labour answers to without a field to keep up to date.

### 3. The Labours list and Excel

- The list's Site Engineer filter goes. Its **Project** filter (`projectId`: Labours currently on that Project), already there, answers "who works under Tower A's Site Engineers". The API's `supervisorId` filter is removed (ignored when sent).
- The export's "Site Engineer" column becomes **Site Engineers**: the names, comma-separated.
- The import template no longer has the column or the Site Engineers list sheet. A sheet that still has a Site Engineer or Supervisor column (an older template) imports with that column ignored.

### 4. Attendance

- A marked day keeps its `labour_attendance.supervisor_id`, and a re-marked day keeps the one it had: history does not change.
- A newly marked day saves none. The mark request's `supervisorId` is removed (and ignored when sent).
- The marking sheet loses the Site Engineer line under each name and its Site Engineer filter. The rows already all belong to one Project.
- The recorded list loses its Site Engineer filter (the API's `supervisorId` filter on days goes). Its Site Engineer column shows the day's saved Site Engineer, else the Project's Site Engineers today. The day's Response replaces `supervisor` with `siteEngineers: { id, name }[]` in that order of preference.
- The Labour Attendance report's Site Engineer column follows the same rule: the saved one, else the Project's Site Engineers, comma-separated.

### 5. Deleting a Site Engineer

A Site Engineer is "in use" (delete refused, CM-0016) only while a marked attendance day names them; Labours no longer can.

## Consequences

- Moving a Labour between Projects, or putting a Site Engineer on a Project, changes who the Labour answers to at once, with nothing to edit on the Labour.
- A Project with no Site Engineer shows none on its Labours. That is a staffing gap the Project page already shows, not something the Labour form should paper over.
- The links dropped by the migration stay readable in the audit log. They are not shown on the Labour's Activity feed (CM-0038), which reads a fixed set of actions.
- The report shows today's Site Engineers for days marked after this release. If a Site Engineer leaves the Project, past days marked after this release show the new set. Saving a snapshot per day would avoid that, but would bring back a Site Engineer per Labour per day that nobody picks; if the owner asks for it, attendance can save the Project's set when a day is marked.

## Considered options

- **A lead Site Engineer per Project** (question 1 b). A single name on reports, but one more thing to keep up to date per Project, and the client staffs Projects with several Site Engineers who share the Labours.
- **A pick per Labour among the Project's Site Engineers** (question 1 c). It brings back the direct link the owner asked to remove, only narrowed to one Project, and it goes stale on every transfer.
- **Turn the old links into Project staffing** (question 4). It would put Site Engineers on Projects nobody chose, and it fails for Site Engineers without a sign-in (CM-0038 question 1).
- **Keep the column, hide the field.** Data nobody can see or edit drifts and misleads reports. Dropping it, with the audit record, is cleaner.
