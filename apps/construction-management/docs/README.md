# Construction Management — documentation

Requirements and architecture for rebuilding **BuildControl** (legacy: web.buildcontrol.in) as a new Construction Management product for Indian builders and contractors, on AWS with the same modular-monolith conventions as Whiteboard.

Everything here was produced from a walkthrough of a demo tenant of the legacy product (every screen, the API, and the compiled client's UI strings) plus desk research. Nothing is copied from the legacy codebase.

## Table of contents

### Start here

| Doc                                                        | What it answers                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [00-overview.md](./00-overview.md)                         | What the product is, who uses it, glossary, legacy technical profile                                             |
| [01-domain-model.md](./01-domain-model.md)                 | Entities and relationships per bounded context (ER diagrams)                                                     |
| [02-module-relationships.md](./02-module-relationships.md) | Module dependency map, the material / money / labour / sales flows, build order                                  |
| [03-target-architecture.md](./03-target-architecture.md)   | AWS deployment, contexts → Postgres schemas → API prefixes, shared kernel, data conventions, migration, ADR list |
| [04-gaps-and-roadmap.md](./04-gaps-and-roadmap.md)         | What the legacy lacks (product + India compliance), phased roadmap, open questions                               |

### Module specifications (`modules/`)

Each spec has the same sections: Legacy behaviour · Entities & fields · Workflows & states · Business rules · Permissions · Relationships · Reports & exports · Rebuild recommendations · Open questions.

| #   | Module                                                                                         | Covers                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Organization, Identity & Access](./modules/01-organization-identity-access.md)                | Company, email login (OTP once SMS is on), multi-company, team members, designations, permission matrix, devices, profile, subscription & billing, support             |
| 02  | [Master Records](./modules/02-master-records.md)                                               | Departments, work types, contractors, suppliers, vendors, labours, equipment, materials, categories, units, accounts, other parties, seed lists |
| 03  | [Projects, Structure, Drawings & Gallery](./modules/03-projects-structure-drawings-gallery.md) | Project wizard, phases → wings → floors → units, locations, drawings, testing reports, gallery, dashboard                                       |
| 04  | [Daily Site Work](./modules/04-daily-site-work.md)                                             | Daily worksheet, equipment usage & lifecycle, progress reports                                                                                  |
| 05  | [Tasks, Issues & Inspections](./modules/05-tasks-issues-inspections.md)                        | Tasks with Gantt & earned value, issues/snags, inspection requests                                                                              |
| 06  | [Procurement & Inventory](./modules/06-procurement-inventory.md)                               | PR → PO → GRN → inventory → transfer; central store (MR, delivery note); central inventory                                                      |
| 07  | [Payments & Accounting](./modules/07-payments-accounting.md)                                   | Bank/cash accounts, petty cash, transactions, contractor/supplier/labour/vendor/other-party invoices & payments, ledger                         |
| 08  | [Labour & Vendor Attendance](./modules/08-labour-vendor-attendance.md)                         | Labour master & transfers, daily attendance with OT, vendor gang attendance, balances                                                           |
| 09  | [Sales CRM — Inquiry & Booking](./modules/09-sales-crm-inquiry-booking.md)                     | Leads, lead sources, funnel, follow-ups, unit bookings                                                                                          |
| 10  | [HRMS](./modules/10-hrms.md)                                                                   | Settings, geo-fenced attendance, holidays, leave types/balances/requests, shifts & rotations, salary structures & runs                          |
| 11  | [Reports, Dashboards & Backup](./modules/11-reports-dashboards-backup.md)                      | Dashboards, the report catalogue, central reports, async generation, backups                                                                    |
| 12  | [Settings & Configuration](./modules/12-settings-configuration.md)                             | Numbering sequences, back-dated entry control, currency, form configuration, module visibility                                                  |
| 13  | [Chat, Notifications & Support](./modules/13-chat-notifications-support.md)                    | Member/group/project chat, push notifications, support tickets, announcements                                                                   |

### Research

| Doc                                                                      | What it answers                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [research/market-and-compliance.md](./research/market-and-compliance.md) | Indian competitor landscape (Powerplay, Onsite, Zepth, Tally…), GST/TDS/RERA/BOCW/PF/ESI rules, BOQ/RA-bill/MB practices, differentiators, prioritisation — with sources |

### Legacy discovery (raw)

| Doc                                                    | What it is                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [legacy/_working-notes.md](./legacy/_working-notes.md) | Endpoint inventory, menu & permission map, numbering modules, subscription facts |
| [legacy/_notes-masters.md](./legacy/_notes-masters.md) | Master-record screens and seed data                                              |
| [legacy/_notes-project.md](./legacy/_notes-project.md) | Project modules, HRMS API data, subscription, profile, back-dated settings       |
| [legacy/_notes-strings.md](./legacy/_notes-strings.md) | Screen-by-screen field lists mined from the compiled client                      |

These are evidence, not specification. When a module spec and a legacy note disagree, fix the spec and keep the note.

## Conventions

- Module specs mark anything not directly observed as **(inferred)**.
- Cross-references between modules use the two-digit number (`→ 06 Procurement`).
- Decisions that change the architecture go in `adr/` here (numbered `CM-0001…`); repo-wide decisions stay in the root `docs/adr/`.
- Product vocabulary is in [00-overview.md](./00-overview.md#glossary-legacy-terms-we-keep-and-what-they-mean); a `CONTEXT.md` for this app should be derived from it before coding starts.
