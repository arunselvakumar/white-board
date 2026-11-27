# CM-0055 — Employees replace Labours and Site Engineers

- Status: accepted (2026-11-27, the owner asked for it)
- Date: 2026-11-27
- Supersedes: the Labour and Site Engineer pages and records of [CM-0036](CM-0036-one-staff-group-and-site-engineers.md), [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md), [CM-0041](CM-0041-labour-site-engineers-come-from-the-project.md) and [CM-0053](CM-0053-site-engineers-sign-in-with-mobile.md); the "for show, not saved" Role assignment card of [CM-0054](CM-0054-hr-default-roles.md) §3 (for Labour and Site Engineer)
- Amends: [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) (a Labour's Projects and transfers are now an Employee's), [CM-0035](CM-0035-labour-reports-to-and-labour-categories-in-masters.md) (Reports To), [CM-0042](CM-0042-project-resources-become-teams.md) (the Teams sections), [CM-0043](CM-0043-site-check-in.md) (who checks in)
- Relates to: [CM-0030](CM-0030-users-and-roles.md) (Roles and sign-in), [CM-0050](CM-0050-role-department.md) (a Role is under a Department), [CM-0052](CM-0052-staff-forms-photo-first-no-projects.md) (staff forms open with the photo)

## Context

Human Resources → Staff has a page each for **Labour** and **Site Engineer**. They are two records for one idea, a person the Company employs on its Projects, kept in two contexts (`construction_labour.labours`, `construction_masters.supervisors` plus a sign-in membership), with two forms, two APIs and two sets of rules. Since CM-0054 both are default Roles under the Human Resources Department.

The owner asked for one **Employees** page in their place. Adding a Labour becomes adding an Employee with Department **Human Resources** and Role **Labour**; adding a Site Engineer, the same with Role **Site Engineer**. The form holds the fields of both. The app is not in production, so the two tables, and everything that hangs off them, are dropped: the only data is test data.

## Questions the owner answered

| Question                                                                                                                                            | Answer                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| What happens to what hangs off a Labour or a Site Engineer (attendance, overtime, Check-Ins, wages and dues, transfers, documents, Teams, reports)? | **It moves onto Employees.** It keeps working, keyed on the Employee. The old rows go with the tables.                               |
| How does an Employee sign in?                                                                                                                       | **Optional for any Employee.** The admin turns it on; what they may do comes from their Role (the Labour Role gives no access).      |
| Who gets attendance and wages?                                                                                                                      | **Every Employee.** The wage fields are on every Employee's form, and every active Employee on a Project is on its attendance sheet. |

## Decision

### 1. One record: the Employee

`construction_labour.employees` (Prisma `ConstructionLabourEmployee`) holds every field a Labour or a Site Engineer had:

| Card (form order) | Fields                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Photo             | photo (CM-0052: the form opens with it); on Edit, **Photo & documents** also holds Other Documents, as Labours had        |
| Basic             | name\*, mobile, email, gender, date of birth, father's name, blood group, Employee Id, joining date\*                     |
| Role assignment   | Department\*, Role\*                                                                                                      |
| Details           | address, emergency contact, Aadhaar, PAN, UAN, ESIC                                                                       |
| Work              | qualification, experience (years), specialisation, Labour Category, Reports To                                            |
| Wage              | wage type\*, wage per day or per month\*, overtime wage per hour\*, working hours a day, weekly holidays, opening balance |
| Bank              | account holder, account number, IFSC, bank name (shown and saved only with Financial)                                     |
| Sign-in           | "Can sign in" (§4)                                                                                                        |

- Aadhaar, PAN and the bank account number are encrypted as before; the last four characters are kept for masking.
- The **Employee Id** (`employee_code`, was the Labour Id and the Site Engineer's employee code) is unique among live Employees of a Company.
- **Reports To** is another live Employee, never themselves, never a loop (CM-0035's rule, now across all Employees).
- A Labour's Site Engineers (CM-0041: "the Site Engineers on their Projects") are no longer worked out or shown. Reports To says who someone answers to.
- Active / Inactive, delete (refused while they have attendance or payments), transfers between Projects, Excel import and export stay as Labours had them.

### 2. Department and Role decide what an Employee is

- **Role is required and saved** on the Employee (`role_id`): a live Role of the Company. The **Department** is the Role's (CM-0050), read from it, never stored on the Employee, so the two cannot disagree.
- On the form, **Department** (required) lists the Company's live Departments; **Role** (required) lists the live Roles under the chosen Department. A Company that has Roles under no Department also sees **No department** in the first list. Picking another Department clears the Role.
- Add Employee starts on Human Resources → Labour, the most common case.
- 400 `EMPLOYEE_ROLE_NOT_FOUND` for a Role that is not live in the Company, shown on the Role field.
- Deleting a Role stays refused while it is in use (CM-0030 `ROLE_IN_USE`): live Employees on it now count, as well as Team Members.
- The Roles and Departments lists are readable with Employees Read (`masters.labours`) as well as Role Management or Departments Read, so whoever adds Employees can choose them.
- The Role gives access only to an Employee who signs in (§4). It does not change the form, the wage or the attendance: every Employee is handled the same way.
- The Employees list shows the Role and Department of each Employee and can be filtered by them.

### 3. Every Employee has a wage and is on the attendance sheet

Everything that was a Labour's is now an Employee's, with the same rules:

- **Projects and transfers**: `employee_projects`, `employee_transfers`, set from a Project's **Teams** and by Transfer.
- **Attendance and overtime**: `employee_attendance`, `employee_overtime`; one live day per Employee per Project per date. Every active Employee on a Project is on its attendance sheet, priced from their wage as on the day.
- **Check-In** (CM-0043): an Employee's Check In and Check Out write their attendance day, whatever their Role. A Site Engineer's check-ins were a log only; they now count as attendance. Person kinds are `employee` and `vendor`.
- **Ledger, wage payments, balances and dues**: party type `employee` (was `labour`); ledger source types `employee` and `employee_attendance` (were `labour` and `labour_attendance`).
- **Other Documents**: owner `employee`.
- **Paid To / Received From** labels (finance): counterparty kind `employee` (was `labour`).

### 4. Signing in is optional for any Employee

- The **Sign-in** card has **Can sign in**, off by default. Turned on, it shows CM-0053's rules: "Use mobile number as login", ticked and read-only, and a **Password** (required, at least 8 characters; they change it the first time). A mobile is then required (400 `MOBILE_REQUIRED`).
- Saving makes a membership (Team Member) for the Employee on the **Employee's Role**, marked `team_members.employee` and left off Office Staff, as a Site Engineer's was. When someone already signs in with that mobile, they get a Join Request instead (CM-0030 §3).
- The membership follows the Employee: a new Role, name, mobile or email on the Employee is saved on it too (a new mobile moves the sign-in, CM-0053 §3, with its 409 `MOBILE_IN_USE` / `MOBILE_LOCKED`); the Employee's Projects are its Projects, so they see what they work on. Set password is on the Employee's page.
- Turning **Can sign in** off on Edit, or deleting the Employee, removes the membership. Inactive Employees keep their sign-in but cannot be picked for new work.
- What a signed-in Employee may do comes only from their Role's Permission Matrix. The Labour Role has no cells (CM-0054), so a Labour who signs in can do nothing until an admin gives the Role access.

### 5. Screens and addresses

- Human Resources → **Staff** lists **Employees, Vendor, Office Staff, Role Management**, in that order. `/app/staff` opens Employees.
- Employees live at `/app/staff/employees` (list, with Department and Role filters), `/new` and `/<id>`: the Employee page, with **Details** (the form; Edit is this tab, as for Labours), **Attendance** (CM-0051) and **Activity** tabs. `/app/staff/labours/…` and `/app/staff/site-engineers/…` are removed with **no redirects** (CM-0036's choice; the app is not in production).
- A Project's Employee attendance sheet is at `/app/projects/<id>/attendance/employees` (was `…/attendance/labour`); each row shows the Employee's Role. Check-In captures at `…/attendance/check-in/employee/<id>`; its find screen and log group people as Employees and Vendors, and an Employee's entry shows their Role.
- A Project's **Teams** page has one **Employees** section (paged, Add Employees with a first day, Remove with a last day, each row showing the Role) in place of the Site Engineers and Labours sections. Team Members stays, without Employees' sign-ins.
- Screen text that named the person says **Employee** ("Add Employee", "1 Employee", "Employee" columns in sheets, reports and Excel). Words for the kind of work stay: **Labour Category**, the labour-supply **Vendor**, "labour shortage" on a hindrance, labour cost. Report titles about the Company's own people say Employee (Employee Attendance, Employee Payments, Employee Month, Central Employee Attendance); Muster Roll stays. Where a report or sheet had a Site Engineers column, it shows the Employee's **Role**.
- The Permission Matrix keeps its keys, so no Role changes: `masters.labours` (Human Resources) and `labour.labour` (Project) are labelled **Employees**. Site Engineers were already gated by `masters.labours`.

### 6. API and code

- `/api/construction/labour/employees/…` replaces `/api/construction/labour/labours/…`, with the same operations (list, options, add, read, update, delete, transfer, import, import template, export, attendance, activity) plus set password. `/api/construction/masters/site-engineers/…` and `/api/construction/masters/supervisors/…` are removed.
- Request and response fields that named the person say `employee` (`employeeId`, `employeeCode`, `employees`); OpenAPI models are `…Employee…`. Routes and modules named for the work keep their word (`/labour/attendance`, `/labour/payments`, `/labour/balances`, the `construction_labour` schema and the `labour` context), as CM-0032 and CM-0042 kept words that a user never reads.
- In code, the person is `Employee` (`src/labour/domain/employee.ts`, `EmployeeHandlers`, …); `Labour` and `Supervisor` as record types are gone.

### 7. The data (migrations)

Four migrations, one per schema (ADR-0030), each writing one audit event per Company with the counts:

1. `construction_finance_employees`: the finance postings of Labours' wage payments go; counterparty kind `labour` becomes `employee` (the saved name stays).
2. `construction_labour_employees`: Labours, their Projects, transfers, attendance, overtime, ledger entries, wage payments and documents go, and every Check-In of a Labour or Site Engineer; the Employee tables are created. Vendors and their records stay.
3. `construction_masters_drop_supervisors`: the Site Engineer table goes.
4. `construction_organization_employee_sign_ins`: `team_members.site_engineer` becomes `team_members.employee`. The sign-ins Site Engineers had are kept and show on **Office Staff** as ordinary members on the Role they had; an admin can delete them there.

Photos and files of deleted Labours stay in storage with nothing pointing at them, like any deleted record's.

## Consequences

- Employees start empty in every Company. Add them again under Human Resources → Staff → Employees.
- The word **Employee** now names this record. HRMS's page keeps its name, **Employee Management** (a Team Member's HRMS salary set-up); `CONTEXT.md` separates the two.
- A Company that renamed nothing sees the same default Roles; Labour and Site Engineer now count the Employees on them.
- Site Engineers' check-ins now make attendance days and wages, which they did not before.
- Making the form differ by Role (for example hiding wages for an office Role), or letting Office Staff and Employees become one record, are later decisions.

## Considered options

- **Keep the two tables and add a third view over them:** keeps old data, but the owner asked for one record and for the tables to go, and the data is test data.
- **Store the Department on the Employee as well as the Role:** what the owner said picks the Department first, but a Role moved to another Department would leave Employees disagreeing with their Role. The Department is read from the Role.
- **Sign-in only on the Site Engineer Role:** rejected by the owner; any Employee may sign in.
- **Wages and attendance only on the Labour Role:** rejected by the owner; one record, one behaviour.
- **Rename the `construction_labour` schema, the `labour` context and the `/labour/attendance` routes:** a large change across five contexts for words a user never reads. Not done.
