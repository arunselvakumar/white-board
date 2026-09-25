---
title: Teachers — Training Institute
status: accepted
phase: P1
product: Whiteboard
institution_type: training_institute
created: 2026-09-25
---

# Teachers — Training Institute

## Goal

An Owner can add a Teacher, invite them into the Active Workspace, assign them to Batches, and remove their access. A Teacher can sign in and see only their assigned Batches. This prepares the attendance slice; it does not record attendance.

## Language and boundaries

- **Teacher** is a Workspace resource, separate from the Clerk User who signs in. Centre Teachers and Visiting Tutors are Teacher types, not separate entities.
- Clerk owns User identity and Workspace membership. `org:teacher` is a custom Workspace role. The Teacher resource keeps a nullable Clerk User ID after activation; no User or Workspace table is added.
- A Teacher may be assigned to many Batches, and a Batch may have several Teachers. Assignments have an active interval so history survives reassignment.
- Owner APIs and pages remain Owner-only. Teacher pages and APIs expose assigned Batch details only, with no Student contact information or Fees.

## Owner workflow

1. Add a Teacher with full name, email, and type (`centre_teacher` or `visiting_tutor`). Phone and qualification summary are optional.
2. Save the Teacher record and send an `org:teacher` Clerk Organization invitation with the Teacher ID in invitation metadata. The UI shows invitation failure and supports resend.
3. Assign or unassign the Teacher on their profile or a Batch. Pending Teachers may be assigned, but cannot sign in until they accept the invitation.
4. Edit name, type, phone, and qualification summary. The invitation email is fixed after creation so the Teacher record cannot drift from the Clerk sign-in identity; resend is an explicit invitation operation.
5. Deactivate a Teacher to stop Teacher access and new assignments while retaining history.

## Teacher workflow

After invitation acceptance and Workspace Selection, the Teacher activates the link between their Clerk membership and Teacher record, then lands on **My Batches**. Activation verifies role, Active Workspace, and invitation metadata; it never matches by email alone. The Teacher sees assigned Batches and basic schedule information. Attendance marking is the next slice.

## Rules

- Only an Owner can manage Teachers and assignments.
- Only active Teachers may receive new Batch assignments or use Teacher pages. A closed or tombstoned Batch cannot receive an assignment.
- A Teacher sees a Batch only while their assignment is active. The Owner sees all Teachers and assignments.
- One active Teacher profile per normalized email per Workspace; one linked Clerk User per Workspace.
- Another Workspace's Teacher or Batch ID returns 404. No Session returns 401; no Active Workspace or insufficient role returns 403.
- A person already holding a Student or Parent role in the same Workspace is not silently converted to Teacher. That case needs an explicit future multi-role decision.
- Teacher profile and assignment deletes use tombstones; deactivation and unassignment are named operations.

## Delivery

Teacher domain and migration; Clerk role and invitation adapter; Owner HTTP APIs and OpenAPI; Owner screens and Storybook; Teacher activation and My Batches; unit, Postgres HTTP, role, and UI verification.

The development Clerk instance has `org:teacher` in its default Role Set. Configure the same custom Role with no Clerk system permissions in each deployment's Clerk instance before using Teacher invitations there.

## Outside this slice

Student attendance, Teacher availability and clash detection, salary or payroll, bank details, documents, background checks, performance evaluation, and Teacher self-service profile editing.
