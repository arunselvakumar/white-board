# Class change product decisions

[Issue #13](https://github.com/white-board-io/white-board-v3/issues/13) left four product questions open. They were answered on 2026-10-06 before implementation. This record keeps the answers and the reasons so we don't reopen them by accident.

## 1. Who can cancel, move, or restore a Class?

**Decision:** The Owner and active Teachers assigned to the Batch. Holidays stay Owner-only.

Teachers are often the first to know they can't take a class: they're ill, travelling, or the power is out. Sending every change through the Owner slows the news down. Assignment already scopes what a Teacher may see and mark in Attendance, so the same check decides which Classes a Teacher may change. A Holiday affects every Batch, including ones the Teacher doesn't teach, so it stays with the Owner. Students and Parents can't change anything.

**Considered options:** Owner only (the issue's starting point); Owner and assigned Teachers (chosen).

## 2. Does a Holiday always cover the whole Workspace?

**Decision:** Yes. A Holiday cancels every Class in the Workspace on its dates.

That matches how a centre closes for Diwali or Pongal. If only some Batches are off, the Owner or Teacher cancels those Classes one at a time. Picking Batches would raise extra questions: whether a Batch opened later should inherit the Holiday, and how a partial Holiday shows on a Calendar that mixes Batches. Nobody has asked for that yet.

**Considered options:** whole Workspace (chosen); Owner picks the Batches.

## 3. Do cancelled Classes count toward a Course's learning hours?

**Decision:** Not tracked. A cancelled Class simply doesn't happen. Whiteboard doesn't count hours delivered, and it doesn't push for a make-up Class.

Course total learning hours is an optional catalog value today. Nothing compares it with Classes held. If the Owner wants a make-up, Move does that. Revisit this when hours delivered or Course completion is tracked.

**Considered options:** not tracked (chosen); prompt for a make-up Class after cancelling.

## 4. Are notifications needed?

**Decision:** No outbound notifications. The Calendar marks Cancelled, Moved, and Holiday Classes. It also shows an **Upcoming changes** list for the next 14 days to everyone who can see the affected Classes.

The change list puts the news where Students, Parents, and Teachers already look, without new storage or read tracking. WhatsApp, SMS, and email stay out of scope, as do a notification inbox and unread state.

**Considered options:** Calendar only; Calendar plus Upcoming changes (chosen); Calendar plus a notification inbox.

## Also decided while implementing

- **Home tuition on the Owner and Teacher Calendar.** Owner and Teacher Calendars now also list Classes from Student-specific Timings, labelled with the Student's name. Without that, the people who make changes couldn't see home-tuition Classes, and the rule "affected only when their own class changes" couldn't be used. Proposed during implementation; the user can overrule it on the PR.
- **Moving a Holiday Class.** A Class that falls on a Holiday can't be cancelled (it is already off), but it can be moved to another date as a make-up. A Class can't be moved onto a Holiday or onto another Class of the same Batch with the same start time.
- **A Holiday that includes today** is refused if any Class today has already started or has saved Attendance. The Owner cancels the remaining Classes one at a time, or starts the Holiday tomorrow.
