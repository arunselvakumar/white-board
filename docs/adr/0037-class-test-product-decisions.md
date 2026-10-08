# Class test product decisions

[Issue #28](https://github.com/arunselvakumar/white-board/issues/28) lets the Owner and assigned Teachers record Tests for a Batch, enter each listed Student's result, and publish the results to the Student and linked Parents. The issue settled five decisions: families see only their own marks, results go live only when published, Teachers can correct published marks without approval and every change is logged, a Test is for a whole Batch or for one Student, and Test results belong to Reports. Four more questions were answered on 2026-10-08 before implementation. This record keeps the answers and the reasons.

## 1. Does this work build the Test reports?

**Decision:** No. This work builds the on-screen views only: the Batch's Tests, a Student's Test history, and the family Results page. The student test results report and the batch test performance report come with the Reports work.

No Reports spec exists yet, and a download is the easiest place for other Students' marks to leak. With nothing downloadable, the rule that families never see a batch average, highest score, rank, or other Students' marks holds by construction: the family read returns only that Student's own results.

**Considered options:** on-screen only (chosen); add CSV downloads now.

## 2. Where does a Teacher see a Student's Test history?

**Decision:** From the Batch's Tests. A Teacher opens a Student on a Test and sees that Student's Tests in every Batch the Teacher is assigned to. The Owner sees the Student's Tests from every Batch on the Student profile.

Teachers have no Student profile today; they work from their assigned Batches. Limiting a Teacher to their own Batches follows the rule that Teachers not assigned to a Batch can't see its Tests, even when the Student is shared.

**Considered options:** from the Batch, own Batches (chosen); from the Batch, all Batches.

## 3. Can a Test be edited or deleted?

**Decision:** Its details can be edited before and after publishing. Only an unpublished Test can be deleted.

- The name, maximum marks, pass mark, and topic note can change at any time. The maximum can't go below a mark already entered; the pass mark can't be above the maximum.
- The date can change only before publishing, and only to a date every Student with a saved result was in the Batch on. A single-student Test's Student must be in the Batch on the new date.
- Deleting a draft Test hides it and its saved results from everyone (an invisible tombstone, ADR-0019). A published Test can't be deleted, so a result a family has seen never disappears.

**Considered options:** edit anytime and delete drafts (chosen); edit drafts only and delete drafts; edit drafts only and never delete.

## 4. Can a Test be published with blank results?

**Decision:** No. Every listed Student must be scored, absent, or exempt before the Test can be published.

A family should never see a half-finished Test, and "blank" isn't one of the three results the issue allows. Publishing is refused with the names of the Students still blank.

**Considered options:** all must be filled (chosen); publish with blanks and show each result once it's entered.

## Also decided while implementing

- **Test dates.** A Test is dated from the day the Batch was created through today, in the Batch's timezone. Future and pre-Batch dates are refused, the same as a missed-date Attendance Register (WB-006). Closed Batches take no new Tests, but their marks can still be corrected and published.
- **Who is listed.** Until publishing, a whole-batch Test lists the Students whose Enrollment in the Batch had begun by the Test date and hadn't ended, and who hadn't been dropped, before it, plus anyone who already has a saved result. Publishing fixes the list: a published Test lists exactly the Students it was published with. A Student who leaves keeps their results; a Student who joins after the Test date isn't listed.
- **Marks.** Maximum and pass marks are whole numbers; the maximum is 1 to 1000. A mark is from 0 to the maximum in steps of 0.5, so half marks work. A scored result with a pass mark is a pass when the mark is at least the pass mark. Absent and exempt results have no mark. A remark is optional, up to 500 characters.
- **Saving.** Saving marks never publishes them. Staff can save a partly filled Test as a draft and come back to it.
- **Change history.** Only changes made after publishing are logged: each records the old and new result, mark, and remark, who changed it, and when. Edits to a draft aren't history. Staff see the history on the Test; families see only the current value. Changing a Test's details isn't logged.
- **Batch view numbers.** Average, highest, and lowest count scored results only. Single-student Tests are listed, marked as such, and left out of those numbers. Drafts are listed and marked as drafts; their numbers are shown to staff from what's saved so far.
- **Where it lives.** The Owner opens a Batch's Tests from the Batches list; a Teacher from My Batches. The Owner's Student profile shows the full Test history, drafts marked. Students and Parents get a **Results** page, and their Home shows the 5 latest published results for each Student. A Parent sees each linked Student separately.
- **What families see.** Each published result shows the Test name, date, Batch and Course, marks out of the maximum or absent or exempt, pass or fail when there's a pass mark, the remark, and the topic note. Nothing about other Students or the Batch as a whole.
- **Who can see what.** Unassigned Teachers get 403 for a Batch's Tests. Families never see an unpublished Test, not even that it exists. A family read returns a Student's own published results and nothing about anyone else.
- **Lists aren't paginated.** A Batch gets a few dozen Tests a year, and a Student's history is smaller still.
