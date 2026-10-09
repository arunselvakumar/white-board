# Fee dues follow-up product decisions

[Issue #36](https://github.com/arunselvakumar/white-board/issues/36) gives the Owner a dues list (Overdue, Due soon, All with a balance) and a way to log **Fee Follow-ups** on an Enrollment, so chasing fees moves out of notebooks and WhatsApp. The issue settled three decisions: fee chasing is Owner-only, "due soon" means within the next 3 days, and when due dates are unclear it is enough to sort by amount owed and show the Fee Plan's dates as a guide. Four more questions were answered on 2026-10-09 before implementation. This record keeps the answers and the reasons.

## 1. How is an Enrollment Overdue or Due soon when payments aren't matched to instalments?

**Decision:** Oldest due first. The Fee Payments made so far are counted against the Fee Plan's due dates in date order, earliest first. This is only a way of reading the dues; nothing is stored, and how a Fee Payment is recorded doesn't change.

- **Overdue:** the amounts due before today add up to more than the total paid.
- **Due soon:** some due date from today to 3 days ahead still has an unpaid part after the earlier dates are covered.
- An Enrollment can be both, for example an instalment missed last week and the next one due on Friday.

Read literally, "a due date before today with money still owed" would mark a Student Overdue all term once the first instalment's date had passed, even if they paid it on time. Counting payments against the oldest dates first keeps Overdue for people who are really behind, and it needs no new rules for matching payments to instalments.

**Considered options:** oldest due first (chosen); overdue whenever any past due date exists and money is owed.

## 2. When are a Fee Plan's due dates "unclear"?

**Decision:** When the due-date amounts don't add up to the Fee Plan's amount after concession. Such an Enrollment is never Overdue or Due soon. It appears only under **All with a balance**, sorted by amount owed, with its due dates shown as a guide and marked as not matching the plan.

Today a Fee Plan accepts any due-date amounts. A concession given after enrolling, or a plan whose total was changed without changing the dates, leaves dates that no longer describe what is owed. Guessing which date the gap belongs to would show the wrong Students as Overdue. A plan whose dates add up is never unclear.

**Considered options:** dates don't add up (chosen); never unclear, with any shortfall counted as due on the last date.

## 3. Do ended Enrollments with money owed appear?

**Decision:** Yes, with an **Ended** tag. An ended Enrollment with nothing owed never appears.

A Student who leaves still owes the money, and the Owner still needs to chase it. The Owner Dashboard's outstanding dues still count active Enrollments only. Changing that number is outside this issue.

**Considered options:** include, tagged Ended (chosen); active Enrollments only.

## 4. When is a Fee Follow-up open, and when is it closed?

**Decision:** The latest one is open. Logging a new Fee Follow-up closes the Enrollment's open one, so an Enrollment has at most one open Fee Follow-up. The Owner can edit the channel, note, and next follow-up date of the open one, or mark it done without logging another. A closed Fee Follow-up can't be edited. When the remaining dues reach zero, the open Fee Follow-up closes by itself.

The morning chase list should show each Enrollment once, with its latest plan ("will pay Saturday"). If every older Fee Follow-up stayed open, the list would fill with stale dates the Owner has already acted on.

**Considered options:** latest one is open (chosen); every Fee Follow-up stays open until the dues are paid.

## Also decided while implementing

- **Where it lives.** The Fees screen becomes the dues list, with Overdue, Due soon, and All with a balance filters and a **Follow-ups due today** list above it. Each row links to its Enrollment, where the Owner logs a Fee Follow-up, sees the history, and takes a Fee Payment. The Owner Dashboard shows how many Fee Follow-ups are due today and links to the Fees screen.
- **"Today" is the Batch's day.** Due dates and next follow-up dates are calendar dates. Today, the 3-day window, and "due today or overdue" use the timezone of the Enrollment's Batch (Asia/Kolkata by default), the same rule Classes use.
- **What a row shows.** Student, Course and Batch, remaining dues, and one due date: the oldest unpaid one when Overdue, otherwise the next unpaid one. For unclear dates, the plan's dates. Plus the next follow-up date of the open Fee Follow-up, if any.
- **Sorting.** By amount owed, largest first, by default; the Owner can sort by due date instead. Rows with no due date to show sort last.
- **Fee Follow-up fields.** A channel is required: Phone, WhatsApp/SMS, In person, or Other. The note is optional, up to 500 characters. The next follow-up date is optional and can't be before today. WhatsApp/SMS only records that a reminder was sent; Whiteboard sends nothing.
- **No Fee Follow-up without dues.** A Fee Follow-up can be logged only while the Enrollment has remaining dues. That includes ended Enrollments.
- **Closing on zero, whatever the cause.** The open Fee Follow-up closes when a Fee Payment brings the remaining dues to zero, and also when a Fee Plan change does (for example a concession for the rest). The close happens in the same transaction as the payment or plan change. History stays.
- **Who logged it.** History shows each Fee Follow-up's date, channel, note, next follow-up date, whether it is open or closed (and why), and the User who logged it, by display name. Edits to the open Fee Follow-up record who edited it and when, but the older values aren't kept: Fee Follow-ups are the Owner's working notes, and families never see them.
- **Who can see what.** Only the Owner can read the dues list or Fee Follow-ups and log, edit, or close one; Teachers, Students, and Parents get 403. Student and Parent Home is unchanged and never includes Fee Follow-ups. Every read and write is scoped to the Active Workspace; another Workspace's Enrollment is 404.
- **The dues list isn't paginated.** It is worked out per Enrollment from the Fee Plan and Fee Payments, so it is read in one pass. A Training Institute has a few hundred Enrollments with dues at most.
