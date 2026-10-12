# CM-0017 — Finance product decisions for M7

- Status: accepted
- Date: 2026-10-11
- Tickets: CM-701 … CM-709 (M7)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0004](CM-0004-ledger-first-balances.md) (ledger-first balances), [CM-0008](CM-0008-statutory-figures-are-dated-tables.md) (dated statutory tables), [CM-0012](CM-0012-hrms-product-decisions.md) (salary payments), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments), [CM-0015](CM-0015-procurement-inventory-product-decisions.md) (GRN, approval), [CM-0016](CM-0016-daily-site-work-product-decisions.md) (equipment hire)

`modules/07` ends with sixteen open questions and sixteen rebuild recommendations. The owner answered four before M7 started:

- **One ledger.** Every payment names the account the money left or entered, and posts to that account's ledger in the same transaction as the party's entry (§2, §6).
- **TDS 194C is computed**, with a TDS ledger; the accountant can override with a reason. 194I, 194J, 194Q and Form 26Q / 16A wait for M11 (§8).
- **Only approved entries move balances.** An approved entry is never edited in place: a correction is a reversal plus a new entry (§4).
- **One payment can settle several invoices** of the same party, and the unallocated part is an advance that later invoices absorb (§7).

Every other question is answered here with the default we recommend; the M7 handoff lists them again for the owner.

**Delivery.** One milestone, built on one branch and opened as a native GitHub stack of pull requests of at most 300 files each, like M5 and M6.

## Decisions

### 1. A `finance` context

- Accounts, account entries, Payment Categories, Other Parties, Transactions, transfers, petty-cash vouchers, Other Expenses, invoices, party payments, allocations, settlements, party entries and the TDS rate table live in `src/finance`, Postgres schema `construction_finance`, API prefix `/api/construction/finance`, Prisma prefix `ConstructionFinance` (`03-target-architecture`).
- **Payment Categories and Other Parties live in finance**, although their menus stay `masters.payment_categories` and `masters.other_parties` and their screens sit under Masters. Only finance uses them (the same reasoning as Equipment in CM-0016 §1).
- Contractors and Suppliers stay in masters. Finance reads their name, PAN, GST state and TDS settings through a `FinanceDirectory` port implemented in `src/composition`.
- Money is paise in `BIGINT` (contractor bills pass ₹2.14 crore); sums are `SUM(amount)::bigint` (CM-0004).

### 2. Accounts: company cash and bank, and petty cash (open question 9)

- One `accounts` table with three kinds: **Cash**, **Bank** and **Petty Cash**.
- **Company accounts** (Cash, Bank) are Masters → **Company's Bank A/C** (`masters.bank_accounts`). Bank accounts take bank name, account number, IFSC (checked for shape: four letters, `0`, six letters or digits) and branch. Names are unique among live accounts, ignoring case.
- **Every Company is seeded** with "Company's Cash Account" (Cash, primary) and "Company's Bank Account" (Bank), both with a zero opening balance; existing Companies are backfilled by migration.
- **Exactly one company account is primary.** Set As Primary moves the flag in one transaction. The primary account is the default "paid from" everywhere.
- **Petty Cash accounts** belong to one Team Member each (at most one live account per member). A member with Petty Cash Create opens one for a Team Member; the holder's own account can be opened by anyone with Petty Cash Create for themselves.
- **The opening balance is an entry** (`kind = opening`, dated the account's opening date), never a column (CM-0004). Changing it posts a reversal and a new entry.
- **An account with entries cannot be deleted** (409 `ACCOUNT_IN_USE`); the primary account cannot be deleted at all.
- **Balances may go negative.** A site engineer often spends their own money first. The screen shows a negative balance in red; nothing is refused.

### 3. Account entries: one ledger for every rupee that moves

- `account_entries` holds every movement of money into or out of an account: positive is money in, negative is money out.
- Writers: approved Transactions and transfers (§5), approved petty-cash vouchers (§9), approved Other Expenses (§10), party payments and receipts (§6), labour and vendor wage payments and Paid salary slips (§12).
- Each entry copies what the Ledger Report filters on: Project or Store, Payment Category, mode, reference, the party (kind, id and name) and the module that wrote it. The report then reads one table.
- Entries are append-only with `reverses_entry_id` unique, as in CM-0004. The writer lives in `src/finance/infrastructure/account-ledger.ts`; other contexts post through the `AccountPosting` port (composition), inside their own transaction.

### 4. Approval, and fixing mistakes (owner; open questions 6, 7)

- **Transactions, transfers, petty-cash vouchers, Other Expenses and invoice settlements** go through approval: `pending` → `approved` or `rejected` (with a reason), singly or in bulk (all or none, CM-0015 §2). **Save & Approve** is offered to members with Approve on the menu.
- **Only approved entries move balances.** Approval posts the account entries; a pending or rejected document has none. Lists show pending documents with a "Pending" chip and the screens show the pending total beside the balance.
- **A rejected document can be edited and resubmitted;** saving it returns it to pending.
- **Approval is never revoked.** Editing an approved document posts the reversal of its entries and returns it to pending; approving it again posts the new entries. Deleting an approved document posts the reversal.
- **Party payments, wage payments and salary payments have no approval** (none in legacy; M2 recorded wage payments the same way). They post when recorded. They are not edited: **Cancel** posts the reversal, and the accountant records the payment again.
- Multi-level approval and amount thresholds (recommendation 12) are not built.

### 5. Transactions and transfers (open questions 1, 2, 3)

- A **Transaction** is money in or out of a company account that is not a party payment: bank charges, interest, owner's capital, a customer's token amount. Fields: date, Payment In / Payment Out, account, Payment Category, mode (Cash, Cheque, Online, UPI), cheque number or reference, Project or Store (optional), Paid To / Received From, amount, description, files.
- **Mode follows the account.** Cash takes a Cash account (or petty cash); Cheque, Online and UPI take a Bank account. Cheque needs a cheque number; Online and UPI need a reference.
- **Paid To / Received From is a label**, not a balance: a party (Contractor, Supplier, Labour, Vendor, Other Party or Team Member, picked) or a typed name. Legacy's numeric "paid-to types" and the Payment Module tag become this party kind. **A Transaction never moves a party's balance**; paying a party against its dues is a party payment (§6). This keeps party balances and the bank ledger from counting the same money twice.
- **Transfer** moves money between two accounts (company to company, company to petty cash to fund a holder, or petty cash back to the company). It needs approval and posts two entries on approval.
- **Import.** Transactions import from the downloadable xlsx sample, all or nothing with per-row errors (as Import Inventory Stock, CM-0015). Imported rows start pending.
- **Duplicate references.** A cheque number or reference already used on a live entry of the same account is refused with 409 `DUPLICATE_REFERENCE`; the form offers **Save anyway** (recommendation 14).
- Transactions are numbered `TXN/26-27/00001`.

### 6. Party payments: money to and from Contractors, Suppliers and Other Parties (owner; open questions 2, 12, 13)

- A **party payment** names the party, the Project (or Store for a store supplier), the date, the **account it was paid from or received into** (required: a company account or a petty-cash account the payer may use), the mode with its cheque number or reference and mode date, the amount, the Payment Category (optional), **Paid By** (a Team Member, defaulting to the signed-in member), remarks and files.
- It posts, in one transaction, the party entries (§7) and one account entry.
- Direction is **Payment Out** for Contractors, Suppliers and Other Parties, and **Payment In** for Other Parties (a sales invoice being paid, §11).
- Party payments are numbered `PAY/26-27/00001`, and each prints a receipt (PDF).
- **Cancel** reverses the party and account entries and frees the payment's allocations. A payment dated in a closed period cannot be cancelled.

### 7. Party balances, invoices and allocation (owner; open questions 4, 5, 11)

- **Party entries** (`party_entries`) hold each Contractor's, Supplier's and Other Party's balance **per Project** (per Store for store suppliers). **Positive means the Company owes the party.** Kinds: opening, invoice (a bill from the party, +), sales invoice (a bill to the party, −), payment (−), receipt (+), TDS (−), write-off.
- **The opening balance is per party per Project**, entered on the Project's party screen with an as-of date. Positive is owed to the party; negative is an advance already with them. Labour and Vendor balances stay in the labour ledger (M2, party-wide).
- **An invoice** has the party, Project or Store, invoice number (typed for bills from a party, unique per party among live invoices ignoring case), invoice date, due date, amount, and optionally its taxable value and GST amount (for the TDS base and reports; ITC and RCM are M11). Contractor invoices may name one of the Contractor's Departments. Editing an invoice's amount posts a reversal and a new entry; it is refused below what is already allocated (409 `INVOICE_BELOW_ALLOCATED`).
- **Allocation.** A payment out is allocated across one or more open invoices of the same party on the same Project, oldest due date first as the suggestion. Its **settled amount** is what it paid plus its TDS. What is not allocated is an **advance** on that party and Project; **Apply advance** later allocates it to new invoices without moving money.
- **Invoice status is derived:** Open, Partly paid, Paid (balance zero) or Settled (§11), plus Overdue when the due date is past and a balance remains.
- **Settle Invoice** (open question 11) writes off what is left of an invoice: it raises a settlement with a reason that needs Approve on Parties; approval posts a write-off entry and marks the invoice Settled. Rejecting it leaves the invoice open.

### 8. TDS under section 194C (owner; open question 4)

- **Contractors gain TDS settings** in masters: TDS applies (default on), a lower-deduction certificate rate (section 197, optional) and a note. The payee kind comes from the PAN's fourth letter: **P** (individual) and **H** (HUF) are 1%, every other kind 2%. **No PAN means 20%** (section 206AA).
- **Rates and thresholds are a dated table** (`statutory_tds_rates`, CM-0008): section, payee kind, rate, single-payment threshold (₹30,000) and financial-year aggregate threshold (₹1,00,000), effective from. Seeds are versioned JSON. The Income-tax Act, 2025 renumbers 194C as section 393 from 1 April 2026; the row carries the label to print, and the key stays `194C`.
- **When it is suggested.** On a payment to a Contractor, TDS is suggested at the Contractor's rate on the settled amount when the payment is above the single threshold, or when the Contractor's settled amount in the financial year (across Projects) passes the aggregate threshold. On the payment that first crosses the aggregate threshold, the suggestion also catches up the earlier undeducted amounts of that year.
- **Base.** The base defaults to the settled amount. When the allocated invoices carry a GST amount, the GST share is left out of the base (CBDT circular 23/2017). The accountant may change the base, the rate or the amount, and **an override needs a reason**, kept on the payment.
- **TDS reduces the invoice like money paid.** The Contractor's invoice is settled by paid + TDS. The account moves only by what was paid.
- **The TDS ledger** is a report per Contractor per financial year: payment, date, base, rate, TDS, overridden or not, and the totals by quarter for filing. Deposit challans, Form 26Q, Form 16A, 194I on equipment hire, 194J and 194Q are M11.

### 9. Petty Cash (open questions 1, 6)

- Each petty-cash account has **Payment** (cash out), **Receipt** (cash in) and **Transfer** (to another petty-cash account or a company account) vouchers.
- A voucher has a date, Project (optional), Paid To / Received From (a party label as in §5, or a typed name), amount, Payment Category\* (Payment and Receipt), Paid For, reference, description and photos.
- Vouchers are numbered `PC/26-27/00001` and go through approval (§4); the account's balance counts approved vouchers only, and the pending total shows beside it.
- **View all** on Petty Cash shows every account; without it a member sees only their own account and vouchers.
- **Export Receipts** downloads a ZIP of the voucher photos for an account and a date range, named by voucher number. It runs in the request, up to 500 files; M9 moves it onto the job queue with a notification.

### 10. Other Expenses (open question 10)

- An **Other Expense** is a Project's spend that has no party bill: a date, Payment Category\*, payee (a typed name), amount, the account it was paid from, mode and reference, description and files. It is numbered `EXP/26-27/00001` and goes through approval.
- It differs from a Payment Out Transaction by being **Project spend**: it is required to name a Project, it appears in the Project's Module Wise Payment chart and the Other Expense report, and it has its own menu.
- **A new menu, `finance.other_expenses` "Other Expenses"** (CRUDAJPO, project-scoped), joins the Payment & Accounting category; legacy put its approval under no menu.

### 11. Other Parties: purchase and sales invoices and settlement

- **Other Party** master: name\*, mobile, email, GSTIN, PAN, GST state, address and the Projects it works on.
- **Purchase invoices** (from the party) are typed; **sales invoices** (to the party) are numbered by the Other Party Sales Invoice rule (`INV/26-27/00001`).
- **Payment Out** settles purchase invoices and **Payment In** settles sales invoices, with allocation as in §7.
- **Party Balance** in the Workspace lists each Other Party's balance across Projects (positive: the Company owes them; negative: they owe the Company).

### 12. Labour, Vendor and salary payments post to accounts (CM-707; open question 15)

- **Wage payments** (M2) gain the **account they were paid from**, required from M7 on. The labour ledger keeps the party entry; finance gets the account entry through `AccountPosting` in the same transaction, and Cancel reverses both. The pay dialog picks Cash → a Cash or petty-cash account, Bank → a Bank account.
- **Wage payments recorded before M7 have no account** and are not backfilled; the Ledger Report shows them nowhere, and the M7 handoff says so.
- **Paid salary slips** (M3) name the account they were paid from, and Mark Paid posts one account entry per slip (CM-0012 §16).
- **A labour advance is recovered in full** from the next amounts owed, as the M2 balance already nets it (open question 15). Instalment recovery is not built.
- Back-dated limits for wage payments use new modules `labour_payment` and `vendor_payment` in the Labour & Vendor group (they were reported but not in the catalogue).

### 13. Supplier invoices come from Goods Receipts (recommendation 6)

- **A GRN posted with an invoice number creates its supplier invoice** (one GRN, one invoice): number, date and amount from the GRN (its invoice amount, or its total value when none was typed), the GRN's Project or Store, and a due date of invoice date + the PO's payment-terms days (none without a PO).
- Finance listens to `GoodsReceiptPosted`. An edited GRN updates its invoice while nothing is allocated to it; a deleted GRN deletes it. The listener is idempotent by GRN id.
- **GRNs without an invoice number** are listed as "awaiting invoice"; the accountant creates one supplier invoice for one or more of them, and its amount defaults to their total value.
- **A GRN is paid** once any payment is allocated to its invoice. The `GoodsReceiptPayments` port now answers from finance, so a paid GRN can no longer be edited or deleted (CM-0015).
- When the invoice amount differs from the GRN's total value by more than ₹1, the invoice shows a **variance** flag. A PO rate check (three-way match) is not built.

### 14. Permissions (open question 8)

- **Finance menus carry no Financial flag; Read on a finance menu is the right to see its money.** Financial keeps its meaning on the menus that show money beside other data (Labour, Vendor, Project, Equipment, Material Received).
- **Who uses which menu:**
  - Transactions and transfers: `finance.transactions`.
  - Contractor, Supplier and Other Party invoices, payments, opening balances and settlements: `finance.parties` (Approve and Reject decide settlements).
  - Petty Cash: `finance.petty_cash`; Other Expenses: `finance.other_expenses`.
  - The Project's Payments module shows each tab by its own menu; `finance.payments` Read shows the Payments section of the Project Dashboard.
  - `finance.central_payment` Read opens Central Payment in the Workspace (every Project's party dues for the Owner; otherwise the Projects the member is on).
- Store-located supplier invoices and payments are Owner-only in M7, because a Store has no Project to scope the menu.
- The Accountant template gains Other Expenses; Site Engineer and Site Supervisor gain Petty Cash and Other Expenses create and read (their own account). Existing Companies' designations are not changed.

### 15. Dates, numbering and closing (open question 16)

- New numbering modules: Transaction (`TXN`), Party Payment (`PAY`) and Other Expense (`EXP`), beside Petty Cash (`PC`) and Other Party Sales Invoice (`INV`). Purchase, contractor and supplier invoice numbers are typed.
- New back-dated modules in the Accounts group: `party_payment`, `party_invoice` and `other_expense` (with `petty_cash` and `transaction`), plus `labour_payment` and `vendor_payment` (§12).
- **The Financial Closing Date is company-wide** (CM-113) and also blocks approving, rejecting, cancelling and deleting anything dated on or before it, because each of those posts or reverses entries.

### 16. Reports and dashboards

- **Reports** (xlsx + PDF, the CM-217 report jobs): Ledger (an account and a period: opening, every entry with its running balance, credit, debit, closing), Petty Cash, Transactions, Contractor Payments, Supplier Payments, Other Expenses, TDS 194C (a financial year) and Due Payments (by party with ageing 0–30, 31–60, 61–90, 90+ days).
- **Central Payment** (Workspace): party dues across Projects for Contractors, Suppliers and Other Parties; every account's balance; the petty-cash accounts with their holders and pending totals.
- **Project Dashboard Payments section:** Payment In / Out and balance by month, Due Payments (party, invoiced, paid, due), Module Wise Payment (Contractor, Supplier, Labour, Vendor, Other Party, Other Expenses), and the **Payment Approvals** KPI (pending Transactions, transfers, vouchers, Other Expenses and settlements on the Project).

### 17. Not in M7

- RA bills, work orders, retention and mobilisation advances (recommendation 5) and GST on invoices beyond the recorded amount — ITC, RCM, e-invoice (recommendation 4) — are M11.
- 194I on equipment hire: `EquipmentHireAccrued` stays without a listener; hire is billed by the hire party's invoice. 194J, 194Q, challans and Form 26Q / 16A are M11.
- UPI collection links, the RERA designated account, Tally / Zoho sync, bank-statement import, the vendor portal and minimum-wage warnings (recommendations 8, 9, 10, 14, 15, 16) are M11 and M12.
- Equipment maintenance cost does not post to expenses.

## Consequences

- Party balances, account ledgers, the dashboard and Central Payment read two append-only tables (`party_entries`, `account_entries`) plus the labour ledger, so they cannot disagree.
- Labour and HRMS write to finance only through the `AccountPosting` port, in their own transaction; finance never imports them.
- Approval now posts money, so approve, reject, cancel and delete all run the back-dated and closing-date checks.

## Considered options

- **Party payments without an account** (legacy): the bank ledger would never reconcile with party balances. Rejected by the owner.
- **Transactions that also move party balances** (legacy's Payment Module tag): the same rupee could be counted twice, once as a Transaction and once as a party payment. Rejected; a Transaction is a label-only movement.
- **A typed TDS amount** (legacy): no thresholds, no ledger, no audit. Rejected by the owner.
- **Pending entries counted in balances:** quick for site staff, but a rejection would rewrite a balance someone already relied on. Rejected by the owner.
