# Enquiry and demo product decisions

[Issue #19](https://github.com/white-board-io/white-board-v3/issues/19) adds Enquiries and demo classes ahead of admission. The issue left three product questions open. They were answered on 2026-10-06 before implementation. This record keeps the answers and the reasons.

## 1. Which Enquiries does a Teacher see?

**Decision:** Every Enquiry in the Active Workspace, the same as the Owner.

In a tuition centre or small institute, the Teacher who picks up the phone is often not the one who books the demo or follows up next week. Scoping the list to "Enquiries I added or that are booked with me" would hide the very follow-ups a colleague needs to see. Teachers already take calls and run demos, so they get the whole list, its history, and its follow-up notes. Students and Parents never see Enquiries.

**Considered options:** only Enquiries a Teacher added or that have a demo with them; every Enquiry (chosen).

## 2. Who can convert an Enquiry into a Student?

**Decision:** The Owner only.

Converting creates a Student, an Enrollment, and a Fee Plan. Today only the Owner can add a Student, enroll one, or touch a Fee Plan, and conversion follows the same admission rules. A Teacher marks the demo attended and the Owner converts. Teachers get 403 from the convert command, and the screen doesn't offer them the action.

**Considered options:** Owner only (chosen); Owner and Teachers, which would also let Teachers set Fee Plans for the first time.

## 3. Does a paid demo fee count against the first course fee?

**Decision:** No. Demo fees stay separate from course fees.

The issue's business rules already keep demo fees out of Enrollment dues and Student fee balances. Crediting the demo fee against the course fee would tie the two together at conversion. If the Owner wants to credit it, they give a concession on the new Enrollment's Fee Plan, which they can already do.

**Considered options:** always separate (chosen); offer to record the paid demo amount as a Fee Payment on the new Enrollment at conversion.

## Also decided while implementing

- **Stage is worked out from what happened, then stored.** In priority order: **Joined** once converted; **Not interested** once closed with a reason; **Demo scheduled** while any booked demo isn't marked yet; **Demo attended** once any demo is marked attended; **Follow-up due** once a follow-up date or note exists; otherwise **New**. The domain recalculates it on every change. The stored column lets lists filter by stage. Proposed during implementation; the user can overrule it on the PR.
- **Follow-ups due** are open Enquiries (not Joined or Not interested) whose next follow-up date is today or earlier in the institute's timezone (Asia/Kolkata, the same default Batches use).
- **Default Enquiry Sources.** The first time a Workspace's Sources are read, Whiteboard adds Phone call, Walk-in, Referral, Social media, and Website. The Owner can rename, retire, and add Sources from there. A retired Source keeps its name on past Enquiries and isn't offered for new ones. Source names are unique among a Workspace's active Sources, ignoring case.
- **One-to-one demos use Asia/Kolkata.** A one-to-one demo isn't tied to a Batch, and Whiteboard has no Workspace timezone yet, so its date and time use the same default Batches use. A one-to-one demo can't fall on a Holiday.
- **Clashes.** Two one-to-one demos with the same Teacher can't overlap. Demos booked into a Batch's Class don't count as the Teacher's own demos for this check, because the Class runs anyway.
- **Demo bookings can be cancelled** while their attendance isn't marked, for when the prospect calls off. A cancelled demo stays in the history.
- **Attendance is marked from the demo's start time onwards.** Before the demo starts, Whiteboard can't know who came.
- **A Teacher's demos.** On their Home, a Teacher sees the next 7 days of demos they take: one-to-one demos with them and demos in Classes of Batches they're assigned to. The Owner sees every demo.
- **Phone matches are checked with a POST.** The check sends the phone number in the body, not the URL, so it doesn't land in access logs.
- **Conversion uses the Course's default fee**, the same as Enroll Student. The Owner adjusts the Fee Plan on the new Enrollment afterwards. The new Student gets the prospect's name, phone, email, and Parent or Guardian name and phone. If the Student has an email address, the usual `org:student` invitation is sent.
