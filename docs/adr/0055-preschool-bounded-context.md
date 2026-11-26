# Preschool: a second bounded context, with Centres inside one Workspace

## Context

Whiteboard sold only to Training Institutes. Preschools in India are next: standalone preschools, chains with their own branches, and franchise brands whose centres are owned by franchisees. The product spec is [`docs/prd/preschool-p0.md`](../prd/preschool-p0.md). A preschool's words and rules differ from a Training Institute's (a Child has Parents, Authorised Pickups and a Daily Report; fees are Invoices on an Admission for an Academic Year), so ADR-0030 applies: it is its own bounded context.

Three things had no precedent in the Training Institute context: a tenant with several locations, a role that sees only one location, and screens that depend on the Institution Type.

## Decision

**Its own context.** Code in `apps/whiteboard/src/preschool`, Postgres schema `preschool`, Prisma models and enums prefixed `Preschool`, HTTP under `/api/preschool`, OpenAPI components prefixed `Preschool`. Nothing in `training-institute` changes and neither context imports the other.

**One Workspace is the brand; Centres live inside it.** A franchise is one Workspace with many Centres, not a Workspace per franchisee. A standalone preschool has exactly one Centre, created for it, and its screens never ask which Centre. Every row that belongs to a location carries `centreId` next to `workspaceId`. A Centre is Company-owned or Franchised; a Franchised Centre records the franchisee and a royalty in basis points.

We considered a Workspace per franchisee linked into a network. It matches the legal picture (each franchisee is its own business) but the head office could then see nothing without cross-tenant reads, and Programmes, Fee Structures and Stock Items would have to be copied between tenants. Brands that run franchise software centralise it, so the Workspace is the brand.

**What makes a Workspace a Preschool** to this context is its `preschool.settings` row, written by Workspace Creation when the Institution Type is Preschool. Every Preschool route answers 403 `NOT_A_PRESCHOOL` without it. The context never reads `identity`.

**Roles without a new member role.** `@repo/auth` keeps `owner`, `teacher`, `student`, `parent`. Inside a Preschool:

| Preschool role      | Member role | Decided by                                                                                           |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Owner (Head Office) | `owner`     | The Workspace Owner. Every Centre.                                                                   |
| Centre Head         | `teacher`   | An active Staff record with role `centre_head` and the User's verified email. Their Centres only.    |
| Teacher             | `teacher`   | An active Staff record with role `teacher`. Their Centres; the Classrooms they are Class Teacher of. |
| Parent              | `parent`    | A Child whose father or mother email is the User's verified email. Those Children only.              |

A helper is a Staff record with no sign-in. A member with no matching Staff record or Child gets 403. `requirePreschoolActor()` resolves this on every request into a `PreschoolActor` (`role`, `centreIds`, `classroomIds`, `childIds`), and handlers check it with `assertCentre`, `assertManagerOf`, `assertClassroom` and `canReadChild`. A Teacher never receives fee amounts.

Adding a `centre_head` member role was rejected: every `Record<WorkspaceRole, …>` in the Training Institute screens would need a case for a role it can never see, and the Centre a head runs is Preschool data either way.

**The Centre in a request.** Reads that are about one Centre take `centreId` in the query string; creates take it in the body; anything addressed by id finds its Centre from the row. The Workspace still comes only from the Session (ADR-0014). A Centre the User may not open is 403 `CENTRE_FORBIDDEN`; an id from another Workspace is 404.

**Screens follow the Institution Type.** Preschool screens live under `/preschool/…` (`app/(app)/preschool`). The sidebar and the In-app Home are chosen by Institution Type first and role second. A Preschool Workspace is sent away from Training Institute screens and the reverse. The active Centre is the User's choice in the shell, kept in a cookie; with one Centre there is no switcher.

**Errors carry their own status.** `PreschoolError(kind, code, message)` with kind `not_found | conflict | forbidden | invalid`, mapped by `mapPreschoolError`. The shared `mapError` keeps its lists for the Training Institute; Preschool codes are not added to them.

**Money and time.** Amounts are whole paise. Calendar dates are `@db.Date` and travel as `YYYY-MM-DD`. Every Centre is in India; "today" and clock times are Asia/Kolkata (`domain/dates.ts`).

**Fees.** Fee Heads and Fee Structures (per Programme and Academic Year) belong to the Workspace; a Centre may hold an override when `mayOverrideFees` is on. An Admission gets Invoices generated from the structure in force. A Fee Payment is allocated to the Child's oldest unpaid Invoices; `paidPaise` on the Invoice is kept in step in the same transaction. Receipt numbers are `<centre code>/<year>/<sequence>` from a counter on the Centre. No GST: Receipts are not tax invoices.

**Royalty is a report, not a ledger.** A Royalty Statement is computed per Franchised Centre per month from allocations on royalty-bearing Fee Heads × the Centre's rate. Nothing is stored or billed.

**Stock is an append-only ledger.** Stock Items belong to the Workspace. Each Centre's stock on hand is the sum of its Stock Movements; a movement that would take it below zero is refused. A transfer between Centres writes two movements that share a `transferId`. Issuing to a Child records what was handed over and does not bill.

## Consequences

- A second context exists, so `eslint.config.js` lists both and each is closed to the other.
- `lib/workspace-access.ts`, the nav, the In-app Home and the Workspace Gate read the Institution Type; before this they read only the role.
- A Centre Head's sign-in is a `teacher` member. Anything in `@repo/auth` that speaks of Teachers (invitation emails) must not assume a Training Institute.
- Parent and Staff links depend on a verified email, as Training Institute links do. A Parent who signs up with a different email sees nothing until the Centre corrects the Child's record.
- The franchisee cannot be billed, pay online, or have a separate legal identity on Receipts yet; a Receipt carries the Centre's name.
