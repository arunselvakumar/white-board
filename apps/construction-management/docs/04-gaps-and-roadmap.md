# Gaps and roadmap

What the legacy product does not do, what the Indian market expects, and the order we propose to build. Evidence: the module specs under [`modules/`](./modules/) and [`research/market-and-compliance.md`](./research/market-and-compliance.md) (cited as _research §n_).

## 1. Gaps observed in the legacy product

### Product gaps (seen while walking the app)

| #   | Gap                                                                                                                                                                                      | Where it hurts                                                                                 | Fix in the rebuild                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **No BOQ / work order / RA bill.** Contractor invoices are typed amounts with a TDS field; there is no measured quantity behind them.                                                    | Every civil contractor bills by measurement; the owner cannot verify a bill against work done. | BOQ with DSR item library, work orders at item rates, measurement book, RA bills with retention/advance/deductions (_research §3_).             |
| G2  | **Worksheet labour counts and attendance are disconnected.** Skilled/unskilled counts are typed on the worksheet; labour and vendor attendance are marked elsewhere; nothing reconciles. | Double entry; DPR headcount never matches the muster.                                          | Worksheet labour section reads from attendance by contractor/department for the day; manual override flagged.                                   |
| G3  | **No material reconciliation.** Consumption is recorded, but theoretical consumption (BOQ × coefficients) is never computed.                                                             | Cement/steel leakage is the biggest site loss.                                                 | Coefficients per BOQ item; reconciliation statement per contractor per RA bill (_research §3_).                                                 |
| G4  | **Equipment sheets, worksheets, and PR/PO all re-key location.** `LocationRef` exists but is free-form per screen (floors are multi-select on worksheets, single on others).             | Reports by location are unreliable.                                                            | One `LocationRef` value object; floor multi-select only where it means "spanned".                                                               |
| G5  | **GST is a per-line percentage with no CGST/SGST/IGST, place of supply, HSN validation, ITC flag, or RCM.** PO totals are informational only.                                            | Cannot produce a GST-correct PO or purchase register; Tally still needed.                      | Full tax lines, effective-dated rate table, ITC-eligible flag by project type, 80/20 test for promoters (_research §2 GST_).                    |
| G6  | **TDS is a typed amount on contractor payments only.** No section, no threshold tracking, no 194Q on supplier purchases, no 26Q export.                                                  | CA re-computes everything at quarter end.                                                      | Party-level PAN/entity type/section; cumulative per-FY tracking; TDS ledger; 26Q/16A export (_research §2 TDS_).                                |
| G7  | **No audit trail.** Only `createdBy / approvedBy / rejectedBy` columns; balances are edited in place (opening balance, "Update Estimation Quantity").                                    | Disputes with contractors and auditors.                                                        | Append-only ledgers; `audit_events` on every command (architecture §3).                                                                         |
| G8  | **Approval is single-level everywhere** (HRMS leave has `approval_levels` but site documents do not).                                                                                    | Larger firms need PM → owner for PO above a value.                                             | Approval policy per module: levels, amount thresholds, designation-based approvers.                                                             |
| G9  | **Numbering resets are manual** ("Start Number"); fiscal-year token is typed into the prefix (`PR/26-27`).                                                                               | Wrong FY on 1 April.                                                                           | Fiscal-year-aware sequence rule (architecture §2).                                                                                              |
| G10 | **Reports are PDFs generated by the app, one at a time** ("please wait while another report is generating"); no saved views, no scheduled delivery.                                      | Owners want a Monday email.                                                                    | Job queue, saved filters, scheduled reports, Excel first.                                                                                       |
| G11 | **Two attendance systems with different UX** (site labour via supervisor; office via GPS). Reasonable split, but no consolidated manpower view.                                          | "How many people were on site today" needs three screens.                                      | One manpower read model across labour, vendor gangs, and HRMS check-ins per project per day.                                                    |
| G12 | **Booking is a flag on a unit**, not a sale: no price, no payment schedule, no demand letters, no receipts, no RERA ledger.                                                              | Developers run collections in Excel/Sell.Do.                                                   | Unit pricing & areas, payment plan (CLP/construction-linked), demand letters, receipts with UPI, 70% account ledger (_research §2 RERA, §4.6_). |
| G13 | **Testing reports are files with a date** — no sample register, no 7/28-day results, no acceptance logic.                                                                                | IS 456 compliance is paper.                                                                    | Pour register → cube samples → results → acceptance (_research §3_).                                                                            |
| G14 | **Drawings are albums of files**; nothing links a worksheet, issue, or task to a point on a drawing.                                                                                     | Reviewers of competitors ask for exactly this (_research §4.8_).                               | Drawing viewer with pins; LocationRef can carry a drawing coordinate.                                                                           |
| G15 | **Equipment hire cost is computed but not posted anywhere** (no vendor payable from equipment sheets).                                                                                   | Rented machinery is a top-3 cost.                                                              | Equipment sheet with hire details raises a vendor payable line (194I TDS).                                                                      |
| G16 | **No offline mode; web app is a 19 MB Flutter bundle** that shows a 0% loader without JS and takes 8–10 s per screen on a laptop.                                                        | Basements and remote sites; SEO zero.                                                          | PWA with offline outbox (architecture §2).                                                                                                      |
| G17 | **Data-entry friction**: 3-step PR wizard, panel-in-panel forms, bottom-sheet pickers that need a search tap each, "Discard changes?" on every back.                                     | Reviewers of Powerplay/Onsite complain of exactly this (_research §1_).                        | One-screen forms with defaults from yesterday, bulk rows, keyboard-friendly web.                                                                |
| G18 | **Hidden pricing, trial banner, "Company owner only" checkout, add-ons per unit per month.**                                                                                             | Market complaint across competitors (_research §4.9_).                                         | Public per-company pricing; export everything.                                                                                                  |

### Compliance gaps (India)

| Area    | Legacy                                               | Required (_research §2_)                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GST     | % per PO line; GST No on parties                     | SAC 9954 works-contract classification per WO; CGST/SGST/IGST; ITC block (s.17(5)) by project type; promoter 1%/5% + 80/20 registered-supplier test + RCM; e-invoice (IRN) above ₹5 cr AATO; e-way bill above ₹50,000 on material transfers/sales |
| TDS     | TDS amount on contractor payment                     | 194C (1%/2%, ₹30k/₹1L), 194J (₹50k), 194Q (0.1% > ₹50L/seller, buyer > ₹10 cr), 194I on equipment hire; per-FY thresholds; 26Q                                                                                                                    |
| RERA    | —                                                    | Project registration data; 70% separate account ledger; quarterly physical & financial progress per wing; Forms 1–3 inputs; state-configurable QPR deadlines                                                                                      |
| Labour  | UAN/ESIC/Aadhaar on labour master; attendance; wages | Form XVI/XVII (combined register), minimum-wage rate cards per state & skill with VDA, PF/ESI challan inputs, BOCW registration & 1% cess per project, CLRA licence on contractor master                                                          |
| Quality | Testing report files                                 | IS 456 sampling & acceptance registers; MTC per batch                                                                                                                                                                                             |
| Records | —                                                    | Site diary, hindrance register with joint sign-off (EoT evidence)                                                                                                                                                                                 |

## 2. Roadmap

Each phase is a shippable product. Build order inside a phase follows [`02-module-relationships.md`](./02-module-relationships.md).

### Phase 0 — Foundation (4–6 weeks)

- App skeleton on the Whiteboard conventions; `construction_*` schemas; `@repo/auth` with OTP login; Company = Workspace; team members; permission matrix; designations with templates; numbering; back-dated policy; audit events.
- Masters: departments, work types, contractors, suppliers, vendors (rate cards), labour, categories, UoMs, materials (with HSN/GST), bank/cash accounts, other parties.
- Projects: create wizard, phases → wings → floors → units generator, locations, drawings, gallery, hide/show modules.
- Exit: a company can onboard, invite staff, and set up a project with its building structure.

### Phase 1 — Site & material (6–8 weeks) — _parity core_

- Procurement chain: PR (both modes) → PO (GST-correct) → GRN → inventory ledger → consume / missing / transfer; min-stock alerts; central store (MR → DN); stock register.
- Daily worksheet with configurable sections and material consumption; equipment master, usage sheets, transfers, maintenance; testing items & reports.
- Tasks with Gantt & earned value; issues & snags; inspection requests.
- Project dashboard v1; PDF/Excel for PR, PO, GRN, worksheet, stock register via job queue; notifications.
- Exit: a site engineer runs a day on the product; the store keeper runs the store.

### Phase 2 — Money & people (6–8 weeks) — _parity complete_

- Finance: transactions, petty cash vouchers, contractor/supplier/labour/vendor/other-party invoices and payments, ledger report, module-wise payment widgets; TDS sections with thresholds; purchase register.
- Labour & vendor attendance with OT, running balances, payments, muster-roll export.
- Sales CRM: inquiries, lead sources, funnel, follow-ups, bookings (unit flag level).
- HRMS: settings, branches/geo-fences, check-in/out, holidays, leave types/structures/balances/requests, shifts/rotations, salary structures & runs.
- Central payment, central reports, backups. Subscription & Razorpay checkout.
- Exit: feature parity with BuildControl; existing customers can migrate.

### Phase 3 — India (8–10 weeks) — _what Tally and the CA do today_

- BOQ with DSR item library; work orders at item rates; measurement book / JMR; RA bills with retention, mobilisation recovery, deductions register, escalation; DLP tracking on units.
- Material reconciliation per contractor per bill.
- GST engine: CGST/SGST/IGST, ITC flags, promoter 80/20 & RCM, e-invoice and e-way bill via GSP.
- Labour compliance: Form XVI/XVII, minimum-wage cards, PF/ESI inputs, BOCW cess.
- RERA: 70% ledger, quarterly progress by wing, Forms 1–3 inputs.
- IS 456 sampling/acceptance; site diary; hindrance register.
- Tally/Zoho Books sync in the base plan.

### Phase 4 — Differentiators

- WhatsApp Business bot (attendance, DPR photos, MR, approvals).
- Offline outbox hardening; native shell.
- Allottee portal: price sheet, payment plan, demand letters, UPI collection, receipts, construction photos.
- Vendor/sub-contractor portal: RA-bill submission, PO/GRN/payment/TDS status.
- Drawing-pinned, geo-tagged photo progress with AI tagging; 360/drone import later.
- Multi-level approval policies; scheduled reports.

## 3. Things we will deliberately drop

- Firebase RTDB chat → Postgres + SSE. Support chat stays, but as tickets with email.
- CCAvenue → Razorpay only.
- "Direct with Image Upload" PR (a photo instead of line items) → keep as _attachment on a draft PR_, not a separate mode; OCR later.
- Per-user petty cash _accounts_ as a separate module → petty cash becomes a cash account type with a custodian; same voucher/approval model as bank transactions.
- Three hard-coded worksheet shifts (Shift1/2/3) → shifts come from the project's shift definitions (shared with HRMS shift templates).
- Int status codes and PascalCase RPC endpoints → enums and resource routes with OpenAPI.

## 4. Open questions for the product owner

1. Is the first customer a **developer** (sells units; RERA, bookings, allottee collections matter) or a **contractor** (bills a client; BOQ/RA bills/retention matter)? Phase 3 ordering depends on this.
2. Do we keep **per-company pricing with add-ons** (projects, members, storage, HRMS seats) or move to per-company flat tiers? Research favours flat and public.
3. **Mobile strategy**: PWA only for the first year, or commit to a native shell from Phase 1 for camera/GPS reliability?
4. Which **states** first? Minimum wages, RERA forms, and professional tax are state-specific.
5. Do site labour (non-users) ever get a **self-service surface** (WhatsApp wage slip, attendance confirmation)? Affects how we store their mobile numbers and consent.
