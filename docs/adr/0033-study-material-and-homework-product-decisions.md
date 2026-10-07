# Study Material and Homework product decisions

[Issue #21](https://github.com/white-board-io/white-board-v3/issues/21) lets the Owner and assigned Teachers share Study Material with a Batch and set Homework against a Class date, and lets Students and Parents see them, submit Homework, and read the Teacher's remark. The issue settled four decisions: late joiners see earlier items, Parents can submit for a Student, remarks are visible to Parents, and Homework belongs to a Class date. Four more questions were answered on 2026-10-07 before implementation. This record keeps the answers and the reasons.

## 1. What does a Student who leaves a Batch still see?

**Decision:** Items posted while they were enrolled, read-only. Nothing posted after they left.

An Enrollment that ends, a Batch that closes, or a Student who is dropped all end access to new items. Material and Homework posted up to that moment stay readable for the Student and their linked Parents, together with their own Submissions and remarks. They can't submit, change, or undo a Submission once access has ended. Their Submissions stay on the Teacher's list.

Moving an Enrollment to another Batch moves the Student. Whiteboard keeps no record of the old Batch on the Enrollment, so the old Batch's items are no longer shown to the family. Their Submissions in the old Batch stay on record for the Owner and Teachers.

**Considered options:** nothing after leaving, the same as recordings; items from while enrolled (chosen).

## 2. Does Homework set before a Student joined count against them?

**Decision:** No. They see it, but it isn't owed.

A Student who joins late sees every item already shared with the Batch (the issue's rule). Homework due before their Enrollment began is shown for reference: it isn't flagged overdue to them or their Parents, and they don't appear as "Not submitted" or "Late" on the Teacher's list. They can still submit it, and a Submission shows up on the Teacher's list like any other.

The Enrollment begins on the local date it was created in the Batch's timezone, the same date Attendance and recordings use.

**Considered options:** visible but not owed (chosen); owed like everyone else.

## 3. Can a Student or Parent change a Submission?

**Decision:** Yes, until the Teacher checks it.

Until it's checked, the Student or a linked Parent can change the note, replace attachments, or undo "done". Once the Owner or a Teacher marks it checked, it is locked. The Submission keeps who first marked it done (the Student or a Parent) and when; Late compares that first time with the current due date, so a later change doesn't make it late. Who made the latest change is recorded too. Undoing ends the Submission; marking it done again starts a new one.

**Considered options:** until checked (chosen); never; always, with a "changed after checking" flag.

## 4. Which files can be attached, and where are they kept?

**Decision:** PDF, JPEG, and PNG, up to 4 MB each and 5 per item, stored in Postgres. Photos are resized in the browser before upload.

Notes, worksheets, and photos of written work cover what centres send today. Teacher documents already keep PDF and images in Postgres with the same content checks (file signature, a readable PDF or image), so Study Material, Homework, and Submissions use that path, and no new storage service is needed. Files aren't encrypted; they're not identity documents. A file is downloaded through Whiteboard only by someone who can see the item it belongs to.

The first answer was 5 MB. Whiteboard runs on Vercel, which refuses a request body over 4.5 MB, so the limit became 4 MB with each file sent on its own request. The browser shrinks a photo to at most 2000 pixels on its long edge before sending it, so a phone photo of written work fits. A PDF over 4 MB is refused with a message. Each file is uploaded first and then attached when the item is saved; an upload that is never attached is deleted after a day.

**Considered options:** PDF and photos in Postgres (chosen); also Word, Excel, and PowerPoint, 10 MB; files over 4 MB uploaded straight to the private R2 bucket with a signed URL.

## Also decided while implementing

- **Who posts.** The Owner posts to any Batch. A Teacher posts only to open Batches they're assigned to; anything else is 403. Either can edit or remove any item in a Batch they can post to, whoever posted it. Closed Batches take no new items or edits, but Submissions can still be checked.
- **Class dates.** A Class date is a date on which the Batch has a Class that will happen: from the Batch Timings or a Student's own Timings in that Batch, with Class Changes and Holidays applied. A Cancelled or Holiday Class isn't offered; a Moved Class counts on its new date. Homework needs a Class date and a due date on or after it. Study Material may have a Class date. The form offers the last 60 days and the next 14.
- **Due dates and overdue.** Homework is due by the end of its due date in the Batch's timezone. It is overdue from the next day until it's submitted. A Submission is Late when it was made after the due date. Changing the due date changes both.
- **What a Study Material needs.** A title, plus at least one of a short note, a link, or a file.
- **Removing.** Removing hides an item from Teachers, Students, and Parents. The Owner still sees it, marked Removed, with its Submissions. There is no restore yet.
- **Checking.** Only a Submission can be checked; the Teacher can't check Homework nobody submitted. The remark is optional, up to 500 characters, and can be changed after checking. Checking records who checked it and when. The Student and linked Parents see the remark.
- **Who submitted.** The Teacher's list shows "by Student" or "by Parent" for each Submission.
- **Where it lives.** The Owner opens a Batch's Homework and Study Material from the Batches list; a Teacher from My Batches. Students and Parents get a **Homework** page with both, and their Home shows Homework that's overdue or due in the next 7 days and the 5 newest Study Materials.
- **Lists aren't paginated.** A Batch's Study Material and Homework, and a family's Homework page, are returned whole without file data. A Batch gets a few hundred items in a year at most.
