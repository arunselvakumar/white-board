---
title: Class Changes — cancellations, Holidays, and Moved Classes
status: accepted
phase: P1
product: Whiteboard
institution_type: training_institute
issue: https://github.com/white-board-io/white-board-v3/issues/13
created: 2026-10-06
---

# Class Changes — Training Institute

## Goal

An Owner or assigned Teacher can cancel one Class or move it to another date or time. The Owner can declare a Holiday that cancels every Class in the Workspace. Everyone who can see a Class sees the change on their Calendar, with the reason if one was given. Online Classes, Attendance, and the Owner Dashboard all respect the change.

Decisions behind this spec: [ADR-0028](../adr/0028-class-changes-are-exceptions-over-weekly-timings.md) (how changes are stored) and [ADR-0029](../adr/0029-class-change-product-decisions.md) (answers to the issue's open questions).

## Language

- **Class**: one meeting of a Batch on a local date at a start time. Weekly Timings produce Classes; Whiteboard doesn't store a row per Class.
- **Cancelled Class**: a Class that won't happen. It may carry a reason.
- **Moved Class**: a Class moved to a new date and/or time. The original slot shows as moved; the new slot shows the Class with a **Rescheduled** marker.
- **Holiday**: one date or a date range on which every Class in the Workspace is cancelled. It may carry a reason, such as "Diwali".
- **Upcoming changes**: the list at the top of the Calendar of Cancelled Classes, Moved Classes, and Holidays in the next 14 days.

## Workflow

1. On the Calendar, an Owner or assigned Teacher opens a Class and chooses **Cancel class** or **Move class**. A reason is optional (up to 200 characters). Moving asks for a new date, start time, and end time.
2. A Cancelled Class or a Moved Class shows **Restore**, which brings the Class back for everyone while it hasn't happened yet. A Rescheduled Class can be moved again or cancelled.
3. The Owner opens **Holidays** on the Calendar to declare a Holiday (start date, end date, optional reason) or remove an upcoming one.
4. Students, Parents, Teachers, and the Owner see the change in day, week, and month views, and in Upcoming changes.

## Rules

- Owner: any Batch in the Active Workspace. Teacher: only Batches with an active assignment and an active, linked Teacher profile. Holidays are Owner-only. Students and Parents get 403 on every change command.
- A Class Change applies to one Class (Batch, date, start time). The Batch's weekly Timings never change.
- Only today or future Classes can change. A Class that has started (its start time has passed or an online meeting exists for it) or has any saved Attendance Mark can't be cancelled, moved, or restored.
- The new time of a Moved Class must be in the future. End time must be after start time. It can't land on a Holiday, on another Class of the same Batch with the same start time, or on its own original slot.
- A Class on a Holiday can't be cancelled; it is already off. It can be moved.
- Restoring a Moved Class also removes its new slot. That slot must not have started.
- Editing Batch Timings or Student-specific Timings is refused while it would remove the original slot of an upcoming Moved Class. Restore that Class first.
- A Holiday is one or more dates (at most 92 days), starting today or later in every Batch's timezone. If it includes today, it is refused when any Class today has started or has saved Attendance. Holidays can't overlap. A Holiday can be removed until its first day has passed.
- Students on Student-specific Timings are affected only when their own Class (same Batch, date, and start time) changes.
- Everything is scoped to the Active Workspace. Other Workspaces' Batches return 404.

## Effects

- **Calendar:** Cancelled and Holiday Classes appear struck through with their reason. A Moved Class's original slot names the new time. Its new slot shows **Rescheduled**. Owner and Teacher Calendars also list Student-specific Classes for home tuition.
- **Online Classes:** the pre-join page for a Cancelled or Holiday Class says so and offers no Start or Join. A Moved Class points to its new time and can be started and joined there.
- **Attendance:** a Register can't be opened for a date on which every Class is cancelled. A Moved Class can be marked on its new date, with the Students of the original Class. A Register that has only Unmarked rows and no Class left is removed when its Classes are cancelled, so it never shows as a gap.
- **Owner Dashboard:** today's Batches leaves out a Batch whose every Class today is cancelled, and includes a Batch with a Class moved to today.

## Outside this slice

WhatsApp, SMS, or email notifications; a notification inbox; adjusting fees or making up hours automatically; Students or Parents asking for a reschedule; clash detection with other Batches or Teacher availability; importing holiday lists; changing a Batch's weekly Timings; Holidays for selected Batches only.

## Delivery

Prisma migration, domain rules with unit tests, HTTP commands with OpenAPI and Postgres HTTP tests, Calendar and pre-join UI with Storybook play functions, and typecheck, lint, and build.
