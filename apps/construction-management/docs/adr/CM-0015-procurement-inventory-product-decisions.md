# CM-0015 — Procurement & inventory product decisions for M5

- Status: accepted
- Date: 2026-10-10
- Tickets: CM-501 … CM-510 (M5)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0004](CM-0004-ledger-first-balances.md) (ledger-first balances), [CM-0008](CM-0008-statutory-figures-are-dated-tables.md) (dated statutory tables), [CM-0013](CM-0013-projects-structure-product-decisions.md) (Contractors, Suppliers, `LocationRef`), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments)

`modules/06` ends with seventeen open questions, and its "Rebuild recommendations" ask for more than the legacy product did. The owner answered four of them before M5 started (§3, §4, §6 and the delivery shape below). Every other question is answered here with the default we recommend; the M5 handoff lists them again for the owner.

**Delivery.** M5 was to ship as one pull request (owner, 2026-10-10). At 556 files it was over CodeRabbit's 300-file review limit, so the owner chose a native GitHub stack of four pull requests, merged bottom-up: schema, kernel and shared contracts (#48); masters (#49); documents, Purchase Requests, Purchase Orders and Goods Receipts (#50); inventory, transfers, Central Store, Central Inventory and the dashboard (#51). It replaced #47.

## Decisions

### 1. A new `procurement` context; materials are masters

- Purchase Requests, Purchase Orders, Goods Receipts, the stock ledger, Material Transfers, Stores, Material Requests and Delivery Notes live in `src/procurement`, Postgres schema `construction_procurement`, API prefix `/api/construction/procurement`, Prisma prefix `ConstructionProcurement` (`03-target-architecture`).
- Materials, Material Categories, Measurement Units, Terms & Conditions and party quotations are **masters** (`construction_masters`), like Suppliers and Contractors (CM-0013 §6). Procurement holds their ids and copies the values a document must keep (name, unit, rate, GST %, HSN) onto its lines at save.
- Billing addresses belong to the Company (organization context), with a GSTIN and a state (§6).
- **Places get a GST state.** A Project gains an optional state (GST state code) on its form, a Store has one, and a Supplier's state is its GSTIN's first two digits, or a state picked on the form when it has no GSTIN. Place of supply (§6) reads them.

### 2. Approval and fulfilment are two statuses

Rebuild recommendation 9 is adopted: every document keeps an **approval status** (`pending | approved | rejected`) apart from its **fulfilment status**, so filters and the dashboard never mix them.

| Document          | Approval                         | Fulfilment (derived unless marked)                                                                                                                                           |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase Request  | pending / approved / rejected    | not ordered / partially ordered / ordered / excess ordered, from the quantities on live, non-rejected PO lines linked to its items; **Mark as Ordered** sets ordered by hand |
| Purchase Order    | pending / approved / rejected    | **Mark as Ordered** (sent to the supplier) then not received / partially received / received from GRN quantities; **Close** ends a short-supplied PO                         |
| Goods Receipt     | none (a record of fact)          | —                                                                                                                                                                            |
| Material Transfer | pending / approved / rejected    | in transit (from approval) / delivered                                                                                                                                       |
| Material Request  | none (A approves Delivery Notes) | requested / partially delivered / delivered / closed                                                                                                                         |
| Delivery Note     | pending / approved               | in transit (from approval) / delivered                                                                                                                                       |

- **Save & Approve** is offered to members with the menu's Approve flag; Approve and Reject (with a reason) work singly and in bulk, and each document keeps a remarks thread.
- A Purchase Request is editable while pending or rejected; saving a rejected one sends it back to pending. A Purchase Order is editable while pending or rejected; editing an approved, not-yet-ordered PO sends it back to pending; an ordered PO is not edited (it is Closed and re-raised).
- A rejected or deleted PO stops counting towards its PR's ordered quantity (open question 2). **Excess ordered** is a warning, not a block.
- Multi-level approval by value (recommendation 11) is not built; one approver decides.

### 3. Stock never goes below zero (owner)

Consume, Missing, transfer dispatch and Delivery Note dispatch are refused when the quantity is more than the stock at that location **on that date and on every later date** (409 `STOCK_INSUFFICIENT`, naming the material, the stock and the shortfall). Editing or deleting a GRN is refused for the same reason when the stock it brought in has already gone out. The fix is to record the missing receipt or an opening stock first.

### 4. Transfers and deliveries: out at dispatch, in on delivery (owner)

- A **Material Transfer** moves nothing while pending. **Approve** dispatches it: the source posts **Transferred out** on the transfer date. **Mark as Delivered** posts **Transferred in** at the destination on the delivery date and records who received it. Between the two the quantity shows as **In transit** on both sides. Reject moves nothing; a pending transfer can be deleted; an approved one cannot.
- A **Delivery Note** works the same way from a store: **Approve** posts **Issued** at the store, **Mark as Delivered** posts **Received from store** at the Project (open question 17). Only delivered quantities count towards the Material Request.
- Approve needs the menu's Approve flag; Mark as Delivered needs Update on the destination, the Project's or the store's (open questions 10–11).

### 5. The stock ledger is append-only

Recommendation 7 is adopted. Stock at a location is the sum of its ledger entries; nothing types a stock figure.

- Entry types: **Opening**, **Received** (GRN), **Transferred in / out**, **Issued** (store → DN), **Received from store**, **Consumed**, **Missing**, **Adjustment** (+ or −). Each entry names its source document and line.
- Editing a GRN, a consumption or a missing entry posts a **reversal** of the old entries and new ones; deleting posts only the reversal. The history shows both, so the Stock Register for any past date reproduces exactly.
- **Adjust stock** replaces legacy's "edit history": the counted quantity and a reason post the difference as an Adjustment.
- **Import Inventory Stock** (open question 13) posts **Opening** entries, only for materials with no entries at that location yet; other rows are reported back per row ("already has stock movements; use Adjust stock"). It can also set Estimated Qty.
- **Valuation** is not computed in M5. Received entries carry the GRN unit rate so M6 / M7 can value consumption at weighted average later.
- A location is a Project or a Store (`StockLocation`).

### 6. GST is split by state; ITC, RCM and TDS wait for M11 (owner)

- PO and GRN lines carry HSN, taxable value, GST %, and either **CGST + SGST** or **IGST**. The split is decided per document: **intra-state** when the supplier's GSTIN state code equals the **place of supply** state, otherwise inter-state. Place of supply is the delivery address's state when "Delivery address is other than the Project address" is ticked, else the Project's (or Store's) state. When either state is unknown the document is intra-state. The default can be overridden on the form.
- Line math, in paise, rounded half-up per line: `subTotal = qty × rate`; `discount = % ? subTotal × v / 100 : v`; `taxable = subTotal − discount`; `gst = taxable × rate / 100` split in two equal halves (CGST gets the odd paisa) or all IGST; `total = taxable + gst`. Header: `grandTotal = Σ total + additional charges − deduction`.
- GST % and HSN default from the Material and are stored on the line. The effective-dated HSN rate table (recommendation 1, CM-0008) is M11, and so are ITC eligibility, the RCM 80/20 test and TDS 194Q.
- The **GRN's value** (open question 6) is Σ GRN line totals including GST; the invoice amount is shown beside it and a difference is a warning, not a block.
- The billing address carries the Company GSTIN printed on the PO PDF (open question 16).

### 7. Purchase Requests

- Attachment ("Upload Required Materials List") is stored, not parsed (open question 1). **Required Date** is shown and becomes the default Expected Delivery Date of a PO raised from the PR; overdue alerts wait for M9.
- A PR with a PO line against it cannot be deleted. Mark as Ordered is allowed from approved or partially ordered.

### 8. Purchase Orders

- A PO is for a **Project or a Store** (open question 5); its supplier must be assigned to that Project (Resources) or Store.
- **Terms & Conditions**: several can be picked; their text is copied onto the PO at save, so editing the master never changes a PO already raised (open question 15).
- **Close** is allowed on an ordered PO; it stops it counting as pending receipt and records a reason. A PO with a GRN cannot be deleted.
- The PO list shows both statuses (open question 4).

### 9. Goods Receipts

- A GRN can be posted **without a PO**, to a Project or a Store (open questions 5 and 7). A linked PO must be approved, ordered or partially received, for the same supplier and location.
- **Over-receipt** (received > ordered) is allowed and shown as "Excess received" on the GRN and the PO (open question 7).
- Field groups (open question 8): **Supplier details** — Invoice No, Invoice Date, Invoice Amount; **Delivery details** — Delivery Challan No, GRN/DC No, Vehicle No, Driver name and mobile, E-way bill No (recommendation 3). Each of these optional fields can be hidden per Company (Settings → GRN fields); hidden fields are neither shown nor printed.
- Posting a GRN emits `GoodsReceiptPosted`. M7 will block editing a GRN a supplier payment points at through a port that answers "not paid" until then.

### 10. Minimum stock and alerts

- Minimum Stock defaults from the Material master and can be overridden per location (open question 12); the alert toggle is per location and material. At or below the minimum the item is **Low stock**, at zero **Out of stock**.
- Crossing below the minimum emits `StockBelowMinimum`. Delivering a notification to members with Current Inventory's Notification flag is M9.

### 11. Central Stores, Material Requests and Delivery Notes

- A Store has a name, an address with a state, at least one Project, store keepers (Team Members) and Suppliers. Anyone with Central Store Read sees every store.
- A Material Request targets a Store assigned to its Project. A store **refuses** what it cannot supply by **closing** the MR's remaining quantity with a reason (open question 3); an MR with a Delivery Note cannot be deleted.
- A Delivery Note's delivered quantity is at most the MR line's pending quantity and the store's stock.
- Converting an MR the store cannot meet into a Purchase Request (recommendation 10) is not built in M5.

### 12. Central Inventory

Central Inventory is the stock query without a location filter: per material, per Project and Store, with in-transit quantities (open question 14). The **Stock Ledger** report for a date range is a screen with an Excel download; it is generated on request, not as a background job, until the M9 report jobs exist.

### 13. Numbering, back-dated entry and permissions

- The six numbering modules (Purchase Request, Purchase Order, Goods Receipt, Material Transfer, Material Request, Delivery Note; default prefixes `PR`, `PO`, `GRN`, `MT`, `MR`, `DN`) and the **Procurement** and **Inventory** back-dated groups were registered in M1 (CM-113, CM-114); M5 is their first caller. Legacy's `MDN00001` is a prefix a Company can set, not our default.
- The M5 menus were registered in M1 with the legacy flags of `modules/06` → Permissions. Financial off hides rates, amounts and invoice values in responses (`null`) on PO, GRN (Material Received) and Materials.
- Terms & Conditions get their own masters menu, `masters.terms_conditions` (`modules/02` open question 13). Billing addresses and GRN field visibility are Company settings under `organization.settings`.

### 14. Not in M5

RFQ and comparative statements, multi-level approval, unit conversion per material (recommendation 15), Tally sync, the vendor portal, offline capture and WhatsApp, stock valuation, ITC / RCM / TDS on purchases, e-way bill generation, material reconciliation per contractor, and notification delivery. Each is a later milestone in `04-gaps-and-roadmap`.

## Consequences

- Six documents share approval, remarks, numbering and back-dated checks; the shared pieces live in the kernel (CM-502) so M6–M8 documents reuse them.
- The stock check in §3 reads the ledger at every later date, so posting a back-dated movement is one indexed query per material, inside the transaction that writes it, with the location's rows locked.
- Every rule above can be relaxed later (allow negative stock, add approval levels) without migrating data away.
