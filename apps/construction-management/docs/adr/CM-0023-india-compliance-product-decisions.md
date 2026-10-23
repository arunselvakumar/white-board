# CM-0023 — India compliance: product decisions for M11

- Status: accepted
- Date: 2026-10-21
- Tickets: CM-1101 … CM-1126 (M11)
- Relates to: [CM-0004](CM-0004-ledger-first-balances.md) (ledger-first balances), [CM-0008](CM-0008-statutory-figures-are-dated-tables.md) (statutory figures are dated tables), [CM-0010](CM-0010-project-contract-details-and-documents.md) (Project contract details), [CM-0015](CM-0015-procurement-inventory-product-decisions.md) (GST split by state), [CM-0016](CM-0016-daily-site-work-product-decisions.md) (worksheets, hindrances), [CM-0017](CM-0017-finance-product-decisions.md) (parties, invoices, TDS 194C), [CM-0019](CM-0019-tracking-product-decisions.md) (progress rollup), [CM-0021](CM-0021-reporting-notifications-backups-product-decisions.md) (reports, notices, backups), [CM-0022](CM-0022-sales-crm-product-decisions.md) (bookings)

M11 covers India compliance: the work a builder's accountant (CA) and Tally do today (`04-gaps-and-roadmap` Phase 3, `research/market-and-compliance` §2–3). Earlier ADRs left pieces here. CM-0015 left ITC, RCM and the HSN rate table. CM-0017 left 194I/J/Q, challans and Form 26Q / 16A. CM-0016 left work measured against a BOQ. CM-0019 left Wing-level RERA progress. CM-0022 left unit money.

The owner settled four questions before M11 started (2026-10-21):

- **Contractor first** (`04-gaps-and-roadmap` open question 1). The first customer bills a client against a BOQ and pays sub-contractors against work orders. Contract billing ships first, and RERA last (§Delivery).
- **Unit money is in M11, recorded by hand.** Unit prices, payment plans, demand letters and receipts are entered by the accountant and feed the RERA 70% ledger. M12's allottee portal adds UPI collection on top (§17).
- **E-invoices and e-way bills are exported as NIC JSON.** The accountant uploads the file to the government portal and records the IRN or e-way bill number back. No GST Suvidha Provider contract (§13).
- **Tamil Nadu, Maharashtra and Karnataka** are the first states for minimum wages, RERA forms and quarterly-report deadlines (`04-gaps-and-roadmap` open question 4). Other states are data added later (§15, §19).

Two more calls were made when the board was written. The owner can reverse either:

- **Tally / Zoho Books sync moves to M12.** The at-a-glance table already lists it there, and it needs M11's GST and TDS data to sync anything useful.
- **M11 ships in three parts**, each opened as a native GitHub stack of pull requests of at most 300 files (CodeRabbit's limit). The milestone is about three times the size of M10.

Every other question is answered here with the default we recommend. The M11 handoff lists them again for the owner.

**Statutory figures** (rates, thresholds, section numbers, form names, deadlines) are seeded as dated rows under CM-0008. Each seeded row carries its `source` notification. The build checks every row against the notification in force on the day it is coded, because the research notes are from 2026-10-08 and several regimes changed during 2025–26. The 56th GST Council rates changed from 22 Sep 2025. The Income-tax Act 2025 renumbered TDS sections from 1 Apr 2026. The Labour Codes came into force on 21 Nov 2025.

## Delivery

| Part          | Tickets           | What an owner gets                                                                                                                                                                   |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M11 (1/3)** | CM-1101 … CM-1111 | Contract billing: Clients, item library, BOQ, work orders, measurement book, client and contractor RA bills, advances, retention, escalation, material reconciliation                |
| **M11 (2/3)** | CM-1112 … CM-1117 | GST and TDS: dated HSN/SAC rates, CGST/SGST/IGST on invoices, ITC and RCM, promoter 80/20 test, e-invoice / e-way bill JSON, TDS sections, challans, 26Q                             |
| **M11 (3/3)** | CM-1118 … CM-1126 | Labour, RERA and quality: minimum wages, PF/ESI for site labour, BOCW cess, unit prices and collections, RERA ledger and quarterly progress, concrete registers, compliance calendar |

Parts 2 and 3 depend on part 1's foundation (CM-1101), not on its billing tickets, except where the board says so. Each part ends with its own section in `handoff/M11.md`.

## Decisions

### 1. Where the work lives

- A new **`contracts`** context owns the item library, BOQ, work orders, measurements, RA bills, advances, retention, escalation and material reconciliation. It uses `src/contracts`, Postgres schema `construction_contracts`, API prefix `/api/construction/contracts` and Prisma prefix `ConstructionContracts`. Every table carries `workspace_id`.
- **GST and TDS stay in `finance`.** Finance already owns invoices, party payments and the 194C ledger. The HSN/SAC rate table is a finance statutory table, read by masters, procurement and contracts through a `GstRates` port.
- **Minimum wages, PF/ESI for site labour and BOCW** belong to `labour`. Its PF/ESI arithmetic reuses HRMS's dated tables through a port, not by importing `hrms`.
- **Unit prices, payment plans, demands, receipts and RERA** belong to `sales`, which owns units' sales details and bookings. Receipts post money through the existing `AccountPosting` port.
- **Concrete pour and cube registers** belong to `site-work`, beside the worksheet and the site diary.
- **Clients** are a new master in `masters` (§2).

### 2. Clients and the Project's role

- **Client** is a Company-level master record. A Client has a name, GSTIN, PAN, state, billing address, PIN, email, phone and an optional TAN. It is managed under Master records → **Clients** (menu `masters.clients`, CRUD). Its GSTIN and PAN are checked like a Supplier's.
- A Project gains an optional **Client** link. `client_name` stays: picking a Client fills it, and Projects without a Client keep their text. A data migration links nothing: owners pick the Client when they first bill.
- A Project gains a **Role**: **Contract work** (built for a Client, who is billed) or **Own development** (built to sell or keep). The migration sets Contract work where the Project has a client name or client order number, and Own development otherwise. The Role drives ITC defaults (§11), the promoter scheme (§12) and which modules are shown by default (§22).
- Finance gains the party type **`client`**. Client bills are receivable invoices to it, and receipts from it record the TDS and GST-TDS the client deducted (§14).

### 3. Item library and rate analysis

- **Items** belong to the Company. An Item has a code, a short description, a long description, a UoM, a SAC or HSN code, a **schedule** label (free text such as "CPWD DSR 2023", "TN PWD SoR 2025-26" or "Own") and an **adopted rate**.
- **Rate analysis** is optional per Item. It has lines for material (a Material and its coefficient per unit), labour (a Labour Category and days per unit), equipment (an Equipment and hours per unit) and lump sums, plus an **overhead and profit %**. The analysed rate is computed. The adopted rate is typed, so the two can differ, and the form shows the gap.
- Material coefficients from rate analysis feed material reconciliation (§10).
- **We do not ship DSR or state schedule data.** Schedules are large, differ by state and change every year. The Company imports its own from Excel, using a sample file with the columns, and matched by code: a new code creates an Item, an existing code updates it. The import is all or nothing, like the unit import (CM-1005).
- Menu **`contracts.items`** ("Item Library", Master records, CRUDEI). An Item used on a BOQ cannot be deleted (409 `ITEM_IN_USE`).

### 4. BOQ and variations

- A Project has one **BOQ**. On a Contract work Project it is the client's contract. On an Own development Project it is the budget, and it is never billed to anyone.
- A BOQ has ordered **sections**, and each section has **items**. A BOQ item has an item number as the contract prints it (`2.1.3`), a description, UoM, SAC/HSN, quantity, rate and amount. It is copied from the library or typed ad hoc, and may name a Wing or Location. The BOQ total is shown beside the Project's Order Value.
- The BOQ can be **imported from Excel** (sections and items in one sheet).
- A BOQ item can be edited freely until a **checked measurement** names it. After that, quantity and rate change only through a **Variation**: an extra item, or a change of quantity or rate with a reason, numbered by a sequence rule and approved with the menu's Approve flag. The BOQ shows the original and the current quantity, and each item lists its variations.
- Measuring more than an item's current quantity is allowed on the client side and is flagged as a **deviation**, with a list of the items that need a variation. Contracts usually allow ±25 %, and the figure is a setting.
- Menu **`contracts.boq`** ("BOQ", Project, CRUDAJPNOFEI). Rates and amounts need **Financial**; without it the BOQ shows quantities only.

### 5. Work orders

- A **Work Order** goes to a Contractor, and optionally one of its Departments. It has a sequence-rule number, a date, a valid-until date and a scope note.
- Its lines are **BOQ items at the work-order rate**, which is usually lower than the client rate, or **non-BOQ lines** for labour-only or extra work. A line's quantity may exceed what the BOQ has left for that item; the form warns, and it does not block.
- **Terms** on each work order:
  - retention % per bill, and a retention cap as a % of the work-order value;
  - mobilisation advance and its recovery % per bill;
  - DLP months;
  - TDS nature (defaulted from the Contractor, §14);
  - GST: SAC 9954 (works contract) or 9987 / 9985 (labour supply), the rate, and whether reverse charge applies.
- Statuses are draft, pending approval, **issued**, closed and cancelled. Approve and Reject use the existing approval kernel.
- An issued work order is changed by an **amendment**: a new revision with a reason and the old revision kept. A line that has been billed cannot be removed, and its quantity cannot fall below what was billed. Billing beyond a line's work-order quantity is refused (409 `WORK_ORDER_QUANTITY_EXCEEDED`, `details.lineId`); amend the work order first.
- Work-order PDF with terms; it prints Indian scripts (embedded Noto fonts, like the other PDFs).
- Menu **`contracts.work_orders`** ("Work Order", Project, CRUDAJPNOF).

### 6. Measurement Book and joint measurement

- A **measurement sheet** records one date, one side and one party: **client** (against BOQ items) or **contractor** (against one work order's lines).
- Each row has an item, a description, a location (`LocationRef`), number, length, breadth and depth/height, and the computed quantity. A row can instead give the quantity directly, or be negative for deductions such as openings. Photos can be attached (attachments, not the Gallery).
- A sheet is **draft**, **submitted** and then **checked**. Checking is the **joint measurement** (JMR). It records our engineer (the checking user), the other party's name and role, and the date, the same way the hindrance register records joint sign-off.
- A row in an approved bill is **locked**. To correct it, reverse the bill (§7).
- Menu **`contracts.measurements`** ("Measurement Book", Project, CRUDAPNO; Approve = check; Notification since CM-1105, for `measurement.submitted`).

### 7. RA bills, both ways

There are two kinds of running account (RA) bill:

- **Contractor bills** (inward), from a work order.
- **Client bills** (outward), from the BOQ, on Contract work Projects.

Both kinds work the same way:

- A bill takes every **checked** measurement up to its "measured up to" date that no earlier bill has taken. The **gross** is the cumulative value to date minus the previous bills.
- The bill has typed **deductions**: retention, mobilisation advance recovery, secured advance recovery, material issued at cost, material reconciliation recovery (§10) and other (with a reason). It also has **GST** on the gross (§11) and a net amount.
- Bills are numbered by a sequence rule per Project and side. They go draft → pending approval → **approved** (Approve and Reject flags). The last bill on a work order or BOQ can be marked **Final**, which closes the work order.
- An approved bill is locked. It can be **reversed** only while it is the latest bill on its work order or BOQ and nothing has been paid or received against it. Reversing posts a reversal and frees its measurements (409 `BILL_NOT_LATEST`, `BILL_SETTLED`).
- **TDS is not a bill deduction.** Finance deducts TDS at payment, as today (CM-0017). The bill PDF shows the TDS estimate for information.

When a **contractor bill** is approved, it creates a **payable invoice** in finance (origin `ra_bill`). The invoice amount is the bill's net (gross + GST payable, none under reverse charge, − retention − recoveries) plus the advances it recovers, which approval settles from the advances' on-account payments (§8, amended by CM-1108). **Retention held** is kept in contracts, derived from the retention deductions of approved bills less releases, and shown on the Contractor Bills page and the Work Order. It is not a party-ledger entry: finance sums the party ledger in many places (balances, statements, central payments, dues, reports), and a new entry kind would change all of them. The Contractor's finance balance is therefore what is owed now, and a release (§8, CM-1108) creates the payable for what it releases. (Amended by CM-1106.)

When a **client bill** is approved, it creates a **receivable invoice** to the Client in the same way, for the net plus the advances it recovers. Retention the client holds is **retention receivable**, derived in contracts from approved client bills less releases like retention held, and shown on the Client Bills page and the Client's balance. The bill carries the place of supply (§11) and can be exported for an e-invoice (§13). (Amended by CM-1107.)

Every bill has a PDF with three parts: an abstract, the measurement detail and the deductions.

Menus **`contracts.contractor_bills`** ("Contractor Bills") and **`contracts.client_bills`** ("Client Bills"), both Project, CRUDAJPNOF.

### 8. Advances, retention release, DLP and bank guarantees

- An **advance** (mobilisation or secured) belongs to a work order (given) or to the Project's client contract (received). It has an amount, date, recovery % per bill or a fixed amount per bill. A **bank guarantee** (number, bank, amount, issue date and expiry) can secure it.
  - A given advance is paid through finance as an **on-account Payment Out** to the Contractor on the Project, recorded with the advance in one transaction (finance's own payment checks apply, Parties Create among them). A received advance is the mirror: an on-account **Payment In** from the Client. Finance shows either as an advance on the party's balance, and leaves cancelling or applying it to Contracts.
  - Each later bill suggests the recovery: min(the rule's amount, what is left of the advance). The user can edit it, and a recovery always names its advance.
  - A recovery is **the advance being applied to the bill**, not money withheld. The bill's finance invoice is the net **plus** its recoveries, and approval allocates that much of the advance's payment to the invoice, the way **Apply advance** does (CM-0017 §7). The party's balance shows the advance used up and the invoice partly settled. Reversing the bill takes the allocation back, and an allocation that came from the bill's own recovery does not make the bill "settled". (Amended by CM-1108.)
- **Retention release** has two stages, configurable per work order or contract: by default 50 % on completion and 50 % at the end of the DLP. Retention can also be released early against a live retention bank guarantee, or for another reason. A release creates a finance invoice for what it releases (origin `retention_release`, no taxable value or GST, because GST was charged on the bills): payable to the Contractor, or receivable from the Client. Retention held or receivable is what approved bills deducted less these releases. A release can be deleted, with a reason, while its invoice is unsettled. (Amended by CM-1108.)
- **DLP** starts on the work order's completion date, or on the client contract's handover date for the client side. The DLP end date drives the second release: it is allowed on or after the end, and earlier only by someone holding the menu's Approve flag, with a reason. (Amended by CM-1108.)
- A daily notice warns 30 days before a **bank guarantee expires** or a **DLP ends** (CM-0021 messaging, like the follow-ups notice): one message per member per Project a day, to Work Order Read + Notification holders for work orders and Client Bills Read + Notification holders for the client contract.

### 9. Escalation bills

- **Price indices** are a Company-level table that the accountant types in each month: WPI, CPI-IW, cement, steel, bitumen and POL, or any named series. We do not fetch them.
- A work order or client contract can turn on an **escalation clause**. The clause has component weights (labour, material, cement, steel, POL and others, summing to 100), a base month and a non-escalable %.
- An **escalation bill** is a third bill type for a period. It applies the CPWD 10CC-style formula to the value of work done in that period and approves like an RA bill. Clause 10CA (cement and steel quantities × index change) is the same mechanism with the quantities taken from material reconciliation.
- Price indices sit under Master records → Contracts and use the Item Library's menu (`contracts.items`); they are typed or imported from Excel. (Amended by CM-1109.)
- An escalation bill covers **whole months**. Its value of work is the gross of the side's approved running bills dated in the period. Cement and steel on 10CA are taken out of that value before the 10CC part, so they are not escalated twice. Until CM-1110, their quantities are typed on the bill. (Amended by CM-1109.)
- **Negative escalation** (the indices fell) is approved without an invoice and recovered on the next running bills of the same contract, as an "other" deduction that names the escalation bill. Retention on escalation bills counts towards the retention cap, retention held and retention receivable. Approved escalation periods on one contract cannot overlap. (Amended by CM-1109.)

### 10. Material reconciliation

- A work order lists the **materials the Company issues** to the Contractor. Each has an issue basis (free or at cost), a **coefficient per unit** of each work-order line (copied from the Item's rate analysis, editable), a **permissible wastage %** and a **penal rate**.
- The **reconciliation statement** is produced per work order per bill:
  - **theoretical consumption** = Σ billed quantity × coefficient;
  - **issued** = Delivery Notes to that Contractor, net of returns;
  - **excess** = issued − theoretical × (1 + wastage).
- The excess becomes a suggested **material reconciliation recovery** at the penal rate on the next contractor bill, editable with a reason. Under-use beyond the wastage limit is flagged, because the work may be short of material.
- Material issued at cost is recovered through its own deduction line.

### 11. GST engine

- **Rates are dated.** A platform table maps an HSN/SAC prefix to its rate, with `effective_from` and `source`, seeded as JSON under CM-0008. It includes the 22 Sep 2025 changes (cement 28 % → 18 %, works contract SAC 9954 at 18 %).
  - Materials and Items keep their HSN/SAC. A document line takes the rate in force on the document's date.
  - The user can override the rate with a reason, and the override is audited.
  - The Material's static `gst_rate` becomes a fallback for codes the table does not know.
- **Invoices split GST.** Finance invoices gain CGST, SGST, IGST and cess. Rows from before M11 keep only their total (`gst_amount`), and the split is null.
- **Place of supply.**
  - Works on immovable property: the Project's state.
  - Goods: the existing PO rules (CM-0015).
  - The Company's GSTIN for a Project is its billing address in the Project's state, else the default billing address. If the Company has no GSTIN in the Project's state, the client bill warns (`GSTIN_NOT_IN_STATE`), because the Company may need to register there.
- **ITC eligibility** is stored per purchase invoice. It defaults to **blocked** on Own development Projects (s.17(5), construction of immovable property on own account) and **eligible** on Contract work Projects, and the accountant can change it with a reason.
- **Reverse charge (RCM).** A purchase invoice is marked RCM when the supplier is unregistered and the goods or service is notified for RCM (for example cement from an unregistered supplier), or for the promoter shortfall (§12). The RCM liability shows in the GST registers.
- **Registers and return summaries.** These are Excel exports for the accountant to file; nothing is filed by us:
  - an output register (client bills and sales invoices);
  - an input register (eligible, blocked and RCM);
  - GSTR-1 tables (B2B, B2C, credit notes, HSN summary);
  - GSTR-3B tables 3.1, 4 and 5.
- Menu **`finance.gst`** ("GST", Payment & Accounting, Company, ROE).

### 12. Promoter scheme and the 80/20 test

- An Own development residential Project can opt into the **promoter scheme**: 1 % (affordable) or 5 % (other) GST without ITC, for projects from 1 Apr 2019.
- Per Project per financial year, purchases from **registered** suppliers must be at least 80 % of inputs and input services. Excluded from the base are land, TDR/FSI, long-term lease, electricity, high-speed diesel, motor spirit and natural gas, and capital goods.
- The report shows registered and unregistered purchases, the shortfall and the **RCM at 18 %** on it. Cement from unregistered suppliers is always under RCM at the cement rate, outside the 80/20 test.
- The figure for the year is a working for the CA to confirm. The year-end RCM is recorded as a journal by the accountant, not posted automatically.

### 13. E-invoice and e-way bill JSON

- A Company setting records that **e-invoicing applies** (aggregate turnover over ₹5 crore in any year since 2017-18) and from which date.
- **E-invoice JSON** in the NIC IRP schema can be exported for client bills, other-party sales invoices and credit notes. The schema version is a constant in code and its tests.
- **Bulk e-way bill JSON** can be exported for Delivery Notes, material transfers and sales whose consignment value with tax is over ₹50,000.
- Before export, documents are checked: GSTIN format, PIN, and HSN length by turnover (6 digits above ₹5 crore). Errors are listed per document.
- The accountant uploads the file to the portal and records back the IRN, acknowledgement number and date, signed QR text, or the e-way bill number and validity. The printed invoice then shows the IRN and QR.
- Cancelling an IRN is done on the portal. We record that it was cancelled.

### 14. TDS beyond 194C

- **A payment has a TDS nature, not a hard-coded section.** The natures are:
  - contractor / labour supply;
  - professional fee;
  - technical fee;
  - rent of plant and machinery;
  - rent of land or building;
  - purchase of goods.
- The dated statutory table maps each nature, payee kind and date to a **section label**, a rate and thresholds. Payments before 1 Apr 2026 print 194C, 194J, 194I and 194Q. Later payments print the Income-tax Act 2025 numbers (e.g. 393(1)), verified against the Act's schedule when seeded.
- Each party has a **default nature**: Contractors default to contractor, and Suppliers and Other Parties to none. A payment can change it. The hard-coded "194C" in `PartyPaymentHandlers` goes away.
- **Purchase of goods (194Q)** applies only when the Company setting "turnover above ₹10 crore last year" is on. It applies to the value above ₹50 lakh per seller per financial year, and is deducted at payment. The law says at credit or payment, whichever is earlier, and the handoff states this simplification.
- Equipment hire (`EquipmentHireAccrued`) still has no listener: hire is billed by the hire party's invoice, and its payment can take the plant-hire nature.
- **Challans.** The accountant records deposits: BSR code, challan serial, date, amount and period. Each challan is allocated to TDS deductions. Deposits are due on the 7th of the next month (30 April for March), and late ones are flagged with interest at the statutory rate.
- **Form 26Q.** A quarterly export of the deductee rows in the column order of Protean's Return Preparation Utility. We do not build the FVU file.
- **Form 16A.** A register where the accountant uploads the TRACES PDF per deductee per quarter, downloadable with Parties read.
- **TDS receivable.** Receipts from Clients record the TDS (and GST-TDS 2 % for government clients) deducted by the client. A register lists it to reconcile with Form 26AS, by hand.
- Menu **`finance.tds`** ("TDS", Payment & Accounting, Company, CRUDOE). Today's per-Contractor TDS ledger moves under it.

### 15. Minimum wages

- **Rate cards** are dated platform rows per state (Tamil Nadu, Maharashtra, Karnataka), zone (where the state zones by area), employment (construction) and skill: unskilled, semi-skilled, skilled, highly skilled. Each row holds basic + VDA per day and its source notification.
- **Labour Category skill grows to four levels.** The migration keeps skilled and unskilled as they are.
- A Project picks its **minimum-wage zone** from its state's zones.
- **Warnings, not blocks.** The labour form, vendor rates and attendance warn when a daily wage is below the applicable minimum on that date. A **Minimum wage check** report lists every labour and vendor rate below it.
- VDA revisions (twice a year) are new dated rows added by migration. Companies cannot edit them (CM-0008).

### 16. PF, ESI and statutory registers for site labour

- A Labour can be marked **PF applies** and **ESI applies**, with UAN and ESIC numbers (already on the record).
  - Contributions are computed per wage month on wages earned, with the HRMS dated rates and ceilings.
  - The employee share is a **deduction** on wage payments.
  - The employer share is a cost shown in reports. The Company's ECR and ESI uploads for site labour reuse the HRMS return builders.
- The **muster roll's Deductions column** shows PF, ESI and advances recovered. It stops being 0.
- **Contractor compliance fields:** labour licence number and validity (CLRA, or the OSH Code licence), PF and ESI establishment codes, and BOCW registration. A **Principal employer check** report lists the contractors' labour on a Project with missing UAN or ESIC, and licences expiring within 30 days.
- **Registers under the Labour Codes.** The Codes have been in force since 21 Nov 2025 and states are still notifying rules. The register titles and form numbers are dated data per state. The combined muster roll cum wage register keeps CLRA Forms XVI/XVII until a state's notified forms are seeded, and the build checks TN, MH and KA. **Electronic wage slips** (PDF per labour per wage period) are added.

### 17. Unit prices, payment plans, demands and receipts

- **Price sheet.** A Project's price sheet has:
  - a base rate per unit area on **carpet area** (RERA requires sale on carpet area; other areas are shown);
  - floor rise per floor from a given floor;
  - PLC by unit;
  - parking and other charges, each taxable or not;
  - the GST rate from the Project's scheme: 1 %, 5 %, or 18 % with ITC for commercial.
- **Agreement value.** A booking gets its agreement value from the price sheet when it is booked. The value is kept on the booking; editing it needs Booking Update + Financial and a reason.
- **Payment plans** are per-Project templates. Each stage is a % of the agreement value with a trigger: on booking, on agreement, on a **Wing stage** (plinth, nth slab, brickwork, finishing, possession) or on a date. RERA s.13 caps collection before the agreement for sale at 10 %, and the plan warns above it.
- **Demands.** Marking a Wing stage reached raises a demand for every booked unit on that Wing in one action. Each demand has its amount + GST, a due date (default 15 days) and a **demand letter PDF**. Demands can also be raised one at a time.
- **Receipts are entered by hand.** A receipt has a mode (cheque, NEFT/RTGS, UPI, cash), reference, date and the account it went to, and is allocated to demands. Each receipt gets a **receipt PDF**.
  - TDS 194-IA deducted by the buyer (1 % above ₹50 lakh) is recorded on the receipt.
  - Receipts post to finance through `AccountPosting`.
- Each booking has an **allottee ledger** (demands, receipts, balance).
- **Cancellation with money.** Cancelling a booking that has receipts shows the refund due. The refund is recorded as a payment to the allottee.
- Interest on late payment is **not** in M11.
- Bookings gain the **allottee's PAN** and **co-applicants**.
- Menu **`sales.collections`** ("Collections", Project, CRUDAJPNOF).

### 18. RERA registration and the 70 % ledger

- **Project RERA details:** state authority, registration number, date, valid until (with extensions), and the designated (70 %) bank account, a finance bank account. An optional collection account can be added where the state requires one (MahaRERA).
- The Project form warns when the Project needs registration: over 500 m² or over 8 units.
- **Booking gate.** A Project marked "RERA registration required" refuses Book and Confirm before its registration date (409 `RERA_NOT_REGISTERED`). Holds are allowed.
- **The 70 % ledger** is a report per Project:
  - receipts from allottees;
  - 70 % of them required in the designated account;
  - what was actually deposited there;
  - withdrawals from it (finance transactions);
  - the withdrawal limit, which is % completion × cost-based eligibility from the certificate inputs.
  - Shortfalls and excess withdrawals are flagged, not blocked: the bank and the CA are the control.
- Menu **`sales.rera`** ("RERA", Project, CRUDPO).

### 19. RERA quarterly progress and certificate inputs

- **Quarterly progress per Wing** has:
  - physical % complete from the tracking rollup (CM-0019 §4), filtered by the tasks' Wing, overridable with a reason;
  - stages reached;
  - cost incurred to date, split into land and construction by mapping Payment Categories;
  - receipts and the designated account balance;
  - units sold and unsold.
- **State templates** cover MahaRERA, TNRERA and K-RERA. Each has its form layout as an Excel export and its **due days after quarter end**, as dated data. A daily notice reminds from 15 days before the due date.
- **Forms 1–3 inputs.** An export of the figures the architect, engineer and CA certify. The certificates themselves are signed outside the app and uploaded as Project Documents.

### 20. Concrete pour and cube registers

- **The pour register** belongs to a Project. Each pour has a date, location (`LocationRef`), structural element, grade (M20 … M60), quantity in m³, source (RMC or site mix), supplier and batch or MTC file, slump and remarks.
- **Required samples** are computed from the quantity per IS 456 cl. 15.2.2. The table is a constant with its tests.
- **The cube register** lists samples, each of three cubes. A sample has 7-day and 28-day test due dates, results in N/mm² per cube, the lab, and an optional link to a Testing Report file (CM-409).
- **Acceptance** follows IS 456 Table 11 as amended: the individual result criterion and the mean of consecutive non-overlapping samples. Each sample and pour is **pass**, **fail** or **pending**. The criteria are verified against the current amendment when coded. A failed pour offers to raise an Issue (M8).
- A daily notice lists cube tests due.
- Menu **`site_work.concrete`** ("Concrete Register", Project, CRUDAPO; Approve = accept a result).

### 21. Compliance calendar and dashboard

- **Due dates** are dated data per regime:
  - TDS deposit on the 7th;
  - 26Q on 31 Jul / 31 Oct / 31 Jan / 31 May;
  - GSTR-1 on the 11th and GSTR-3B on the 20th;
  - RERA quarterly reports per state;
  - bank guarantee expiry and DLP end;
  - BOCW cess stages;
  - cube tests due.
- A **Compliance** section on the Company Dashboard shows what is due and overdue. Each item needs its own menu, so a member sees only what they may open. The existing daily notice job sends one compliance digest per member.
- **Backups** (CM-906) gain the Contracts modules, Collections and RERA, and the Concrete Register.

### 22. Sidebar, menus and modules

- A new sidebar heading, **Contracts**, holds the Project modules **BOQ**, **Work Orders**, **Measurements**, **Contractor Bills** and **Client Bills**.
- **Collections** and **RERA** join the Sales heading.
- **Concrete** joins the site-work heading.
- New Project modules start **shown**, except for these Role defaults:
  - **Client Bills** is hidden on Own development Projects.
  - **Collections** and **RERA** are hidden on Contract work Projects.
  - Owners change this per Project, as today.
- The Permission Matrix gains a **Contracts & Billing** category for the `contracts.*` menus. The migration grants the new menus to the seeded designation templates that hold the matching finance or project menus. The Owner holds everything already.

### 23. BOCW cess

- **The Company's BOCW registration** is recorded per state (number and date).
- **A Project's BOCW details:** registration, the **estimated cost of construction** (excluding land and BOCW compensation), and the cess at 1 %, with the residential exemption (cost ≤ ₹10 lakh).
- **Cess payments** are recorded: challan, date, amount and stage. The register shows cess due against paid.
- Construction spend to date, from finance, is shown beside the estimate so the accountant sees when to revise it.
- Menu **`labour.compliance`** ("Labour Compliance", Project, CRUDO). It also shows §16's reports.

### 24. Not in M11

- Tally / Zoho Books sync (M12).
- Live GSP or IRP APIs; filing any return.
- UPI collection links and the allottee and vendor portals (M12).
- Interest on late allottee payments.
- TDR/FSI accounting.
- The Form 1–3 certificates themselves.
- States other than TN, MH and KA, and central-sphere minimum wages (data later).
- Bundled DSR or state schedule data.
- Labour welfare fund and professional tax for site labour.
- ITC reversal when an under-construction unit is sold after the completion certificate.
- Linking Tasks to BOQ items for earned value.
- A vendor-gang (piece-rate) version of work orders.

## Consequences

- `construction_contracts` is a new schema with its own migrations. Other schemas change only in their own migrations (projects: Client link and Role; finance: invoice GST split, party type `client`, retention entry kinds, GST and TDS tables; labour: skill levels, zones, PF/ESI; sales: prices, plans, demands, receipts, RERA; site-work: concrete).
- **Finance stops treating TDS as one section.** The TDS ledger, reports and payment form read the nature and the dated section label.
- **Money from new sources reaches finance through ports.** RA bills create invoices through a `PartyInvoicing` port; receipts post through `AccountPosting`. No context writes another context's tables.
- **Statutory data now spans three regimes and three states.** Each seed has a unit test that keeps the JSON and the migration SQL in step, as CM-0008 established.
- **The product now produces documents the Company files with the government.** Every export names its schema or form version, and the handoff says what the accountant still checks by hand.

## Considered options

- **One `compliance` context holding GST, TDS, RERA and labour law.** This was rejected. Each rule needs the data of the context that already owns the money or the people, so a separate context would read across all of them.
- **Ship CPWD DSR data.** This was rejected: it is large and changes every year, it is one schedule among many (each state has its own SoR), and owners already hold theirs in Excel.
- **TDS as a bill deduction.** This was rejected because finance deducts TDS at payment with per-year thresholds (CM-0017). Deducting it at the bill would count it twice or miss the threshold catch-up.
- **Block wages below the minimum.** This was rejected: rates are data that can lag a notification, and a block stops the site paying anyone. A warning plus a report keeps the record honest.
- **A GSP integration for e-invoices.** The owner deferred it: it needs a paid contract and credentials, and JSON upload covers the volume of a small contractor.
