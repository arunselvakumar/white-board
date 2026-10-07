---
title: Enquiries and demo classes
status: accepted
phase: P1
product: Whiteboard
institution_type: training_institute
issue: https://github.com/white-board-io/white-board-v3/issues/19
created: 2026-10-06
---

# Enquiries and demo classes — Training Institute

## Goal

Most admissions at a tuition centre start as an Enquiry: a parent calls about Class 10 Maths, someone walks in about DCA, or a neighbour refers a friend. Many tutors offer a demo class first. The Owner and Teachers record each Enquiry, follow it up, book demos, and turn it into a Student and Enrollment in one step when the prospect joins. The Owner sees a monthly summary of how Enquiries turn into admissions.

Decisions behind this spec: [ADR-0032](../adr/0032-enquiry-and-demo-product-decisions.md).

## Language

- **Enquiry**: a prospect asking about a Course or subject, before admission. It is not a Student.
- **Prospect**: the person an Enquiry is about. A prospect has no login.
- **Follow-up**: a note after a call or conversation, with an optional next follow-up date.
- **Demo**: a trial class for a prospect, free or paid. Either a **Batch demo** (one date's Class of an existing Batch) or a **one-to-one demo** (a chosen date and time with a chosen Teacher).
- **Enquiry Source**: where an Enquiry came from, such as Phone call or Walk-in. Each Workspace keeps its own list.
- **Stage**: New, Follow-up due, Demo scheduled, Demo attended, Joined, or Not interested.

## Workflow

1. The Owner or a Teacher opens **Enquiries** and chooses **Add enquiry**: the prospect's name and phone, Parent or Guardian name and phone if a minor, optional email, a Course or a free-text subject, preferred Class Mode, preferred timing, Source, notes, and an optional next follow-up date. If the phone matches an open Enquiry or an active Student, a warning names them before saving.
2. The Enquiry's page shows its details, stage, and history. **Log follow-up** adds a note and sets or clears the next follow-up date.
3. **Book demo** books a Batch demo (a Batch, a date, and one of that day's Classes) or a one-to-one demo (a Teacher, a date, a start and end time). Each is free or paid; a paid demo has an amount. Later, the demo can be marked attended or missed, a paid demo marked paid, or the booking cancelled.
4. **Not interested** closes the Enquiry with a reason. **Reopen** brings it back.
5. The Owner chooses **Convert to Student**: a Batch (defaulting to the Batch of the latest attended demo), the Timings source, and an optional Class Mode override. The prospect's details carry over. The Enquiry becomes Joined and links to the new Student.
6. The Enquiries list has **Follow-ups due**, **Open**, and **Closed** tabs, with search by name or phone.
7. The Owner manages **Enquiry Sources** (add, rename, retire) and opens the **Enquiry summary** for a month.
8. A Teacher's Home lists the next 7 days of demos they take.

## Rules

- Owner and Teachers: create, edit, follow up, close, reopen, and book and mark demos for every Enquiry in the Active Workspace. The Owner alone converts, manages Sources, and sees the summary. Students and Parents get 403 everywhere.
- An Enquiry doesn't count towards active Students, Batch capacity, fees, dues, or Attendance. A Batch demo doesn't take a seat and doesn't appear in the Batch's Attendance Register.
- A Batch demo needs an open Batch and a Class that is scheduled on that date at that start time. A Cancelled, Moved-away, or Holiday Class can't take a demo. A Rescheduled slot can.
- No demo on a past date, or today after its start time.
- A one-to-one demo needs an active Teacher, an end time after its start time, and a date that isn't a Holiday. It can't overlap another booked one-to-one demo with the same Teacher.
- A paid demo has an amount from ₹1 to ₹1,00,000. A free demo has none. Demo fees never create dues or Fee Payments.
- Attendance is marked from the demo's start time onwards, and can be corrected. A cancelled demo can't be marked. A marked demo can't be cancelled.
- Joined and Not interested Enquiries can't take new follow-ups or demos. A Not interested Enquiry can be reopened; a Joined one can't.
- Not interested needs a reason of 1–200 characters.
- Conversion follows Enroll Student's rules: an open Batch, a Course that isn't archived, capacity, and the Course's default fee. If any rule fails, nothing is created and the Enquiry stays open. An Enquiry converts once.
- Source names are 1–80 characters and unique among the Workspace's active Sources, ignoring case. Retired Sources stay on past Enquiries.
- Everything is scoped to the Active Workspace. Another Workspace's Enquiry, demo, Source, Batch, or Teacher returns 404.

## Monthly summary

For a calendar month (Asia/Kolkata): Enquiries received, demos attended (by demo date), admissions (conversions), paid demo fees collected (by paid date), the top Not interested reasons, and each Source's Enquiries and admissions, most admissions first.

## Outside this slice

WhatsApp, SMS, or email reminders; public enquiry forms; importing leads; online demo fee collection; assigning Enquiries to staff; automatic follow-up scheduling; campaigns and offers; crediting demo fees against course fees.

## Delivery

Prisma migration, domain rules with unit tests, HTTP commands and queries with OpenAPI and Postgres HTTP tests, Enquiry, Source, summary, and Teacher Home UI with Storybook play functions, and typecheck, lint, and build.
