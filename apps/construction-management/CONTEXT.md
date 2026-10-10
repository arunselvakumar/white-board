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

**Phase**:
A named stage of a Project with Wings ("Phase 1", "Phase 2"); Wings are grouped under it. A Project's first Wing brings "Phase 1".
_Avoid_: stage, sector

**Wing Type**:
One of eight: Commercial, Residential, Bungalow scheme, Residential & Commercial, Plotting scheme, Institutional, Individual Unit, Industrial. It decides the configuration Add Wing asks for.

**Continue to Units**:
The Add Wing step that turns the configuration (floors, start number, units per floor, basements, terrace) into floors and units the Team Member then adjusts in the editor before Save.

**Floor kinds**:
Terrace Floor, typed floors (numbered: "Commercial Floor 5"), Ground Floor, Basement Floor N, a scheme's one row of plots or bungalows, and named floors (stilt, podium, mezzanine) added in the editor.
_Avoid_: level, storey (in UI copy)

**Wing chart**:
A Wing's floors × units grid, top floor first.

**Location**:
A named place on a non-building Project (road, pipeline, interiors): "Chainage 0+000 – 2+500", "Culvert C3", with an optional description, in the Team Member's order. Not a Unit, an Amenity or an office location.
_Avoid_: site, area, zone

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

### HRMS (staff attendance, leave and salary)

**HRMS**:
The Workspace area for the Company's own salaried staff: check-in attendance, shifts, holidays, leave and monthly salary ([`modules/10`](./docs/modules/10-hrms.md)). Separate from Labour attendance and wages; the two registers never mix. Spelt in capitals.
_Avoid_: HR, payroll (for the whole area), Hrms

**Employee**:
A Team Member as HRMS pays them: a monthly salary, attendance on their own phone. The word names only the Employees page (Employee Management, each member's salary set-up); everywhere else say Team Member or member. An Employee is a User; a Labour is a record that never signs in, and nobody is both (ADR CM-0012 §18).
_Avoid_: staff, worker, labour (for an Employee); employee (for a Labour)

**HRMS Team Member**:
A Team Member whose Member Type is HRMS: attendance, leave and salary only, no Projects. Counts against the plan's HRMS seats; the Projects home sends them to Workspace → HRMS.
_Avoid_: HRMS user, HRMS employee

**Branch**:
An office the Company's people check in at: a name and a fence (a point and a radius of 25–5,000 m). Members can be linked to Branches; a member linked to none may check in at any Branch.
_Avoid_: office (for the record), location, geofence (alone)

**Site fence**:
The check-in fence on a Project's site, one per Project, for the Team Members assigned to that Project. Branches and Site fences are listed together on Branches & Sites.
_Avoid_: project branch, site branch, geofence (alone)

**GPS requirement**:
How HRMS Settings treats the location at check-in: **Disabled** (no location needed), **Record only** (captured if the phone gives one; Outside fence goes to approvals) or **Required** (Outside fence is refused).
_Avoid_: GPS mode, location policy

**Check in / Check out**:
Starting and ending one attendance entry on the member's own phone. A day may have several entries; at most one is open. Buttons say "Check In" and "Check Out"; the nouns are check-in and check-out.
_Avoid_: punch in / out, clock in / out, log in / out, mark attendance

**Missed checkout**:
A check-out added later, with a reason, to an entry left open on an earlier day. It waits in Attendance Approvals.
_Avoid_: forgotten checkout, regularisation

**Back-dated attendance**:
A whole past day (check-in and check-out times) added later with a reason; on screens "Add Back-dated Attendance". It passes the Back-dated Entry check and waits in Attendance Approvals.
_Avoid_: manual attendance, regularisation, backdate

**Outside fence**:
A check-in farther from every fence that applies to the member than its radius (plus the phone's accuracy, at most 50 m). Refused when GPS is Required; accepted and sent for approval when it is Record only.
_Avoid_: out of range, geofence violation

**Day status**:
What one member's day counts as: **Present**, **Half Day**, **Absent**, **On Leave**, **Holiday** or **Week Off** (grid letters P, HD, A, L, H, WO). Holiday wins over Week Off, which wins over On Leave, which wins over hours worked. **Late** is a flag beside the status, never a status. Not the Labour Attendance statuses, though the words match.
_Avoid_: leave (for On Leave), off, weekend, holiday (for a Week Off)

**Shift**:
A template of the working day: start and end, working hours, half-day hours, grace period and whether overtime is paid. A member with no Shift works the HRMS Settings day, shown as "Standard". Shift Management assigns Shifts and Rotations from a date until changed.
_Avoid_: timing, schedule (for the template); shift (for a Labour Transfer)

**Rotation**:
A repeating cycle of Shifts and Week Offs: Week (7 slots from Monday), Month (31 slots from day 1) or Custom Cycle (2–12 slots from the assignment's start).
_Avoid_: roster, rota, shift pattern

**Leave type**:
A kind of leave: Casual, Sick, Privilege, Maternity, Compensatory Off, Loss of Pay (seeded) or the Company's own. Paid or unpaid, a yearly limit, how it is credited, carry forward and whether it needs approval.
_Avoid_: leave category, leave code

**Leave structure**:
A named bundle of Leave types with each one's yearly entitlement, assigned to members from a date. A member with none gets every active Leave type at its yearly limit.
_Avoid_: leave policy, leave plan, leave template

**Leave balance**:
What a member has left of one Leave type in a leave year (calendar year, or financial year labelled "26-27"). It is the sum of ledger entries (initial, accrual, carry forward, adjustment, reserved, released, used, restored), never a stored number (ADR CM-0004); pending requests count as taken.
_Avoid_: leave quota, leaves left, leave count

**Accrual**:
Leave credited month by month on the accrual day, up to the entitlement, when "Credit leave every month" is on in HRMS Settings. Upfront types (Casual) are credited in full when the balance is initialised instead.
_Avoid_: leave credit run, earned leave (for the process)

**Carry forward**:
Unused days of a Leave type brought into the next leave year, capped by the type's maximum and the Company's, posted once.
_Avoid_: rollover, encashment (not built)

**Leave request**:
An application for leave days, each Full, Morning or Afternoon. States: **Pending**, **Approved**, **Rejected**, **Withdrawn** (taken back while pending), **Cancellation requested** (approved, cancellation asked for) and **Cancelled**.
_Avoid_: leave application (in UI copy), leave ticket, revoked

**Salary structure**:
A template of how a monthly salary is made up: Components, PF, ESI, PT, other deductions, and whether absent days and unpaid leave are deducted. Members get one in Employees with their base salary.
_Avoid_: CTC template, pay grade, salary template

**Component**:
One earnings line of a Salary structure (Basic, HRA, Special Allowance…): a fixed monthly amount or a percentage of the member's base salary, marked when it counts for PF wage.
_Avoid_: head, pay head, allowance (for every line)

**Balancing component**:
The one Component that takes the base salary less the others, so the Components always add up to the base. A member's override never changes it.
_Avoid_: residual, plug, remainder

**Salary run**:
Working out a month's Salary slips for every Configured Team Member, from attendance and leave: by hand (Calculate Salary on Team Salary) or automatically on the salary day. Running it again replaces Calculated slips and keeps Approved and Paid ones.
_Avoid_: payroll, payroll run, process salary

**Salary slip**:
One member's month in figures: day counts, earnings, deductions, employer contributions and net payable. **Calculated** → **Approved** → **Paid**. A Salary advance has a slip of its own.
_Avoid_: pay record, salary entry, payslip (for the record)

**Payslip**:
The PDF of an Approved or Paid Salary slip, stored once and never changed. Members download their own from My Salary.
_Avoid_: salary slip (for the PDF), pay stub, salary certificate

**Salary advance**:
Salary paid ahead of the month ("Pay Advance"), with a number of instalments; later Salary slips recover it automatically and show "Advance recovered". Not the Labour Advance on the Labour ledger.
_Avoid_: loan, salary loan

**Month lock**:
Approving a member's Salary slip closes their month: attendance entries, leave requests and leave decisions dated in it are refused (`MONTH_LOCKED`), and corrections wait for the next month.
_Avoid_: freeze, period close, payroll lock

**PF / EPF / EPS / EDLI**:
Provident Fund: 12% of the PF wage from the member and 12% from the Company. The Company's 12% splits into EPS (Employees' Pension Scheme: 8.33% of the PF wage up to ₹15,000) and EPF (Employees' Provident Fund, A/c 1: the rest). EDLI (Employees' Deposit Linked Insurance) is reported on the EPF wage up to ₹15,000. Rates and ceilings are dated tables (ADR CM-0008).
_Avoid_: provident fund (after the first use), pension (for EPS)

**ESI**:
Employees' State Insurance: 0.75% of gross earnings from the member and 3.25% from the Company, for a member whose gross was within ₹21,000 at the start of the contribution period (April–September, October–March). The member's ESI number is the **IP number** (Insured Person).
_Avoid_: ESIC (that is the Corporation), medical insurance, mediclaim

**PT**:
Professional Tax: a monthly state tax by salary slab for the PT state in HRMS Settings (some states differ for women), or a flat amount set on the Salary structure.
_Avoid_: profession tax, P.Tax

**UAN**:
Universal Account Number: the member's 12-digit PF number, entered in Employees.
_Avoid_: PF number, PF account number

**ECR**:
Electronic Challan cum Return: the EPFO's monthly PF upload, exported with the ESI contribution file from an approved month on Team Salary (Export → PF ECR). Members without a UAN, or without an IP number for ESI, are listed in the Excel instead of the upload.
_Avoid_: PF challan (that is the payment), PF return file

### Money

**Amount**:
Money is integer paise in code and `₹1,00,000.00` (Indian grouping) on screen.
_Avoid_: price (unless it is a rate), cost

## Say / do not say

| Say                   | Do not say (in UI copy)         |
| --------------------- | ------------------------------- |
| Company               | organization, tenant, org, firm |
| Team Member           | user, employee, staff           |
| Owner                 | admin, super admin              |
| Designation           | role, position                  |
| Permission Matrix     | roles, ACL                      |
| Labour                | worker, labourer                |
| Vendor (labour gang)  | supplier, contractor            |
| Supplier (material)   | vendor                          |
| Project               | site, job                       |
| Wing / Unit           | tower, block, flat              |
| Daily Worksheet       | daily log                       |
| Inquiry               | enquiry, lead                   |
| Sequence ID           | serial number                   |
| Back-dated Entry      | backdate                        |
| Sign in / Sign up     | log in, register                |
| Labours (plural)      | labourers, workers              |
| Rate Card             | price list                      |
| Wage Payment          | salary (for Labours)            |
| Client                | customer                        |
| PO / WO (Client)      | purchase order (alone)          |
| Tender / RFQ ref.     | enquiry ref.                    |
| HRMS                  | HR, payroll (for the area)      |
| Check In / Check Out  | punch in, clock in, log in      |
| Back-dated Attendance | regularisation, manual entry    |
| Rotation              | roster, rota                    |
| Leave structure       | leave policy                    |
| Leave balance         | leave quota                     |
| Salary run            | payroll                         |
| Payslip               | pay stub, salary certificate    |
| Salary advance        | loan                            |
| Month lock            | freeze, period close            |
| IP number (ESI)       | ESIC number                     |

`Workspace` appears in code because `@repo/auth` calls a Company a Workspace. It never appears in UI copy as the tenant; on screens "Workspace" names only the cross-project area.
