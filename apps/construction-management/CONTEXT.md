# Construction Management

The rebuild of the legacy BuildControl product for Indian builders and contractors. Use these words on screens, in code comments, in tests, and in API descriptions. Derived from the glossary in [`docs/00-overview.md`](./docs/00-overview.md); module specs under [`docs/modules/`](./docs/modules/) define each term in detail.

## Language

### People and tenancy

**Company**:
The tenant. A builder or contractor firm that buys one subscription and invites a team. A User may belong to several Companies and switches between them. In code and in `@repo/auth` a Company is a **Workspace** (Better Auth organization); the id is `workspaceId` (ADR CM-0001, CM-0002).
_Avoid_: organization, tenant, org, firm, account (in UI copy)

**Active Company**:
The Company the current Session is working in. Every API call is scoped to it; it is never sent in a request body.
_Avoid_: current org, selected tenant

**User**:
A person who can sign in, by mobile OTP or by email and password. A User exists once, across all their Companies.
_Avoid_: account, login, customer

**Team Member**:
A User's membership and employee record inside one Company: name, Designation, mobile, email, ids, Member Type, projects, and the Permission Matrix.
_Avoid_: user, employee, staff (in UI copy); "employee" only where the legacy screen name is quoted

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
_Avoid_: subcontractor (unless that is the legacy label)

**Supplier**:
A party that sells material. Linked to POs and GRNs. Not a User.
_Avoid_: vendor (for material sellers)

**Vendor**:
A labour-supply party (a gang or mukadam). Attendance is counted per labour category per shift and priced from the Vendor's rate card. Not a User.
_Avoid_: supplier, contractor (for gangs)

**Labour**:
An individual worker on the Company's own roll, with a daily or monthly wage and an OT rate. A record, not a User.
_Avoid_: worker, employee, staff

**Other Party**:
Any other counter-party — a customer you raise a sales invoice to, a consultant, a lender.

### Projects and the building

**Project**:
A construction job. Almost everything hangs off a Project. One of the three top-level areas (**Projects**).
_Avoid_: site (for the record), job

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
Purchase Request, Purchase Order, Goods Receipt Note, Material Transfer, Material Request (central store), Delivery Note. Spell them out on first use in a screen.
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

**Plan / Subscription / Trial**:
What the Company has bought (projects, Team Members, HRMS seats, storage) and until when. A new Company starts on a 14-day Trial.
_Avoid_: license, package

### Money

**Amount**:
Money is integer paise in code and `₹1,00,000.00` (Indian grouping) on screen.
_Avoid_: price (unless it is a rate), cost

## Say / do not say

| Say                  | Do not say (in UI copy)                 |
| -------------------- | --------------------------------------- |
| Company              | organization, tenant, org, firm         |
| Team Member          | user, employee, staff                   |
| Owner                | admin, super admin                      |
| Designation          | role, position                          |
| Permission Matrix    | roles, ACL                              |
| Labour               | worker, labourer                        |
| Vendor (labour gang) | supplier, contractor                    |
| Supplier (material)  | vendor                                  |
| Project              | site, job                               |
| Wing / Unit          | tower, block, flat                      |
| Daily Worksheet      | daily log                               |
| Inquiry              | enquiry, lead                           |
| Sequence ID          | serial number                           |
| Back-dated Entry     | backdate                                |
| Sign in / Sign up    | log in, register (except legacy quotes) |

`Workspace` appears in code because `@repo/auth` calls a Company a Workspace. It never appears in UI copy as the tenant; on screens "Workspace" names only the cross-project area.
