# Absence Notice product decisions

[Issue #61](https://github.com/arunselvakumar/white-board/issues/61) lets a Student, or a linked Parent, tell the institute ahead of time that the Student will miss one or more upcoming Classes. The issue settled four decisions: Teachers are notified in the app and by email as soon as a notice comes in, there is no cutoff before the Class starts, both Students and Parents can give notice, and there is no monthly cap. Four more questions were answered on 2026-10-12 before implementation. This record keeps the answers and the reasons.

## 1. What does "notified in the app" mean?

**Decision:** A bell in the app shell with an unread count, opening a list of **Notifications** that can be marked read one at a time or all at once. Each Notification is also sent by email. The Notifications are generic in shape (a kind and a snapshot of what to show), but in this release only Absence Notices create them, and only Teachers receive them, so only Teachers see the bell.

Whiteboard had no in-app notifications: Class Changes deliberately notify nobody ([ADR-0029](./0029-class-change-product-decisions.md) §4). A card on My Batches would only be seen when the Teacher opens that page, which is what the issue rules out ("not just shown it on the class list"). A bell is visible on every page and is the place later notifications can go.

**Considered options:** bell and inbox, plus email (chosen); a card on My Batches; email only.

## 2. How does "informed absent" relate to the existing Excused status?

**Decision:** A new Attendance status, **Informed absent**, beside Unmarked, Present, Absent, Late, and Excused. It counts as an absence but is labelled and counted apart from Absent, which from now on means an uninformed absence. Excused keeps its meaning: the Teacher's own judgement that the absence shouldn't count against the Student.

Reusing Excused would give it two meanings, and old Excused marks would read as informed absences. Replacing it would rewrite marks Teachers already saved.

**Considered options:** a new Informed absent status (chosen); reuse Excused; rename Excused.

## 3. What do "reports" cover?

**Decision:** The Attendance views that exist today show Informed absent and Absent separately: a Register's summary, the Batch's list of Registers, the Owner's Attendance history for a Student, and the recent Attendance on Student and Parent Home. No attendance percentage or new report page is added.

There is no Reports PRD in the repository and no attendance percentage anywhere in the code. The issue's counting rule (an informed absence counts as an absence) is kept by every count that exists: Informed absent is never counted as attended.

**Considered options:** split the existing views (chosen); add an attendance percentage; add an Attendance report page per Batch.

## 4. How far ahead can notice be given?

**Decision:** For Classes in the next 60 days, the same horizon Student Home uses to find the next Class.

**Considered options:** 60 days (chosen); 30 days; 14 days.

## Also decided while implementing

- **One Absence Notice per Class.** Giving notice for a week away creates one Absence Notice for each Class picked, from one form with one reason and note. A Class is keyed the way a Class Change is: Batch, local date, and start time ([ADR-0028](./0028-class-changes-are-exceptions-over-weekly-timings.md)). A Moved Class is keyed by its new date and time. Each Enrollment can have one live Absence Notice per Class; giving notice again for a Class that already has one is refused.
- **Which Classes can be picked.** Classes of the Student's active Enrollments from now to 60 days ahead, in the Batch's timezone, that are still scheduled and haven't started (local start time not yet reached). That includes the new time of a Moved Class and Classes on Student-specific Timings. A Cancelled Class, a Holiday, the original slot of a Moved Class, and anything past or started can't be picked. Pickers show the Classes already noticed as given, not pickable.
- **Reason and note.** The reason is required: Sick, Exam, Travel, Family function, or Other. The note is optional, up to 300 characters.
- **Applies is worked out on read.** An Absence Notice is never rewritten when the schedule changes. It applies while its Class is still scheduled at that date and start time for an active Enrollment. So a Class cancelled after notice, a Holiday declared over it, or a Class moved away drops the notice from the Teacher's and Owner's lists, from the Register flags, and from Notifications; and nothing carries over to a moved Class's new time. If the Class Change is later undone (a Cancelled or Moved Class restored), the Class is the same Class again and the notice applies again. The family sees a notice that no longer applies tagged "Class cancelled", "Holiday", or "Class moved to …, give notice again if you'll miss it".
- **Withdrawing.** Any Student or Parent linked to the Student can withdraw a live Absence Notice until its Class starts, whoever gave it. A withdrawn notice is kept (with who withdrew it and when) but disappears from every list and flag. Withdrawing notifies the Teachers only if the notice still applied.
- **Who is notified.** Every Teacher actively assigned to the Batch whose Teacher profile is active and linked to a User. The email goes to that User's account email address. A Batch with no such Teacher notifies nobody; the Owner still sees the notice in the Absence Notices list. The Owner is never notified individually.
- **One Notification per Batch per action.** Giving notice for several Classes of one Batch at once sends each of its Teachers one Notification and one email listing the Classes. Classes in two Batches give two. Withdrawing is per Class.
- **What a Notification shows.** The Student, the Batch and Course, each Class's date and time, the reason, the note, and whether the Student or a Parent gave or withdrew it, with that User's display name. It links to the Absence Notices list.
- **The notice is saved even if email fails.** The Absence Notice and the in-app Notifications commit in one transaction; email is sent after the commit and a failure is logged, never shown to the family as an error.
- **Where Teachers and the Owner see expected absentees.** An **Absence Notices** page lists upcoming Classes in the next 60 days that have live notices that apply, by date and Class, with each Student, reason, note, and who gave notice. The Owner sees every Batch; a Teacher sees only their assigned Batches. Teachers, Students, and Parents never see another Student's contact details here.
- **The Register.** An Attendance Register still opens with every mark Unmarked in the database; nothing is marked by a notice. When a Student has a live notice for any of that day's Classes of the Batch, the Register flags them ("Notice given: Sick — by Parent") and the form pre-selects Informed absent for a mark that is still Unmarked. "Mark all Present" leaves those Students as Informed absent. The Teacher can pick any status, and Informed absent is available for any Student, because a Teacher may have been told some other way. A notice withdrawn after the Register is saved leaves the saved mark alone.
- **Family Home.** Student Home and Parent Home (one section per Student) show the Student's upcoming Absence Notices with a Withdraw button, and a **Give absence notice** button that opens the Class picker. A Parent gives notice for each child separately.
- **Who can see what.** Students and Parents see only notices for their linked Students. Teachers see notices only for their assigned Batches; another Batch's notice is 404. The Owner sees all. Teachers and the Owner cannot give or withdraw notice. Every read and write is scoped to the Active Workspace; another Workspace's notice is 404. A Notification is only ever visible to its recipient.
