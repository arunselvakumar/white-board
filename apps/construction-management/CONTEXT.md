# Construction Management

A new construction management product for Indian builders and contractors. Customers start fresh; nothing is imported from other tools. Use these words on screens, in code comments, in tests, and in API descriptions. Derived from the glossary in [`docs/00-overview.md`](./docs/00-overview.md); module specs under [`docs/modules/`](./docs/modules/) define each term in detail.

## Language

### People and tenancy

**Company**:
The tenant. A builder or contractor firm that buys one subscription and invites a team. A User may belong to several Companies and switches between them. In code and in `@repo/auth` a Company is a **Workspace** (Better Auth organization); the id is `workspaceId` (ADR CM-0001, CM-0002).
_Avoid_: organization, tenant, org, firm, account (in UI copy)

**Active Company**:
The Company the current Session is working in. Every API call is scoped to it; it is never sent in a request body.
_Avoid_: current org, selected tenant

**User**:
A person who can sign in: by email and password, and by mobile OTP once SMS is on (ADR CM-0009). A User exists once, across all their Companies.
_Avoid_: account, login, customer

**Team Member**:
A User's membership and employee record inside one Company: name, Designation, mobile, email, ids, Member Type, projects, and the Permission Matrix.
_Avoid_: user, employee, staff (in UI copy)

**Owner**:
The Team Member who created the Company. Buys and renews the plan, can do everything, cannot be removed. Role `owner` in `@repo/auth`.
_Avoid_: admin, super admin

**Member**:
Every other Team Member. Role `member` in `@repo/auth`; what a Member may do comes from their Permission Matrix, not from the role.

**Member Type**:
**Normal** (works on projects) or **HRMS** (attendance, leave and salary only; no projects).
_Avoid_: user type, employee type

**Designation**:
A job title in a Company (Site Engineer, Store Keeper, Accountant…). Some carry a Permission Template.
_Avoid_: role, position

**Join Request**:
An invitation to a Company as seen by the invitee. Pending until accepted; the Team Member shows **Joining Pending** until then.
_Avoid_: invite request

### Access

**Permission Matrix**:
Per Team Member, per Menu, a set of Flags. Decides what the Team Member sees and does.
_Avoid_: role permissions, ACL, RBAC

**Menu**:
One screen family the matrix controls (`organization.team_members`, `labour.attendance`, `hrms.leave_management`…).

**Flag**:
One right on a Menu: `create read update delete approve reject print report view_all notification transfer financial export import`. **View All** off means "only entries I created". **Financial** off means amounts are hidden.

**Permission Template**:
A Designation's starting Permission Matrix, copied to a Team Member when that Designation is chosen.

### Masters and parties

**Masters**:
The Company's reference lists (Departments, Contractors, Suppliers, Vendors, Labours, Materials, Units, Accounts…). One of the three top-level areas.
_Avoid_: settings (for these lists), catalog

**Department**:
A trade or work category (RCC, Plumbing, Painting, Excavation…). Classifies Contractors, Work Types, Worksheets, Issues and Inspections.
_Avoid_: trade, team

**Contractor**:
A party that executes work, labour-and-material or labour-only. Has invoices with TDS. Not a User.
_Avoid_: subcontractor

**Supplier**:
A party that sells material. Linked to POs and GRNs. Not a User.
_Avoid_: vendor (for material sellers)

**Vendor**:
A labour-supply party (a gang or mukadam). Attendance is counted per labour category per shift and priced from the Vendor's rate card. Not a User.
_Avoid_: supplier, contractor (for gangs)

**Labour**:
An individual worker on the Company's own roll, with a daily or monthly wage and an OT rate. A record, not a User.
_Avoid_: worker, employee, staff

**Labour Category**:
The trade a Labour or a Vendor's headcount is booked under (Mason, Carpenter, Helper…). Seeded per Company; seed rows can be disabled, not renamed.
_Avoid_: skill, trade (for this list)

**Supervisor**:
The person on site who looks after a group of Labours. Often a Team Member, but need not sign in.
_Avoid_: foreman, mukadam (that is a Vendor)

**Rate Card**:
A Vendor's shifts, each with a rate per day and an overtime rate per Labour Category.
_Avoid_: price list, tariff

**Other Party**:
Any other counter-party — a customer you raise a sales invoice to, a consultant, a lender.

### Projects and the building

**Project**:
A construction job. Almost everything hangs off a Project. One of the three top-level areas (**Projects**).
_Avoid_: site (for the record), job

**Client**:
Who gave the Company the work on a Project: a name and a mobile on the Project. Not a Party master (yet).
_Avoid_: customer, owner (the Owner is the Company's)

**Contract Details**:
The papers that gave the Company a Project, each optional, in the order they happen: Tender / RFQ reference, Quotation (No. and date), Letter of Award (LOA), Client Order, Agreement, and the Order Value (ADR CM-0010).
_Avoid_: tender details, order details

**Quotation**:
The Company's numbered price offer to the Client, with the date it was issued.
_Avoid_: quote (in UI copy), estimate, bid

**Client Order (PO / WO)**:
The Purchase Order or Work Order the Client issued to the Company, accepting the Quotation. On screens it is "PO / WO". Not the Purchase Order the Company sends a Supplier (PR / PO below).
_Avoid_: purchase order (alone), work order (alone), order

**Order Value**:
The Client Order's value excluding GST, shown only to Team Members with the Project menu's Financial flag.
_Avoid_: contract value, budget (that is the Company's own figure)

**Custom Field**:
A field a Team Member names on one Project ("Site engineer", "Architect") and fills with text. Names already used on other Projects are offered so spelling stays the same.
_Avoid_: extra field, attribute, metadata

**Project Document**:
A file kept on a Project, filed under the paper it is a copy of (Tender, Quotation, LOA, PO / WO, Agreement) or Other. Any type but programs, up to 25 MB.
_Avoid_: attachment (for these), upload

**Phase / Wing / Floor / Unit**:
The building structure inside a Project. A Wing has a type (Commercial, Residential, Bungalow scheme, Plotting scheme…) that drives Floor generation.
_Avoid_: tower, block, flat (use Wing and Unit)

**Amenity / Common Development**:
Locations that are not Units (Swimming Pool, Compound Wall).

**Workspace (area)**:
The cross-project area of the app: HRMS, Central Payment, Central Store, Central Reports, Central Inventory. One of the three top-level areas. Not the tenant — that is the Company.

### Documents

**Daily Worksheet**:
The day's work record per Contractor/Department/location: labour counts, approximate work done, materials consumed, photos.
_Avoid_: DPR (that is the Daily Progress Report built from Worksheets), daily log

**PR / PO / GRN / MT / MR / DN**:
Purchase Request, Purchase Order, Goods Receipt Note, Material Transfer, Material Request (central store), Delivery Note. Spell them out on first use in a screen. This Purchase Order goes from the Company to a Supplier; the one a Client sends the Company is the Client Order.
_Avoid_: requisition, indent, invoice (for a PO)

**Petty Cash**:
A per-custodian cash float with payment, receipt and transfer vouchers that need approval.
_Avoid_: imprest, cash box

**Transaction**:
An entry on a Company bank or cash account: Payment In or Payment Out.
_Avoid_: payment (alone), entry

**Inquiry / Booking**:
A pre-sales lead with a funnel stage; the unit-level sale record.
_Avoid_: enquiry, lead (in UI copy), sale

### Settings and rules

**Sequence ID**:
The document number format per module, e.g. `PR/26-27/P1/00001`. Counters restart each fiscal year (April–March).
_Avoid_: serial number, invoice number

**Back-dated Entry**:
An entry dated in the past. How many days back a Team Member may create or edit one is set per module, can be overridden by Designation, and stops at the Financial Closing Date.
_Avoid_: backdate, past entry

**Plan / Subscription**:
What the Company has bought (projects, Team Members, HRMS seats, storage) and until when. A new Company has no plan, and nothing is limited, until its Owner buys one.
_Avoid_: license, package

### Labour attendance and wages

**Attendance**:
Labour attendance is one status per Labour per day (Present, Half Day, Absent, On Leave, Holiday) in the Project they were on that day. Vendor attendance is a headcount per shift and Labour Category (Full day, Half day, OT hours).
_Avoid_: muster (for the daily entry), check-in (that is HRMS)

**Paid Leave**:
An On Leave day that is paid. The only way a daily-wage Labour is paid for a day off.

**Overtime (OT)**:
Hours beyond the day, at a rate per hour; at most 24 hours a day for a Labour.

**Transfer**:
Moving a Labour to another Project from a date. Their balance goes with them.
_Avoid_: shift (for this), reassign

**Ledger / Balance**:
Every amount owed or paid is an entry that is never edited; a balance is the sum of entries (ADR CM-0004). Positive is owed to the Labour or Vendor; an Advance makes it smaller.
_Avoid_: account (for a Labour's balance)

**Opening Balance**:
What was owed (or advanced, if negative) on the joining date, before the app.

**Wage Payment / Advance**:
Money paid against wages earned (Payment) or ahead of them (Advance), by Cash or Bank.
_Avoid_: salary (that is HRMS), settlement

**Previous Balance / To Pay / Final Amount**:
For a period: owed before it, earned in it (wages + OT), and owed at its end after Advances and Payments.

**Muster Roll**:
The monthly combined attendance and wage register for the Company's own Labours, printed for labour-law inspection.
_Avoid_: attendance sheet

### Money

**Amount**:
Money is integer paise in code and `₹1,00,000.00` (Indian grouping) on screen.
_Avoid_: price (unless it is a rate), cost

## Say / do not say

| Say                  | Do not say (in UI copy)         |
| -------------------- | ------------------------------- |
| Company              | organization, tenant, org, firm |
| Team Member          | user, employee, staff           |
| Owner                | admin, super admin              |
| Designation          | role, position                  |
| Permission Matrix    | roles, ACL                      |
| Labour               | worker, labourer                |
| Vendor (labour gang) | supplier, contractor            |
| Supplier (material)  | vendor                          |
| Project              | site, job                       |
| Wing / Unit          | tower, block, flat              |
| Daily Worksheet      | daily log                       |
| Inquiry              | enquiry, lead                   |
| Sequence ID          | serial number                   |
| Back-dated Entry     | backdate                        |
| Sign in / Sign up    | log in, register                |
| Labours (plural)     | labourers, workers              |
| Rate Card            | price list                      |
| Wage Payment         | salary (for Labours)            |
| Client               | customer                        |
| PO / WO (Client)     | purchase order (alone)          |
| Tender / RFQ ref.    | enquiry ref.                    |

`Workspace` appears in code because `@repo/auth` calls a Company a Workspace. It never appears in UI copy as the tenant; on screens "Workspace" names only the cross-project area.
