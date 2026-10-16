# CM-0021 — Job queue, reports, dashboards, notifications and backups: product decisions for M9

- Status: accepted
- Date: 2026-10-16
- Tickets: CM-901 … CM-904, CM-906 (M9). CM-905 (chat and support tickets) is left out of this delivery by the owner.
- Supersedes: the planned CM-0007 ("Reports are worker jobs on SQS…", `03-target-architecture §5`), never written.
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0009](CM-0009-email-sign-in-while-sms-is-off.md) (email codes while SMS is off), [CM-0014](CM-0014-attachments-and-gallery-index.md) (stored files, orphan clean-up), [CM-0016](CM-0016-daily-site-work-product-decisions.md) §15–16 (report jobs, Progress Reports), [CM-0017](CM-0017-finance-product-decisions.md) §16, [CM-0019](CM-0019-tracking-product-decisions.md) (tracking events)

`modules/11` and `modules/13` end with open questions, and `03-target-architecture` planned SQS and an ECS worker. Construction Management actually deploys to **Vercel on the Hobby plan**: no long-running worker, and cron at most **once a day**. The owner answered four questions before M9 started:

- **Job runner:** a **Postgres queue** (§1), not SQS and not Vercel Queues.
- **Notification events:** **approvals and assignments** across the modules that exist, plus report and backup ready (§6).
- **Backups:** **signed, expiring links** for project and module backups, also emailed. A **full Company backup is Owner-only and needs a one-time code** (§8). Exports keep working after the plan expires.
- **Delete My Account:** **blocked for an Owner** until they hand the Company over or delete it. Company deletion is a separate Owner action with a code and a cooling-off period (§10).

Every other question gets the default recommended here; the M9 handoff lists them again for the owner.

**Delivery.** One milestone, built on one branch and opened as a native GitHub stack of pull requests of at most 300 files each, like M5–M8.

## Decisions

### 1. A Postgres job queue (CM-901)

- **One table:** `construction_organization.queue_jobs`, kernel-owned like `audit_events` and `stored_files`. Columns: `id`, `workspace_id` (null for system jobs), `type` (text, e.g. `report`, `backup`, `push`, `retention`), `payload` (jsonb), `status` (`queued | running | done | failed`), `attempts`, `max_attempts` (default 3), `run_after`, `lease_until`, `last_error`, `dedupe_key` (unique among unfinished jobs), `created_at`, `finished_at`.
- **Claiming** uses `FOR UPDATE SKIP LOCKED` on `status = 'queued' AND run_after <= now()`, together with running jobs whose lease has passed (a crashed run). Claiming sets `running`, `attempts + 1` and `lease_until = now() + lease`. The lease is the handler's time limit plus 30 seconds.
- **Handlers** are registered by `type` in the composition root (`src/composition/queue.ts`). A context never imports another context's handler. A handler that throws is retried with backoff (30 s, 2 min, 10 min). When its attempts run out the job is `failed` and the handler's `onGiveUp` runs; for a report, that marks the report failed with a message.
- **What starts a run.** There is no worker process.
  1. **Right after the request.** A route that enqueues calls `drainQueue()` inside Next's `after()`. The response returns first; the job runs in the same function invocation. Those routes declare `maxDuration = 300`, the Hobby ceiling.
  2. **Polling heals.** Screens already poll a queued or running job every 3 seconds. A poll that sees a queued job older than 15 seconds, or a lease that has passed, starts a drain in `after()`. A job never waits for a cron while someone is watching it.
  3. **A daily cron**, `/api/construction/queue/drain/scheduled` (`CRON_SECRET`, like the HRMS crons), sweeps stragglers. It also runs the daily jobs: retention (§3), orphan clean-up (§3), "became delayed" notifications (§6) and Company deletions that are due (§10).
  - **A drain** claims and runs jobs one after another until its time budget is spent, and never starts a job whose limit would overrun the budget.
  - **Moving off Hobby.** On the Pro plan the same route can run every minute: one line in `vercel.json`. A GitHub Actions schedule that calls the route is another option. Neither changes the code.
- **Report time limit.** It rises from 60 s to **240 s** now that a report no longer holds the request open. A report past its limit fails with the existing "took too long" message.
- **One requester, five unfinished reports.** A member may have at most **five** reports queued or running at once. A sixth is refused with 409 `TOO_MANY_REPORTS` ("Wait for one of your reports to finish."). This replaces the legacy "Please wait while another report is generating". Several jobs may queue; the per-user cap stops one person from filling the queue.
- `report_jobs` stays the record a screen reads. The queue row only says "run report job X". Its status is never shown.

### 2. Report catalogue, downloads and report headers (CM-901)

- **One server-side catalogue,** `src/reporting/domain/report-catalogue.ts`. For each kind it records the title, scope (`project`, `central` or both), the menu it is gated on (with the Report and Print flags), the formats, whether it carries money, and the filters it takes. It replaces the hand-kept lists (`CENTRAL_REPORT_KINDS`, the UI's `report-catalogue.ts`) and is served at `GET /api/construction/reporting/catalogue?scope=project|central&projectId=`, trimmed to what the viewer may request. The project Reports page and Central Reports both read it.
- **Downloads** (`/app/downloads`, linked from the user menu and from every "ready" notification) lists the member's own report jobs, backups and data exports across Projects, newest first. Each shows its status, and Download, Retry and Delete where allowed.
- **The Project logo** is printed in the PDF header when the Project's `useLogoInReports` is on (CM-0013 promised it for M9); the Company logo otherwise; neither when there is none.
- **Every PDF footer** says who generated it and when: "Generated by Asha Rao on 16 Oct 2026, 14:05", in the Company's timezone (`modules/11` recommendation 9). Excel files carry the same line under the header.

### 3. Retention and clean-up (CM-901)

- **Report files are kept 30 days** from completion. Then the daily retention job deletes the files, stops counting them as stored, and sets the job to a new status, **`expired`**, which says "Expired — generate it again". **Progress Reports** (DPR, Task Progress) are excepted: CM-0016 keeps them until someone deletes them.
- **Backups and data exports are kept 7 days** (§8), then expire the same way.
- **Notifications are kept 90 days,** then deleted. Each notification's **delivery log** (who, which channel, sent or failed) is kept 1 year for audit (`modules/13` recommendation 6).
- **Orphan files** (CM-0010, CM-0014): an object under `companies/<id>/…` with no `stored_files` row that is more than 24 hours old is deleted by the daily job. `ObjectStorage` gains `list(prefix)` for this. The local-disk adapter implements it too, so tests cover it.
- **Finished queue rows** are deleted after 14 days.

### 4. Reporting views and dashboards (CM-902)

- **The headline counts move into SQL views** in `construction_reporting`, so a KPI tile, the Company Dashboard and a report never disagree (`modules/11` recommendation 13). The views are plain views, not materialised: these counts are cheap and must be live.
  - `project_pending_approvals`: per Project and module, the documents waiting for approval. It covers PRs, POs, Material Transfers, worksheets, equipment usage sheets, transactions, petty cash vouchers, invoice settlements and other expenses, using the same status rules as each module's list.
  - `project_pending_tracking`: per Project, pending and delayed Issues & Snags and Inspection Requests pending a decision. "Delayed" uses the Company's today, passed as a parameter through a SQL function, as CM-0019 does.
  - `party_dues`: per Project and party, invoiced, paid and due amounts, as `bigint` paise.
  - The Project Dashboard's KPI tiles, the Due Payments widget and the Company Dashboard read these views. Each view carries a migration-level comment naming its readers.
  - The rest of the dashboard sections keep their existing module queries. Moving each one is not worth the churn, and they are already shared with their reports.
- **A Company Dashboard** (`/app/dashboard`, first item of the main menu, gated on `reporting.project_dashboard` Read). It has:
  - Totals across the Projects the member can see: active Projects, approvals waiting, pending Issues & Snags, pending inspections, labour present today, and amounts due (Financial only).
  - **One row per Project:** status, progress %, approvals waiting, pending issues, labour present today, amount due (Financial only). Each row links to the Project's Dashboard.
  - Without View all on a menu, its counts cover the member's own and assigned rows, as on the Project Dashboard (CM-0019). The Projects listed are the member's assigned Projects; all Projects for the Owner and for members not limited by assignment.
- **Manage Dashboard** already stores the section order and visibility per member, for every Project (M4). M9 keeps that.
  - The duration filter defaults to the last 12 months.
  - Sections whose module is hidden on the Project (Hide/Show Modules) are left out, and Manage Dashboard says why ("Hidden on this Project").
  - Booking and Inquiry stay stubs until M10.

### 5. Central Reports (CM-903)

- **Workspace → Central Reports** (`/app/workspace/central-reports`, menu `reporting.central_reports` Read). It lists every central-scope report in the catalogue that the member may request. Each opens the same filter sheet as the project Reports page, with an optional **Projects** filter (all, or a chosen few) and a Store filter where the report reads stock. It lists the member's recent central jobs.
- **New report kinds**, project and central unless noted: `purchase_requests`, `purchase_orders`, `material_received` (amounts with Material Received Financial), `material_transfers`, `stock_register` (a per-material ledger: opening, received, transfer in and out, consumed, missing, closing), `labour_attendance_central` (central only: every Project's labour days), and the existing `vendor_attendance` with Vendor and Labour Category pickers. These complete the legacy Reports tile apart from Inquiries and Bookings (M10) and the three "data" reports, which backups cover (§8).
- **A central report needs** Central Reports Read and the underlying module's Report flag. Rows cover only the Projects the member may see. Money follows the module's Financial flag, as for project reports.

### 6. Notifications (CM-904)

- **A `messaging` context:** `src/messaging`, schema `construction_messaging`, API `/api/construction/messaging`, Prisma prefix `ConstructionMessaging` (`03-target-architecture §2`). M9 builds notifications only; chat and support tickets are later.
- **Channels:**
  - **In-app:** the bell in the top bar with an unread count, a list, mark read, mark all read, delete.
  - **Web push:** VAPID with the `web-push` package and a service worker, `public/sw.js`.
  - There is no FCM: no native shell exists yet. There is no email for ordinary notifications; only backups (§8) and invitations email.
- **Who is notified.** A member receives a module's notifications only while they hold that menu's **Notification** flag, together with the flag the event needs: Approve for "waiting for your approval", or Read for the rest. For a Project-scoped menu they must also be assigned to the Project. The person whose action caused the event is never notified of it.
- **The events M9 delivers:**

  | Menu                       | Event                                                                          | Recipients                            |
  | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
  | any report kind            | Report ready / report failed                                                   | The requester (needs no N flag)       |
  | Backups / My Data          | Backup ready / export ready / failed                                           | The requester (needs no N flag)       |
  | Task                       | Assigned to you; completed                                                     | New assignees; creator and assignees  |
  | Task, Issues and snags     | Became delayed (daily job)                                                     | Assignees                             |
  | Issues and snags           | Assigned to you; update added; marked solved; reopened                         | Assignee; creator and assignee        |
  | Inspection Request         | Requested of you; approved / rejected                                          | Inspector; creator                    |
  | Daily Worksheet            | Waiting for approval; approved / rejected                                      | Approvers; creator                    |
  | Equipment Usage            | Sheet waiting for approval; fuel overrun                                       | Approvers; holders of N               |
  | Purchase Request / Order   | Waiting for approval; approved / rejected                                      | Approvers; creator                    |
  | Material Transfer          | Sent to your Project or Store; delivered                                       | Receiving side's holders of N; sender |
  | Material Request, Delivery | Raised; delivered                                                              | Central Store holders of N; requester |
  | Current Inventory          | Stock below minimum                                                            | Holders of N on the Project or Store  |
  | Transactions, Petty Cash   | Waiting for approval; approved / rejected                                      | Approvers; creator                    |
  | Parties                    | Invoice settlement waiting for approval; decided                               | Approvers; creator                    |
  | Leave, Attendance (HRMS)   | Leave applied / attendance correction waiting; decided; cancellation requested | Approvers; the employee               |
  | Salary                     | Salary approved / paid                                                         | The employee                          |

  Drawings uploaded, equipment transferred, holidays added and shift changes are left for later (the full `modules/13` catalogue).

- **How they are raised.** Modules raise domain events after commit, as they already do for tracking and procurement. Where a module has no event yet (worksheets, PR/PO decisions, transactions, petty cash, settlements, leave, attendance corrections, salary), M9 adds one. Messaging's listeners, wired in the composition root, turn each event into notification rows in one insert. They then enqueue one `push` queue job per notification, so a slow push service never slows the command. Each notification records its menu, a title, a short body, a link to the record, and an optional download (a report job or backup id).
- **Push consent is per browser.** **Turn on notifications on this device** asks the browser for permission and stores the subscription against the user and the signed-in session. Signing out of a device, or removing it (§9), deletes its subscription. A subscription the push service reports as gone (404/410) is deleted.
- **Preferences:** My Profile → Notifications has one switch per menu group to mute push for that group. In-app notifications are not mutable: the N flag is the Company's switch.
- **The in-app popup:** when a report, backup or export the member asked for finishes, a toast offers its download. It is driven by the unread-count poll (every 30 seconds, and every 3 seconds while the member has a job running).
- **Delete** removes a notification from the member's list (`deleted_at`). The delivery log remains (§3).

### 7. Approvals from a notification

Approve and Reject buttons inside a push (`modules/13` recommendation 4) are left for later. A notification opens the record, where the usual buttons and checks apply.

### 8. Backups and data export (CM-906)

- **What a backup is:** a ZIP holding one CSV and one JSON file per entity of the chosen modules, with a `manifest.json` (Company, Project, modules, date range, who, when, row counts).
  - The CSVs use the same labels as the screens; amounts are in rupees with two decimals.
  - **Media Backup** adds the module's files (photos, drawings, receipts) under `media/<module>/…`, named by record number.
  - A backup reads tombstoned rows out (deleted means deleted).
- **Scopes:**
  - **A Project backup** (Project → options → Backup): chosen modules and a date range, data and/or media. It needs Project Read and Read on each chosen module; amounts are left out without that module's Financial flag. The `modules/11` "Daily work backup" is this with the Daily Work modules ticked.
  - **A full Company backup** (Settings → Backup & export, **Owner only**): every module of every Project plus masters and the Company's settings. It always includes amounts. Requesting it sends a **six-digit code** to the Owner's email (or SMS when SMS is on, CM-0009); the code must be entered before the job is queued.
  - **Master records** are included in a Company backup and can also be backed up on their own: Masters → Backup. That needs Read on each master.
- **Delivery:**
  - The finished ZIP is stored privately.
  - A **signed link valid for 7 days** is shown in Downloads and in the "backup ready" notification. A full Company backup's link is also **emailed to the Owner**.
  - The download route checks the signature and expiry, and that the link belongs to the signed-in user.
  - Backups are **not refused when the plan has expired** (CM-118 keeps export open), and they do not count against storage.
- **Download My Data** (My Profile → Privacy): any user can download a ZIP of their own data. It holds their profile, their memberships and Team Member records in each Company, their sign-in devices, notifications and the audit events they caused. It is delivered the same way, with a 7-day link.
- **Size and time:** a backup job runs in parts. One queue job per module writes its part to storage; a final job zips the parts, so no single run exceeds 240 s. A backup over 2 GB fails with "Too large — choose fewer modules or a shorter range".

### 9. Devices (CM-906)

- **My Profile → Devices** lists the user's signed-in sessions from Better Auth's `sessions` table: browser and OS parsed from the user agent, the IP's coarse location left out, signed in on, last active, "This device", and whether push is on.
- **Sign out** ends one session; **Sign out of all other devices** ends the rest. Both go through Better Auth (`/revoke-session`, `/revoke-other-sessions`, added to the allow-list) and delete those sessions' push subscriptions.
- Web login by QR (`modules/13`) is left for a native shell.

### 10. Ownership, account and Company deletion (CM-906)

- **Transfer ownership** (Settings → Company → Transfer ownership, Owner only): choose an active member with a User, then enter a code sent to the Owner. The member becomes `owner` in `@repo/auth`, their Team Member gets the Owner designation and full matrix, and the old Owner becomes a `member` with the Admin template. There is one Owner at a time (CM-0002).
- **Delete My Account** (My Profile → Privacy):
  - **Refused for an Owner** (409 `OWNER_MUST_HAND_OVER`) while they own any Company, with links to Transfer ownership and Delete Company.
  - **For everyone else:** give a reason, type DELETE and enter a code. They are removed from every Company. Each Team Member record is kept as the Company's own record, marked **Left**, with its link to the User cleared. Their sessions, push subscriptions, notifications and preferences are deleted, and the identity row is erased (name, email and phone replaced; the row is kept so foreign keys hold).
  - Screens that name who did something show **"Deleted user"** for them.
  - An `account_deleted` record (user id, when, reason) is kept for audit.
- **Delete Company** (Settings → Company, Owner only): type the Company's name and enter a code. The Company enters a **30-day cooling-off**:
  - it is read-only for everyone (writes return 409 `COMPANY_DELETION_SCHEDULED`);
  - a banner names the date;
  - the Owner can **Cancel deletion** at any time.
  - A full Company backup is offered first.
  - On the day, the daily job deletes every row of the Company in every `construction_*` schema, its stored files and its memberships, and keeps a `company_deletions` record (id, name, Owner, requested and completed dates) outside the Company. The Better Auth workspace is deleted last. Subscriptions and invoices are kept for GST records (8 years), detached from the Company.

### 11. Aadhaar and PAN reveal needs a code

CM-108 deferred this to M9. **Reveal** on a Team Member's or Labour's Aadhaar or PAN now asks for a code sent to the viewer's own email (or SMS). A verified code allows reveals for 10 minutes in that session. Each reveal is still audited.

### 12. Left out of M9

- Chat (member, group, project) and support tickets (CM-905): the owner moved them out of this delivery.
- FCM and native push; email digests; WhatsApp (M12).
- Approve or Reject from a notification (§7).
- Scheduled automatic backups.
- The rest of the `modules/13` event catalogue (§6).
- Moving every dashboard section onto views (§4).
- Statutory, RERA, GST and Tally outputs (M11, M12).

## Consequences

- No new infrastructure: the queue, the cron, storage and email all exist already. Moving to Pro or to a worker later changes how a drain is started, not the handlers.
- A job can wait up to a day when nobody is watching it and its `after()` run died. In practice the per-request drain and the polling cover every job someone asked for; the daily sweep is a safety net.
- Notifications widen several command handlers (new events), but each module's tests stay its own; messaging's listeners are tested against the events alone.
- Company deletion is the first code that deletes across every schema. It runs table by table in foreign-key order and is covered by an HTTP test that counts rows in every schema before and after.
