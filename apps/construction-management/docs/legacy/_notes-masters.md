# Raw notes — Master Records & Settings (BuildControl)

App shell: 3 bottom tabs — Projects (home, project cards with status filter All/Ongoing/Completed/Not started/On hold, search, "Not checked in / Check In" HRMS banner, pinned projects), Workspace (HRMS[beta], Central payment, Central store, Central Reports, Central Inventory), Master. Top bar: org switcher (multi-company), support chat, notifications. Free-trial banner.

## Team Members (#/employeeList → #/employeeAddUpdate → Select Projects → #/employeeRolePermission)

- FAB options: Add Team Member / Export Team Members (Excel, doubles as import template) / Import Team Members.
- Type: Normal Team Member (works on projects; pick projects + permissions) | HRMS Team Member (HRMS only — attendance, leave, salary; no projects; permissions from HRMS default set `v2/hrms/team-members/default-permissions`).
- Fields: Name* (pick from contacts), Designation* (searchable list, Create New inline), Country code +91 + Mobile*, Email*, Address; Identity: Aadhaar, PAN; Emergency contact number.
- Step 2: Select Projects (checkbox list, select-all, search). Step 3: Role Permissions matrix — rows grouped by category (Project Management 114, Payment & Accounting 30, Materials 46, Master record 92, Central store 20, HRMS 57, Others 1 cells); columns ADD, VIEW, EDIT, DELETE, APPROVE, REJECT, DOWNLOAD, REPORT, VIEW ALL, NOTIFICATION, TRANSFER, FINANCIAL; column select-all; search.
- Record: id, name, address, email, mobile, countryId/Code/Iso, gstNo, designationId, stateID, join_request (0 pending), isHrmsMember, memberType, joinLinkMessage (Play/App Store links). Status chip "Joining Pending" until the invitee installs app and accepts (Users/UpdateJoinRequest). Row actions: Share Invite Link, Edit, Delete.
- Login is OTP on mobile (Users/VerifyLoginWithMobile, iss otp-login); employees can be on multiple companies (companiesList); device management (LoggedInDevices, AssignDevice/RemoveDevice, webLoginScan QR for web login).

## Designations (#/designationList, #/designationRolePermission)

Seeded global list (companyId null) + company-specific; `hasPermission` flag = designation carries a default permission template (Accountant, Admin, Project Manager, Site Engineer, Site Supervisor, Store Keeper). Duplicate action. Seed: Accountant, Admin, Architect, Assistant Project Manager, Chief Engineer, Commercial Manager, Construction Assistant/Coordinator/Engineer/Finance Manager/Foreman/Manager/Project Manager/Superintendent/Supervisor, Crane Operator, Document Controller, Electric Engineer, Field Engineer, Heavy Equipment Operator, HVAC Engineer/Technician, Junior Engineer, Landscaping Consultant, Machine Operator, Marketing Executive/Manager, Owner, Partner, Project Manager, Quality Control, Security Manager, Senior Engineer, Site Engineer, Site Manager, Site Supervisor, Store Keeper, Structural Engineer.

## Departments (#/agencyAddUpdate — "Add Department", name only)

Seeded ~54: Surveying, Departmental Work, Equipment, Tancha Work, Steel Reinforcement Work, Flooring Work, False Ceiling, Pollution Control, Landscaping, Planning, Marketing, Purchase, Account, HVAC, Solar Electric, Solar Water Heater, Corporation Water, Water, Drainage, Soil Backfilling, Excavation, Labour, Miscellaneous Labour, Elevation, Concrete Hacking, Glazing, Silicone, Stone Fixing, Soil Nail & Gunting, Anti Termite, Soil Filling, Diaphragm Wall, Piling Work, Safety, Shuttering, Glass Fixing, Aluminum Section, POP, Trimix Work, Exposed Work, Fire Safety, Fabrication, Carpentry, Cleaning, Acid Wash, Painting, Tiling Work, Plumbing, Electric, Chicken mesh, Water Proofing, Masonry & Plaster, RCC. Departments = trade/work category; used by Contractors (multi-select), Work Types, Worksheets.

## Work Type (#/workTypeAddUpdateRoute): Work Type Name*, Department* (WorkerType/* API; "RCC" seeded). Assign/Unassign items to work type (WorkerType/AssignItem) — ties materials to a work type for worksheet consumption.

## Contractors (#/contractorAddUpdate → #/contractorProjectList)

Contractor Name*, Departments (multi-select, Create New inline), Address, Email, Mobile; Contact Person 1/2 name+number; Tax: GST No, PAN No; Contractor Quotation file upload; then Select Projects (multi) → Save. Record: workTypeId (csv of dept ids), contact persons w/ country, panNumber, gstNumber, invoiceNumber. Import/SampleExport/Report. Contractor quotations list (Contractor/GetAllContractorQuotations).

## Supplier (#/venderaddUpdate — "Add Supplier")

Supplier Name*, Contact Person Name, Email, Mobile, Address; GST, PAN; Supplier Quotation upload; Select Projects. Import/Export/Report. Supplier quotations (Quotation/GetAllSupplierQuotations) → "View Quotations" master tile lists contractor & supplier quotation files.

## Vendors (#/addVendor) — labour-supply vendor (gang/piece-rate contractor supplying workers)

Vendor Name*, Joining Date*, Contact Number, Address; Shifts: Shift 1 (Start Time, End Time, Labour Category*, Rate/day, Overtime/hr, "+ Add Category" for multiple categories per shift), "+ Add New Shift"; Upload Vendor Photo, Other Documents; Add Projects. Vendor attendance is headcount per category per shift (see attendance notes).

## Labours (#/addLabour)

Labour Name*, Labour Id, Wage Type* (Daily wages | Monthly Wages), Weekly Holidays (Sun..Sat toggles), Wage per month* / per day*, Overtime Wage per Hour*, Opening Balance (editable), Joining Date*; Statutory: UAN Number, ESIC Number, Aadhaar Number; Category & Contact: Labour Category (Carpenter, Electrician, Helper, Labour, Mason, Plumber, Skilled, Unskilled, Welder), Supervisor (team member), Contact Number, Gender; Upload Labour Photo, Other Documents; Select Project (current project assignment; transfer history #/labourTransferHistory, multipleLabourTransfer). Import/sample-export; hide.

## Equipments (#/equipmentAddUpdate)

Equipment Name*, Contractor Name* (equipment owner/renter), Equipment Number*, Fuel Type (CNG/Diesel/Petrol), Fuel Measurement Unit (Barrel/Gallon/Kg/Litre/Unit), Contact Person Name/Number, Company Name. Routes suggest owned vs rented forms (#/ownedEquipmentForm, #/rentedEquipmentForm), maintenance log/report, transfer between projects, time shifts, dashboard.

## Company's Bank A/C (#/addBankAccount)

Account Type*: Cash Account | Bank Account (then bank fields). SetAsPrimary. Used as "paid from" in Transactions/Petty cash.

## Materials (#/itemAddUpdate — "Add Material")

Material Name*, Specification, Measurement Unit*, Material Category, Item Type* (Consumable | …), Rate Details (checkbox → unitRate, discountType/Value, gstRate, hsnCode), Minimum Stock (checkbox → min qty to maintain). Record: itemCategoryId, defaultUoMId, unitRate, discountType, discountValue, gstRate, hsnCode, qty. Import/export, multi-delete, single-batch. Seed: "Cement OPC 53" (Civil Work Materials, Bag).

## Material Categories (#/itemCategoryAddUpdate): name only; ParentCombo exists (hierarchy). Seed: Aluminium Section, C P Fittings, Children Play Equipment, Civil Work Materials, Colour & Paints, Construction Chemicals, Construction Tools, Covers Drainage Chamber & Tank, Decorative Landscape Items, Electric Material, Fabrication Material, Fire & Safety, …

## Measurement Units (#/uomAddUpdate): name only; seed: %, Bag, Box, Brass, Bundle, cft, cm, CMT, cucm, cum, Dozen, Drum, Gallon, gram, Hour, inch, kg, KGL, kL, km, Litre, meter, mg, mL, mm, MTS, No, Pack, Pieces, PRS, Quintal, Rft, ROLL, SET, sqft, sqm, sqyd, Ton, Trip, Unit, Yard. Disable.

## Amenities & Common Development (#/developmentTypeAddUpdate "Add Development"): name only; typeId 1 = Common Development (seed "Compound Wall"), 2 = Amenity (seed "Swimming Pool"). AssignItem/UnassignItem → attach to projects/wings for booking brochure.

## Labour Categories (#/labourCategoryAdd): name only.

## Payment Categories (#/addPaymentCategory): name only — PettyCashCategory; seed: Bonus, Canteen, Computer and software, Conveyance, Entertainment, Fuel, Hardware, Housekeeping, Internet, Labour, Labour Payment, Maintenance, Marketing and Advertising, Medical, …; Disable.

## Issue Categories (#/addIssueSnagCat): name only; seed: Client, Communication, Compliance, Design, Environmental, Financial, Management, Operational, Other, Quality, RFI, Safety, Supply, Technical.

## Other Party (#/addOtherParty): Party Name* + Select Project. Customer/misc counter-party for sales invoices & receipts.

## Setting (#/settingsList)

- Manage Sequence IDs (#/numberingScreen): per module (PR, PO, GRN, Material Transfer, Petty Cash, Central Store MR, Delivery Note, Inspection Request, Other Party Sales Invoice). Rule rows: Project (All/Default or specific), Prefix (e.g. "PR/26-27"), Project Id ("PX"), Start Number; preview "PR/26-27/PX/00001". Multiple rules; one default; FAB add.
- Back Dated Entry Control (#/backdatedEntryControl): Default limits — Restrict creating entries older than N days (0 = none) with override mode (No override, hard block for all | allow designations to override); Restrict editing entries older than N days + override. Module Overrides grouped: Procurement (PR, PO, GRN, Material Transfer, Central Store MR, Delivery Note), Site (Daily Worksheet, Equipment Usage, Issues & Snags, Inspection Request, Material Testing Report), Inventory (Current Inventory, Material Consumed, Missing Material), Accounts (Petty Cash, Transactions), Labour & Vendor (Labour Attendance, Vendor Attendance), Sales (Inquiry, Inquiry Follow-up, Booking), HRMS (Attendance, Leave, Holiday); each "Global, Create 0d · Edit 0d" with + to override; "Advanced, financial closing date".
- Currency settings: company currency (INR default, symbol, format ₹1,00,000.00), list of world currencies. isNonIndianCompany flag.

## Lookups

- Payment modes: Cash (account_type 1), Cheque (number "Cheque No"), Online (Reference Number), UPI (Reference Number) — account_type 2 = bank.
- Paid-to types: Other Party(1), Contractor(2), Supplier(3), Labour(5), Vendor(6).
- Fuel types, fuel units, Material types ("test").
