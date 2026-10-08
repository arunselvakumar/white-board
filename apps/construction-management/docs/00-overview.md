# Construction Management — Product overview

This document set is the requirements baseline for rebuilding **BuildControl** (https://web.buildcontrol.in, v11.6.6, "Powered by Shreekunj Softech Pvt. Ltd.") as a new product on a modern AWS stack. It was produced by walking every screen of a demo tenant, calling the legacy API, and mining the compiled Flutter bundle for every label, hint, and validation message. Raw evidence is kept in [`legacy/`](./legacy/); each module has its own specification under [`modules/`](./modules/).

## Who buys it, who uses it

BuildControl sells to small and mid-size Indian builders and contractors — a residential developer with two or three wings under construction, a civil contractor running a handful of sites, an interior/MEP sub-contractor. The owner buys one subscription per **company** and invites a team. The people on the ground:

| Persona                             | What they do in the product                                                                                                      | Modules        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Owner / Director** (Admin)        | Sees every project's dashboard, approves money and material movements, buys the plan, manages team permissions                   | 01, 11, 07, 06 |
| **Project Manager / Site Engineer** | Fills the daily worksheet, raises purchase requests and inspection requests, logs issues, updates tasks, marks labour attendance | 04, 05, 06, 08 |
| **Store Keeper**                    | Receives material (GRN), consumes and transfers stock, runs the central store (MR → delivery note)                               | 06             |
| **Purchase Manager**                | Converts PRs into POs, maintains suppliers, quotations, billing addresses                                                        | 06, 02         |
| **Accountant**                      | Petty cash vouchers, bank transactions, contractor/supplier/labour/vendor payments, other-party invoices, ledger reports         | 07             |
| **Site Supervisor / Mukadam**       | Labour and vendor-gang attendance, overtime                                                                                      | 08             |
| **Sales Executive**                 | Inquiries, follow-ups, funnel, unit bookings                                                                                     | 09             |
| **HR / Office admin**               | Employee attendance with geo-fence, leaves, holidays, shifts, salary runs                                                        | 10             |
| **Contractor / Supplier / Vendor**  | Not users. They are _parties_ (master records) that work on projects and get paid                                                | 02, 07         |
| **Labour**                          | Not a user. A record with wages, attendance, and a running balance                                                               | 08             |

## The shape of the product

```
Company (tenant)
├── Team Members (users with a permission matrix)            → modules/01
├── Master Records (parties, materials, categories, units…)   → modules/02
├── Projects (n)                                              → modules/03
│   ├── Phases → Wings → Floors → Units   (the building)
│   ├── Daily Worksheet, Equipment Usage, Progress Reports    → modules/04
│   ├── Tasks, Issues & Snags, Inspection Requests            → modules/05
│   ├── Manage Materials: PR → PO → GRN → Inventory → Transfer → modules/06
│   ├── Payments: Petty Cash, Transactions, Party payments    → modules/07
│   ├── Attendance: Labour, Vendor                            → modules/08
│   ├── Inquiry, Booking                                      → modules/09
│   ├── Drawings, Gallery, Testing Reports, Dashboard, Reports → modules/03, 11
│   └── Project chat
├── Workspace (cross-project)
│   ├── HRMS                                                  → modules/10
│   ├── Central Store (MR / Delivery Note), Central Inventory → modules/06
│   ├── Central Payment, Central Reports                      → modules/07, 11
└── Settings (numbering, back-dated entry, currency, form config) → modules/12
    Chat, Notifications, Support                              → modules/13
```

Three things define the product's character:

1. **Everything hangs off a Project, and most things hang off a Location inside it.** A worksheet, an issue, an inspection, a PR, a task, a booking — each points at `Wing → Floor → Unit`, or at an Amenity, or at a Common Development. The building structure (module 03) is therefore the first thing a company sets up.
2. **Money follows paper.** A PR becomes a PO, a PO is received as a GRN, the GRN creates stock and a supplier payable, payments reduce the payable; contractor invoices carry TDS; labour and vendor attendance produce a running balance that payments settle; petty cash and bank transactions are vouchers with an approval status. Every one of these has a numbering sequence, an approval gate, and a report.
3. **Permissions are a matrix, not roles.** Every menu has up to twelve flags (`create read update delete approve reject print report viewAll notification transfer financial`) and the owner ticks them per team member, optionally starting from a designation template. "viewAll" (see others' entries) and "financial" (see amounts) are the two that shape screens.

## Glossary (legacy terms we keep, and what they mean)

| Term                             | Meaning in BuildControl                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Company / Organization**       | The tenant. A user can belong to several and switch.                                                                                          |
| **Team Member**                  | An employee user. "Normal" members work on projects with a permission matrix; "HRMS" members only use attendance/leave/salary.                |
| **Designation**                  | Job title; some carry a default permission template.                                                                                          |
| **Department**                   | A trade or work category (RCC, Plumbing, Painting, Excavation…). Used to classify contractors, work types, worksheets, issues, inspections.   |
| **Work Type**                    | A finer activity under a Department; can have materials attached.                                                                             |
| **Contractor**                   | A party that executes work (labour-and-material or labour-only). Has invoices with TDS.                                                       |
| **Supplier**                     | A party that sells material. Linked to POs and GRNs.                                                                                          |
| **Vendor**                       | A labour-supply party (a gang/mukadam). Attendance is counted per labour category per shift and priced from the vendor's rate card.           |
| **Labour**                       | An individual worker on the company's own roll, with daily/monthly wage and OT rate.                                                          |
| **Other Party**                  | Any other counter-party — a customer you raise a sales invoice to, a consultant, a lender.                                                    |
| **Phase / Wing / Floor / Unit**  | Project structure. A Wing has a type (Commercial, Residential, Bungalow scheme, Plotting scheme, …) that drives floor generation.             |
| **Amenity / Common Development** | Non-unit locations (Swimming Pool, Compound Wall).                                                                                            |
| **Daily Worksheet**              | The day's work record per contractor/department/location: labour counts, approximate work done, materials consumed, photos.                   |
| **Equipment Usage Sheet**        | The day's machine record: hours/km/trips, fuel, breakdown, hire cost.                                                                         |
| **PR / PO / GRN / MT / MR / DN** | Purchase Request, Purchase Order, Goods Receipt Note (Material Received), Material Transfer, Material Request (central store), Delivery Note. |
| **Petty Cash**                   | Per-user cash float; payment/receipt/transfer vouchers with approval.                                                                         |
| **Transaction**                  | A company bank/cash account entry (Payment In/Out).                                                                                           |
| **Inquiry / Booking**            | Pre-sales lead with funnel stage; and the unit-level sale record.                                                                             |
| **Back-dated entry control**     | How many days in the past an entry may be created/edited; per module; overridable by designation; financial closing date.                     |
| **Sequence ID**                  | The document number format per module (`PR/26-27/PX/00001`).                                                                                  |

## Legacy technical profile (for migration planning)

- **Client:** Flutter Web (CanvasKit) + the same Flutter codebase on Android/iOS. Hash routing (`#/employeeList`). Side panels for add/edit; bottom sheets for pickers; a "Discard changes?" guard on dirty forms.
- **API:** Laravel (PHP) at `prodbuild.buildcontrol.in/api`. Two generations of routes: PascalCase controller-style (`Project/GetAll`, `PurchaseRequest/SetApprovalStatus`) and a newer REST-ish `v2/...` family (`v2/hrms/leave-types`, `v2/purchase-orders`, `v2/home/projects`). JWT (`tymon/jwt`, issued by `otp-login`). Envelope `{status, message, data}` with HTTP 200 even for not-found (`status: 404` inside the body).
- **Realtime / push:** Firebase RTDB (chat), FCM (push), Firebase Auth.
- **Payments:** Razorpay and CCAvenue for subscriptions.
- **Files:** uploads with 10 MB cap; per-plan storage quota (20 GB basic, 1 GB trial); media backup as ZIP delivered by notification.
- **Multi-tenancy:** `companyId` on every row; a user holds several `companiesList` entries; `isNonIndianCompany` toggles currency/compliance behaviour.

See [`03-target-architecture.md`](./03-target-architecture.md) for what we will do differently.

## How to read this set

1. [`01-domain-model.md`](./01-domain-model.md) — the entities and how they relate (ER diagrams per context).
2. [`02-module-relationships.md`](./02-module-relationships.md) — which module feeds which; the end-to-end flows (material, money, labour, sales).
3. [`modules/`](./modules/) — one specification per module: screens, fields, states, rules, permissions, reports, rebuild recommendations, open questions.
4. [`03-target-architecture.md`](./03-target-architecture.md) — bounded contexts, AWS stack, data model conventions, migration approach.
5. [`04-gaps-and-roadmap.md`](./04-gaps-and-roadmap.md) — what the legacy product lacks for India and for the market; proposed phases.
6. [`research/market-and-compliance.md`](./research/market-and-compliance.md) — competitor and compliance research with sources.
7. [`legacy/`](./legacy/) — raw discovery notes (endpoint inventory, menu/permission map, seed data, mined UI strings). Keep for traceability; not a spec.
