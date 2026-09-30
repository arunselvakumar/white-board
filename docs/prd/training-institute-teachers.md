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

Student attendance, availability-based clash detection, payroll payments, external background-check integration, performance evaluation, and Teacher self-service profile editing.

## Expanded Teacher profile (approved 2026-09-29)

The Owner can record a Teacher photo, salutation, preferred display name, gender, date of birth, alternate phone, city or area, full address, emergency contact, teaching specialisms, learner levels, teaching experience, highest qualification, certifications, languages, short bio, portfolio link, start date, weekly availability, ID proof type and number, background check status/date/note, pay basis and rate, and bank details. The existing invitation email remains fixed after creation. A Teacher's specialisms describe expertise; Batch assignment is still a separate Owner action. Weekly availability is a profile record and does not reject Batch assignments or detect clashes.

The Add Teacher UI requires a photo and offers camera capture or file upload; the API permits photo omission so existing integrations and records remain valid. The Owner can replace the photo later. JPEG, PNG, and WebP photos are limited to 2 MiB after client resizing and are served from an authenticated, Workspace-scoped endpoint. The Owner can attach up to ten active PDF, JPEG, or PNG documents of at most 3 MiB each, tagged as certificate, identity, background check, or other. Removing a document creates an invisible tombstone.

Full ID and bank account numbers and document bytes are encrypted in Postgres with AES-256-GCM using `TEACHER_PRIVATE_DATA_KEY`. API responses expose only the last four characters of the numbers. The key must be configured before saving those fields or documents; losing it makes existing encrypted data unreadable. Photo, documents, verification, and pay data are Owner-only. The Teacher list exposes a summary without private profile fields. No payroll transfer or background-check service is part of this expansion.
