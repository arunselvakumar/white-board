# Student and Parent Home product decisions

[Issue #12](https://github.com/white-board-io/white-board-v3/issues/12) replaces the Hello world page that invited Students and Parents land on (ADR-0027) with a Home that shows their next Class, remaining dues, recent Attendance, and ready recordings. Three product questions were answered on 2026-10-06 before implementation. This record keeps the answers and the reasons.

## 1. How does a Parent with several linked Students see them?

**Decision:** One page, with a section for each linked Student. Each section has the same four cards a Student sees.

Most families have one or two children at a centre, so a stacked page hides nothing behind a click. A Parent is linked to a Student when one of their verified email addresses matches the Student's father, mother, or Guardian email address. The Calendar already uses this rule.

**Considered options:** one page with a section each (chosen); one Student at a time with a picker.

## 2. How much recent Attendance and how many recordings?

**Decision:** The latest 5 marked Attendance entries and the latest 5 ready recordings for each Student.

There are no Student-facing history screens yet, so Home is the only place a family sees these. Five covers about a week for a daily Batch and keeps a page with several Students short. Unmarked entries are left out because they don't say anything yet.

**Considered options:** last 5 (chosen); last 10; everything from the last 30 days.

## 3. May Students and Parents download recordings?

**Decision:** Yes, for Classes of a Batch the Student is actively enrolled in, on or after the date the Enrollment began. A Parent gets the same access for each linked Student. The download uses the same short-lived signed URL as the Owner and Teacher.

WB-009 left family access to recordings for later. Families mostly want recordings to catch up on a missed Class, which is a Class they were enrolled for. Recordings from before the Student joined stay with the Owner and Teacher, so a late joiner doesn't get the whole Batch history by default. Access ends when the Enrollment ends or the Batch closes, the same as joining a Class. A Student on Student-specific Timings (home tuition) sees recordings only for their own Classes, not for the Batch's regular slots.

**Considered options:** download for Classes since the Enrollment began (chosen); download every recording in the Batch; keep family access deferred and show an empty card.

## Also decided while implementing

- **Dues are per active Enrollment**, the same rule the Owner Dashboard uses for its total. Each row shows the Fee Plan after concession, the amount paid, and what remains. Ended Enrollments are left out. The Fee Plan stores due dates but no record of which due date a payment covers, so Home doesn't show a "next due date". Proposed during implementation; the user can overrule it on the PR.
- **Next Class** is the earliest Class across the Student's active Enrollments that hasn't ended yet, looking up to 60 days ahead. A Class in progress counts as next. Cancelled and Holiday Classes are skipped, and a Moved Class shows at its new time. An Online or Hybrid Class links to its pre-join page. An Offline Class shows the room if the Batch has one.
- **Where Home lives.** `/student` and `/parent` are the Homes, and `/` sends Students and Parents there, the same way it sends Teachers to `/teacher`. The navigation item is labelled **Home**. The Owner and Teacher pages don't change.
- **One read for every section.** `GET /api/training-institute/home` returns a list of Students for both roles: one item for a Student, one per linked Student for a Parent. It returns 403 for the Owner and Teachers, who have their own Homes.
