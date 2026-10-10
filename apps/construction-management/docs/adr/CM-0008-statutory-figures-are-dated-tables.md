# CM-0008 — Statutory figures are effective-dated tables

- Status: accepted
- Date: 2026-10-10
- Tickets: CM-301 (used by CM-314, CM-316, CM-320; later by M7 and M11)
- Relates to: [CM-0012](CM-0012-hrms-product-decisions.md), [`research/market-and-compliance.md` §2](../research/market-and-compliance.md)

Indian payroll and tax figures change by notification and differ by state. The PF wage ceiling is ₹15,000 today, and ₹21,000 has been proposed but not notified. Professional tax slabs are set by each state. Minimum wages are revised twice a year. The legacy app typed these numbers into each salary template. When a figure changed, old templates either went stale or had to be edited, and old payslips no longer showed why they were what they were.

## Decision

**Statutory figures live in effective-dated tables, never in code constants or templates.** Each row has `effective_from` (a date) and, where it varies, a `state_code`. The row in force for a salary month is the latest row whose `effective_from` is on or before the **last day of that month**.

The M3 tables (schema `construction_hrms`, platform-wide, not per Company):

| Table                 | Holds                                                                                                                            | Seed                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `statutory_pf_rates`  | wage ceiling (paise), employee %, employer % (EPF + EPS split: EPS 8.33% of wage up to the ceiling)                              | from 2014-09-01: ₹15,000, 12%, 12%                                                                                                           |
| `statutory_esi_rates` | gross ceiling (paise), PwD ceiling, employee %, employer %                                                                       | from 2019-07-01: ₹21,000, ₹25,000, 0.75%, 3.25%                                                                                              |
| `statutory_pt_slabs`  | state, gross from/to (paise), monthly amount (paise), an optional month with a different amount (e.g. Maharashtra February ₹300) | Karnataka, Maharashtra, Tamil Nadu, Telangana, West Bengal, Gujarat, Andhra Pradesh; states without PT have no rows, and no rows means no PT |

GST rates, TDS sections and minimum wages follow the same rule. They are built when M7 and M11 need them.

**Seeds are versioned JSON** in `src/hrms/infrastructure/seeds/statutory/*.json`, loaded by a migration-time seed (idempotent by `effective_from` + state). A new notification is a new JSON row plus a migration that inserts it. Rows are never edited in place.

**Who updates them:** the product owner (Construction Management), when the government notifies a change. The PR that adds the row cites the notification. Companies cannot edit the tables.

**Company overrides stay.** As in the legacy app, a salary structure may turn PF capping off (PF on the full PF wage) or set a flat PT amount. The run uses the override when one is set, and otherwise uses the table.

**Payslips snapshot the figures they used.** A salary slip stores the PF ceiling, the rates and the PT amount it applied. Recalculating a Calculated slip re-reads the tables. An Approved or Paid slip never changes.

**ESI eligibility is computed, not switched.** A member is ESI-eligible for a contribution period (April–September, October–March) if their gross at the start of that period was within the ceiling. If eligible, ESI is deducted for the whole period even if a raise takes them above the ceiling.

## Consequences

- Salary code takes a `StatutoryRates` port: `pfFor(month)`, `esiFor(month)`, `ptFor(state, month, gross)`. Domain tests use in-memory tables.
- The Company needs a state for PT. HRMS Settings gains `pt_state_code`, defaulting to the Company's address state when one is known.
- When ₹21,000 PF is notified, one JSON row and a migration change every later run. Earlier runs are unaffected.
