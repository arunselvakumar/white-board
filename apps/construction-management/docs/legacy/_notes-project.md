# Raw notes — Project modules (BuildControl)

## Project (#/projectadd, 2 steps: Details → Resources)

Project Name*, Start Date, Expected Completion, Project Address, Project Status* (Ongoing/Completed/Not started/On hold → status 1..4), Project Type*, Project Logo upload. Step 2 Resources = assign Team Members, Contractors, Suppliers, Vendors, Contacts. Record (v2/projects/{id}): name, startDate, endDate, address, projectTypeId, status, logoImage, budgetValue, useProjectLogoInReport, noOfPhase, employeeId[], contractorId[], supplierId[], contactId[], vendorDetailId[].
Project card: initials avatar, name, address, dates, progress %, kebab (pin, edit, hide modules). Project options menu: View project details, Backup (project data export), Hide/Show Modules (per-project module visibility; projectMenuOrderIds = tile ordering).
home/projects (v2) returns organization block, permissions summary, attendance state (check-in banner w/ geo_fence_required), status_counts.

## Project Home tiles (17)

Dashboard, Create Wing, Project Drawings, Testing Reports, Equipment Usage, Daily Worksheet, Manage Materials, Issues and snags, Reports, Payments, Inquiry, Booking Details, Progress Report, Task, Inspection Request, Gallery, Attendance. (Create Location menu exists for non-building projects.) Project chat icon top-right (group chat per project; Firebase RTDB).

## Project Dashboard (#/chartsDashboard) — "Charts & Performance Overview"

Filter duration (default last 1 year). KPI tiles: Material Approvals, Payment Approvals, Pending Issues & Snags, Pending Inspections. Sections (toggle/reorder via "Manage Dashboard": Task, Payments, Daily Work, Equipment Usage, Materials, Issue And Snag, Attendance, Inspection Request, Booking, Inquiry):

- Task: Project Progress % gauge (start/end date), Value Earned By Task (task value vs earned value), Filtered By Status (Not Started/In Progress/Delayed/Completed counts).
- Payments: Payment In & Out & Balance + trend chart; Due Payments table (party, total invoice, paid, due; export); Module Wise Payment pie (Contractor/Vendor/Supplier/Labour/Other Expenses).
- Daily Work: Total Labours Availability trend; Contractor-wise Labour (contractor, department, skilled, unskilled).
- Equipment Usage: Top Equipment by Work Hours; Category-wise (Owned vs Rented).
- Materials: Material Summary (total materials, in stock, low stock, out of stock, total PO, total PO value); Month-wise PO Value; Stock Register Report (movement & balance per material).
- Issues & Snags: status charts. Attendance: Labour Attendance present/absent, Labours Present At Site day-wise, Labour Payment Status (balance per labour); Vendor's Labour Attendance (present/half/OT), Vendor-wise Labour Allocation, Vendor Payment Status.
- Inspection Request: total/approved/pending/rejected + Success Rate gauge. Booking: Booking by Status (units booked vs available), Booking Report. Inquiry: funnel.

## Create Wing (#/winglist) — project structure

Phases (Phase 1..n; Phase/CreateWingByPhase) → Wings. Wing: Wing Type* (Commercial, Residential, Bungalow scheme, Residential & Commercial, Plotting scheme, Institutional, Individual Unit, Industrial), Wing Name*, then type-specific floor config e.g. Commercial Floors* count, Start Number*, Number Of Units Per Floor*, Basement Parking Floors → "Continue to Units": generated floor list (Terrace Floor, Commercial Floor 5..1, Ground Floor, Basement Floor 2..1) each with unit chips (editable names, remove, + Add), floor rename, counts (Floors 9, Units 24). Wing chart view (#/wingChartRoute). Units are the sales inventory for Booking and the location target for worksheets/issues/inspections.
Location types for site entries: Wing (→ Floor multi-select → Unit) | Amenities | Common Developments.

## Project Drawings (#/projectplanalbum)

Albums (seed: Architect, Electrical, Plumbing, Structural Drawing; add Album Name*) → files (upload drawings, image/PDF viewer, Drawing/Combo used by Inspection "TestingItemDrawing"). Delete album. Notification permission.

## Testing Reports (#/testingReport)

Testing Items per project (seed: Rcc cube, Steel, Cement, Bricks; add Testing Material Name*) → reports: Name*, Report Date*, Upload Test Report file. Search by report name. MaterialTestingReport/GetAll.

## Equipment Usage (#/EquipmentSheetList)

List: search sheet no/name/date, filters Sheet Date, Filled By. FAB → Select Equipment Type: Company Owned | Rented → Select Equipment (project equipment list, + add).
Add Equipment (Company Owned): Equipment Name*, Equipment Number*, Purchase Year, Fuel Type, Unit; Utilization Basis: Hourly | Km | Trip; Working Time Method* (Time Shifts — engineer logs start/end per shift, hours auto-calculated | other); Target & Performance: Target (hrs/day), Min Utilization %, Expected Fuel Efficiency (L/hr) (alerts when burn rate exceeds); Equipment Photo. Rented: adds contractor/owner, rate, rented hours.
Usage sheet fields (v2/equipment-usage/settings toggles): Operator, Supervisor, Location Type, Approx Work Done, Rented hour, Add Fuel Consumption, Remarks, Upload File, Material consumption, Meter Readings, Breakdown Hours, Approval. Duplicate sheet; transfer equipment between projects; maintenance log; equipment dashboard & reports (usage, maintenance, transfer).

## Daily Worksheet (#/worksheetList → Add Worksheet)

List: search sheet no/name/date; filters Sheet Date, Filled By, Department; FAB. Form (date stepper at top): Location Details (Location Type → Wing/Floor(s)/Unit | Amenity | Common Development); Basic Details: Contractor*, Department*, Work Type, Skilled Labours (count), Unskilled Labours (count), Work Shift* (Shift1/2/3), Approx Work Done (value + unit select); Material Consumption: Bulk Select Materials or rows (Material, Used Qty, +); Other Details: Remark (500), Work Photos. Save / Save & Add New.
Settings (gear "Setting for the work item form"; WorkItem/GetSettings, ColumnSettings): toggle sections Location Type, Work Type, Approx Work Done, Labour Details, Material consumption, Remark, Work Images; reorder sections (Location, Basic, Material Consumption, Other). Approval setting (WorkItem/ApprovalSetting approvalStatus bool) → worksheet approval flow (approve/reject, remarks, SetStatus, UpdateWorksheetCompletStatus). Daily worksheet report; backup (#/dailyWorkBackupRoute). Worksheet material consumption decrements project inventory (MaterialConsumed).

## HRMS data (v2/hrms/*)

settings: gps_requirement (0 Disabled/…), attendance_grace_period 15 min, leave_approval_levels, auto_salary_calculation, salary_calculation_day, working_hours_per_day 8, half_day_hours 4, carry_forward_enabled, carry_forward_max_days, leave_accrual_enabled, working_days [1..5].
leave-types seed: Casual Leave 12 paid; Compensatory Off 0 paid; Loss of Pay 0 unpaid; Maternity 182 paid (15.17/mo); Privilege Leave 15 paid 1.25/mo carry-forward; Sick 7 paid 0.58/mo. Fields: yearly_limit, is_paid, requires_approval, approval_levels, max_consecutive_days, carry_forward, max_carry_forward, accrual_mode, accrual_frequency(monthly), accrual_day, allow_advance_use, credit_per_period, is_active.
leave-balances: per employee/leave_type/year: total_allocated, annual_entitlement, used, remaining, carried_forward, last_accrual_period. Initialize / initialize-by-structure / accrue.
attendance/today: entries[], total_hours, is_holiday, has_active_entry, status Absent(3)… check-in/check-out with geo-fence (branches/my-fences, project-sites), manual entry, missed-checkout, approvals, team-today, monthly-summary, monthly report.
salary-structures (templates), salaries (calculate-advance, calculate-bulk, team report), shift-templates, rotation-templates, holidays (import/sample), employees/salary, employees/shift-assignments.
HRMS default permissions for HRMS-only members: HRMS read; Holiday read; Attendance create/read/notification; Leave create/read/notification; Salary read.

## Subscription (v2/subscription/plans)

Plans with includes (Project, Team Member, Storage GB, HRMS Team Member) & terms; add-ons priced per unit per month (HRMS Team Member ₹30/mo, Project, Team Member, Storage) "charged per unit per month — every month of a new plan, or the days left on a running one". currentUsage tracked/enforced per grant. Checkout (Razorpay / CCAvenue), transactions history, billing addresses (GST invoice).

## Profile (v2/home/profile)

header (display_name, role_label, company), account (email verified, mobile, address, aadhaar masked, personal PAN masked), company (name, mobile, email, gstin, company_pan, address, logo), devices (logged-in devices), reveal (OTP to reveal masked ids), organization delete (OTP), change password, timezone, currency.

## Back-dated entry (v2/settings/backdated-entry)

global {create.days, override_designation_ids; edit…}; modules[] {module_key, group, menu_id, entry_date_field (PurchaseRequestDate, PurchaseOrderDate, GRNDate…), mode global|custom, create, edit}; financial-closing date.
