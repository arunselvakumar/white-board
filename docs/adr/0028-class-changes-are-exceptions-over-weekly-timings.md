# Class changes are exceptions over weekly Timings

Batches and Student-specific Timings repeat weekly with no end date. Owners need to cancel one class, move one class, or close the whole Workspace for a Holiday. We do not materialize a row per class. We store only the exceptions and apply them when a class is read.

A **Class** is identified by Batch, local date (in the Batch's timezone), and start time. That is the same key the online Class pre-join page and `class_occurrences` already use. A **Class Change** is one row per original Class: either `cancelled`, or `moved` with a new date, start time, and end time. Cancelling or moving a moved Class updates that same row, so there is never a chain of moves. Restoring a Class tombstones its Class Change (ADR-0019). Only one active Class Change may exist per original Class, and only one active Moved Class may land on a given Batch, date, and start time. Partial unique indexes enforce both.

A **Holiday** is a separate Workspace-wide row with a start and end date. Its dates are read in each Batch's own timezone. It cancels every Class on those dates, including Moved Classes that land there. A Holiday never edits Class Change rows, so removing it brings every affected Class back as it was.

The Class key applies to every Enrollment whose own Class that day has the same start time. Enrollments that inherit Batch Timings are affected by changes to Batch Classes. Enrollments with Student-specific Timings are affected only when their own start time matches. If two home-tuition Students in one Batch share a start time on the same day, they share a Class.

One pure function, `classesOn`, works out the effective Classes for a Batch or Enrollment on a date from its weekly Timings, Class Changes, and Holidays. The Calendar (client), online Classes, Attendance, and the Owner Dashboard all call it, so they can't disagree. The Calendar response carries the raw Class Changes and Holidays next to the weekly items. The client expands them for whatever range is on screen, so the Calendar stays a single read.

Commands that change Classes refuse past or already-started Classes. A Class has started once its start time has passed or an online meeting exists for it. Commands also refuse a Class whose Attendance Register has any saved Mark. If a Register exists only with Unmarked rows and no Class remains on that date, it is tombstoned, so it can't show up as a gap in Attendance history.

**Considered options:** generate a row per Class ahead of time (a session calendar). That needs a horizon, a backfill job, and a migration every time Timings change. Store exceptions keyed by Batch, date, and start time (chosen). Add an `exceptions` JSON column on the Batch. That has no audit trail and can't enforce uniqueness, and Student-specific Timings would need their own copy.
