# 07 — Payments & Accounting

Payments & Accounting is where BuildControl records money: the company's own cash and bank accounts, per-user petty cash, general money-in/money-out transactions, and the money owed to and paid to every counter-party (contractors, suppliers, labour, labour-supply vendors, and "other parties"). It also holds the project-level "Payments" tile, the cross-project "Central payment" workspace, and the payment widgets on the project dashboard.

It is not a general ledger. Legacy BuildControl keeps party-wise invoice and payment registers and a cash/bank ledger report; there is no chart of accounts, journal, or GST/TDS ledger beyond a TDS amount field on contractor payments (see Rebuild recommendations).

Who uses it:

- **Company owner / admin** — sets up company bank and cash accounts, sees Central payment and payment dashboards across projects, approves vouchers and transactions.
- **Accountant** (seeded designation with a default permission template) — enters transactions, party invoices and payments, approves or rejects, runs ledger and payment reports.
- **Site engineer / site supervisor / store keeper** — holds a petty-cash account, raises Payment/Receipt vouchers with receipt photos, records labour payments and advances at site.
- **Project manager** — reviews due payments and module-wise spend on the project dashboard.

---

## Legacy behaviour

### Navigation

- **Master tab → Company's Bank A/C** (`#/addBankAccount`, menu #61) — company cash and bank accounts.
- **Master tab → Payment Categories** (`#/addPaymentCategory`, menu #71) — the category list used by petty cash, transactions, and party payments (API `PettyCashCategory/*`).
- **Master tab → Other Party** (`#/addOtherParty`, menu #64) — misc counter-party for purchase/sales invoices.
- **Project home → Payments tile** (menu #47 "Payments", read-only container). The project-level menu lists two children: **Petty Cash** and **Transactions**. Party payment registers (Contractor, Supplier, Labour, Vendor, Other Expenses, Other Party) are reached from the same Payments tile (notes: "Party payments (Payments tile)").
- **Workspace tab → Central payment** (menu #75, read-only) — cross-project payment views (Contractor Centralized Payment Report, Centralized Supplier Payment Report, and the petty-cash user list `officeModulePettyCashUserList` are the evidenced views; exact layout not captured).
- **Workspace → Parties** (`#/officePartiesScreen`, menu #76 "Parties") — other-party balances, purchase/sales invoices, settlements.
- **Project home → Dashboard** (`#/chartsDashboard`) — "Payments" section and the "Payment Approvals" KPI tile.
- **Project home → Reports** — Contractor payment, Supplier payment, Petty Cash, Other Expense, Transaction reports.

### Company bank / cash accounts (`#/addBankAccount`)

- Every new organisation is seeded with two accounts: **"Company's Cash Account"** (account type 1 = Cash) and **"Company's Bank Account"** (account type 2 = Bank). Each carries `isPrimary` and `openingBalance`.
- Add form: **Account Type\*** — `Cash Account` | `Bank Account`; choosing Bank reveals bank fields (field names not captured).
- List actions: **Set As Primary** (`BankAccount/SetAsPrimary`), edit, delete; **print** and **report** flags exist on the menu (#61 `crudpr`).
- These accounts appear as the "paid from / received into" account in Transactions and as the "Company" mode in petty-cash vouchers.

### Petty Cash (`#/pettyCashAccounts`, `#/pettyCashVoucherAddRoute`)

- **Accounts screen** — one petty-cash account per user (team member), each shown with its running balance (`officeModulePettyCashUserList`).
- **Voucher list** per account: Date, Voucher Number, Category, Account Name, Paid To / Received From, Paid For, Amount, Description, receipt image, Status.
- **Voucher types** (add form `#/pettyCashVoucherAddRoute`):
  - **Payment Voucher** — Cash Out; party label "Paid To".
  - **Receipt Voucher** — Cash In; party label "Received From".
  - **Petty Cash Transfer** — "Transfer To" another petty-cash account or a company account.
- **Form sections**: Voucher Date\*, Project, Party (Select Party Name; **Add New Party** → contractor / supplier / team member / vendor / other party), Amount Detail (Enter Amount; Payment / Receipt / Transfer Mode: `Cash` | `Bank` | `Company`; Reference Number; **Add New Account**), Payment Category\*, Description, Voucher Photo / Document attachment.
- **Buttons**: `Save` | `Save & Approve`.
- **Statuses**: Pending for approval | Approved | Rejected. Single approve/reject (`PettyCash/SetApprovalStatus`), bulk (`PettyCash/BulkSetApprovalStatus`), remarks (`PettyCash/Remark`).
- **Export Receipts** — builds a ZIP of voucher receipts asynchronously and delivers it through a notification; v2 endpoint `v2/petty-cash/vouchers/export`.
- **Internal Petty Cash Transfer** — move balance between petty-cash accounts.
- **Petty Cash Report** — voucher-wise: Date, Voucher No, Category, Account, Paid To / Received From, Credit, Debit, Status, Description, View Voucher, Total; Closing Balance shown.

### Transactions (`#/transactionsList`)

- **Entry fields**: Date, Transaction Type (`Payment In` | `Payment Out`), Bank/Cash Account, Category, Payment Mode (`Cash` | `Cheque` | `Online` | `UPI`, with Cheque No or Reference Number), Payment Module (Contractor / Supplier / Labour / Vendor / Other Party / Transaction), Paid To / Received From (party), Project / Store, Amount, Description, attachment.
- **Approval**: Pending / Approved / Rejected; single (`Transaction/SetApprovalStatus`), bulk (`Transaction/BulkSetApprovalStatus`), Reject Reason, remarks (`Transaction/Remark`).
- **Transaction Transfer** — move money between two company accounts (e.g. bank → cash).
- **Import / Sample Export** — Excel import with a downloadable sample (`Transaction/Import`, `Transaction/SampleExport`).
- **Ledger Report** — Opening Balance, Total Credit, Total Debit, Closing Balance; filters Paid To, Bank Account, Category, Type, Mode, Module, Status.
- **Transaction Report** (project report set).

### Contractor payments

- **Invoice list** columns: Created Date, Invoice Date, Contractor, Department, Invoice Number, Invoice Amount, TDS Amount, Paid Amount, Balance, Remarks.
- **Opening Balance** per contractor.
- **Add Payment** (`ContractorPayment/AddPayment`), list (`ContractorPayment/GetAll`), **View Payments**, **View Receipts** (`Invoice/Receipt` — inferred to back receipt view).
- **Contractor quotations** — uploaded on the contractor master; listed via `Contractor/GetAllContractorQuotation(s)` and the "View Quotations" master tile (#29).
- **Contractor Centralized Payment Report** (cross-project).

### Supplier payments

- Columns: Supplier Name, Invoice Date, Invoice Number, Invoice Amount, Paid Amount, Balance, Due Date, GR/DC No, Store/Project.
- Invoice is linked to goods receipts: **Select GRN/DC No** → shows **Total GRN Value** (GRN carries Invoice No, Invoice Date, Invoice Amount — module 06).
- **Add Payment** (`SupplierPayment/AddPayment`), receipts.
- **Centralized Supplier Payment Report**.
- Supplier quotations via `Quotation/GetAllSupplierQuotation(s)`.

### Labour payments

- Per labour: **To Pay**, **Advance**, **Previous Balance**, **Final Amount**.
- Period selector: `Monthly` | `Weekly` | `Custom`.
- Payment form shows "today's wage amount" and an **Advance** field.
- **Mark Paid Leave** (also on attendance — module 08).
- **All Labour Payment Report**; project-wise labour attendance feeds the amount.

### Vendor payments

- Per vendor: Full Day, Half Day, OT Hours, Total Pay, Opening Balance, Advance Paid, Closing Balance (derived from vendor attendance — module 08).

### Other Expenses

- Miscellaneous project expenses with approval (`OtherExpenses/SetApprovalStatus`, `OtherExpenses/BulkSetApprovalStatus`, `OtherExpenses/Remark`). Fields not captured. Appears as a slice in the Module Wise Payment pie and as "Other Expense" in the project report set.

### Other Party / Parties (`#/officePartiesScreen`)

- **Party Balance** list.
- **Add Purchase Invoice** (invoice from the party) | **Add Sales Invoice** (invoice to the party). Fields: Party Name\*, Project\*, Invoice Date\*, Due Date, Invoice Number\*, Invoice Amount\*, Remarks.
- **Payment In / Payment Out** entries against the party (`Party/AddPayment`).
- **Invoice Settled** flow with approval: `Party/InvoiceSettled`, `/SetApprovalStatus`, `/BulkSetApprovalStatus`, `/Reject`, `/Remark`.
- **Sales invoice numbering** — sequence `OtherPartySalesInvoice` (module 12).
- `OtherParty/Invoice` endpoint (list/print of invoices — inferred).

### Common party payment form (Contractor / Supplier / Labour / Vendor)

- **Invoice Details** — invoice no / date / amount; **Settle Invoice**.
- **Payment Detail** — Payment Date\*, Payment Mode (`Cash` | `Bank` → Reference Number / Cheque No, Payment Mode Date), Paid Amount\*, TDS Amount (contractor only), Payment Category, Paid By (name), Remarks, Upload Documents.

### Project dashboard — Payments section (`#/chartsDashboard`)

- **Payment Approvals** KPI tile (count pending).
- **Payment In & Out & Balance** with trend chart.
- **Due Payments** table — party, total invoice, paid, due; export.
- **Module Wise Payment** pie — Contractor / Vendor / Supplier / Labour / Other Expenses.
- Duration filter (default last 1 year). Section toggled/reordered via "Manage Dashboard".

---

## Entities & fields

### CompanyAccount (Company's Bank A/C)

| Field                 | Type                 | Required | Notes                                                                    |
| --------------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| id                    | uuid                 | yes      |                                                                          |
| companyId             | FK → Company         | yes      | Tenant scope                                                             |
| name                  | string               | yes      | Seed: "Company's Cash Account", "Company's Bank Account"                 |
| accountType           | enum{CASH=1, BANK=2} | yes      | "Account Type\*"                                                         |
| bankName              | string               | no       | Bank fields shown when type = Bank; exact fields not captured (inferred) |
| accountNumber         | string               | no       | (inferred)                                                               |
| ifsc                  | string               | no       | (inferred)                                                               |
| branch                | string               | no       | (inferred)                                                               |
| isPrimary             | bool                 | yes      | Exactly one primary (inferred: per company); `SetAsPrimary`              |
| openingBalance        | decimal(14,2)        | yes      | Default 0                                                                |
| createdAt / updatedAt | datetime             | yes      |                                                                          |

### PaymentCategory

| Field      | Type         | Required | Notes                                                                                                                                                                                      |
| ---------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id         | uuid         | yes      |                                                                                                                                                                                            |
| companyId  | FK → Company | no       | Null for seeded global rows (inferred, as with Designations)                                                                                                                               |
| name       | string       | yes      | Seed: Bonus, Canteen, Computer and software, Conveyance, Entertainment, Fuel, Hardware, Housekeeping, Internet, Labour, Labour Payment, Maintenance, Marketing and Advertising, Medical, … |
| isDisabled | bool         | yes      | `PettyCashCategory/Disable`                                                                                                                                                                |

### PettyCashAccount

| Field          | Type            | Required | Notes                                                                                                                                         |
| -------------- | --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | uuid            | yes      |                                                                                                                                               |
| companyId      | FK → Company    | yes      |                                                                                                                                               |
| employeeId     | FK → TeamMember | yes      | One per user                                                                                                                                  |
| openingBalance | decimal(14,2)   | no       | (inferred)                                                                                                                                    |
| balance        | decimal(14,2)   | derived  | Opening + approved receipts + transfers in − approved payments − transfers out (inferred: whether pending vouchers count is an open question) |

### PettyCashVoucher

| Field                   | Type                                                                                        | Required       | Notes                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------- |
| id                      | uuid                                                                                        | yes            |                                                          |
| voucherNumber           | string                                                                                      | yes            | From `PettyCash` sequence (module 12)                    |
| voucherType             | enum{PAYMENT, RECEIPT, TRANSFER}                                                            | yes            | Payment = Cash Out, Receipt = Cash In                    |
| direction               | enum{CASH_IN, CASH_OUT}                                                                     | derived        | From type                                                |
| voucherDate             | date                                                                                        | yes            | "Voucher Date\*"; subject to back-dated entry control    |
| pettyCashAccountId      | FK → PettyCashAccount                                                                       | yes            | "Account Name"                                           |
| projectId               | FK → Project                                                                                | no             | "Project"                                                |
| partyType               | enum{OTHER_PARTY=1, CONTRACTOR=2, SUPPLIER=3, LABOUR=5, VENDOR=6, TEAM_MEMBER(inferred), …} | no             | Petty cash supports paid-to types 1..7                   |
| partyId                 | FK → party of partyType                                                                     | no             | "Paid To" / "Received From"                              |
| transferToAccountId     | FK → PettyCashAccount or CompanyAccount                                                     | when TRANSFER  | "Transfer To"                                            |
| amount                  | decimal(14,2)                                                                               | yes            | > 0                                                      |
| mode                    | enum{CASH, BANK, COMPANY}                                                                   | yes (inferred) | Payment / Receipt / Transfer Mode                        |
| referenceNumber         | string                                                                                      | no             | For Bank mode                                            |
| companyAccountId        | FK → CompanyAccount                                                                         | no             | When mode = Company / Bank (inferred); "Add New Account" |
| paymentCategoryId       | FK → PaymentCategory                                                                        | yes            | "Payment Category\*"                                     |
| paidFor                 | string                                                                                      | no             | Shown in list                                            |
| description             | text                                                                                        | no             |                                                          |
| attachments             | file[]                                                                                      | no             | Voucher photo / document                                 |
| status                  | enum{PENDING, APPROVED, REJECTED}                                                           | yes            |                                                          |
| approvedBy / approvedAt | FK → TeamMember / datetime                                                                  | no             | (inferred)                                               |
| rejectReason            | text                                                                                        | no             | (inferred from remarks)                                  |
| remarks                 | Remark[]                                                                                    | no             | `PettyCash/Remark`                                       |
| createdBy / createdAt   | FK / datetime                                                                               | yes            |                                                          |

### Transaction

| Field             | Type                                                                 | Required       | Notes                                              |
| ----------------- | -------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| id                | uuid                                                                 | yes            |                                                    |
| date              | date                                                                 | yes            | Back-dated entry control applies                   |
| transactionType   | enum{PAYMENT_IN, PAYMENT_OUT}                                        | yes            |                                                    |
| companyAccountId  | FK → CompanyAccount                                                  | yes            | "Bank/Cash Account"                                |
| paymentCategoryId | FK → PaymentCategory                                                 | no             |                                                    |
| paymentMode       | enum{CASH, CHEQUE, ONLINE, UPI}                                      | yes            | Cash → account type 1; others → bank (type 2)      |
| chequeNumber      | string                                                               | if CHEQUE      | "Cheque No"                                        |
| referenceNumber   | string                                                               | if ONLINE/UPI  | "Reference Number"                                 |
| paymentModule     | enum{CONTRACTOR, SUPPLIER, LABOUR, VENDOR, OTHER_PARTY, TRANSACTION} | yes (inferred) | Module/Combo                                       |
| paidToType        | enum (paid-to types 1,4,8 for "Transaction" module)                  | no             | Meaning of 4 and 8 not captured                    |
| partyId           | FK → party                                                           | no             | "Paid To / Received From"                          |
| projectId         | FK → Project                                                         | no             | "Project / Store"                                  |
| storeId           | FK → Store                                                           | no             | Alternative to project                             |
| amount            | decimal(14,2)                                                        | yes            |                                                    |
| description       | text                                                                 | no             |                                                    |
| attachments       | file[]                                                               | no             |                                                    |
| status            | enum{PENDING, APPROVED, REJECTED}                                    | yes            |                                                    |
| rejectReason      | text                                                                 | no             |                                                    |
| remarks           | Remark[]                                                             | no             |                                                    |
| transferId        | FK → AccountTransfer                                                 | no             | Set when part of a Transaction Transfer (inferred) |

### AccountTransfer (Transaction Transfer / Internal Petty Cash Transfer)

| Field           | Type                                      | Required       | Notes                                           |
| --------------- | ----------------------------------------- | -------------- | ----------------------------------------------- |
| id              | uuid                                      | yes            |                                                 |
| date            | date                                      | yes            |                                                 |
| fromAccount     | FK → CompanyAccount or PettyCashAccount   | yes            |                                                 |
| toAccount       | FK → CompanyAccount or PettyCashAccount   | yes            | ≠ fromAccount                                   |
| amount          | decimal(14,2)                             | yes            |                                                 |
| mode            | enum{CASH, BANK, COMPANY} or payment mode | no             |                                                 |
| referenceNumber | string                                    | no             |                                                 |
| description     | text                                      | no             |                                                 |
| status          | enum{PENDING, APPROVED, REJECTED}         | yes (inferred) | Petty cash transfers are vouchers with approval |

### PartyOpeningBalance

| Field     | Type                                                    | Required | Notes                                                                                             |
| --------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| partyType | enum{CONTRACTOR, SUPPLIER, LABOUR, VENDOR, OTHER_PARTY} | yes      | Contractor and vendor "Opening Balance" evidenced; labour opening balance is on the labour master |
| partyId   | FK                                                      | yes      |                                                                                                   |
| projectId | FK → Project                                            | no       | Per project or company-wide is not settled                                                        |
| amount    | decimal(14,2)                                           | yes      | Sign convention not captured                                                                      |

### ContractorInvoice

| Field         | Type            | Required       | Notes                                             |
| ------------- | --------------- | -------------- | ------------------------------------------------- |
| id            | uuid            | yes            |                                                   |
| projectId     | FK → Project    | yes            |                                                   |
| contractorId  | FK → Contractor | yes            |                                                   |
| departmentId  | FK → Department | no             | Contractor's trade                                |
| invoiceNumber | string          | yes (inferred) | Supplied by contractor, not a system sequence     |
| invoiceDate   | date            | yes (inferred) |                                                   |
| invoiceAmount | decimal(14,2)   | yes            |                                                   |
| tdsAmount     | decimal(14,2)   | no             | Entered manually; no section/rate                 |
| paidAmount    | decimal(14,2)   | derived        | Sum of payments                                   |
| balance       | decimal(14,2)   | derived        | invoiceAmount − tdsAmount (inferred) − paidAmount |
| remarks       | text            | no             |                                                   |
| createdAt     | datetime        | yes            | "Created Date" column                             |
| isSettled     | bool            | no             | "Settle Invoice"                                  |

### ContractorQuotation

| Field        | Type            | Required | Notes                         |
| ------------ | --------------- | -------- | ----------------------------- |
| contractorId | FK → Contractor | yes      |                               |
| files        | file[]          | yes      | Uploaded on contractor master |
| projectId    | FK → Project    | no       | (inferred)                    |

### SupplierInvoice

| Field               | Type                 | Required | Notes                     |
| ------------------- | -------------------- | -------- | ------------------------- |
| id                  | uuid                 | yes      |                           |
| supplierId          | FK → Supplier        | yes      |                           |
| projectId / storeId | FK → Project / Store | yes      | "Store/Project"           |
| invoiceNumber       | string               | yes      |                           |
| invoiceDate         | date                 | yes      |                           |
| invoiceAmount       | decimal(14,2)        | yes      |                           |
| dueDate             | date                 | no       | Feeds Due Payments        |
| goodsReceiptIds     | FK → GoodsReceipt[]  | no       | "Select GRN/DC No"        |
| totalGrnValue       | decimal(14,2)        | derived  | Sum of linked GRN amounts |
| paidAmount          | decimal(14,2)        | derived  |                           |
| balance             | decimal(14,2)        | derived  |                           |

### PartyPayment (contractor / supplier / labour / vendor)

| Field             | Type                                       | Required       | Notes                                                                       |
| ----------------- | ------------------------------------------ | -------------- | --------------------------------------------------------------------------- |
| id                | uuid                                       | yes            |                                                                             |
| partyType         | enum{CONTRACTOR, SUPPLIER, LABOUR, VENDOR} | yes            |                                                                             |
| partyId           | FK                                         | yes            |                                                                             |
| projectId         | FK → Project                               | yes (inferred) |                                                                             |
| invoiceId         | FK → ContractorInvoice / SupplierInvoice   | no             | Contractor/supplier                                                         |
| paymentDate       | date                                       | yes            | "Payment Date\*"                                                            |
| paymentMode       | enum{CASH, BANK}                           | yes (inferred) | Bank sub-modes Cheque/Online/UPI per lookups                                |
| referenceNumber   | string                                     | no             |                                                                             |
| chequeNumber      | string                                     | no             |                                                                             |
| paymentModeDate   | date                                       | no             | e.g. cheque date                                                            |
| paidAmount        | decimal(14,2)                              | yes            | "Paid Amount\*"                                                             |
| tdsAmount         | decimal(14,2)                              | no             | Contractor only                                                             |
| paymentCategoryId | FK → PaymentCategory                       | no             |                                                                             |
| paidBy            | string                                     | no             | Free-text name                                                              |
| isAdvance         | bool                                       | no             | Labour "Advance"                                                            |
| remarks           | text                                       | no             |                                                                             |
| documents         | file[]                                     | no             |                                                                             |
| companyAccountId  | FK → CompanyAccount                        | no             | Whether party payments post to a company account is not captured (inferred) |

### LabourPaymentPeriod (computed view)

| Field             | Type                          | Required | Notes                                                |
| ----------------- | ----------------------------- | -------- | ---------------------------------------------------- |
| labourId          | FK → Labour                   | yes      |                                                      |
| projectId         | FK → Project                  | yes      |                                                      |
| periodType        | enum{MONTHLY, WEEKLY, CUSTOM} | yes      |                                                      |
| fromDate / toDate | date                          | yes      |                                                      |
| toPay             | decimal(14,2)                 | derived  | Wages earned from attendance + OT (module 08)        |
| advance           | decimal(14,2)                 | derived  | Advances paid in period                              |
| previousBalance   | decimal(14,2)                 | derived  | Carry-forward incl. opening balance                  |
| finalAmount       | decimal(14,2)                 | derived  | toPay + previousBalance − advance (inferred formula) |

### VendorPaymentSummary (computed view)

| Field               | Type          | Required | Notes                                    |
| ------------------- | ------------- | -------- | ---------------------------------------- |
| vendorId            | FK → Vendor   | yes      |                                          |
| projectId           | FK → Project  | yes      |                                          |
| fullDays / halfDays | int           | derived  | From vendor attendance                   |
| otHours             | decimal(6,2)  | derived  |                                          |
| totalPay            | decimal(14,2) | derived  |                                          |
| openingBalance      | decimal(14,2) | yes      |                                          |
| advancePaid         | decimal(14,2) | derived  |                                          |
| closingBalance      | decimal(14,2) | derived  | opening + totalPay − payments (inferred) |

### OtherExpense

| Field             | Type                              | Required       | Notes              |
| ----------------- | --------------------------------- | -------------- | ------------------ |
| id                | uuid                              | yes            |                    |
| projectId         | FK → Project                      | yes (inferred) |                    |
| date              | date                              | yes (inferred) |                    |
| amount            | decimal(14,2)                     | yes (inferred) |                    |
| paymentCategoryId | FK → PaymentCategory              | no (inferred)  |                    |
| description       | text                              | no (inferred)  |                    |
| status            | enum{PENDING, APPROVED, REJECTED} | yes            | Approval evidenced |
| remarks           | Remark[]                          | no             |                    |

### OtherParty

| Field      | Type           | Required | Notes            |
| ---------- | -------------- | -------- | ---------------- |
| id         | uuid           | yes      |                  |
| name       | string         | yes      | "Party Name\*"   |
| projectIds | FK → Project[] | no       | "Select Project" |

### OtherPartyInvoice

| Field         | Type                  | Required | Notes                                                            |
| ------------- | --------------------- | -------- | ---------------------------------------------------------------- |
| id            | uuid                  | yes      |                                                                  |
| invoiceKind   | enum{PURCHASE, SALES} | yes      | Purchase = from party; Sales = to party                          |
| otherPartyId  | FK → OtherParty       | yes      | "Party Name\*"                                                   |
| projectId     | FK → Project          | yes      | "Project\*"                                                      |
| invoiceDate   | date                  | yes      |                                                                  |
| dueDate       | date                  | no       |                                                                  |
| invoiceNumber | string                | yes      | Sales: from `OtherPartySalesInvoice` sequence; Purchase: entered |
| invoiceAmount | decimal(14,2)         | yes      |                                                                  |
| remarks       | text                  | no       |                                                                  |
| settledAmount | decimal(14,2)         | derived  |                                                                  |

### OtherPartyPayment

| Field            | Type                          | Required       | Notes      |
| ---------------- | ----------------------------- | -------------- | ---------- |
| id               | uuid                          | yes            |            |
| otherPartyId     | FK → OtherParty               | yes            |            |
| direction        | enum{PAYMENT_IN, PAYMENT_OUT} | yes            |            |
| date             | date                          | yes (inferred) |            |
| amount           | decimal(14,2)                 | yes            |            |
| mode / reference | as PartyPayment               | no             | (inferred) |

### InvoiceSettlement

| Field        | Type                              | Required       | Notes                                         |
| ------------ | --------------------------------- | -------------- | --------------------------------------------- |
| id           | uuid                              | yes            |                                               |
| invoiceId    | FK → OtherPartyInvoice            | yes            |                                               |
| paymentIds   | FK → OtherPartyPayment[]          | no             | (inferred)                                    |
| amount       | decimal(14,2)                     | yes (inferred) |                                               |
| status       | enum{PENDING, APPROVED, REJECTED} | yes            | `InvoiceSettled/SetApprovalStatus`, `/Reject` |
| rejectReason | text                              | no             |                                               |
| remarks      | Remark[]                          | no             |                                               |

### Remark (shared)

| Field                 | Type          | Required | Notes                                              |
| --------------------- | ------------- | -------- | -------------------------------------------------- |
| entityType / entityId | string / uuid | yes      | Petty cash, transaction, other expense, settlement |
| text                  | text          | yes      |                                                    |
| createdBy / createdAt | FK / datetime | yes      |                                                    |

---

## Workflows & states

### 1. Organisation onboarding seeds accounts

1. Company is created (module 01).
2. System creates "Company's Cash Account" (type 1, primary — inferred) and "Company's Bank Account" (type 2) with opening balance 0.
3. Admin edits opening balances and adds further bank accounts; sets one as primary.

### 2. Petty cash voucher

1. User opens their petty-cash account (`#/pettyCashAccounts`) and taps add (`#/pettyCashVoucherAddRoute`).
2. Picks voucher type: Payment, Receipt, or Petty Cash Transfer.
3. Enters Voucher Date (back-dated limits apply), Project, Party (or adds a new one inline), Amount, Mode (Cash/Bank/Company), Reference Number, Payment Category, Description, photo.
4. `Save` → status Pending for approval. `Save & Approve` → Approved immediately (only for users with approve permission — inferred).
5. Approver reviews singly or in bulk; Approve or Reject with remark.
6. Approved vouchers update the account balance and appear in the Petty Cash Report (Credit/Debit).

```mermaid
stateDiagram-v2
    [*] --> Pending: Save
    [*] --> Approved: Save & Approve (approver)
    Pending --> Approved: Approve / Bulk approve
    Pending --> Rejected: Reject (remark)
    Pending --> Pending: Edit / add remark
    Approved --> [*]
    Rejected --> [*]
```

Whether a Rejected voucher can be edited and resubmitted, or an Approved one reverted, is not captured.

### 3. Petty cash funding and transfer

1. Owner funds a site engineer: a Petty Cash Transfer voucher from a company account (mode Company) — or a Transaction Transfer — into the engineer's petty-cash account.
2. Engineer can transfer to another petty-cash account (Internal Petty Cash Transfer).
3. Both sides' balances move once approved (inferred).

### 4. Transaction (Payment In / Out)

1. Accountant adds a transaction: Date, Type, Bank/Cash Account, Category, Payment Mode (+ Cheque No / Reference Number), Payment Module, party, Project or Store, Amount, Description, attachment.
2. Status Pending → Approved / Rejected (Reject Reason), single or bulk.
3. Approved transactions roll into the Ledger Report balance of the selected account.
4. Bulk entry via Excel: download sample (`Transaction/SampleExport`), fill, import (`Transaction/Import`).

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Approved: SetApprovalStatus / BulkSetApprovalStatus
    Pending --> Rejected: Reject Reason
    Approved --> [*]
    Rejected --> [*]
```

### 5. Transaction Transfer between accounts

1. Choose from-account and to-account (company accounts), amount, date.
2. System records an outflow from the source and an inflow to the destination (inferred: as a pair of transactions).

### 6. Contractor invoice and payment

1. Accountant records the contractor's invoice: Contractor, Department, Invoice No, Invoice Date, Invoice Amount, TDS Amount, Remarks.
2. Add Payment: Payment Date, Mode (Cash/Bank + reference/cheque no + mode date), Paid Amount, TDS Amount, Category, Paid By, Remarks, Documents.
3. Paid Amount and Balance on the invoice update; when balance reaches zero (or via Settle Invoice) the invoice is settled.
4. View Payments / View Receipts; Contractor payment report; Contractor Centralized Payment Report across projects.

### 7. Supplier invoice and payment

1. PO → GRN (module 06) records goods with Invoice No / Date / Amount and DC No.
2. Accountant creates a supplier invoice and selects GRN/DC No(s); Total GRN Value is shown for cross-check.
3. Due Date drives the Due Payments widget.
4. Add Payment as above (no TDS field evidenced); balance updates.

### 8. Labour payment

1. Attendance is marked daily (module 08).
2. On Labour payments, pick period Monthly / Weekly / Custom.
3. System shows per labour To Pay, Advance, Previous Balance, Final Amount.
4. Record a payment or an Advance (form shows "today's wage amount").
5. Mark Paid Leave adjusts wage for leave days.

### 9. Vendor payment

1. Vendor attendance (module 08) gives full/half days and OT per category per shift.
2. Total Pay = days × rate/day + OT hours × OT rate (rates from vendor shift definitions).
3. Opening Balance + Total Pay − Advance Paid − payments = Closing Balance (inferred formula).
4. Record payment / advance.

### 10. Other expenses

1. Add expense; status Pending → Approved/Rejected (single or bulk), with remarks.

### 11. Other party purchase / sales invoice and settlement

1. On Parties (`#/officePartiesScreen`), choose Add Purchase Invoice or Add Sales Invoice.
2. Sales invoice number comes from the `OtherPartySalesInvoice` sequence; purchase invoice number is typed.
3. Record Payment In (customer pays) or Payment Out (we pay).
4. Raise an Invoice Settled entry; it goes to approval; approver approves (single/bulk) or rejects with remark.
5. Party Balance reflects invoices minus settled payments.

```mermaid
stateDiagram-v2
    [*] --> Open: Invoice saved
    Open --> PartiallyPaid: Payment In/Out < amount (inferred)
    PartiallyPaid --> SettlementPending: Invoice Settled raised
    Open --> SettlementPending: Invoice Settled raised
    SettlementPending --> Settled: Approve
    SettlementPending --> Open: Reject (remark)
    Settled --> [*]
```

### 12. Money flow (invoice → payment → ledger)

```mermaid
flowchart LR
    subgraph Sources
        GRN[GRN / DC<br/>module 06] --> SI[Supplier invoice]
        CW[Contractor invoice<br/>+ TDS amount]
        LA[Labour attendance<br/>module 08] --> LP[Labour to-pay]
        VA[Vendor attendance<br/>module 08] --> VP[Vendor total pay]
        OPI[Other party<br/>purchase invoice]
        OPS[Other party<br/>sales invoice]
        OE[Other expense]
    end

    SI --> PAY[Party payment<br/>mode, ref, category, paid by]
    CW --> PAY
    LP --> PAY
    VP --> PAY
    OPI --> POUT[Payment Out]
    OPS --> PIN[Payment In]
    POUT --> SETL[Invoice Settled<br/>approval]
    PIN --> SETL

    PAY --> BAL[Party balance<br/>opening + invoices - paid]
    SETL --> BAL

    TXN[Transaction<br/>Payment In / Out] -->|approved| LEDGER[Bank / Cash ledger<br/>opening, credit, debit, closing]
    PCV[Petty cash voucher] -->|approved| PCB[Petty cash balance]
    TRF[Transfer] --> LEDGER
    TRF --> PCB
    OE -->|approved| DASH
    PAY --> DASH[Dashboard: In/Out, Due,<br/>Module-wise pie]
    LEDGER --> DASH
    SI -->|due date| DUE[Due Payments]
    CW --> DUE
```

Whether a party payment automatically creates a Transaction (and therefore hits the cash/bank ledger) is not captured; the Payment Module field on Transactions suggests transactions can be tagged to a party module, which may be how legacy links them.

---

## Business rules & validations

**Required fields**

- Company account: Account Type.
- Payment Category master: name.
- Other Party: Party Name.
- Petty cash voucher: Voucher Date, Payment Category, Amount (inferred), voucher type; Transfer To when type is Transfer.
- Transaction: Date, Transaction Type, Bank/Cash Account, Amount (inferred), Payment Mode.
- Party payment: Payment Date, Paid Amount.
- Other party invoice: Party Name, Project, Invoice Date, Invoice Number, Invoice Amount.

**Payment mode rules**

- Cash maps to a cash account (account_type 1); Cheque, Online, UPI map to a bank account (account_type 2).
- Cheque requires Cheque No; Online and UPI require Reference Number (inferred "required"; notes show the field only).
- Party payment form mode is `Cash` | `Bank`; Bank requires Reference Number or Cheque No and a Payment Mode Date.
- Petty-cash voucher mode is `Cash` | `Bank` | `Company`.

**Numbering**

- Petty cash voucher numbers come from the `PettyCash` sequence; Other Party sales invoices from `OtherPartySalesInvoice`. Rule rows: Project (All/Default or specific), Prefix (e.g. `PR/26-27`), Project Id (e.g. `PX`), Start Number → `PREFIX/PROJECTID/00001` (module 12).
- Transactions, contractor invoices, supplier invoices, and purchase invoices have no system sequence; invoice numbers are typed.

**Balances**

- Company account balance = opening balance + approved Payment In − approved Payment Out ± transfers (inferred).
- Petty cash balance shown per user; Closing Balance on the Petty Cash Report.
- Ledger Report computes Opening Balance (before filter start), Total Credit, Total Debit, Closing Balance.
- Contractor invoice Balance = Invoice Amount − TDS − Paid (TDS treatment inferred).
- Supplier invoice Balance = Invoice Amount − Paid.
- Labour Final Amount = To Pay + Previous Balance − Advance (inferred).
- Vendor Closing Balance = Opening + Total Pay − Advance Paid − payments (inferred).
- Only one company account can be primary (inferred from SetAsPrimary).

**Approval gates**

- Approval exists on petty-cash vouchers, transactions, other expenses, and other-party invoice settlements. Single, bulk, remark, reject reason.
- `Save & Approve` is offered on petty-cash vouchers; presumably only when the user holds Approve on Petty Cash (inferred).
- Dashboard KPI "Payment Approvals" counts pending payment items.

**Back-dated entry and financial closing (module 12)**

- Accounts group overrides cover **Petty Cash** and **Transactions**: restrict creating entries older than N days and editing entries older than N days, with designation overrides.
- A **financial closing date** (company-level, also per user row `financialClosingDate`) blocks entries on or before it (inferred: blocks create and edit).
- Per-user `backdatedCreateDays` / `backdatedEditDays` exist on the permission row.

**Permission gates**

- The `financial` flag hides money values (amounts, rates, balances) in modules that carry it (inferred from name; see Permissions). In this module it is on Labour (#58) and Vendor (#59) attendance-payment menus, Vendors master (#60), Labours master (#69), Project (#4), Task, Material Received, Materials, Equipment.
- `viewAll` on Petty Cash (#52) — without it a user sees only their own petty-cash account and vouchers (inferred).
- Central payment (#75) and Payments (#47) are read-only containers.

**Currency**

- Company currency (default INR, `₹1,00,000.00` lakh format); `isNonIndianCompany` flag (module 12). All amounts in company currency; no multi-currency per transaction.

---

## Permissions

Flags (from `_working-notes.md`): C create, R read, U update, D delete, A approve, J reject, P print/download, N notification, V view all, T transfer, O report, F financial, E export, I import. UI matrix columns: ADD, VIEW, EDIT, DELETE, APPROVE, REJECT, DOWNLOAD, REPORT, VIEW ALL, NOTIFICATION, TRANSFER, FINANCIAL.

| Menu (id)                | Flags      | Decoded                                                                              | Notes                                                                                          |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Central payment (#75)    | R          | read                                                                                 | Workspace view                                                                                 |
| Payments (#47)           | R          | read                                                                                 | Project tile container                                                                         |
| Transactions (#63)       | CRUDAJPNO  | create, read, update, delete, approve, reject, print, notification, report           | Reject is its own flag (Reject Reason). No E/I flag although the UI has Import / Sample Export |
| Parties (#76)            | CRUDAJEPNO | create, read, update, delete, approve, reject, export, print, notification, report   | Approve/reject drive Invoice Settled; only Payments menu with Export                           |
| Petty Cash (#52)         | CRUDAJPNVO | create, read, update, delete, approve, reject, print, notification, view all, report | View all controls seeing other users' accounts (inferred)                                      |
| Company's Bank A/C (#61) | CRUDPO     | create, read, update, delete, print, report                                          |                                                                                                |
| Payment Categories (#71) | CRUD       | create, read, update, delete                                                         |                                                                                                |
| Other Party (#64)        | CRUD       | create, read, update, delete                                                         |                                                                                                |
| Contractors (#31)        | CRUD       | create, read, update, delete                                                         | Master; payments live under Payments                                                           |
| Supplier (#9)            | CRUD       | create, read, update, delete                                                         |                                                                                                |
| Vendors (#60)            | CRUDF      | create, read, update, delete, financial                                              | Financial hides rates (inferred)                                                               |
| Labours (#69)            | CRUDF      | create, read, update, delete, financial                                              | Financial hides wage (inferred)                                                                |
| Labour (#58, project)    | CRUDPTOF   | create, read, update, delete, print, transfer, report, financial                     | Labour payment screens; transfer = labour transfer                                             |
| Vendor (#59, project)    | CRUDPOF    | create, read, update, delete, print, report, financial                               | Vendor payment screens                                                                         |
| View Quotations (#29)    | R          | read                                                                                 | Contractor/supplier quotations                                                                 |
| Dashboard (#65)          | R          | read                                                                                 | Payments section                                                                               |
| Central Reports (#77)    | R          | read                                                                                 | Centralized payment reports                                                                    |

Other Expenses has no menu row of its own; its approve/reject endpoints presumably sit under Transactions or Payments (inferred).

The `financial` flag: no Payments-group menu carries `F`, yet the money screens in Labour/Vendor/Project do. Rebuild should define `financial` explicitly as "may see monetary amounts" and apply it consistently (see Open questions).

Seeded designations with permission templates relevant here: Accountant, Admin, Project Manager, Site Engineer, Site Supervisor, Store Keeper (module 01).

---

## Relationships

→ depends on

- **01 Organization/Identity/Access** — company, team members (petty-cash account holders, approvers, "Paid By"), permission matrix, seeded accounts on company creation.
- **02 Master Records** — Company's Bank A/C, Payment Categories, Contractors (departments, GST, PAN, quotations), Suppliers, Vendors (shift rates), Labours (wages, opening balance), Other Party, Departments.
- **03 Projects** — every payment is scoped to a project (or a store); project resource assignment limits which parties appear.
- **06 Procurement & Inventory** — GRN/DC numbers and invoice amounts feed supplier invoices; central stores are a Transaction scope.
- **08 Labour & Vendor Attendance** — source of labour to-pay and vendor total pay.
- **12 Settings** — numbering (PettyCash, OtherPartySalesInvoice), back-dated entry control (Accounts group), financial closing date, currency.

← used by

- **11 Reports/Dashboards/Backup** — Payment In/Out, Due Payments, Module Wise Payment widgets; project report set (Contractor payment, Supplier payment, Petty Cash, Other Expense, Transaction); central reports; project backup.
- **10 HRMS** — salary payments and advances are HRMS-side; no evidence they post here (open question).
- **09 Sales CRM** — no evidenced link from bookings to Payment In; allottee collections would land here in the rebuild.
- **13 Chat/Notifications** — Export Receipts ZIP delivered by notification; per-module notification permission on Transactions, Parties, Petty Cash.

---

## Reports & exports

| Report / export                       | Scope             | Contents                                                                                                                             |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Petty Cash Report                     | Project / account | Date, Voucher No, Category, Account, Paid To/Received from, Credit, Debit, Status, Description, View Voucher, Total, Closing Balance |
| Export Receipts                       | Petty cash        | ZIP of voucher attachments, async, delivered via notification (`v2/petty-cash/vouchers/export`)                                      |
| Ledger Report                         | Company account   | Opening Balance, Total Credit, Total Debit, Closing Balance; filters Paid To, Bank Account, Category, Type, Mode, Module, Status     |
| Transaction Report                    | Project           | Transaction list (columns as entry)                                                                                                  |
| Transaction Sample Export / Import    | Company           | Excel template and import                                                                                                            |
| Contractor payment report             | Project           | Invoice/payment register                                                                                                             |
| Contractor Centralized Payment Report | All projects      | Cross-project contractor dues                                                                                                        |
| Supplier payment report               | Project           | Invoice/payment register                                                                                                             |
| Centralized Supplier Payment Report   | All projects      |                                                                                                                                      |
| All Labour Payment Report             | Project           | Per-labour to-pay/advance/balance                                                                                                    |
| Other Expense report                  | Project           |                                                                                                                                      |
| Company's Bank A/C print/report       | Company           | (contents not captured)                                                                                                              |
| Due Payments table                    | Dashboard         | Party, total invoice, paid, due; export                                                                                              |
| Receipts                              | Party payments    | View Receipts (`Invoice/Receipt`)                                                                                                    |

Reports render PDF or Excel with header (Organisation, Project, Address, Duration) and "Page x of y" (module 11). Project backup includes all payment data.

---

## Rebuild recommendations

1. **Single payments ledger under the registers.** Model every money movement (petty-cash voucher, transaction, party payment, transfer, settlement) as a posting against an account (company bank/cash, petty-cash, party). Party balances, account ledgers, dashboard totals, and Central payment views then derive from one table instead of five registers that may disagree. Keep the legacy registers as views.
2. **Party payment always names the paying account.** Legacy party payments record Cash/Bank and a reference, but the notes don't show which company account the money left. Make the account required so the bank ledger reconciles.
3. **TDS as a computed deduction, not a typed number.** Party master gets PAN, entity type (individual/HUF vs others), and default TDS section; payment computes 194C (1% individual/HUF, 2% others; ₹30,000 single / ₹1,00,000 aggregate per FY), 194J (10% professional / 2% technical; ₹50,000), 194I for equipment hire (2% plant/machinery; ₹6L/yr), and 194Q for large-buyer goods purchases (0.1% above ₹50L per seller per FY), with per-FY cumulative threshold tracking, a TDS ledger, and Form 26Q / 16A exports. Store rates and thresholds as dated configuration — the Income-tax Act 2025 renumbers 194C to 393(1) from 1 Apr 2026. (research §2 TDS)
4. **GST on invoices.** Supplier and contractor invoices carry taxable value, GST rate, CGST/SGST/IGST split, and an ITC-eligible flag derived from project type (s.17(5) blocks ITC on own-account construction). Promoter projects need the 80/20 registered-supplier test per project per FY with RCM on shortfall. Other-party sales invoices need e-invoice (IRN) generation when AATO > ₹5 crore. (research §2 GST)
5. **Contractor work orders and RA bills replace free-form contractor invoices.** RA bill = cumulative measured value − previous bills − deductions (retention 5–10%, mobilisation advance recovery, TDS, material issued at cost, penalties), with a deductions register and retention release (50% at completion / 50% at DLP end). The legacy contractor invoice becomes the RA bill's payable. (research §3)
6. **Supplier invoice three-way match.** Legacy already links invoice → GRN/DC and shows Total GRN Value; add PO rate check and a variance flag rather than just showing the total.
7. **Due dates and ageing.** Legacy has Due Date on supplier and other-party invoices and a Due Payments table; add ageing buckets and payment-terms days from the PO (PO already has Payment Terms (Days) — module 06).
8. **UPI receipts and payment links.** For Payment In from allottees and other parties, generate UPI collection links and auto-create the receipt on settlement; aggregators settle UPI at 0% MDR. (research §4 item 6)
9. **RERA 70% account.** Tag one company bank account per project as the RERA designated account; allottee receipts post 70% to it, and withdrawals are checked against certified % completion. (research §2 RERA)
10. **Tally / Zoho Books sync in the base plan.** Push purchase, payment, receipt and journal (TDS/GST) vouchers; pull ledgers and party balances. Competitors charge ₹20,000 + ₹5,000/yr for this. (research §4 item 3)
11. **Explicit `financial` permission.** Define it as "may see monetary values" and apply to every amount column across modules, including dashboard widgets and reports; legacy applies it inconsistently.
12. **Approval rules engine.** Legacy has one approve/reject level on vouchers, transactions, expenses and settlements. Add amount thresholds and multi-level approval (Onsite sells multi-level approval in its mid tier — research §1). `Save & Approve` only when the creator holds approve and the amount is within their limit.
13. **Immutable approved entries.** After approval or after the financial closing date, edits become reversals, keeping the audit trail.
14. **Reconcile reference numbers.** Unique (account, reference number) check to catch duplicate UPI/NEFT entries; optional bank-statement import.
15. **Labour wages vs minimum wage.** When paying labour, warn when effective daily wage is below the state rate card for the labour's skill category. (research §2 Labour)
16. **Vendor portal.** Let contractors/vendors see their invoices, payments, and TDS certificates (research §4 item 7) — later phase.

---

## Open questions

1. What are paid-to types 4, 7 and 8? (Transactions accept 1, 4, 8; petty cash 1..7.) Team member is a likely candidate for one of them.
2. Does a party payment (contractor/supplier/labour/vendor) create a Transaction row and hit the bank/cash ledger, or are the two independent?
3. Is the "Payment Module" on a Transaction just a tag, or does it link to a specific invoice/party balance?
4. Is TDS deducted from the invoice balance or tracked separately? Is there any TDS report?
5. Are opening balances per party per project, or per party company-wide? Sign convention (payable vs receivable)?
6. Does the petty-cash balance include pending vouchers or only approved?
7. Can a rejected voucher/transaction be edited and resubmitted? Can approval be revoked?
8. Why does no Payments-group menu (Transactions, Parties, Petty Cash, Central payment, Payments) carry the `financial` flag when Labour (#58), Vendor (#59), Labours (#69) and Vendors (#60) do? Can a user without `financial` still see amounts in Transactions and Petty Cash?
9. Exact bank-account fields when Account Type = Bank (bank name, account no, IFSC, branch?).
10. Fields of Other Expenses (date, amount, category, vendor?) and how it differs from a Payment Out transaction.
11. What does "Settle Invoice" on the party payment form do when the payment is less than the balance — write off the difference?
12. Can one payment cover several invoices (supplier GRNs, contractor bills)?
13. Is "Paid By" a free-text name or a team member reference?
14. What exactly does Central payment show beyond the centralized contractor/supplier reports?
15. How does the labour Advance interact with the next period's To Pay (recovered fully or in instalments)?
16. Is the financial closing date enforced per user (`financialClosingDate` on the permission row) or company-wide, and does it block approvals as well as entries?

---

## Decisions for the build

Product rules are in [ADR CM-0017](../adr/CM-0017-finance-product-decisions.md); what follows is every rule the M7 build settled that this spec or the ADR left open, by ticket.

### CM-701 — Finance document thread

- **One thread for every finance document.** Remarks and files on a Transaction, transfer, petty-cash voucher, Other Expense, invoice, party payment or settlement use `/api/construction/finance/documents/{type}/{id}/…` (remarks, files, uploads), copied from site work. Read on the document's menu sees the thread and may comment; Create or Update uploads; Update removes any file, Create only the member's own.
- **Menus.** Transactions and transfers: `finance.transactions`; vouchers: `finance.petty_cash`; Other Expenses: `finance.other_expenses`; invoices, party payments and settlements: `finance.parties`. The menu is checked on the document's Project when it names one, and alone when it names none. A settlement takes its invoice's Project. A Store-located invoice or payment is the Owner's alone (CM-0017 §14).
- **Petty-cash vouchers stay private.** A voucher on someone else's account answers 404 `PETTY_CASH_VOUCHER_NOT_FOUND` (thread and files included) unless the member has Petty Cash View all (CM-0017 §9).
- **Files are receipts, not site photos.** Every finance document takes a PDF or an image (PNG, JPEG, WebP), 25 MB a file, 20 a document, 10 a remark. **Finance files never join the Project Gallery**: a receipt or invoice copy is not a picture of the work, and the Gallery is readable by members who may not see money.

### CM-701 — Company's Bank A/C and the account statement

- **The list is company accounts only** (Cash and Bank). Petty-cash accounts share the table but are listed and opened under Petty Cash (CM-703). Each row shows today's balance (entries up to today in the Company's time zone) and its **pending** documents — pending Transactions, both sides of pending transfers, pending petty-cash vouchers (and a transfer voucher's destination) and pending Other Expenses — as a count and the signed total they would move if approved.
- **The kind never changes** after an account is added. Bank details (bank name, account number, IFSC, branch) are all optional, so the seeded "Company's Bank Account" stays valid; a Cash account refuses them (400 `BANK_FIELDS_NOT_ALLOWED`). The account number keeps letters and digits only (spaces and hyphens dropped); the list shows its last four. The IFSC is upper-cased before the check.
- **The opening balance is signed** (an overdraft is negative), at most ₹100 crore either way, dated an opening date that is not after today. Zero posts no entry. A changed amount, or a changed date of a non-zero opening, posts the reversal of the live opening entry and a new one; both dates must be after the Financial Closing Date (403 `FINANCIAL_PERIOD_CLOSED`).
- **Delete** is refused for the primary (409 `ACCOUNT_PRIMARY`), when any entry besides the opening and its reversals exists, or while any live document of any status names the account (Transaction, transfer either side, petty-cash voucher either side, Other Expense, party payment) — both 409 `ACCOUNT_IN_USE`, the second naming the document. Otherwise the opening is reversed and the row tombstoned; Set As Primary needs Update, delete needs Delete, both with `expectedUpdatedAt` for delete and edit.
- **Account statement** (`GET /api/construction/finance/accounts/{id}/statement`) is the generic Ledger read for every account kind: this month by default, at most 366 days, filters `sourceType`, `paymentCategoryId`, `mode`, `counterpartyKind`. **The filters apply to the opening too**, so closing = opening + in − out always holds for what is shown. Reversals are lines of their own (marked), not netted away. Access lives in `canReadAccountStatement` (`src/finance/application/account-access.ts`): the Owner; a company account with Company's Bank A/C Read or Transactions Read (on any Project); a petty-cash account by its holder or with Petty Cash View all.

### CM-702 — Transactions and transfers

- **Where a document sits.** A Transaction is on a Project, a Store, or neither (Company-level); a transfer on a Project or Company-level. On a Project the Transactions flags are checked on that Project; a Store or Company-level one needs the flag with no Project scope (any member holding it). The **company-wide list** (no `projectId`) is Owner-only, for Central Payment (CM-709). The Project screen always creates on its own Project; the place and the number never change on edit.
- **Paid To / Received From** is optional: nothing, a typed name (≤ 200), or a picked party whose id must exist in the Company for its kind (live Contractor, Supplier, Labour, Vendor or Other Party; an active Team Member) — 400 `COUNTERPARTY_NOT_FOUND` otherwise. The stored name is the party's name when picked; an unchanged pick is kept on edit even if the party has since left.
- **References.** Cheque mode stores the cheque number (and an optional cheque date); Online and UPI store the reference; Cash stores neither. **Duplicate reference** compares the cheque number or reference ignoring spaces and case against live, non-rejected Transactions of the account, transfers touching the account (either side) and live party payments of the account → 409 `DUPLICATE_REFERENCE` with `details.document` `{ type, id, number, date }`, unless `confirmDuplicateReference: true` ("Save anyway"). On edit it is re-checked only when the account or the reference changes. A transfer's reference is checked against its **from** account.
- **Transfers: the mode must fit the from account** (`modeFitsAccount`): Cash leaves a Cash or petty-cash account, Cheque / Online / UPI leave a Bank account; the to account may be any live account (a Cash deposit into the bank is a Cash transfer from the Cash account). The caller must be able to use the from account (their own petty cash, or Petty Cash View all); the to account only has to exist, so a company → petty-cash transfer funds any holder. The entries carry the other account's name as the counterparty and "Transfer to / from …" as the narration when there is no description.
- **Decisions and the closing date.** Approve and reject check only the Financial Closing Date (not the back-dated day limits); create, edit and delete check the back-dated limits of the `transaction` module (which include the closing date). Approve and reject accept an optional `expectedUpdatedAt`. Edit accepts `approve: true` (Save & Approve on edit, needs Approve). Rejecting needs a reason (≤ 500).
- **Bulk** approve / reject takes Transactions and transfers together (`POST …/transactions/bulk`, `items: [{ type, id }]`, 1–100), each checked on its own Project; any refusal is 409 `BULK_DECISION_REFUSED` listing them and nothing changes.
- **The register** lists Transactions and transfers newest first (by when they were recorded) with cursors. Type `in` / `out` leaves transfers out; a category or party-kind filter leaves transfers out (they have neither); an account filter matches either side of a transfer. **Totals** (in, out, transferred) are of every filtered row **except rejected ones**, or only the rejected ones when the status filter is Rejected.
- **Import** takes the .xlsx as the request body (like Import Inventory Stock, M5), not multipart. Up to 500 rows, all in one database transaction: every row runs the same checks as the form (account by name ignoring case, mode against account, reference, duplicate reference against the account **and earlier rows of the same file**, back-dated limits), and any problem rolls everything back with 400 `IMPORT_HAS_ERRORS` and `details.errors` = `[{ row, field (the column header), message }]`. Paid To / Received From is imported as a typed name. Dates may be Excel dates, `YYYY-MM-DD` or `DD/MM/YYYY`; amounts are rupees with at most two decimals.
- **Response shape.** Register rows are a union on `type` (`transaction` | `transfer`); a Transaction's Payment In / Out is `direction` in the response (the request field stays `type`).

### CM-704 — Payment Categories

- **The master is served from finance** at `/api/construction/finance/payment-categories` with the masters' route shape (list, add, `{id}`, `update`, `disable`, `enable`, `delete`) under the `masters.payment_categories` menu; the screen sits under Masters.
- **Seeds can be renamed** (a Company may call "Fuel" "Fuel & diesel"); they are disabled, never deleted (409 `PAYMENT_CATEGORY_SEED`). Any category may be disabled; it leaves the pickers and old documents keep it.
- **In use** means a live Transaction, petty-cash voucher, Other Expense or party payment names it, or any account entry carries it (entries are never deleted, so a reversed one still counts). The list shows "In use" and offers no Delete; the server refuses with 409 `PAYMENT_CATEGORY_IN_USE`.
- Names are unique among the Company's live categories ignoring case (409 `PAYMENT_CATEGORY_NAME_TAKEN`); a deleted category frees its name.

### CM-703 — Petty Cash

- **API.** `/api/construction/finance/petty-cash/accounts` (list, open, `{id}`, `{id}/delete` to close, `{id}/receipts.zip`) and `/petty-cash/vouchers` (list, write, `{id}`, `update`, `approve`, `reject`, `delete`, `bulk-approve`, `bulk-reject`). The statement is the accounts' `GET /api/construction/finance/accounts/{id}/statement`.
- **Who sees what.** Read on Petty Cash lists accounts; without View all only the account the member holds (none when they hold none). A voucher on a Project also needs Read on that Project; another holder's voucher is 404 (its thread and files too).
- **Opening an account** needs Petty Cash Create, for any active Team Member (one live account each, 409 `PETTY_CASH_ACCOUNT_EXISTS`). The opening balance is zero or more and posts an `opening` entry; only the Financial Closing Date guards its date (it is a balance as of a day, not a back-dated voucher).
- **Closing an account** (Petty Cash Delete) is refused while any live voucher names it (from or to) or any entry other than its opening exists (409 `PETTY_CASH_ACCOUNT_IN_USE`). The account is tombstoned; its opening entry stays, as every entry does.
- **Paid To / Received From is optional** on a voucher; a picked party's name is read from its record. A Transfer carries no party and no Payment Category; it may go to any live company or petty-cash account.
- **Entries.** Payment → `payment` −amount; Receipt → `receipt` +amount; Transfer → `transfer_out` on its account and `transfer_in` on the other. Every entry is mode `cash` and copies the Project, category, party, number and Paid For (or the description) as narration.
- **Dates.** Writing checks back-dated module `petty_cash` (create); editing and deleting check its edit limit on the old date and on a new one; **approving and rejecting check only the Financial Closing Date** (an approver deciding last week's voucher is normal; the closing date still refuses it, 403 `FINANCIAL_PERIOD_CLOSED`).
- **Approvers** need not hold the account, but approving re-checks that both accounts still exist. Bulk decisions run in one transaction, all or none, with each refusal listed.
- **The account a voucher is written on cannot change** on edit; its type, date, Project, party, category, amount and texts can.
- **Pending total** beside a balance is what the account's pending vouchers would do once approved: − for its Payments and Transfers out, + for its Receipts and Transfers in.
- **Export Receipts** needs Petty Cash Download (the `print` flag) and streams a ZIP built while it downloads (stored, not deflated). Entries are named `<voucher number> <n>.<ext>` with the number's `/` as `-` (`PC-26-27-00012 1.jpg`), because a ZIP name cannot hold a slash. The `fflate` package (0.8.3, already in the lockfile) builds it.
- **The Petty Cash tab** sits on a Project's Payments, so its voucher list starts on **This Project** with a switch to **All Projects**; balances are always the whole account's.

### CM-704 — Other Parties and Other Expenses

- **Other Party fields follow Masters → Suppliers.** Name\* (at most 120 characters, unique among live Other Parties ignoring case: 409 `OTHER_PARTY_NAME_TAKEN`), mobile (stored as E.164), email, GSTIN (fills the GST state; a different state is 400 `GSTIN_STATE_MISMATCH`), PAN (must sit inside the GSTIN), GST state, address (500) and the Projects it works on. There is no Active / Inactive switch: an Other Party is either live or deleted.
- **What blocks deleting an Other Party:** a live invoice, party payment or opening balance, or any party entry. Paid To labels on Transactions and vouchers keep their own copy of the name and never block. A delete may send `expectedUpdatedAt` (409 `OTHER_PARTY_CHANGED`).
- **Other Expense cheques keep their number in `reference`** (the table has no cheque column): 400 `CHEQUE_NUMBER_REQUIRED` / `REFERENCE_REQUIRED` with `field: reference`. The date may not be after today (400 `EXPENSE_DATE_IN_FUTURE`).
- **Payment Category** must be live and enabled; an expense that already names a since-disabled category keeps it on edit.
- **Which date checks run when.** Create uses the `other_expense` back-dated create limit; edit and delete use its edit limit (on the stored date and, when it changes, the new one) and the Financial Closing Date. **Approve and reject check only the Financial Closing Date** (CM-0017 §15): the approver is deciding, not entering, so the day limits stay with the person who records.
- **The account at approval.** Saving checks that the saver may use the account (their own petty cash unless Petty Cash View all). Approving checks again that the account still exists and fits the mode, but not whose it is: an approver posts a site engineer's expense onto that engineer's petty cash.
- **The account entry** is money out with the Ledger Report's columns: the Project, Payment Category, mode, reference, the EXP number, the typed payee as Paid To (no party kind) and the description as narration ("Other Expense" without one).
- **Save & Approve on edit** of an approved expense reverses its entry and posts the new one in the same transaction; plain Save sends it back to pending.
- **Every reader of the menu sees every expense of the Project**: `finance.other_expenses` has no View all flag (CRUDAJPO).
- **Files.** The Add form takes files, uploaded once the expense is saved (a failed upload leaves the expense saved and says which files to add again); the detail page holds files and remarks (CM-701 thread). The Edit form does not take files.
- **The list** is newest recorded first (cursor pages) with the totals of every match: all, approved, pending and rejected.

### CM-707 — Wage and salary payments post to accounts

- **`accountId` is optional in the request model** so a missing one answers 400 `ACCOUNT_REQUIRED` (with `field: accountId`) rather than a generic validation error; the domain requires it.
- **`AccountPosting` gained `names`** (account names, deleted ones included, for lists and statements) and a `NO_ACCOUNT_POSTING` stub. Labour's and HRMS's factories default to the stub, as procurement does with `NOT_PAID`; every route passes finance's `accountPosting`.
- **Wage payment entries.** Narration "Wage payment" or "Advance"; Paid To is the Labour or Vendor; the Project is the payment's. Bank payments carry the reference with no mode (labour records only Cash or Bank).
- **Whose petty cash.** A member pays from their own petty cash; Petty Cash View all (and the Owner) may pay from anyone's.
- **Back-dated wage payments** use the `labour_payment` / `vendor_payment` modules: their own limits in custom mode, the Company's defaults otherwise, and the Financial Closing Date. Cancel uses the edit limit, so a payment dated in a closed period cannot be cancelled.
- **Pay Advance Salary also names its account** and posts one entry: an advance slip is a Paid slip and its money leaves an account just as Mark Paid's does.
- **Salary entries** have no Project, name the Team Member as Paid To, and read "Salary 2026-09" (or "Salary advance"). A slip with a zero net payable posts nothing. HRMS has no way to undo Paid, so nothing is reversed.
- **Screens.** The pay dialog, Mark Paid and Pay Advance Salary have **Paid from** (the account picker, following Cash / Bank). The Payments list and the statement sheet show the account; payments recorded before M7 show none.

### CM-705

- **One engine for every party.** Invoices, payments, allocations, openings, settlements and statements take a party type (Contractor, Supplier, Other Party); CM-708 builds the Other Party screens on the same API. Contractors and Suppliers must be assigned to the Project (400 `PARTY_NOT_ON_PROJECT`); Other Parties and Store suppliers are not checked against an assignment.
- **An invoice keeps its party and place.** Editing changes the number, dates, Department, taxable value and GST, amount and remarks. Taxable value plus GST is at most the amount (400 `INVOICE_SPLIT_EXCEEDS_AMOUNT`). A settled invoice is not edited (409 `INVOICE_SETTLED`). Delete is refused once a payment or settlement points at it (409 `INVOICE_ALLOCATED`) or while a settlement is pending (409 `SETTLEMENT_PENDING`).
- **A GRN's invoice follows its GRN.** Its number, date and amount come from the GRN; changing them on the invoice is 400 `INVOICE_FROM_GOODS_RECEIPT` (due date, split and remarks stay editable). The invoice date is the GRN's invoice date, else its receipt date. An edited GRN whose invoice number was removed deletes its unallocated invoice (the GRN awaits an invoice again); a GRN moved to another Supplier or place gets its invoice re-created; a number the Supplier already used leaves the GRN awaiting an invoice. A manual invoice that gathered several GRNs keeps its amount; an edited GRN updates only the link's GRN value, a deleted one is unlinked.
- **The GRN listener runs after commit.** Procurement dispatches `GoodsReceiptPosted` after the GRN's transaction, so finance syncs in its own transaction, reads the GRN as committed and is idempotent by GRN id. A failure is logged and never fails the GRN request. The GRN handlers use the composition's `goodsReceiptDispatcher()`, which passes every event on to `procurementEvents` and also to finance.
- **A GRN is paid** once a live allocation points at its live invoice (`GoodsReceiptPayments`).
- **Allocation refusals:** `ALLOCATION_EXCEEDS_PAYMENT` (Σ above paid + TDS), `ALLOCATION_EXCEEDS_BALANCE`, `ALLOCATION_OTHER_PARTY`, `ALLOCATION_OTHER_PLACE`, `ALLOCATION_WRONG_DIRECTION` (out settles bills, in settles sales invoices), `ALLOCATION_DUPLICATE`, 409 `INVOICE_SETTLED`; all 400 unless said.
- **Cancel** runs the `party_payment` edit check (back-dated limit and closing date) and is refused when an invoice it settles has since been written off (409 `INVOICE_SETTLED`). Cancel and Apply advance take `expectedUpdatedAt` (409 `PARTY_PAYMENT_CHANGED`).
- **Duplicate references** compare the cheque number (Cheque) or the reference (Online, UPI, and Cash when one is typed) with live account entries of the same account, ignoring case; 409 `DUPLICATE_REFERENCE` names the document, `confirmDuplicateReference` saves anyway.
- **Openings** predate the app, so only the Financial Closing Date limits them (no back-dated limits). Changing an existing opening needs `expectedUpdatedAt` (409 `PARTY_OPENING_EXISTS` without it).
- **Settlements:** the write-off is dated the day it is approved, which the closing-date check applies to; approval re-reads the balance and keeps the written-off amount on the settlement. The settlement list shows a member the Projects they read Parties on; the Owner also sees Stores.
- **Statements** list live entries only: an entry and its reversal share a date and cancel out. The opening is the balance before `from`.
- **Balances** list the parties assigned to the Project plus any with entries there ("Not on Project").
- **Receipt PDF:** finance cannot import procurement, so the route passes the Purchase Order's amount-in-words helper into the PDF writer.
- **Masters delete guard:** a Contractor or Supplier with a live invoice, party payment or opening cannot be deleted.

### CM-706

- **The year's figures** for the 194C thresholds are the Contractor's live Payment Out rows in the same financial year dated on or before this payment, across Projects. A payment with no TDS keeps its own base (settled − GST share) as `tds_base`, so the payment that crosses ₹1,00,000 catches it up without its GST.
- **An override** is a TDS amount different from the server's suggestion; it needs a reason (400 `TDS_OVERRIDE_REASON_REQUIRED`) and keeps the base and rate sent (the suggestion's when left out). The same amount keeps the suggestion's base and rate.
- **The payment form** takes a Contractor's amount settled (paid + TDS); paid = settled − TDS is what leaves the account.
- **The TDS ledger** lists every live payment to the Contractor in the year (TDS 0 included) on the Projects the viewer reads Parties on (the Owner sees all); quarter totals add the rows with TDS. The xlsx/PDF report is CM-709's.
- **Masters** shows the payee kind from the PAN with its rate as a label ("Individual / HUF — 1%", "Firm/Company/other — 2%", "No PAN — 20%"); finance keeps the dated rates. An edit that leaves the TDS settings out keeps them.
