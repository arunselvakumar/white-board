# CM-0012 — HRMS product decisions for M3

- Status: accepted (defaults taken while building M3; the owner can change any of them in review)
- Date: 2026-10-10
- Tickets: CM-303 … CM-320
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (permission matrix), [CM-0004](CM-0004-ledger-first-balances.md) (ledger-first balances), [CM-0008](CM-0008-statutory-figures-are-dated-tables.md) (statutory figures), [`modules/10-hrms.md`](../modules/10-hrms.md)

`modules/10-hrms.md` ends with fifteen open questions that the legacy notes could not answer. M3 needs an answer to each before the domain code is written. Each answer below is the recommended default. Where the legacy app is silent, we chose what Indian office payroll usually does and what keeps the model simple to change later.

## Decision

### Attendance

1. **GPS requirement has three modes** (open question 1): `disabled` (check-in without a location), `record_only` (location is captured if the device gives one; a check-in outside every fence is accepted but goes to Attendance Approvals) and `required` (check-in outside every fence is refused with `OUTSIDE_FENCE`; no fence configured is `OFFICE_LOCATION_NOT_CONFIGURED`). The default is `disabled`, as seen in the legacy app.
2. **Day status** (open question 2) is one of `present`, `half_day`, `absent`, `on_leave` (paid or unpaid approved leave, with the half if it is a half-day leave), `holiday`, `week_off`. A late flag sits beside the status; it never changes the status.
3. **An on-fence check-in needs no approval** (open question 3). Only manual (backdated) entries, missed checkouts and `record_only` out-of-fence check-ins go to approvals.
4. **Which fences apply to a member** (open question 4): the office branches the member is linked to, plus the site fences of Projects the member is assigned to. A member linked to no branch may check in at any office branch. HRMS Team Members have no Projects, so they only use office branches.
5. **Approvers** are any Team Member holding `approve` (or `reject`) on the relevant HRMS menu, never for their own entry or request. The Owner may approve their own. Named reporting-manager chains are not built.

### Leave

6. **Leave year is a setting** (open question 5): `calendar` (Jan–Dec, default) or `financial` (Apr–Mar, labelled "26-27"). Carry forward runs when the first balance of the new leave year is initialised or accrued, for each member.
7. **Accrual modes** (open question 6) are `upfront` (the whole entitlement is credited when the balance is initialised) and `periodic` (credit per period, monthly only, on the accrual day). Seeded Maternity, Privilege and Sick are periodic. Casual is upfront. Comp Off and LOP have no credit.
8. **An employee may withdraw a Pending request** (open question 8). It becomes `withdrawn` and the reservation is released.
9. **Compensatory Off** (open question 9) is credited by a manager's balance adjustment with a reason. No automatic credit for work on a holiday in M3.
10. **Day breakdown skips holidays and week offs**: a request from Friday to Monday over a weekend counts the two working days. A leave day is Full (1) or Morning/Afternoon (0.5).
11. **Optional holidays** (open question 14) are shown on the calendar but are working days unless the member takes them as leave. There is no cap and no opt-in screen in M3.

### Salary

12. **Salary components** (open question 12) are each a fixed monthly amount (paise) or a percentage of the member's base monthly salary. One component may be marked as the balancing component: it takes base − the other components and must not go negative.
13. **Proration** uses calendar days: monthly gross ÷ days in the month × payable days. Payable days = days in month − absent − unpaid leave (half days count 0.5 off when "Deduct for absent days" is on). Week offs, holidays and paid leave are paid. This matches the labour monthly-wage rule from M2.
14. **Overtime** (open question 13) is always shown in hours on the slip. It is paid only when the member's shift for that day has Overtime Allowed, at twice the ordinary hourly rate. The ordinary hourly rate is monthly gross ÷ days in month ÷ the shift's working hours.
15. **Advance salary** (open question 10) is recorded with a number of instalments (default 1). Each later Regular run deducts the next instalment automatically until the advance is recovered. The slip shows "Advance recovered".
16. **Mark Salaries as Paid** (open question 11) records the mode (Cash / Bank), date and reference. It does not post to company accounts: Finance (M7) does not exist yet. M7 will post existing Paid runs.
17. **Approving a salary run locks the month.** Attendance entries, leave requests and leave approvals dated in that month are refused with `MONTH_LOCKED` for those members. Corrections after approval wait for the next month.
18. **HRMS employees are never site Labour** (open question 15). The two registers stay separate (`modules/10` "Relationships").

## Consequences

- HRMS Settings gains `gps_requirement` with three values and `leave_year` (`calendar` | `financial`).
- Leave requests gain a `withdrawn` state.
- Salary components carry `basis` (`fixed` | `percent_of_base`) and an `is_balancing` flag.
- Overtime pay depends on the shift. A member with no shift assignment uses the Settings working hours and gets no overtime pay.
- Any of these can be changed later without a data migration. Except for the GPS modes and the leave year, each is a domain rule, not a column.
