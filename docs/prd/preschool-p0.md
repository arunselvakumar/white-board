---
title: Preschool P0 — Run the centre from a phone
slug: preschool-p0
status: built — defaults awaiting the owner's review
phase: P0
product: Whiteboard
institution_type: preschool
created: 2026-11-25
updated: 2026-11-25
owner: product
audience:
  - standalone, privately owned preschools and daycares in India (50–150 children)
  - preschool chains with their own branches
  - franchise brands (head office) and their franchisee centres
success_metric: >
  An Owner can create a Preschool Workspace, set up Centres, Programmes and
  Classrooms, admit a Child from an Enquiry, collect fees with a Receipt, and
  a Teacher can mark check-in/check-out and send a Daily Report that the
  Parent reads the same day. A franchise head office sees every Centre on one
  screen with its royalty due. Books, notebooks, uniforms and supplies are
  counted per Centre and issued to Children.
related:
  - CONTEXT.md
  - docs/prd/preschool-tasks.md
  - docs/adr/0030 (one Bounded Context per Institution Type)
---

# Preschool P0 — Run the centre from a phone

Whiteboard's second Bounded Context. **Preschool** becomes selectable at Workspace Creation next to Training Institute. Everything below is new code in its own context (`src/preschool`, Postgres schema `preschool`, `/api/preschool`, `Preschool…` models); the Training Institute context is not changed.

## Who it is for

| Buyer                         | What they run                                                 | What they need that the others don't                                   |
| ----------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Standalone preschool          | One Centre, owner is also the principal                       | The simplest possible setup: no Centre switcher, no royalty            |
| Chain with own branches       | 2–20 Centres, one company                                     | One login across Centres, a Head Office view, shared fee structures    |
| Franchise brand (head office) | Many Centres owned by franchisees (Kidzee / EuroKids pattern) | Standard Programmes and fees pushed to Centres, royalty on collections |
| Franchisee                    | One or two Centres under a brand                              | Runs their Centre fully; cannot see other franchisees' Centres         |

## What competitors do (summary of research)

Checked on 2026-11-25 from vendor sites, app-store listings and directories (Illumine, Kriyo, Lillio/HiMama, Brightwheel, Procare). KinderPass, MyClassboard, Teachmint, Famly, Kangarootime and LineLeader were not read; what is said about them is general knowledge.

- **India** — Illumine and Kriyo lead with: admission enquiry pipeline, fee invoices and reminders, attendance with pick-up record, a daily diary with photos to parents, and a parent app. Bus tracking is common in India and rare in the West. WhatsApp is the real channel to parents (Illumine integrates it through a third party).
- **West** — Brightwheel, Procare, Lillio. Same core plus kiosk/QR check-in with signatures, child-to-staff ratio view, subsidy and food-programme billing, licensing reports, and framework-tagged observations.
- **Franchise** — Kriyo has a Franchisor app (add centres, see enquiries, admissions and attendance per branch); Illumine has a head-office dashboard with HQ / regional / centre roles. **No preschool product was found that calculates royalty, pushes fee templates, or distributes leads from head office** — that is where Whiteboard can be different. Published royalty terms vary from 0% to about 20% of collections; some brands charge no royalty and earn on kits instead.
- **What owners use daily** (judgement; review evidence was thin): fees and dues, attendance, daily updates to parents, enquiries. That is P0. Transport, CCTV, payroll and inventory are bought later.
- **GST** (secondary sources; a CA should confirm): preschool tuition is exempt. Uniforms are taxable goods, and standalone daycare may be taxable. P0 issues plain Receipts; a tax flag per Fee Head comes later.

## The model

One **Workspace** is the brand (or the single preschool). It has one or more **Centres**. Everything a centre does — Children, Classrooms, fees, attendance — belongs to one Centre.

- A standalone preschool gets one Centre created for it and never sees the word "Centre" as a choice.
- Each Centre is **Company-owned** or **Franchised**. A Franchised Centre records the franchisee's name, phone, agreement dates and a **Royalty %**.
- **Academic Year** (default April–March, start month can be changed, e.g. June) scopes Classrooms, Admissions and fees.

### Words (to be added to CONTEXT.md)

| Word                  | Meaning                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Centre**            | One physical preschool. A branch or a franchisee's unit.                                                                                                                              |
| **Head Office**       | The Owner's view across all Centres.                                                                                                                                                  |
| **Programme**         | What a Child is admitted to: Playgroup, Nursery (Pre-KG), LKG, UKG, Daycare. Seeded, renameable, with an age range. Defined once for the Workspace.                                   |
| **Classroom**         | A section of a Programme in a Centre for an Academic Year ("Nursery A"), with capacity and Class Teachers.                                                                            |
| **Child**             | The learner. A Centre-scoped record, never a User.                                                                                                                                    |
| **Parent**            | Father or mother on the Child's record. With an email they are invited to sign in (existing `parent` role).                                                                           |
| **Authorised Pickup** | A person allowed to collect the Child (name, relationship, phone, photo).                                                                                                             |
| **Enquiry**           | A family asking about admission. Moves New → Contacted → Visit scheduled → Visited → Admitted / Lost.                                                                                 |
| **Admission**         | A Child placed in a Programme and Classroom for an Academic Year. Carries the fee plan.                                                                                               |
| **Fee Head**          | A kind of charge: Admission fee, Tuition, Kit & books, Uniform, Activity, Daycare, Transport, Security deposit.                                                                       |
| **Fee Structure**     | The amounts per Fee Head for a Programme in an Academic Year, and the schedule (one-time, monthly, quarterly, per term, annual). Workspace default; a Centre may override if allowed. |
| **Invoice**           | One amount due on a date for one Admission (e.g. "Term 2 tuition").                                                                                                                   |
| **Fee Payment**       | Money received from a family. Partial allowed. Cash, UPI, Card, Cheque, Bank transfer. Produces a **Receipt**.                                                                        |
| **Check-in / out**    | The time a Child arrived and left, who dropped and who collected.                                                                                                                     |
| **Daily Report**      | The day's diary for one Child: meals, nap, toilet/diaper, mood, activities, a note, photos. Sent to the Parent.                                                                       |
| **Announcement**      | A notice from the Centre or Head Office to Parents (circular, event, holiday).                                                                                                        |
| **Observation**       | A Teacher's note on a Child against a Development Domain.                                                                                                                             |
| **Progress Report**   | The term report: a rating per Development Domain plus Teacher remarks. Printable.                                                                                                     |
| **Stock Item**        | Something the Centre keeps and hands out or uses: a book, notebook, uniform, kit, crayon box, toy, chair. Consumable (used up or given away) or Asset (kept).                         |
| **Stock Movement**    | One change to stock on hand at a Centre: Received, Issued to a Child, Issued to a Classroom or Staff, Transferred to another Centre, Adjusted.                                        |
| **Royalty Statement** | Per Franchised Centre per month: collections on royalty-bearing Fee Heads × Royalty %.                                                                                                |

### Roles

| Role                         | Sees                 | Can do                                                        |
| ---------------------------- | -------------------- | ------------------------------------------------------------- |
| **Owner** (Head Office)      | Every Centre         | Everything, including Programmes, Fee Structures, royalty     |
| **Centre Head** (franchisee) | Only their Centre(s) | Everything inside the Centre, including fees                  |
| **Teacher**                  | Their Classrooms     | Check-in/out, Daily Reports, Observations. No fee amounts     |
| **Parent**                   | Their own Children   | Read Daily Reports, attendance, dues, Receipts, Announcements |

## What gets built (P0, in order)

Each item is a ticket in [preschool-tasks.md](./preschool-tasks.md).

1. **Workspace Creation** — Preschool selectable. A short setup: preschool name, single Centre or several, Academic Year start month. Seeds one Centre, the current Academic Year, the five Programmes, and the standard Fee Heads. The sidebar and In-app Home follow the Institution Type.
2. **Centres** — list, add, edit; Company-owned or Franchised with franchisee details and Royalty %. Centre switcher in the shell when there is more than one.
3. **Programmes and Classrooms** — Programmes with age range (years/months on a cut-off date); Classrooms per Centre with capacity and seats left.
4. **Staff** — Centre Heads and Teachers (and helpers as records without login); assign Teachers to Classrooms; invite by email with the right role and Centre scope.
5. **Enquiries** — capture (child name, date of birth, parent, phone, Programme, source), follow-up notes with next follow-up date, pipeline board, convert to Admission without retyping.
6. **Child and Admission** — admission form: Child (name, date of birth, gender, blood group, photo, mother tongue), father and mother, address, emergency contact, Authorised Pickups, health (allergies, medical conditions, doctor), immunisation and documents checklist (birth certificate, Aadhaar, photos, immunisation card — ticked, not uploaded). Admission number per Centre. Age shown against the Programme's range (warns, never blocks). Promote, transfer Classroom, withdraw.
7. **Attendance** — per Classroom per day: Present / Absent / Leave, check-in time, check-out time and who collected. Collecting by someone who is not a Parent or Authorised Pickup needs a note. Built for a phone at 375 px. Monthly register per Classroom.
8. **Daily Report** — per Child: meals (ate all / some / none), nap from–to, toilet or diaper entries, mood, activities done, note, photos. "Apply to whole Classroom" for shared items (lunch menu, activity), then per-child edits. Publish → Parent is notified.
9. **Fees** — Fee Heads, Fee Structure per Programme and year, Invoices generated at Admission (editable per Child), concessions (sibling, staff ward, custom with reason), Fee Payment allocated oldest-first, numbered Receipt per Centre (printable), Dues list with **Remind on WhatsApp** (opens a pre-filled chat; no API).
10. **Announcements and events** — to a Centre, a Classroom, or all Centres from Head Office; holiday and event list; Parents notified in-app and by email.
11. **Parent Home** — per Child: today's status, Daily Reports, attendance month, dues and Receipts, Announcements.
12. **Observations and Progress Report** — Development Domains seeded from NEP 2020 / NCF Foundational Stage (Physical, Socio-emotional and ethical, Cognitive, Language and literacy, Aesthetic and cultural, Learning habits); Observations; term Progress Report with a 3-point rating (Beginning / Progressing / Proficient), printable.
13. **Dashboards and royalty** — Centre Dashboard (children present today, seats filled per Classroom, collected this month, dues, open Enquiries, follow-ups due today). Head Office dashboard (the same per Centre, side by side) and monthly Royalty Statement per Franchised Centre.
14. **Stock** — books, notebooks, stationery, uniforms, kits, toys and learning aids, housekeeping supplies, furniture and equipment. Stock Items with category, unit and reorder level, defined once for the Workspace; stock on hand per Centre; receive stock (supplier, bill number, cost), issue to a Child (kit, books, uniform — the Child's record shows what they have received), issue to a Classroom or Staff, transfer between Centres (Head Office sends kits to a franchisee), adjust for damage or count corrections. Low-stock list on the Centre Dashboard; a stock ledger per item.
15. **Cancel a Receipt** — a Fee Payment entered by mistake is cancelled with a reason; it keeps its number, is marked CANCELLED, and counts for nothing in dues, dashboards and royalty.
16. **Demo data and walkthrough** — a seed script that builds a franchise Workspace with three Centres and a standalone one, so the suite can be tried immediately.

## Not in P0 (next, in this order)

Photo uploads in Daily Reports (links only today) · weekly lesson plan published by Head Office · daycare hourly billing and late pick-up charges · transport routes · incident and medication log · staff attendance and leave · late-fee rules · WhatsApp Business API and SMS · online payment gateway · GST invoices for goods · CCTV · native mobile app · child-to-staff ratio alerts.

## Decisions taken by default (change any of these in the morning)

| #   | Question                                             | Default used                                                                                                                                             |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Is a franchise one Workspace or many?                | **One Workspace = the brand, with Centres inside.** Franchisees are Centre Heads scoped to their Centre.                                                 |
| 2   | What is royalty charged on?                          | A % per Centre, on collections of Fee Heads marked royalty-bearing (Admission fee and Tuition by default). Statement only; no billing of the franchisee. |
| 3   | Can a franchisee change fees?                        | Head Office sets the Fee Structure; a per-Centre "may override amounts" switch, **on** by default.                                                       |
| 4   | Academic Year                                        | April–March, start month configurable at setup.                                                                                                          |
| 5   | Programme names                                      | Playgroup, Nursery (Pre-KG), LKG, UKG, Daycare — renameable.                                                                                             |
| 6   | The learner is called                                | **Child** (not Student) in the Preschool context.                                                                                                        |
| 7   | GST on fees                                          | None in P0. Tuition is exempt; Receipts are not tax invoices. Uniform and daycare tax handling comes later.                                              |
| 8   | Parent sign-in                                       | Email invitation, as Training Institute does today. Phone/OTP sign-in later.                                                                             |
| 9   | Documents (birth certificate, Aadhaar)               | Checklist ticks only; no file uploads and no Aadhaar number stored.                                                                                      |
| 10  | Photos in Daily Reports                              | Use the existing attachment storage if the app has one; otherwise photos move to the next phase.                                                         |
| 11  | Does Training Institute change?                      | No. Existing Workspaces are untouched.                                                                                                                   |
| 12  | Does issuing a book or uniform to a Child bill them? | No. The charge is the Kit & books or Uniform Fee Head on the Fee Structure; Stock only records what was handed over.                                     |
| 13  | Who defines Stock Items?                             | Head Office defines the list once; every Centre keeps its own quantities. Only the Owner transfers stock between Centres.                                |
