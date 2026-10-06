---
title: Student Attendance — Training Institute
status: accepted
phase: P1
product: Whiteboard
institution_type: training_institute
created: 2026-09-25
---

# Student Attendance — Training Institute

## Goal

An Owner or assigned Teacher can open an Attendance Register for a Batch on today or a missed earlier date, mark each scheduled Student, correct a mark, and see what remains unmarked. The Owner can review a Student's Attendance history. Attendance does not alter Enrollment or Fees.

## Language and scope

- An **Attendance Register** belongs to one Batch and one local calendar date in the Batch's timezone. This first release has one Register per Batch per date, not a session calendar or multiple meetings on one day.
- An **Attendance Mark** belongs to one Enrollment in that Register and retains the Student ID and name shown when the Register was opened. A Student is not a Clerk User.
- Status is Unmarked, Present, Absent, Late, or Excused. Unmarked never counts as Absent. Late counts as attended in summaries; Excused is reported separately.
- Owner and active Teachers assigned to the Batch may open and mark its Register. Teachers see only their assigned Batches and the names needed for Attendance, with no contact or Fee information.

## Workflow

1. Owner opens Attendance from navigation and chooses a Batch. Teacher opens Attendance from My Batches. Either can open today's Register or choose an earlier date after the Batch was created.
2. Opening is idempotent for each Batch and local date. On first open, snapshot current active Enrollments in the Batch whose effective Timings include the selected local weekday. Student-specific Timings override Batch Timings for this eligibility check. A missed date uses the current roster and Timings, which may differ from that date's actual roster; the User reviews the Students before saving Marks. Reject a future date, a date before Batch creation, a closed Batch, a day with no scheduled Timings, or an empty scheduled roster.
3. The page shows every Student as Unmarked until the Owner or Teacher selects a status. "Mark all Present" fills the form, then Save Attendance writes the marks. The summary shows counts and whether the Register is complete.
4. A later save may correct marks. Each actual status or note change records old and new values, actor Clerk User ID, and time. Repeated identical saves do not add audit rows.
5. Owner can list Registers for a Batch and review a Student's Attendance history. Historical Registers keep their original roster after Enrollment changes.

## Rules

- A new Register may be created for today or an earlier date from Batch creation onward, using the Batch timezone. Existing Registers can be corrected later. The app does not reconstruct past Enrollment moves or Timing changes, so a backdated Register uses the current scheduled roster and requires User review before Marks are saved.
- A Teacher must have an active Teacher profile linked to the Clerk User and an active Batch assignment at the time of opening or marking. Owner access is Workspace-wide.
- Active Workspace comes from Clerk Session; no Workspace ID in request bodies. Missing Session 401, missing Active Workspace or disallowed role 403, foreign Workspace resource 404.
- Save rejects a Mark outside the Register roster, duplicate Enrollment IDs in a request, unknown statuses, and overlong notes. All marks in a request commit atomically.
- One active Register per Workspace, Batch, and local date. Soft deletes are invisible tombstones. No delete UI in this slice.

## Outside this slice

Automatic absences, QR or biometric check-in, geolocation, parent alerts, Student self-service, multiple meetings per Batch per day, exact historical roster reconstruction, and clash-aware session calendar. Cancelled Classes, Moved Classes, and Holidays were added later by [Class Changes](./training-institute-class-changes.md).

## Delivery

Domain rules, Prisma migration, Owner and Teacher HTTP routes with OpenAPI, Attendance screens and Student history, Storybook interactions, domain and Postgres HTTP tests, typecheck, lint, and build.
