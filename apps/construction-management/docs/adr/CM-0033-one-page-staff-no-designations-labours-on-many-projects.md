# CM-0033 — One-page Add Staff, no Designations, a wage-style salary for Staff, and Labours on many Projects

- Status: accepted
- Date: 2026-10-26
- Supersedes: [CM-0032](CM-0032-staff-and-salary.md) §1 ("Designation stays"), and the remaining Designation lines of [CM-0030](CM-0030-users-and-roles.md) §1–2 (Designations as job titles, Back-dated Entry overrides naming Designations, Masters → Company)
- Amends: [CM-0032](CM-0032-staff-and-salary.md) §2 (the salary is a full set-up, not one monthly amount), the single current Project of a Labour (ticket CM-206, `modules/08`)
- Relates to: [CM-0004](CM-0004-ledger-first-balances.md) (Labours have a ledger, Staff do not), [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) (working hours per day), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (its migration tests go with the Designations)

The client used Staff & Roles and Labours for a day and asked for four changes (issue #136):

1. Add Staff took three steps (Details → Select Projects → Role). Add Labour is one page of cards with one Save. Add Staff should work the same way.
2. Since CM-0030, access comes from Roles. A Designation was only a job title the owner had to pick before saving, so it should go, with its Masters page.
3. A staff member's salary was one box, "Salary per month". A Labour has a proper wage set-up. Staff should get the same.
4. A Labour belonged to exactly one Project, changed only by a Transfer. On site a Labour often works on more than one Project at once.

The issue listed five questions. The owner accepted the recommended answer to each; they are decisions 2.3, 3.2, 3.3, 4.3 and 2.4 below.

## Decision

### 1. Add Staff is one page

- Add Staff is one page of cards, in the style of Add Labour: **Details**, **Role**, **Sign-in**, **Salary**, **Projects**, then one **Add Staff** (or **Add and invite**) button with Cancel beside it. There is no step bar.
- HRMS staff see no Projects card and start on the **HRMS Staff** Role, as before.
- A server error is shown on its field, in whichever card owns it, and the page scrolls to the first error.
- The outcome screen (can sign in now / invited / a record, with Share invite link) is unchanged.
- Edit Staff shows its cards in the same order.
- The card order was revised on 2026-10-27 at the client's request (it was Details, Salary, Projects, Role, Sign-in): who they are and how they sign in come first, pay and Projects after.

### 2. There are no Designations

- The Designation master, its page under Masters → Company, its API and its OpenAPI components are removed. A new Company is no longer seeded with the 38 default Designations.
- A Team Member has no Designation. The Owner is the member with no Role (`role_id` null); handing the Company over no longer changes anyone's title.
- Screens that showed a Designation name show nothing in its place: the Staff list, Edit Staff, HRMS attendance, branches and salary grids, Project Resources search.
- **Back-dated Entry overrides name Roles** (`overrideRoleIds`). A member may create or edit an entry older than the limit when their Role is on the list. The Owner always may.
- **The migration clears the existing override lists.** A Designation does not map one-to-one to a Role, so the Owner picks Roles again. Mapping each Designation to the Roles its members hold was considered and not chosen: it would quietly widen who may back-date.
- **The payslip has no Designation line** and the salary workbook has no Designation column. Nothing else in HRMS read it.
- The company backup loses the Designations sheet and the Designation column on Team Members.
- One migration drops `construction_organization.designations` and `team_members.designation_id`. The old migrations stay in history.

### 3. A staff member's salary is set up like a Labour's wage

- Add Staff and Edit Staff have a **Salary** card with the same fields and words as the Labour **Wage** card, from one shared component:

  | Field                  | Rule                                                              |
  | ---------------------- | ----------------------------------------------------------------- |
  | Salary type            | Daily or Monthly, Monthly by default                              |
  | Salary per day / month | Rupees, optional (blank is no salary), at most ₹2 crore           |
  | Overtime per hour      | Rupees, 0 if none; shown only when a salary is set                |
  | Working hours per day  | Decimal hours, more than 0 and at most 24, 8 by default (CM-0011) |
  | Weekly holidays        | Sunday to Saturday, Sunday by default                             |

- **A staff salary stays optional; a Labour's wage stays required**, because attendance prices every Labour day from it.
- **Staff have no opening balance.** Labours have a ledger (CM-0004); Staff do not.
- `team_members.monthly_salary` becomes `salary_type` (daily | monthly), `salary_per_day`, `salary_per_month`, `overtime_wage_per_hour` (paise), `working_hours_per_day` (decimal 4,2, default 8) and `weekly_holidays` (int[]). Every existing monthly salary moves to `salary_type = monthly`, `salary_per_month`.
- The **Financial** guard on Staff is unchanged from CM-0032 §3: without it the amounts are neither shown nor sent, and an update that leaves them out keeps them. Working hours and weekly holidays are not money and are always shown. The salary type is shown but kept with the amounts, because it picks which amount applies.
- It is still **separate from HRMS**. The salary run and payslips read the HRMS salary set-up. Joining the two stays a later decision.

### 4. A Labour can be on any number of Projects

- Add Labour and Edit Labour have a **Projects** field: a searchable list with a tick per Project and chips for the chosen ones. It is **not required**: a Labour can be saved with no Project and assigned later.
- `construction_labour.labour_projects` (`labour_id`, `project_id`, `since`) holds the assignments, like `team_member_projects`. The migration copies each `labours.current_project_id` into it, then drops that column.
- Everything that read the single Project reads the assignments: the Labours list (filter and Project column), the attendance sheet of every Project the Labour is on, balances, the Project labour summary and Dashboard tile, wage payments, and import/export (an optional **Projects** column, names separated by `;`).
- **Transfer stays** beside the Projects field on Edit Labour: "move from Project A to Project B on a date". Adding or removing a Project on Edit Labour also writes a transfer row, with no "from" or no "to", so the history stays complete.
- Attendance stays one status per Labour per Project per day. A Labour marked Present on two Projects the same day is the supervisors' call; the app does not prevent it.

## Consequences

- Bookmarks to `/app/masters/designations` stop working.
- Owners who had Back-dated Entry overrides must pick Roles again; until then only the Owner can back-date past the limit.
- Reports and exports that showed a Designation no longer do.
- A Labour with no Project appears on no attendance sheet until assigned.

## Considered options

- **Keep Designations as an optional job title.** Less to remove, but the owner did not want a field nobody uses. Not chosen.
- **Map old Designation overrides to Roles.** See 2 above. Not chosen.
- **Replace Transfer with the Projects field.** Simpler screen, but Transfer records a date and a move in one step, which supervisors use. Not chosen.
