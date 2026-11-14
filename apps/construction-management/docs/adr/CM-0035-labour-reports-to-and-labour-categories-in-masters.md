# CM-0035 — Reports To on a Labour, Labour Categories back in Masters, and Add Labour Category from the Labour form

- Status: accepted (2026-11-03, the owner's request)
- Amended by: [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) (the Labour group folds into Staff; Supervisors are shown as Site Engineers), [CM-0041](CM-0041-labour-site-engineers-come-from-the-project.md) (no Site Engineer on the Labour)
- Date: 2026-11-03
- Supersedes: the Labour group of Human Resources in [CM-0034](CM-0034-hr-main-menu.md) §2 (Labours, Vendors, Labour Categories, Supervisors), and the Permission Matrix category of Labour Categories in CM-0034 §5
- Relates to: [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) (the one-page Labour form), [CM-0016](CM-0016-daily-site-work-product-decisions.md) §6 (a Labour Category's skill), [CM-0028](CM-0028-settings-main-menu.md) (redirects when a page moves), `modules/08`

The owner asked for three changes around the Labour register:

1. A Labour should be able to **report to another Labour**: on site a helper answers to a mason, and a mason to a head mason. Today the form only has a Supervisor, which is a separate Supervisor record, not a Labour.
2. The Human Resources → Labour group should read **Labours, Supervisors, Vendors**, and **Labour Categories should move to Masters**, under a **Labour** group with one entry, **Categories**.
3. Under the Labour Category dropdown on the Labour form, an **Add** link should open a slide-over from the right to add a Labour Category; once saved, the dropdown shows it without leaving the form.

## Decision

### 1. Reports To is an optional Labour on the Labour

- A new nullable column `construction_labour.labours.reports_to_id`, a foreign key to `labours.id` (`ON DELETE SET NULL`), indexed. One migration in the labour schema only (ADR-0030).
- The domain keeps `reportsToId` in `LabourDetails` beside `supervisorId`; the audit snapshot carries it like every other detail.
- The command checks it only when it is newly chosen (as Labour Categories and Supervisors are): it must be a live, **active** Labour of the same Company (`REPORTS_TO_NOT_FOUND`), never the Labour themselves (`REPORTS_TO_SELF`), and never a loop, direct or through others (`REPORTS_TO_LOOP`, found by walking up the chain). Each error names `reportsToId` as its field.
- The write repeats the check under locks (PR #141 review): a per-Company advisory lock serialises Reports To writes, the chosen Labour's row is held `FOR SHARE` (a delete's `FOR UPDATE` waits on it, then clears the new report), and a recursive query refuses a loop. Two saves at once ("A reports to B", "B reports to A") therefore let only one through.
- Left out of an update request, the stored value is kept; `null` clears it. The Excel import does not set it.
- Deleting a Labour is a tombstone, so the delete transaction clears Reports To on every Labour that reported to them, bumps their `updatedAt` (an open edit of one is refused as changed rather than re-sending a deleted id), and the `labour.deleted` audit event lists them under `after.reportsCleared`.
- The Response model gains `reportsTo: { id, name } | null`; the Request models gain `reportsToId`.
- On the form it is a **searchable combobox** of active Labours (by name, Labour Id or phone, through the existing list endpoint), not a plain select: a Company can have hundreds of Labours. The Labour being edited is left out, and the saved one shows by name before any search.

### 2. The Labour group is Labours, Supervisors, Vendors; Labour Categories move to Masters → Labour → Categories

- `LABOUR_VENDORS_SECTIONS` is Labours, Supervisors, Vendors, in that order.
- Masters gains a **Labour** group, after Work, with one entry, **Categories** (page title still "Labour Categories"). The page moves from `/app/labour-categories` to `/app/masters/labour-categories`, like every other master, and its header goes back to Masters. `/app/labour-categories` redirects there permanently, so bookmarks keep working.
- In the Permission Matrix, `masters.labour_categories` moves from the **Human Resources** category back to **Master records**, so the matrix keeps reading like the sidebar. The category is not stored in grants, so there is no data migration. No notification carries this menu, so no push mute needs copying (unlike CM-0034's mute carry-over).

### 3. Add Labour Category from the Labour form

- An **Add** link sits under the Labour Category dropdown, on the right. It opens a slide-over (`Sheet`, side right) with the same name and skill fields as Masters → Labour → Categories → Add. The form behind it is shared (`useLookupNameForm`, `LookupNameFields`), so the two cannot drift.
- Saving creates the category, invalidates the Labour Categories query (the dropdown refreshes from the server) and chooses the new category on the form. The Labour itself is not saved.
- The slide-over is portalled out of the Labour `<form>`, and its own submit stops propagation (React bubbles events through portals), so saving a category never submits the Labour.
- Permission is the server's: without Labour Categories Create, the slide-over shows the 403 message. The link is not hidden, as nothing else on the form is hidden by permission today.

## Consequences

- One PR: the migration, domain, handlers, repository and read model, the Request/Response models, the picker, the slide-over, the menu move with its redirect, the matrix category, tests and docs.
- Reports To and Supervisor sit side by side on the form and mean different things: a Supervisor is a Supervisor record (possibly a Team Member) who looks after a group; Reports To is another Labour. `CONTEXT.md` defines both.
- Attendance and reports do not use Reports To yet. Filtering the register or attendance by it is left for when a customer asks.

## Considered options

- **Reports To as a plain select of every Labour.** Simplest, but unusable with hundreds of Labours; the combobox reuses the list endpoint's search.
- **Allow loops and leave it to the user.** A loop makes any later "who answers to whom" view or report walk forever; refusing it is cheap at save time.
- **Refuse to delete a Labour others report to.** Safer for the data but annoying: the Owner would have to edit every helper first. Clearing it, with the audit event naming them, keeps the delete one click.
- **Keep Labour Categories at `/app/labour-categories` and only move the menu entry.** The Masters item would not highlight on that page (`activeMastersSection` matches `/app/masters/…`), and the address would disagree with the menu, the problem CM-0034 §3 avoided for HRMS.
- **A dialog instead of a slide-over for Add.** The owner asked for a slide-over from the right; it also keeps the Labour form visible beside it.
