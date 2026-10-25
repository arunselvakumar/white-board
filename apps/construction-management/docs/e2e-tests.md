# End-to-end tests

Construction Management's Playwright tests (ADR [CM-0031](adr/CM-0031-end-to-end-tests.md)), module by module. **@pr** tests run on every pull request and merge to `main` (at most 40); the nightly run takes every test. @mobile tests also run on a phone viewport.

```sh
docker compose up -d                               # Postgres and Mailpit
bun run --cwd apps/construction-management test:e2e:build   # production build into .next-e2e
bun run --cwd apps/construction-management test:e2e:pr      # the @pr tests
bun run --cwd apps/construction-management test:e2e         # every test
```

99 tests, 30 tagged @pr, 4 also on a phone.

## Sign-in, sign-up and onboarding

| Test                                                                                                         | Tags            | Spec                      |
| ------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------- |
| should land on Projects with the new Company active, when a new User signs up by email and creates a Company | **@pr**         | `sign-up.spec.ts`         |
| should neither reveal nor replace the account, when someone signs up with an email that already has one      |                 | `sign-up.spec.ts`         |
| should open Create Company, when a signed-in User with no Company opens Choose Company                       |                 | `sign-up.spec.ts`         |
| should refuse a wrong password and then sign in, when the Owner signs in by email                            | **@pr**         | `sign-in.spec.ts`         |
| should return to the page that was asked for, when a signed-out visitor opens a deep link and signs in       | **@pr**         | `sign-in.spec.ts`         |
| should ask for a new password first, when a member signs in by mobile with the password the Owner set        | **@pr** @mobile | `sign-in.spec.ts`         |
| should keep a member on Change password, when they try to open the app before choosing their own password    |                 | `sign-in.spec.ts`         |
| should end the session, when the Owner signs out from the account menu                                       | **@pr**         | `sign-out.spec.ts`        |
| should sign in with the new password, when the Owner resets it with the emailed code                         |                 | `forgot-password.spec.ts` |
| should show only the chosen Company's Projects, when a User of two Companies picks one and then switches     | **@pr**         | `choose-company.spec.ts`  |
| should show the impersonation banner on every page and end on Stop, when support staff sign in as a customer | **@pr**         | `sign-in-as.spec.ts`      |

## Staff, Roles and Designations

| Test                                                                                                                                       | Tags    | Spec                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------- |
| should show the invitee as Active, when the Owner invites by email and they join from the emailed link                                     | **@pr** | `staff.spec.ts`        |
| should add an Active staff member with their salary on the chosen Project and Role, when the Owner adds staff with a mobile and a password |         | `staff.spec.ts`        |
| should list the invitee under Joining Pending with a shareable link, when the invitation is not accepted yet                               |         | `staff.spec.ts`        |
| should show the invitation as Declined, when the invitee declines it                                                                       |         | `staff.spec.ts`        |
| should take away the Company's Projects, when the Owner deletes a member                                                                   |         | `staff.spec.ts`        |
| should find a staff member by name, when the Owner searches Staff                                                                          |         | `staff.spec.ts`        |
| should make the member choose a new password, when the Owner sets one for them                                                             |         | `staff.spec.ts`        |
| should show a view-only member just their Project, without Add buttons or admin menus, when their Role only grants Project View            | **@pr** | `roles.spec.ts`        |
| should give a member new menus, when the Owner adds a grant to their Role                                                                  | **@pr** | `roles.spec.ts`        |
| should add a Role with the ticked permissions, when the Owner duplicates a seed Role and edits the copy                                    |         | `roles.spec.ts`        |
| should remove an unused custom Role, when the Owner deletes it                                                                             |         | `roles.spec.ts`        |
| should offer the new Designation when adding staff, when the Owner adds one                                                                |         | `designations.spec.ts` |

## Company, Settings, subscription and profile

| Test                                                                                                         | Tags    | Spec                      |
| ------------------------------------------------------------------------------------------------------------ | ------- | ------------------------- |
| should activate the plan and list a tax invoice, when the Owner pays for Basic                               | **@pr** | `subscription.spec.ts`    |
| should refuse a new Project with the plan's message, when the Company has used every Project its plan allows | **@pr** | `plan-limits.spec.ts`     |
| should keep the GSTIN, PAN, address and logo, when the Owner saves the Company profile                       |         | `settings.spec.ts`        |
| should preview the next number with the new prefix, when the Owner adds a Sequence ID rule                   |         | `settings.spec.ts`        |
| should show the plan-ended banner and refuse new Projects, when the Company's plan has ended                 |         | `settings.spec.ts`        |
| should refuse a member's site diary dated before the back-dated limit, when the Owner sets one               |         | `settings.spec.ts`        |
| should keep the new name, contact and photo, when a User edits their profile                                 |         | `profile.spec.ts`         |
| should show the Aadhaar masked and reveal it only with the emailed code, when a User adds theirs             |         | `profile.spec.ts`         |
| should schedule the Company for deletion and cancel it again, when the Owner confirms with the emailed code  |         | `company-account.spec.ts` |
| should make the member the Owner, when the Owner transfers ownership with the emailed code                   |         | `company-account.spec.ts` |
| should email the Owner a link to the full backup, when they generate one with the emailed code               |         | `company-account.spec.ts` |
| should draw the app dark, when the User picked the dark theme                                                |         | `theme.spec.ts`           |

## Masters

| Test                                                                                             | Tags | Spec                   |
| ------------------------------------------------------------------------------------------------ | ---- | ---------------------- |
| should offer the new Labour Category and Supervisor on a Labour, when the Owner adds them        |      | `masters.spec.ts`      |
| should list the Supplier with its GSTIN and the Material with its unit, when the Owner adds them |      | `masters.spec.ts`      |
| should list the new entry, when the Owner adds one to Departments                                |      | `master-lists.spec.ts` |
| should list the new entry, when the Owner adds one to Material Categories                        |      | `master-lists.spec.ts` |
| should list the new entry, when the Owner adds one to Measurement Units                          |      | `master-lists.spec.ts` |
| should list the new entry, when the Owner adds one to Tags                                       |      | `master-lists.spec.ts` |
| should list the new entry, when the Owner adds one to Amenities                                  |      | `master-lists.spec.ts` |
| should list the new entry, when the Owner adds one to Common Developments                        |      | `master-lists.spec.ts` |

## Labour and vendors

| Test                                                                                                | Tags            | Spec                     |
| --------------------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| should owe the day's wage, when the Owner adds a Labour and marks them Present                      | **@pr** @mobile | `labour.spec.ts`         |
| should owe half the wage, when a Labour is marked Half Day                                          |                 | `labour.spec.ts`         |
| should clear the balance, when the Owner pays a Labour what they are owed                           | **@pr**         | `labour.spec.ts`         |
| should move the Labour and keep the history, when the Owner transfers them to another Project       |                 | `labour-records.spec.ts` |
| should add every row, when the Owner imports Labours from the filled-in sample sheet                |                 | `labour-records.spec.ts` |
| should leave an inactive Labour off the attendance sheet, when the Owner deactivates them           |                 | `labour-records.spec.ts` |
| should owe the Vendor heads × rate, when the Owner adds a Vendor with a rate card and records a day |                 | `vendors.spec.ts`        |

## HRMS

| Test                                                                                                   | Tags            | Spec                      |
| ------------------------------------------------------------------------------------------------------ | --------------- | ------------------------- |
| should show the member as in today, when they check in from their phone                                | **@pr** @mobile | `hrms-attendance.spec.ts` |
| should send the check-in to Approvals as Outside Fence, when a member checks in far from their branch  |                 | `hrms-attendance.spec.ts` |
| should take the days off the balance, when a member applies for leave and the Owner approves it        | **@pr**         | `hrms-leave.spec.ts`      |
| should leave the balance as it was, when the Owner rejects a leave request                             |                 | `hrms-leave.spec.ts`      |
| should give the member a payslip PDF, when the Owner calculates, approves and pays last month's salary |                 | `hrms-salary.spec.ts`     |
| should show the holiday under Upcoming holidays, when the Owner adds one                               |                 | `hrms-calendar.spec.ts`   |
| should count the member as present on the HRMS Dashboard, when they have checked in                    |                 | `hrms-calendar.spec.ts`   |

## Projects and structure

| Test                                                                                           | Tags    | Spec                    |
| ---------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| should open the new Project's dashboard and list it on Projects, when the Owner adds a Project | **@pr** | `projects.spec.ts`      |
| should group Projects under their client, when a Project names a client                        |         | `projects.spec.ts`      |
| should list the Locations in order, when the Owner divides an Infrastructure Project           |         | `project-setup.spec.ts` |
| should drop a module from the Project menu, when the Owner hides it                            |         | `project-setup.spec.ts` |
| should put the Project first on Projects, when the Owner pins it                               |         | `project-setup.spec.ts` |
| should keep the client and contract details, when the Owner edits the Project                  |         | `project-setup.spec.ts` |
| should make the Wing's floors and units, when the Owner adds a Residential Wing                | **@pr** | `wings.spec.ts`         |
| should list a second Phase, when the Owner adds one                                            |         | `wings.spec.ts`         |
| should show the drawing in its album and in the Gallery, when the Owner uploads a drawing      | **@pr** | `project-files.spec.ts` |
| should keep a PDF and refuse a program, when the Owner uploads Project documents               | **@pr** | `project-files.spec.ts` |
| should list the report under its material, when the Owner uploads a testing report             |         | `project-files.spec.ts` |
| should let a member see the Project, when the Owner puts them on its Team Members              |         | `resources.spec.ts`     |
| should keep the ticked Amenities, when the Owner saves them                                    |         | `resources.spec.ts`     |

## Procurement and inventory

| Test                                                                                                                   | Tags    | Spec                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------ |
| should put the received quantity in stock, when a Purchase Request becomes a Purchase Order and its goods are received | **@pr** | `procurement.spec.ts`          |
| should print the PO as a PDF and count what arrived, when only part of the order is received                           |         | `purchase-orders.spec.ts`      |
| should take the quantity out of stock, when the Owner records material consumed                                        |         | `inventory.spec.ts`            |
| should put the goods in stock, when the Owner records a Goods Receipt without a Purchase Order                         |         | `inventory.spec.ts`            |
| should move stock to the other Project, when a Material Transfer is approved and delivered                             |         | `inventory.spec.ts`            |
| should bill the next Purchase Order from the new default address, when the Owner adds a billing address                |         | `procurement-settings.spec.ts` |
| should drop a field from the Goods Receipt form, when the Owner hides it in GRN fields                                 |         | `procurement-settings.spec.ts` |

## Daily site work

| Test                                                                                                                   | Tags            | Spec                 |
| ---------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| should move the Task's progress, when a Daily Worksheet records work done against it                                   | **@pr**         | `worksheets.spec.ts` |
| should make a Daily Progress Report PDF with the day's diary, when the Owner writes the diary and generates the report | **@pr** @mobile | `site-diary.spec.ts` |
| should list an open hindrance with its cause and hours lost, when the Owner records one                                |                 | `hindrances.spec.ts` |

## Finance

| Test                                                                                    | Tags    | Spec                       |
| --------------------------------------------------------------------------------------- | ------- | -------------------------- |
| should move the account balance, when the Owner records money in and money out          | **@pr** | `finance.spec.ts`          |
| should bill the Supplier for a Goods Receipt and clear it, when the Owner pays the bill | **@pr** | `finance.spec.ts`          |
| should move money between the Company's accounts, when the Owner records a Transfer     |         | `finance-accounts.spec.ts` |
| should take a Labour's wage out of the cash account, when the Owner pays them in cash   |         | `finance-accounts.spec.ts` |
| should list an approved Other Expense under its category, when the Owner records one    |         | `finance-accounts.spec.ts` |

## Tasks, issues and inspections

| Test                                                                                                          | Tags    | Spec                  |
| ------------------------------------------------------------------------------------------------------------- | ------- | --------------------- |
| should show the Task In Progress at the percent reported, when the Owner adds a Task and updates its progress | **@pr** | `tracking.spec.ts`    |
| should close the issue, when the assignee posts a photo, marks it solved and the Owner verifies it            | **@pr** | `tracking.spec.ts`    |
| should draw the dated Tasks on the Gantt chart, when the Owner opens Gantt                                    |         | `tracking.spec.ts`    |
| should reopen a closed issue with the reason, when the Owner finds the work redone badly                      |         | `tracking.spec.ts`    |
| should raise a snag from the rejection, when the inspector rejects an Inspection Request                      |         | `inspections.spec.ts` |
| should offer the new Issue Category on a new issue, when the Owner adds one in Masters                        |         | `inspections.spec.ts` |

## Dashboards, reports and notifications

| Test                                                                                               | Tags    | Spec                      |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------- |
| should count today's labour, open issues and the amount due, when the Projects have them           | **@pr** | `dashboard.spec.ts`       |
| should ring the member's bell and mark it read, when the Owner assigns them an issue               | **@pr** | `notifications.spec.ts`   |
| should put a ready Excel workbook in Downloads, when the Owner generates Central Labour Attendance |         | `central-reports.spec.ts` |

## Sales CRM

| Test                                                                                    | Tags    | Spec            |
| --------------------------------------------------------------------------------------- | ------- | --------------- |
| should book the Unit, when a quick-added inquiry is followed up and closed as Converted | **@pr** | `sales.spec.ts` |
| should reopen a lost inquiry, when the Owner closes it as Lost and reopens it           |         | `sales.spec.ts` |
| should not offer a booked Unit again, when a second inquiry is converted                |         | `sales.spec.ts` |
| should show the Unit as booked on Units, when an inquiry books it                       |         | `sales.spec.ts` |
| should list the new Funnel Stage, when the Owner adds one in Inquiry settings           |         | `sales.spec.ts` |
