---
title: Preschool P0 tasks
prd: ./preschool-p0.md
created: 2026-11-25
updated: 2026-11-25
status_values:
  - todo
  - in_progress
  - blocked
  - done
---

# Preschool P0 tasks

Tickets for [preschool-p0.md](./preschool-p0.md). Architecture: [ADR-0055](../adr/0055-preschool-bounded-context.md). How an area is laid out: [`apps/whiteboard/src/preschool/README.md`](../../apps/whiteboard/src/preschool/README.md).

`done` means merged into the Preschool branch with HTTP tests passing and the screens checked in a browser.

## Board

| ID     | Title                                                        | Status | Blocked by    |
| ------ | ------------------------------------------------------------ | ------ | ------------- |
| PS-001 | Schema, access rules, setup seeding, test fixtures           | `done` |               |
| PS-002 | Workspace Creation, shell and navigation by Institution Type | `done` | PS-001        |
| PS-003 | Centres and franchise details                                | `done` | PS-001        |
| PS-004 | Academic Years, Programmes and Classrooms                    | `done` | PS-001        |
| PS-005 | Staff and Class Teachers                                     | `done` | PS-001        |
| PS-006 | Enquiries and follow-ups                                     | `done` | PS-001        |
| PS-007 | Child and Admission                                          | `done` | PS-004        |
| PS-008 | Attendance: check-in, check-out, who collected               | `done` | PS-007        |
| PS-009 | Daily Report                                                 | `done` | PS-007        |
| PS-010 | Fees: Fee Structure, Invoices, Fee Payment, Receipt, Dues    | `done` | PS-007        |
| PS-011 | Announcements and events                                     | `done` | PS-002        |
| PS-012 | Parent Home                                                  | `done` | PS-008–PS-011 |
| PS-013 | Observations and Progress Report                             | `done` | PS-007        |
| PS-014 | Stock                                                        | `done` | PS-007        |
| PS-015 | Centre Dashboard, Head Office dashboard, Royalty Statement   | `done` | PS-008–PS-014 |
| PS-016 | Demo data and browser walkthrough                            | `done` | all           |
