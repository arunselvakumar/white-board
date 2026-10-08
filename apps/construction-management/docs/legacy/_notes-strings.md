# Raw notes — UI strings mined from main.dart.js (grouped by screen)

## Purchase Order (form)

Purchase Order Date*, Purchase Request Number (optional; selecting loads PR items), Supplier*, Expected Delivery Date*, Location Type (+wing/floor/unit), Materials (Add Materials → Purchase Order Material sheet: Material Category, Material*, Available Stock / Balanced estimated qty info, Quantity*, Unit, Unit Rate*, Discount + Type ₹|%, GST Rate %, Sub Total / Discount / GST / Total Amount, Remark 500), Charges: Additional Charges, Deduction Amount, Total; Billing Address* (company billing addresses, v2/company-billing-addresses); Contact Details: Supplier POC Name/Number, Site POC Name/Number; Terms & Conditions: Payment Terms (Days), Select Terms & Conditions (TermsnCondition master, #/termsAndConditionAdd); Additional: "Delivery Address is other than Project Address" (Enter Delivery Address), Remark 500, Attachment. Save | Save & Approve. PO approval (SetApprovalStatus), bulk-approval mode, mark-as-ordered, remarks; PO list filters Date/Status/Supplier; PO PDF.
PR statuses: Pending, Approved, Rejected, Ordered, Partially Ordered, Excess Ordered. PR filter: Date (This Week/Last Week/Last 15 Days/This Month/Last Month/Custom), Status, Material Category, Material, Created By, Location Type.

## GRN — Material Received (Goods Receipt Note)

GR Date*, Supplier*, Inventory Date*, Linked PO (PO Number) → items with Ordered Qty / Received Qty, Unit rate, Amount, Delivery Challan No, GRN/DC No, Invoice No, Invoice Date, Invoice Amount, Remark, Store/Project, SUPPLIERS DETAILS, DELIVERY DETAILS; hide/show field settings (#/materialReceivedHideShowFieldScreen). GRN feeds inventory and supplier payable (Supplier payment "Select GRN/DC No", "Total GRN Value"). GRN PDF.

## Current Inventory (#/inventoryList)

Per project stock list: Estimated Qty, Stock Qty, min-stock alert On/off ("Start/Stop minimum stock to maintain Alert"); options: Consume Material (record material consumed on site; multiple), Missing Materials (add multiple), Purchase Request (select materials → PR), Purchase Order (select materials → PO), Received Materials, Transfer Materials (project→project), Import Inventory Stock (Excel), Export Sample Excel, Export Data. History entries: Delivered to Project, TRN. To / TRN. From, From Central store, Consumed by, Received by; edit/delete entry. Stock Register report: per material Opening Balance, Received, Transfer In, Transfer Out, Consumed, Missing, Closing Balance; ledger types Consumed/TransferredOut/Missing/Received/TransferredIn/Issued.

## Material Transfer (#/materialTransferAddUpdate)

Transfer Date*, Store | Project (source/destination), Add Transferred Material (Material, Quantity, MU, Remarks; Available Stock shown), Receiver Name, Upload Documents/Attachments, Comment thread (Comment By/On, Files). Status Pending → Delivered (MarkAsDelivered). List columns: Transfer Number, Transfer Date, Transfer Type, Store, Project, Status, Sent By, Received By, Remark. Delete with confirm.

## Central Store (Workspace) — stores, MR, Delivery Note

Central Store listing (Add Store: name, address; assign projects "Please select minimum one project"); store inventory. Material Request (MR, #/centralStoreMRRequestAdd): Request Date*, Request To (Store)*, Contractor, Department, Location Type/Wing/Location, Receiver Name, Remark, materials (Ask Qty), attachments; Request ID (MR numbering); status Requested / Partially Delivered / Delivered; comments; options Edit, Export Material Request (PDF), Delete. Delivery Note (#/deliveryFormAdd, numbering MDN00001): created from MR ("Create Delivery Note"), Delivered Qty per material vs Requested/Pending Qty, Delivered To, Delivered On, Linked Material Request / Linked Delivery Note, Mark As Delivered, comments; Deliveries Report; Delivery note report.

## Equipment (transfer, usage detail)

Equipment Transfer: Transfer to Project | Transfer to Warehouse ("Warehouse / Off system", "Another Project"), Transfer Date*, Destination Project*, Location Name*, Remark, "Effect on Tracking"; statuses Unassigned / In maintenance; Transfer Report columns (Equipment Name, Number, Purchase Year, Transfer Date, Location Before, Transfer To Project, Latest Location, Remarks, Entry By). Rented equipment: Hire Details (Vendor, Hire basis Daily|Monthly|Trip|Hourly, Rate, Chargeable, Hire amount). Usage sheet detail: Equipment No, Operator, Supervisor, Utilisation (Usage hrs / Distance / Trips), Idle, Breakdown hours, Approx work done, Fuel Consume, Meter Reading (Both / Time Shifts), Target hrs/day | days/month | Km/day | trips/day, Unit Rate, Hire Cost, Consumed Material, Images, Work Item, Department, Location, Contractor, Shift, Remark.

## Daily worksheet detail/report columns

Date, Department, Contractor, Skilled Workers, UnSkilled Workers, LocationType, Location, App. Work Done, TaskName, Shift, Work Images, Consumed Material, Labour Details.

## Issues & Snags (#/issuesSnagAddUpdate)

Issue Date*, Department, Issue Assign To (team member), Due Date, Issue Details (text), Priority (colour-coded High/Medium/Low: F90B0B/FF9900/FCF200), Category (Issue Categories master), Location Type / Location, Images, Attachment. Detail: Created By, Assign to, Progress / Add Update (comments with images), Solved On, status Pending | Delayed | Solved; Mark As Solved / Save & Mark As Solved; bulk mark resolved; Issue & Snag report, Assignee-wise issue chart.

## Inspection Request (#/inspectionAddNew, numbering)

Inspection Date*, Inspection Time, Department, Contractor, Request Assign To (inspector), Description of work (Work Details), Location Type/Location, Upload Drawings and site photographs; detail: Request No, Status Pending for approval | Approved | Rejected, Created On/By, Approved By/On, Rejected By/For/On, Observations (Observations By/On, Inspection Images, files), Remarks list, Reject Reason; bulk approve/reject; Inspection Request Report.

## Task (#/taskAddEdit, #/taskGantt)

Task Name*, Description, Assign To (multi), Start Date, Due Date, Priority (High/Medium/Low), Location Type/Wing/Locations, Department, Contractor, Tags (Tag master), Total work (qty + unit) & Total Price → Completed Work / Completed Price (earned value), Baseline Start/End/Duration/Variance, Actual Start/End, Duration, Progress %, Status (Not Started/In Progress/Delayed/Completed), Task No., Sub-tasks (Add Sub-Task, Paste Task below), Update Task Progress, Mark As Completed, bulk-delete, import (Excel), Gantt view, Task Report / Task Progress Report (by location, percent). Task activity feed.

## Progress Report (#/progressReport)

Daily Progress Report (generated PDF per date / Filled By): Organisation, Project, Address, Report Filled By, Date, Total Skilled/Unskilled/Total Labour, Equipment Details, worksheets; "Include images in report"; Task Progress Report (duration, location, task, progress %); report generation is async ("You will receive a popup once the report is ready"); Create new / View Reports.

## Inquiry (sales CRM, #/inquiryaddUpdate, Inquiry2/*)

Inquiry Date, Name, Mobile, Email, Address, Occupation, Interest Type (Warm/Cold/Hot), Interested In (wing/unit type), Lead Source (per-project master: Add/Edit/Delete Lead Source), Follow-up Date & Time, Remarks, Status / Inquiry Stage (FunnelStatus — configurable, reorderable, #/funnelStatusSettings), Closing Type (Converted → unit / Lost → Lost reason), Assignee, Lead Owner, images; Follow-up history log; Inquiry Tasks (#/inquiryTaskAddUpdate); import/sample export; Inquiry Report (filters Interest Type, Lead Source, Status, Closing Type, Lost Reason). Dashboard: Total/Open/Converted/Lost/Conv. Rate/Overdue, Lead source wise performance, Funnel stage breakdown, Sales team performance, Call Activity (Today/Yesterday/This Week/This Month/All Time).

## Booking (#/bookingaddupdate)

Booking Type* (Booked | On Hold | Available), Booking Date, Name, Wing, Unit, Referred By Name / Contact No, Remarks, Upload Booking Form, images; Booking/AddArea (unit areas), AddUnavailableUnit, UnitImport (Excel), Tutorial; Booking Report (Booking Date, Name, Wing, Unit No, Referred by, Remarks); dashboard Booking By Status (units booked vs available).

## Petty Cash (#/pettyCashAccounts, #/pettyCashVoucherAddRoute)

Petty cash accounts per user (officeModulePettyCashUserList) with balance; vouchers: Cash In | Cash Out, Date, Voucher Number (numbering), Category (Payment Categories), Account Name, Paid To / Received From (party types), Paid For, Amount, Description, receipt image; Status Pending for approval | Approved | Rejected; Approve/Reject (single & multiple), Export Receipts (ZIP via notification), Internal Petty Cash Transfer (between accounts), Petty Cash Report (voucher-wise: Date, Voucher No, Category, Account, Paid To/Received from, Credit, Debit, Status, Description, View Voucher, Total), Closing Balance; v2 vouchers export.

## Transactions (#/transactionsList, Transaction/*)

Entry: Date, Transaction Type (Payment In | Payment Out), Bank/Cash Account, Category, Payment Mode (Cash/Cheque/Online/UPI + ref no), Payment Module (Contractor/Supplier/Labour/Vendor/Other Party/Transaction), Paid To / Received From (Party), Project/Store, Amount, Description, attachment; approval (Pending/Approved/Rejected, bulk, Reject Reason), Transaction Transfer (between accounts), Import/SampleExport; Ledger Report (Opening Balance, Total Credit, Total Debit, Closing Balance; filters Paid To, Bank Account, Category, Type, Mode, Module, Status); Transaction Report.

## Party payments (Payments tile)

- Contractor payments: invoices (Created Date, Invoice Date, Contractor, Department, Invoice Number, Invoice Amount, TDS Amount, Paid Amount, Balance, Remarks), Add Payment (ContractorPayment/AddPayment), View Payments / View Receipts, Opening Balance; Contractor Centralized Payment Report. Contractor quotations.
- Supplier payments: Supplier Name, Invoice Date, Invoice Number, Invoice Amount, Paid Amount, Balance, Due Date, GR/DC No (select GRN/DC → Total GRN Value), Store/Project; Add Payment; receipts; Centralized Supplier Payment Report.
- Labour payments: per labour To Pay / Advance / Previous Balance / Final Amount, Monthly|Weekly|Custom period, Project-wise labour attendance; All Labour Payment Report; Mark Paid Leave.
- Vendor payments: Full Day/Half Day/OT Hours/Total Pay/Opening Balance/Advance Paid/Closing Balance per vendor.
- Other Expenses (OtherExpenses/*): misc expenses with approval.
- Other Party / Parties (#/officePartiesScreen): Party Balance; Add Purchase Invoice (from the party) | Add Sales Invoice (to the party): Party Name*, Project*, Invoice Date*, Due Date, Invoice Number*, Invoice Amount*, Remarks; Payment In / Payment Out entries; Invoice Settled flow with approval (Party/InvoiceSettled/*); Sales invoice numbering (OtherPartySalesInvoice).

## Attendance — Labour (project)

Mark Attendance: Attendance Date, Supervisor filter, Select Labours (multi), Present / Half Day / Absent / On Leave / Holiday, Overtime (Add Overtime: Labour Category, Wages/hr (OT Wages/hr), Labour, OT hrs ≤24; "Add Different OT Hour Labour"), Shift; Multiple Labour Attendance; Transfer Multiple Labour; Add/Edit Supervisor; Active/Inactive Labour; Mark Paid Leave; All Labour Attendance Report, All Labour Payment Report, Month-wise labour report; Import/Export labour list.

## Attendance — Vendor

Per vendor per date per labour category: Full Day count, Half Day count, OT Hours, Shift Worked, Total Pay (rate/day & OT/hr from vendor shifts), Opening Balance, Advance Paid, Closing Balance; Vendor OT attendance; Month-wise vendor attendance; Central Vendor Attendance Report (filters Vendor, Labour Category, dates).

## Project Reports (tile) / Backup

Report set: Daily Work, Purchase Order, Material received, Contractor payment, Supplier payment, Rented Equipment Usage, Company Owned Equipment Usage, Inquiries, Bookings, Issue & Snag, Task Report, Petty Cash, Inspection Request, Material Transfer, Other Expense, Transaction, Drawings Data, Testing Report Data, Project All Media. Backup: Data Backup / Media Backup with date range, Generate Backup (async, emailed/OTP-protected), "Only Current Project Report". Reports render PDF/Excel (Page x of y, Organisation, Project, Address, Duration), Download as PDF / Excel.

## HRMS (Workspace)

Menu: Dashboard (Today's Snapshot: Present Today/On Leave/Employees; Present/Absent Breakdown; Day-Wise Trend; Pending Approvals; Team Leaves), Attendance (My Attendance: Check In/Check Out with geo-fence, Open Attendance, Add Missed Checkout, Add Backdated Attendance; Team Attendance; Attendance Approvals), Leave (My Leaves: Apply Leave (Leave Type, From Date, To Date, day session Morning/Afternoon/Full, reason), Leave Details, credit history, Request Cancellation (manager approval, "balance updated after request approved"); Leave Approvals: Pending/Approved/Rejected/Cancel Requests with Approval Remarks / Rejection Reason / Cancellation Reason), Salary (My Salary; Team Salary: Calculate Salary (all team members, month), Pay Advance Salary (employee), Mark Salaries as Paid, approve; salary slip: Attendance Details (Working Days, Present, Absent, Paid Leave, Unpaid, Half Days, Payable Days, Week Off, Holidays, Overtime Hrs, Total Hrs), Earnings (Base Salary, components), Gross Salary, Statutory Deductions (PF, ESI, Professional Tax), Absent Deduction, Other Deductions, Net Payable), Configuration (Holiday Management: Add Holiday — Holiday Name, Date, Holiday Type National/Festival/Company, Optional Holiday flag, Description; Import Holidays via .xlsx sample; Leave Structure (leave types & assignment); Salary Structure (templates: Template Name, Description, Salary Components e.g. Basic, Special Allowance; PF Applicable + PF %, cap at statutory wage ceiling, PF Wage Ceiling; ESI Applicable + ESI %; Professional Tax Applicable; Other Deductions); Shift Template (Shift Name*, Start/End Time, Working Days, Working Hours, Half Day Hours, Grace Period minutes, Overtime Allowed, Active) & Rotation templates; Shift Management (assign shifts); Employee Management (per-employee salary config: Configured/Not Set, Save All); HRMS Settings; Branches/geo-fences (Add Branch, Project site geo-fence, Edit Geo-fence, remove).

## Chat & Support

Chat home tabs: Member Chat (1:1), Group Chat (My Groups, Start New Group Chat, readers), Support Chat / Support Tickets (BuildControl team; close request). Push notifications (FCM), notification list (Notification/Destroy), per-module notification permission.

## Profile / Privacy

My Profile (photo ≤10MB, email, mobile, address, Aadhaar, PAN, emergency contact), Company (GST No, Company PAN), Change Password, Linked Devices, Privacy & Consent (App Improvement, Push Notifications, Data Preferences), Legal (Privacy Policy, Terms of Service, Data Retention Policy), Download My Data (export request), Delete My Account (reason, type DELETE), Organisation switch, Logout, "MAINTENANCE IN PROGRESS" screen, app version check (CompanyLogo/GetAppVersion).

## Petty cash voucher form

Voucher types: Payment Voucher (Cash Out: Paid To) | Receipt Voucher (Cash In: Received From) | Petty Cash Transfer (Transfer To another petty-cash account/Company account). Fields: Voucher Date*, Project, Party (Select Party Name; Add New Party → contractor/supplier/team member/vendor/other party), Amount Detail (Enter Amount; Payment/Receipt/Transfer Mode: Cash | Bank | Company; Reference Number; Add New Account), Payment Category*, Description, Voucher Photo/Document attachment; Save | Save & Approve.

## Party payment form (Contractor / Supplier / Labour / Vendor)

Invoice Details (invoice no/date/amount; Settle Invoice) + Payment Detail: Payment Date*, Payment Mode (Cash | Bank → Reference Number / Cheque No, Payment Mode Date), Paid Amount*, TDS Amount (contractor), Payment Category, Paid By (name), Remarks, Upload Documents. Labour: "today's wage amount", Advance.

## HRMS extra

Check-in: GPS requirement setting (Disabled/…), "Outside Fence" blocks check-in, "Office location is not configured", active check-in guard. Branches & Project Sites: New Office Branch (Branch Name, Set Branch Location, Set Geo-Fence radius), Project site geo-fence (Site label, radius), Edit/Remove Fence. Apply Leave: Employee (for managers), Leave Type*, From Date, To Date, Day Breakdown (per-day Full/Morning/Afternoon), Total leave, Reason (min 10 chars), live leave balance. Rotation template: Rotation Name*, Rotation Type (Week | Month | Custom Cycle (Days per cycle 2–12)), Cycle Shifts (select a shift per cycle), Active; shift assignment "Until changed". Salary template: Deduct for Absent Days, Deduct for Unpaid Leave, PT Amount per month, Add/Edit Component.

## Central store form

Create Store: Store Name*, Store Address, Assignments: Select Projects* (projects this store serves), Team Members (assign store to team member), Suppliers. Store Project List; store transfer list (Transfer Date, Number, Type, Project, Status, Sent By, Received By).

## Inventory item actions

Per material: Consume Material (Consume Date, Quantity, Location, Remarks), Missing Material (Missing Date, Quantity, Remarks), Record a goods receipt, Raise a purchase request, Transfer Material, Update/Add Estimation Quantity, history entries (Received / Transfer In / Transfer Out / Consumed / Missing / Delivered).

## Worksheet approval

Worksheet Approval Settings: approve worksheet on/off; statuses Pending | Partially Approved | Approved.

## Subscription checkout

Choose Your Plan (by country; "Company owner only"), Choose Duration, Add-Ons (minimums), Order Summary (Rate, Amount, Sub Total, Plan Charge, Last Plan Discount, Coupon Discount, Total), Buyer Details (billing address, GST), Review & Pay, Proceed to Payment (Razorpay/CCAvenue), Your Subscription (Auto renew, Upgrade Plan — "new plan should be same or higher", Extend current plan, Only Add-Ons), Plan Expired state, subscription history/transactions.

## Organization / onboarding

Register (mobile OTP), Create company, "Your Organizations / Other Organizations", New Join Request (Accept/Reject by admin; invitee approves joining), Switch Organization, Add Organization; roles seed: Administrator, Builder, Site Engineer. Seeded bank/cash accounts: "Company's Cash Account" (type 1), "Company's Bank Account" (type 2), isPrimary, openingBalance.

## Inquiry add form (quick)

Inquiry Date, Name*, Mobile, Address, Occupation, Interested In, Remarks, Visiting Card photo; Inquiry Type (Warm/Cold…); statuses Open/Converted/Lost; Reopen.

## Project create

Step 1 Details: Project Name*, Start Date, Expected Completion, Project Address, Project Status*, Project Type*, Financials: Budget Value, Project Logo. Step 2 Resource Assignment. Project types / statuses from master (Project/Combo).
