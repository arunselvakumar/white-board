---
title: P0 — Replace the register
slug: training-institute-p0
status: accepted
phase: P0
product: Whiteboard
institution_type: training_institute
created: 2026-09-12
updated: 2026-09-12
owner: product
audience:
  - computer education centres (CSC-style)
  - home tuition centres
  - skill / spoken English / vocational centres
success_metric: >
  A Workspace Owner can add a Student, enroll them in a Course/Batch with
  Timings and Class Mode, collect a Fee Payment with a Receipt, and see who
  is in today's Batches — without a paper register or spreadsheet.
in_scope:
  - Student records
  - Course catalog
  - Batches
  - Enrollment (Timings + Class Mode)
  - Fee Plan, Fee Payment, Receipt
  - Owner Dashboard
out_of_scope:
  - enquiry CRM and demo-class follow-up
  - attendance
  - clash-aware session calendar
  - certificates and ID cards
  - WhatsApp / SMS
  - UPI gateway and GST invoices
  - live classroom (Zoom is a URL on the Batch, not a product)
  - Student or Guardian login
  - staff payroll
  - multi-branch / franchise royalty
  - School and College modules
related:
  - CONTEXT.md
  - docs/prd/tasks.md
  - docs/adr/0009-context-first-modular-monolith.md
  - docs/adr/0015-task-based-commands-not-generic-patch.md
  - docs/adr/0018-clerk-ids-as-opaque-foreign-keys.md
---

# P0 — Replace the register

Whiteboard's first Training Institute slice. School, Preschool, College, University, and Other stay **Coming soon**. Language in this document matches [CONTEXT.md](../../CONTEXT.md). Tickets are [tasks.md](./tasks.md).

## Problem Statement

A Training Institute owner — CSC-style computer centre, home tuition centre, spoken English or vocational shop — runs the business in a paper register and a spreadsheet:

- Student names, phones, and photos in one book
- Which course and batch each person is in, in another
- Who paid, who owes, and handwritten receipts in a third

They lose dues, double-book weekday batches, and cannot answer “who is in this morning’s Tally batch?” without flipping pages. Competing products (Proctur, Teachworks, institutesoftware.in, TutorCruncher) already sell this loop. Whiteboard has authentication and a Workspace, and nothing the owner can run a centre with.

They do not need a school ERP. They need the register on a screen.

## Solution

After Workspace Creation (Training Institute, the only selectable Institution Type), the Owner lands on an Owner Dashboard and can:

1. Add a **Student** (admit them — no enquiry pipeline in P0)
2. Define **Courses** the centre teaches
3. Open **Batches** of those Courses with default **Timings**, **Class Mode**, and capacity
4. Create an **Enrollment**: this Student in this Course/Batch, with Class Mode and Timings (inherit the Batch, or Student-specific for home tuition)
5. Attach a **Fee Plan**, take a **Fee Payment** (including partial), print a **Receipt**
6. See **today’s Batches**, active Student count, and outstanding dues on the Owner Dashboard

One Workspace is one centre. Students are records, not Users. Fees hang off the Enrollment, not the Student, because one person can take Tally and DCA.

## User Stories

1. As a Workspace Owner, I want Training Institute selected for me at Workspace Creation, so that I am not asked to pick School or College.
2. As a Workspace Owner, I want to add a Student with name, phone, optional email, photo, address, ID proof note, and Guardian name and phone, so that walk-in admissions leave the paper form.
3. As a Workspace Owner, I want to edit a Student, so that a wrong phone number is fixable.
4. As a Workspace Owner, I want to list Students with search by name or phone, so that I can find someone at the desk.
5. As a Workspace Owner, I want to mark a Student Dropped, so that they leave the active register without deleting history.
6. As a Workspace Owner, I want to import Students from a simple spreadsheet later without blocking P0 typed entry, so that existing centres can migrate — typed create is enough to ship; bulk import is a stretch inside P0 only if it does not delay the loop.
7. As a Workspace Owner, I want to create a Course with name, duration, description, and a default fee, so that DCA and Tally are catalog items, not batch names.
8. As a Workspace Owner, I want to edit or archive a Course, so that we stop offering a program without erasing past Enrollments.
9. As a Workspace Owner, I want to list Courses, so that staff can see what we teach.
10. As a Workspace Owner, I want to create a Batch for a Course with name, Class Mode (Offline, Online, Hybrid), capacity, optional room, optional online join URL, and default Timings (days of week + start and end time), so that “DCA Weekday 9–11 Lab 1” exists.
11. As a Workspace Owner, I want to edit a Batch’s Timings, capacity, room, and join URL, so that a timing change is not a new Batch unless I choose to open one.
12. As a Workspace Owner, I want to close a Batch to new Enrollments, so that a full or finished run stops taking Students.
13. As a Workspace Owner, I want to see how many Students are enrolled in a Batch against its capacity, so that I know if there is a seat.
14. As a Workspace Owner, I want to refuse an Enrollment when the Batch is at capacity, so that we do not oversell a lab.
15. As a Workspace Owner, I want to enroll a Student in a Batch, so that they are on that Course’s register.
16. As a Workspace Owner, I want one Student to have several Enrollments, so that the same person can take Tally and Python.
17. As a Workspace Owner, I want the Enrollment to inherit the Batch Class Mode, and to override it when this Student is online in an otherwise Offline Batch (Hybrid at the person, not only at the Batch), so that mixed rooms work.
18. As a Workspace Owner, I want the Enrollment to inherit Batch Timings, so that computer-centre Students follow the group clock.
19. As a Workspace Owner, I want to set Student-specific Timings on an Enrollment, so that a home-tuition Student can be Sunday 5–6 when the Batch default does not apply.
20. As a Workspace Owner, I want to move a Student from one Batch to another of the same Course, so that a timing change does not require deleting them.
21. As a Workspace Owner, I want to end an Enrollment, so that a completed or dropped Course leaves the active list.
22. As a Workspace Owner, I want a Fee Plan created with the Enrollment, defaulting from the Course fee, so that I am not retyping amounts.
23. As a Workspace Owner, I want to choose one-time, monthly, or a fixed number of installments, with due dates, so that CSC-style admission + monthly and short-course lump sums both work.
24. As a Workspace Owner, I want to adjust the Fee Plan amount or concession on this Enrollment, so that a sibling discount is not a new Course.
25. As a Workspace Owner, I want to record a Fee Payment (full or partial) with method Cash, UPI, Card, or Other, so that desk collection is in the system the same day.
26. As a Workspace Owner, I want a Receipt number issued for every Fee Payment, so that the parent leaves with a document.
27. As a Workspace Owner, I want to print or download that Receipt, so that I can hand it over or WhatsApp a PDF later (WhatsApp send is not P0).
28. As a Workspace Owner, I want to see remaining dues on an Enrollment, so that I know what to collect.
29. As a Workspace Owner, I want a list of Fee Payments for a Student, so that I can answer “did they pay June?”
30. As a Workspace Owner, I want the Owner Dashboard to show active Student count, total outstanding dues, today’s Batches (by weekday) with enrolled counts, and recently added Students, so that I can run the morning without opening four screens.
31. As a Workspace Owner, I want to open today’s Batch and see the enrolled Students, so that I know who should be in the room or on the link.
32. As a Workspace Owner, I want empty states that tell me to add a Course, then a Batch, then a Student, so that a brand-new centre is not a blank table.
33. As a Workspace Owner, I want every list scoped to my Active Workspace, so that another centre’s Students never appear.
34. As a Workspace Owner, I want to sign in and land on this dashboard, not a sample Todo, so that Whiteboard feels like the product I bought.
35. As staff with access to the Workspace, I want the same register operations as the Owner in P0, so that the front desk can collect fees without a second role model. (Fine-grained staff permissions are not P0.)
36. As a developer, I want Students not stored as Clerk Users, so that we do not bill identity seats per learner.
37. As a developer, I want the sample Todo context gone once the first real resource ships, so that the monolith template is not mistaken for the product.

## Implementation Decisions

- **First real bounded context is `training`.** Lives at `apps/whiteboard/src/training/{domain,application,infrastructure}` per ADR-0009. HTTP adapters stay in `app/api/`. Prisma stays in `packages/db`. The `todo` context is deleted when Student (or the first training resource) is queryable — ADR-0009.
- **Aggregates (few, with real invariants — ADR-0022):**
  - **Course** — name, duration, description, default fee amount, archived flag.
  - **Batch** — belongs to one Course; Class Mode; capacity; room; join URL; default Timings; open/closed to enrollment.
  - **Student** — profile fields; Active or Dropped; Guardian fields on the same record (not a separate aggregate).
  - **Enrollment** — one Student, one Course, one Batch; Class Mode (default Batch, optional override); Timing source (`batch` or `student`); Student-specific Timings when source is `student`; status Active or Ended; owns the Fee Plan.
  - **Fee Payment** — amount, method, paid at, recorded-by User id, Receipt number. Fee Plan is part of Enrollment, not its own aggregate, unless splitting it simplifies invariants; do not invent a fifth aggregate without an invariant that needs it.
- **Money** is integer minor units (paise). Currency is INR for P0. No float. No multi-currency.
- **Receipt number** is sequential per Workspace, not global. Format can be `R-0001`. Gaps from failed attempts are acceptable; duplicates are not.
- **Timings** on a Batch: one or more weekly slots `{ daysOfWeek, startTime, endTime }` in the Workspace local time. P0 is not timezone-heavy; store a Workspace timezone defaulting to `Asia/Kolkata`.
- **Class Mode** values: `offline` | `online` | `hybrid`. An Online or Hybrid Batch may have a join URL. Offline may have a room. Neither is required to save (a centre may add the link later).
- **Capacity**: Enrollment of an Active Enrollment against an open Batch fails with a domain conflict (HTTP 409) when at capacity. Ended Enrollments do not occupy a seat.
- **Students are not Users.** `workspaceId` and `createdByUserId` / `recordedByUserId` are opaque Clerk ids (ADR-0018). No Student table in Clerk. No Guardian login.
- **Soft delete** on Course, Batch, Student, Enrollment, Fee Payment: invisible tombstone (ADR-0019). Get/mutate of a tombstone is 404. Archive/close/drop are explicit domain operations, not deletes. Prefer Drop Student / End Enrollment / Close Batch / Archive Course for the happy path; delete is for mistakes.
- **Commands, not PATCH** (ADR-0015). Examples (names may tighten in code, not in HTTP as generic update):
  - `CreateStudent`, `RenameStudent` / `UpdateStudentProfile`, `DropStudent`
  - `CreateCourse`, `UpdateCourse`, `ArchiveCourse`
  - `CreateBatch`, `UpdateBatchSchedule`, `CloseBatch`
  - `EnrollStudent`, `OverrideEnrollmentMode`, `SetEnrollmentTimings`, `MoveEnrollment`, `EndEnrollment`
  - `RecordFeePayment` (creates Receipt), `AdjustFeePlan`
  - No `PATCH /api/students/:id` that takes an arbitrary bag of fields if a named command exists. Profile edits that are truly one “correct the form” operation may be a single `UpdateStudentProfile` command — that is still a named task, not a generic resource patch.
- **HTTP** is Next.js Route Handlers in Whiteboard (ADR-0006). Logical CQRS, no bus (ADR-0007). Zod only on Request/Response models (ADR-0016). Models live next to routes (ADR-0021). OpenAPI from those models; a route is not done until it appears at `/api/docs` (ADR-0012). Errors use the JSON envelope (ADR-0017). Tenant is Active Workspace on the Session (ADR-0014): no Session → 401; no Active Workspace → 403; other tenant’s id → 404.
- **List** uses bidirectional cursor pagination plus total (ADR-0020). Student list additionally supports a `q` search on name and phone (filter on the query, not a second pagination style).
- **Domain events** in-process after persist (ADR-0008): at least `StudentCreated`, `StudentEnrolled`, `FeePaymentRecorded`. Listeners may be no-ops in P0.
- **In-app chrome:** replace the placeholder In-app Home with the Owner Dashboard. Add authenticated navigation: Dashboard, Students, Courses, Batches, Fees. Screens use `@repo/ui` (frontend-patterns). Forms are react-hook-form + zod. Client reads use TanStack Query `queryOptions` + `useSuspenseQuery` (ADR-0026). Storybook play functions for each form and empty state.
- **Online class in P0** is a join URL on the Batch (and optional override on Enrollment). Do not build video.
- **Bulk Excel import** is not required to close P0. Typed create is.
- **Permissions:** any Workspace member may perform P0 register operations. Role split is not P0.
- **First vertical slice to demo:** Student list/create (even before Course) is acceptable as an early ticket, but the slice is not “done” until Enrollment + Fee Payment + Owner Dashboard exist.

### Suggested HTTP shape (commands behind these)

Illustrative, not a frozen contract. Adapters map RequestModels to commands.

| Method | Path | Command / query |
| --- | --- | --- |
| POST | `/api/students` | CreateStudent |
| GET | `/api/students` | ListStudents (`q`, cursors) |
| GET | `/api/students/:id` | GetStudent (includes Enrollments summary) |
| POST | `/api/students/:id/profile` | UpdateStudentProfile |
| POST | `/api/students/:id/drop` | DropStudent |
| POST | `/api/courses` | CreateCourse |
| GET | `/api/courses` | ListCourses |
| GET | `/api/courses/:id` | GetCourse |
| POST | `/api/courses/:id/update` | UpdateCourse |
| POST | `/api/courses/:id/archive` | ArchiveCourse |
| POST | `/api/batches` | CreateBatch |
| GET | `/api/batches` | ListBatches (optional `courseId`) |
| GET | `/api/batches/:id` | GetBatch (includes enrolled count) |
| POST | `/api/batches/:id/schedule` | UpdateBatchSchedule |
| POST | `/api/batches/:id/close` | CloseBatch |
| POST | `/api/enrollments` | EnrollStudent |
| GET | `/api/enrollments/:id` | GetEnrollment |
| POST | `/api/enrollments/:id/mode` | OverrideEnrollmentMode |
| POST | `/api/enrollments/:id/timings` | SetEnrollmentTimings |
| POST | `/api/enrollments/:id/move` | MoveEnrollment |
| POST | `/api/enrollments/:id/end` | EndEnrollment |
| POST | `/api/enrollments/:id/fee-plan` | AdjustFeePlan |
| POST | `/api/enrollments/:id/payments` | RecordFeePayment |
| GET | `/api/enrollments/:id/payments` | ListFeePayments |
| GET | `/api/payments/:id/receipt` | GetReceipt |
| GET | `/api/dashboard` | GetOwnerDashboard |

## Testing Decisions

- Test external behaviour, not private methods. Domain tests construct aggregates and assert invariants and recorded events. HTTP tests hit Route Handlers against real Postgres (`whiteboard_test`), same as Todo.
- **Domain unit tests (no Prisma)** for: Student drop; Course archive; Batch capacity; Enrollment mode/timing rules; Fee Plan remaining dues; Receipt number uniqueness in the aggregate’s terms; cannot enroll in a closed or archived Course/Batch.
- **HTTP tests on Postgres** for: 401 / 403 / 400 / 404 / 409; list cursors; Student search; capacity 409; payment larger than remaining dues 409; Workspace isolation (id from another org → 404).
- **Storybook play functions** for: Student create/validation; Course create; Batch create with Class Mode and Timings; Enroll flow (inherit vs Student-specific Timings); record payment + remaining dues; Owner Dashboard empty and populated states; desktop and the form layouts already used in onboarding.
- Do not add Playwright for P0 unless Storybook cannot exercise a flow. Follow ADR-0023.
- OpenAPI: every new route visible at `/api/docs`.
- When the first training resource is live, delete `src/todo` and `/api/todos` and their tests so they cannot rot.

## Out of Scope

P1 (do not sneak in): attendance, enquiry/lead pipeline, clash-aware session calendar, trainer availability, parent absent alerts, in-app announcements.

P2 (do not sneak in): certificates/QR, WhatsApp Business, Razorpay/UPI gateway, GST receipts, student/parent portal, exams, expenses/P&L, multi-branch, franchise royalty splits (Aptech vs CSC/Sarva are different — a later add-on, not the default).

Never in Training Institute P0: transfer/migration/bonafide certificates, transcripts, merit lists, homework diary, alumni, faculty HR, library, transport, hostel, board exam gradebooks. Those wait on School / College Institution Types.

## Further Notes

- Hybrid Batch means some Students in the room and some on the link under **one** Enrollment register. P0 captures mode and URL. Attendance from “join” vs “QR” is P1.
- CSC/Sarva-style centres keep admission, monthly, and exam fees. P0 Fee Plan can represent that as one-time + installments or monthly; a dedicated “exam fee” line is not required if a second Enrollment or a concession/adjustment can wait.
- Home tuition is the reason Enrollment Timings can ignore the Batch clock. Do not force 1:1 centres to fake a 30-person Batch.
- Competitive references used to shape P0, not to clone screens: Proctur, Teachworks, TutorCruncher, institutesoftware.in, ExtraaEdge (CRM only — not the bar for batches).
- Work the tickets in [tasks.md](./tasks.md) in sequence. Status there is the tracker until issues are filed.
