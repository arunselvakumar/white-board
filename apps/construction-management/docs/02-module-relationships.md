# Module relationships

How the thirteen modules depend on each other, and the four end-to-end flows that cross them. Use this to decide build order and to spot the interfaces between bounded contexts.

## Dependency map

```mermaid
flowchart TB
    subgraph Foundation
        M01[01 Organization,<br/>Identity & Access]
        M02[02 Master Records]
        M12[12 Settings:<br/>numbering, back-dated, forms]
    end
    subgraph Project
        M03[03 Projects &<br/>Structure]
        M04[04 Daily Site Work]
        M05[05 Tasks, Issues,<br/>Inspections]
        M06[06 Procurement &<br/>Inventory]
        M08[08 Labour & Vendor<br/>Attendance]
        M09[09 Sales CRM]
    end
    subgraph Money
        M07[07 Payments &<br/>Accounting]
    end
    subgraph Office
        M10[10 HRMS]
    end
    subgraph Cross-cutting
        M11[11 Reports, Dashboards,<br/>Backup]
        M13[13 Chat, Notifications,<br/>Support]
    end

    M01 --> M02
    M01 --> M03
    M01 --> M10
    M12 --> M04
    M12 --> M06
    M12 --> M07
    M12 --> M05
    M02 --> M03
    M02 --> M04
    M02 --> M06
    M02 --> M07
    M02 --> M08
    M03 --> M04
    M03 --> M05
    M03 --> M06
    M03 --> M09
    M04 -- consumes stock --> M06
    M04 -- labour counts --> M08
    M06 -- GRN creates payable --> M07
    M08 -- attendance totals --> M07
    M05 -- earned value --> M11
    M09 -- units --> M03
    M01 -- HRMS members --> M10
    M04 --> M11
    M06 --> M11
    M07 --> M11
    M08 --> M11
    M09 --> M11
    M10 --> M11
    M05 --> M13
    M06 --> M13
    M07 --> M13
    M11 -- async reports --> M13
```

Reading the arrows: **01, 02, 12 come first** (you cannot create a worksheet without a contractor, a department, a project location, and a numbering rule). **03 is the spine**: every project-level module takes a `LocationRef` from it. **07 is downstream of 06 and 08**: the only way a supplier payable or a vendor balance appears is through a GRN or an attendance day. **11 and 13 read everything.**

## Flow 1 — Material (procure → receive → stock → consume)

```mermaid
flowchart LR
    W[Daily Worksheet<br/>needs cement] -- "Raise PR from inventory<br/>or PR screen" --> PR[Purchase Request<br/>PR/26-27/P1/00001<br/>Pending → Approved]
    PR -- "Generate PO" --> PO[Purchase Order<br/>supplier, rates, GST<br/>Save & Approve]
    PO -- "Mark as Ordered" --> PRo[PR: Ordered /<br/>Partially / Excess]
    PO -- "Goods arrive" --> GRN[GRN / Material Received<br/>ordered vs received qty<br/>challan, invoice]
    GRN -- "+stock" --> INV[(Project Inventory<br/>stock ledger)]
    GRN -- "payable" --> SI[Supplier Invoice<br/>→ 07 Payments]
    INV -- "Consume on worksheet /<br/>Consume Material" --> OUT[Consumed]
    INV -- "Missing Material" --> MISS[Missing]
    INV -- "Material Transfer" --> INV2[(Other project /<br/>store inventory)]
    CS[(Central Store)] -- "MR → Delivery Note" --> INV
    INV -- "min stock alert" --> N[Notification → 13]
```

Interfaces: `06 → 07` publishes `GoodsReceiptPosted { supplierId, projectId, grnId, invoiceNo, amount, dueDate }`. `04 → 06` publishes `MaterialConsumed { projectId, materialId, qty, worksheetId, date }`. `06 → 13` publishes `StockBelowMinimum`.

## Flow 2 — Money (commit → bill → pay → ledger)

```mermaid
flowchart LR
    subgraph Payables
        CI[Contractor Invoice<br/>amount, TDS]
        SI[Supplier Invoice<br/>from GRN]
        LB[Labour balance<br/>from attendance]
        VB[Vendor balance<br/>from attendance]
        OE[Other Expense]
        PI[Other-party<br/>purchase / sales invoice]
    end
    CI --> PAY[Payment entry<br/>date, mode, reference,<br/>category, paid by]
    SI --> PAY
    LB --> PAY
    VB --> PAY
    OE --> PAY
    PI --> PAY
    PAY -- "from bank/cash" --> TX[Transaction<br/>Payment Out / In<br/>Pending → Approved]
    PAY -- "from float" --> PC[Petty Cash Voucher<br/>Pending → Approved]
    TX --> LED[Ledger Report<br/>opening / credit / debit / closing]
    PC --> PCR[Petty Cash Report<br/>per account balance]
    TX --> DASH[Dashboard: Payment In/Out,<br/>Due Payments, Module-wise]
    PC --> DASH
```

Every payment carries a `paymentModule` (which payable) and a `paidToType` (which party kind), which is how the legacy product keeps one `Transaction` table serving six payables. The `financial` permission flag hides amounts from users who may still create the underlying documents.

## Flow 3 — Labour (register → attend → pay)

```mermaid
flowchart LR
    L[Labour master<br/>wage, OT rate,<br/>UAN / ESIC / Aadhaar] --> A[Labour Attendance<br/>per day: P / HD / A / Leave / Holiday<br/>+ OT lines]
    V[Vendor master<br/>shifts × category rates] --> VA[Vendor Attendance<br/>per day per category:<br/>full / half / OT hrs]
    A --> LBAL[Labour running balance<br/>to pay / advance / previous]
    VA --> VBAL[Vendor running balance]
    LBAL --> LP[Labour Payment<br/>monthly / weekly / custom]
    VBAL --> VP[Vendor Payment]
    LP --> TX[Transaction / Petty cash → 07]
    VP --> TX
    A --> WS[Daily Worksheet<br/>skilled / unskilled counts<br/>are separate, manual]
    A --> R[Reports: all labour attendance,<br/>month-wise, contractor-wise,<br/>central vendor attendance]
```

Note the gap: worksheet labour counts and attendance are entered separately and never reconciled — see [`04-gaps-and-roadmap.md`](./04-gaps-and-roadmap.md).

## Flow 4 — Sales (lead → follow-up → booking)

```mermaid
flowchart LR
    SRC[Lead Source<br/>per project] --> INQ[Inquiry<br/>Hot / Warm / Cold<br/>stage = Funnel status]
    INQ --> FU[Follow-ups<br/>date/time, remarks,<br/>history]
    INQ --> IT[Inquiry Tasks]
    FU --> INQ
    INQ -- "Converted" --> UNIT[Unit<br/>Wing → Floor → Unit]
    INQ -- "Lost + reason" --> LOST[Lost]
    UNIT --> BK[Booking<br/>Booked / On Hold / Available<br/>customer, referred by, form]
    BK --> DASH[Booking by status,<br/>Booking report,<br/>Inquiry funnel KPIs]
```

Interfaces: `09 → 03` reads units and marks them booked; `03 → 09` provides `UnitArea` (via `Booking/AddArea`) for the price sheet.

## Flow 5 — Office staff (HRMS) vs site labour

Two parallel attendance systems coexist and must not be merged:

|            | Site labour / vendor gang (08)                     | Office employee (10 HRMS)                                        |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Who        | Non-users; records                                 | Users (Normal or HRMS member)                                    |
| How marked | Supervisor marks for many, per project             | Self check-in/out with GPS, geo-fenced to branch or project site |
| Unit       | Day / half-day / OT hours; headcount for vendors   | Hours; grace period; shifts & rotations                          |
| Pay        | Wage × days + OT; running balance; cash/bank       | Salary structure (PF/ESI/PT), monthly run, payslip               |
| Leave      | "On Leave" status, Mark Paid Leave                 | Leave types, balances, accrual, approvals, cancellations         |
| Regulation | Minimum wages, BOCW, CLRA registers (research doc) | PF/ESI thresholds, Labour Codes                                  |

## Shared kernel (what every module uses)

- **LocationRef** (03) — wing/floor/unit or amenity/common development.
- **Party** (02) — contractor, supplier, vendor, labour, other party, team member; `paidToType`.
- **SequenceRule** (12) — document numbers.
- **BackdatedPolicy** (12) — date guards on create/edit.
- **Approval** (status + remarks + bulk) — PR, PO, GRN(?), MT, MR, DN, worksheet, equipment sheet, inspection, petty cash, transaction, other expense, party invoice settlement, leave, salary.
- **Attachment / Comment** — polymorphic.
- **Permission flags** (01) — `create read update delete approve reject print report viewAll notification transfer financial`.
- **Notification** (13) — push + in-app list; async job completion.

## Suggested build order (vertical slices)

1. **01 + 12 + 02 (subset)**: company, team members, permissions, numbering, departments, contractors, suppliers, materials, UoM.
2. **03**: project, phases/wings/floors/units, drawings. Dashboard shell.
3. **06 core**: PR → PO → GRN → inventory → consume/transfer. (This is the loop most customers judge first.)
4. **04**: daily worksheet (with material consumption) + equipment usage.
5. **07 core**: bank/cash accounts, transactions, supplier & contractor invoices/payments, petty cash.
6. **08**: labour & vendor masters, attendance, balances, payments.
7. **05**: tasks (Gantt), issues, inspections.
8. **11 + 13**: dashboards, reports, notifications, chat.
9. **09**: inquiry & booking.
10. **10**: HRMS.
11. **06 central store / central inventory**, **07 central payment**, **11 central reports**.
