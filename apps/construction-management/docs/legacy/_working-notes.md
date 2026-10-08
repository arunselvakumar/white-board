# Working notes — BuildControl discovery (raw, not a deliverable)

Source: https://web.buildcontrol.in (Flutter web, CanvasKit) → API https://prodbuild.buildcontrol.in/api (Laravel, JWT via otp-login; Firebase RTDB/FCM for chat & push).

## Menu / permission map (from RolePermissions/DefaultMenuPermission/GetAllV3)

Flags (unambiguous letters, from the API field names): C=create R=read U=update D=delete A=approve J=reject P=print(download) N=notification V=viewAll T=transfer O=report F=financial E=export I=import

- Project Management: Project#4[CRUDF], Create Wing#6[CRUD], Daily Worksheet#19[CRUDAPNO], Project Drawings#21[CRUDN], Testing Reports#44[CRUD], Task#53[CRUDAJPNVOF], Issues and snags#51[CRUDAJPNVO], Inspection Request#54[CRUDAJPNO], Reports#20[RP], Attendance#57[CRUDPO], Labour#58[CRUDPTOF], Vendor#59[CRUDPOF], Booking Details#41[CRUDPNO], Inquiry#8[CRUDPNVO], Gallery#55[R], Dashboard#65[R], Progress Report#73[CRDNF], Create Location#74[CRUD], Equipment Usage#56[CRUDAPNOF]
- Payment & Accounting: Central payment#75[R], Payments#47[R], Transactions#63[CRUDAJPNO], Parties#76[CRUDAJEPNO], Petty Cash#52[CRUDAJPNVO]
- Materials: Manage Materials#49[R], Current Inventory#16[CRUDPNO], Purchase Request#17[CRUDAJPNO], Purchase Order#18[CRUDAJPNO], Material Received#30[CRUDPNVOF], Material Transfer#50[CRUDAJPNO], Central Inventory#96[RP]
- Master records: Master Records#14[R], Team Members#12[CRUD], Departments#43[CRUD], Contractors#31[CRUD], Supplier#9[CRUD], Vendors#60[CRUDF], Equipments#22[CRUDPNTOF], Setting#86[CRUD], Material Categories#27[CRUD], Materials#28[CRUDF], Company’s Bank A/C#61[CRUDPO], Add Measurement Unit#25[CRUD], Designations#26[CRUD], View Quotations#29[R], Amenities#42[CRUD], Common Development#45[CRUD], Work Type#46[CRUD], Labours#69[CRUDF], Labour Categories#70[CRUD], Payment Categories#71[CRUD], Issue Categories#72[CRUD], Other Party#64[CRUD]
- Central store: Central store#66[CRUD], Central Store (MR)#67[CRUDAPNO], Delivery Note#68[CRUDAPNO]
- HRMS: HRMS#78[R], Holiday Management#79[CRUDN], Attendance Management#80[CRUDAJENVO], Leave Structure#87[CRUD], Leave Management#81[CRUDAJNVO], Salary Management#82[CRUDAJENVOF], Salary Structure#83[CRUD], Employee Management#84[CRUF], HRMS Settings#85[CRUD], Shift Management#95[CRUDAEINV]
- Others: Central Reports#77[R]

(An earlier version of this legend used lowercase first letters, so `r` stood for read, reject and report at once. The module specs were written against that version; where a spec says the flag string is ambiguous, this table is the answer.)

Per-user permission row also carries: backdatedCreateDays, backdatedEditDays, financialClosingDate.

## Project-level menu (MenuPermission/MenuList, parent = Project#4)

Dashboard, Wings, Create Location, Project Drawings, Testing Report, Equipment Usage, Worksheet, Issues and snags, Manage Materials{Central Store (MR), Current Inventory, Goods Received, Material Transfer, Purchase Order, Purchase Request}, Reports, Payments{Petty Cash, Transactions}, Inquiry, Booking, Progress Report, Task, Inspection Request, Gallery, Attendance{Labour, Vendor}

## Numbering (ModulePrefix/GetModuleList)

Sequence IDs: PurchaseRequest, PurchaseOrder, GoodsReceipt (Material Received GRN), MaterialTransfer, PettyCash, MaterialRequest (Central Store MR), DeliveryNote, InspectionRequest, OtherPartySalesInvoice. Company config: Back Dated Entry Control. Other: Currency settings.

## Payment modules (Module/Combo) — paidTo types

Contractor's Payments(type 2), Suppliers Payments(3), Labour Payment(5), Vendor Payment(6), Other Party(1), Transaction(1,4,8), Petty Cash(1..7)

## Subscription

BASIC: ₹14,000/6mo, ₹21,000/12mo; 5 employees, 10 projects, 20GB. Add-ons ₹299/mo each: team member, 30GB storage, project. Razorpay + CCAvenue. Free trial.

## Endpoint inventory (strings found in main.dart.js; concatenated paths missing)

BankAccount/{GetAll,SetAsPrimary}; Booking/{AddArea,AddUnavailableUnit,Tutorial,UnitImport}; Charges/Month; Chat/{EmployeeList,Notification}; Contact/GetAll; Contractor/{Combo,GetAll,GetAllContractorQuotation(s),Import,Report,SampleExport}; ContractorPayment/{AddPayment,GetAll}; Countries/Combo; Dashboard/PermissionsList; DeliveryNote/{Comment,MarkAsDelivered}; Department/{Combo,GetAll}; DepartmentWork/Combo; Designation/{Combo,Duplicate,GetAll}; DevelopmentType/{AssignItem,GetAll,UnassignItem}; Drawing/Combo; EmployeeUserPermissions/EmployeeUserPermissionUpdate; Employees/{AssignDevice,Combo,ComboList,GetAll,RefreshTokens,RemoveDevice,Report,ResponseQrCode,SendEmailUpdateOtp,TrashedComboList,UpdateCompanyCurrency,UpdateDeviceToken,UpdateLoginTimezone,UpdateProfile,VerifyEmailUpdateOtp}; Equipments/Combo; File/Images; FuelType/Combo; FuelUnit/Combo; FunnelStatus/Reorder; GoodsReceipt/GetAll; GroupChat/GroupList; Inquiry/GetAll; Inquiry2/{FollowUp,Import,SampleExport}; InspectionRequest/{BulkSetApprovalStatus,Remark,SetApprovalStatus}; Inventory/{GetAvailableStock,Import,Notification,SampleExport,Update}; Invoice/Receipt; IssueCategory/{Combo,Disable,GetAll}; IssueSnag/{BulkMarkAsResolved,Comment,MarkAsResolved}; Issuer/Requested; Item/{Combo,GetAll}; ItemCategory/{Disable,GetAll,Import,ItemCombo,ParentCombo,SampleExport}; LabourCategory/Combo; MaterialConsumed/AddMultiple; MaterialRequest/{Comment,GetAvailableStore}; MaterialTestingReport/GetAll; MaterialTransfer/{Comment,MarkAsDelivered}; MaterialType/Combo; MenuPermission/{AssignMenu,GetAll,MenuList}; MissingMaterial/AddMultiple; Module/Combo; ModulePrefix/GetModuleList; Notification/Destroy; OtherExpenses/{BulkSetApprovalStatus,Remark,SetApprovalStatus}; OtherParty/Invoice; PaidToType/Combo; Party/{AddPayment,InvoiceSettled,InvoiceSettled/BulkSetApprovalStatus,InvoiceSettled/Reject,InvoiceSettled/Remark,InvoiceSettled/SetApprovalStatus}; PaymentIntegration/CCAvenue*; PaymentModeType/Combo; PettyCash/{BulkSetApprovalStatus,Remark,SetApprovalStatus}; PettyCashCategory/{Combo,Disable,GetAll}; Phase/{Combo,CreateWingByPhase}; Photo/Document; Plan/{GetAll,GetById}; Project/{Combo,GetAll,Store}; PurchaseOrder/SetApprovalStatus; PurchaseRequest/{BulkSetApprovalStatus,MarkAsOrdered,Remark,SetApprovalStatus}; Quotation/{GetAllSupplierQuotation(s),GetById}; Razorpay/{CreateOrder,Verify}; RolePermissions/DefaultMenuPermission/GetAll{,V2,V3}; Roles/Combo; Store/{Combo,GetAllCombine,GetByEmployeeId,Project}; Subscription/*; Supervisor/Combo; Supplier/{GetAll,Import,Report,SampleExport}; SupplierPayment/AddPayment; Tag/Combo; TermsnCondition/Combo; TestingItemDrawing/Combo; Transaction/{BulkSetApprovalStatus,Import,Remark,SampleExport,SetApprovalStatus}; Uom/{Combo,Disable,GetAll}; Users/{ChangePassword,CheckResetPasswordRequestValid,LoggedInDevices,Login,Logout,Register,ResetPassword,UpdateJoinRequest,UpdateVerifyEmail,VerifyLoginWithMobile}; Wings/GetAll; WorkItem/{ApprovalSetting,ColumnSettings,Duplicate,GetSettings,Remark,SaveFormConfig,SaveSettings,SetStatus,V2}; WorkSheetImages/Upload; WorkSheets/UpdateWorksheetCompletStatus; WorkerType/{AssignItem,Combo,GetAll,GetNotSelected,UnassignItem}
Lowercase v2-style: employees/{combo,export,import}; equipments/combo; home/{organization,organization/delete-otp,profile,profile/devices,profile/reveal,projects,projects/pinned}; hrms/attendance/{approvals,check-in,check-out,manual,missed-checkout,monthly-summary,report/monthly,team-members,team-today,today}; hrms/branches{,/my-fences,/project-sites}; hrms/dashboard; hrms/employees/{salary,shift-assignments}; hrms/holidays{,/import,/sample}; hrms/leave-balances{,/accruals,/accrue,/initialize,/initialize-by-structure,/team}; hrms/leave-structures{,/assignments}; hrms/leave-types{,/accrual-options}; hrms/leaves{,/approvals,/report/team,/team}; hrms/rotation-templates{,/active}; hrms/salaries{,/calculate-advance,/calculate-bulk,/report/team}; hrms/salary-structures; hrms/settings; hrms/shift-templates{,/active}; items/{exports,imports,multi-delete,not-selected,single-batch}; labour/{combo,hide,import,sample-export}; projects/{by-employee,combo}; reports/central_inventory_stock_ledger/generate; settings/backdated-entry{,/financial-closing,/global}; subscription/{checkout,confirm,plans,transactions}; tasks/{bulk-delete,gantt,import}; v2/company-billing-addresses; v2/equipment-usage/{duplicate,settings}; v2/hrms/team-members/default-permissions; v2/petty-cash/vouchers/export; v2/projects; v2/purchase-orders{,/bulk-approval,/mark-as-ordered,/remarks}; v2/support-chat/{conversations,unread-count}

## Org/user facts

Company: id 21769 "NA"; employee 23889 isCompanyOwner. localStorage keys: token, companyId, employeeId, companiesList, selectedCompanyModel, projectMenuOrderIds, isNonIndianCompany.
