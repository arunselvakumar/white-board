# CM-0022 — Sales CRM: product decisions for M10

- Status: accepted
- Date: 2026-10-17
- Tickets: CM-1001 … CM-1008 (M10)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0013](CM-0013-projects-structure-product-decisions.md) (Wings, Units, `StructureUsage`, dashboard shell), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments), [CM-0020](CM-0020-project-sidebar-menu.md) (Project sidebar), [CM-0021](CM-0021-reporting-notifications-backups-product-decisions.md) (reports, notifications, backups)

`modules/09` ends with nineteen open questions. The owner answered four before M10 started (2026-10-17):

- **Converting an inquiry creates the booking** (open question 4): closing as Converted picks a unit and books it in the same save (§6).
- **Bookings keep their history and can be cancelled** (open questions 5, 6, 17): one active booking per unit, every status change kept, cancel needs a reason, a hold can carry a hold-until date (§7).
- **Funnel Stages, Lead Sources and Lost Reasons are per Project and seeded** (open questions 1, 3): every Project starts with a default set its sales head edits (§2).
- **Chat moves out of the way:** CM-905 (chat, support tickets) moved from M9 to M12 as CM-1201. It is not part of M10.

Every other question is answered here with the default we recommend; the M10 handoff lists them again for the owner.

**Delivery.** One milestone, built on one branch and opened as a native GitHub stack of pull requests of at most 300 files each (CodeRabbit's limit), like M5–M9.

## Decisions

### 1. A `sales` context with two Project modules

- Inquiries and Bookings live in `src/sales`, Postgres schema `construction_sales`, API prefix `/api/construction/sales`, Prisma prefix `ConstructionSales` (`03-target-architecture`). Every table carries `workspace_id`, so the Company purge (CM-907) finds them.
- Two Project modules under a new sidebar heading **Sales**: **Inquiries** (menu `sales.inquiries`, Inquiry #8) and **Bookings** (menu `sales.bookings`, Booking Details #41). Both already exist in the Permission Matrix. Bookings follows the Wings structure rule: a Project with Locations instead of Wings has no units, so it has no Bookings module (`modules/09` → Relationships).
- The Project Dashboard's **Inquiry** and **Booking** sections stop being stubs and belong to these modules, so hiding a module hides its section (CM-902).
- Contractor Projects that sell nothing hide both modules per Project, as today.

### 2. Per-Project masters, seeded (owner; open questions 1, 3)

- **Funnel Stages**, **Lead Sources** and **Lost Reasons** belong to a Project. A new Project gets this set, and a data migration gives it to every existing Project:
  - Funnel Stages, in order: **New, Contacted, Site Visit, Negotiation** (rebuild recommendation 14).
  - Lead Sources: **Walk-in, Referral, Website, Property portal, Hoarding, Social media**.
  - Lost Reasons: **Budget, Location, Bought elsewhere, Not reachable, Not interested**.
- Seeding reacts to a new **`ProjectCreated`** event that the projects context dispatches after its transaction (the first per-Project reaction; the sales tables are not written inside the projects transaction). The listener is idempotent, like the Company seeds.
- They are managed on the Inquiries module's **Settings** tab and need **Inquiry Update**. Names are unique in the Project among live rows, ignoring case.
- **Funnel Stages** are reordered with up/down buttons (the order is the funnel chart's order). A stage can be renamed at any time. It cannot be deleted while an Open inquiry sits in it (409 `FUNNEL_STAGE_IN_USE`, `details.openCount`): move those inquiries first. Closed inquiries keep the deleted stage's name. The last live stage cannot be deleted (409 `FUNNEL_STAGE_LAST`).
- **Lead Sources** and **Lost Reasons** can be renamed and **disabled** (they leave the pickers; old inquiries keep them). They are deleted only when nothing uses them (409 `LEAD_SOURCE_IN_USE` / `LOST_REASON_IN_USE`, `details.count`) (the "block or keep as disabled" edge case).

### 3. Inquiries

- **Fields** as `modules/09`: Inquiry Date (default today, not in the future, back-dated window `inquiry`), Name (required, ≤ 120), Mobile, Email, Address, Occupation, Interest Type (Hot / Warm / Cold, optional), **Interested In** (open question 2: an optional Wing of the Project **and** an optional unit type in words, e.g. "2BHK", ≤ 60), Lead Source, Funnel Stage, Next follow-up (date and optional time), Assignee, Lead Owner, Remarks, a **Visiting Card** photo and other photos.
- **Quick add** is the same command with fewer fields: Name, Mobile, Interest Type, Interested In, Remarks, Visiting Card.
- **Mobile** is optional (open question 14). It is stored normalised: a 10-digit Indian number becomes `+91…`; any other number must be `+` and 8–15 digits. Email must be a valid address.
- **Duplicate leads** (rebuild recommendation 12, open question 14): when a new or edited inquiry has the same mobile or email (ignoring case) as another live inquiry of the Project, the save is refused with 409 `INQUIRY_DUPLICATE` listing the matches (`details.matches: [{ id, name, status }]`). The form shows them and offers **Save anyway**, which resends with `allowDuplicate: true`. Duplicates are checked within a Project only: inquiries are per Project.
- **New inquiries** are Open at the first Funnel Stage unless the form picks another. Assignee and Lead Owner default to the creator when the creator is on the Project; both must be Team Members on the Project.
- **View all** (open question 11): without the Inquiry View all flag a member sees, edits, follows up and reports only the inquiries they created, are assigned to, or own as Lead Owner; any other inquiry is 404. Assignee and Lead Owner have the same rights.
- **History** (rebuild recommendation 13, the "ownership history" edge case): every inquiry keeps an append-only list of what happened — created, assigned, lead owner changed, stage moved, closed, reopened — with who and when. The detail page shows it merged with the follow-ups.
- **Delete** (Inquiry Delete) is soft and audited. A Converted inquiry whose booking is still active cannot be deleted (409 `INQUIRY_HAS_BOOKING`).
- **Files are personal data.** Visiting cards and inquiry photos are stored like other attachments but are **not** indexed in the Project Gallery (CM-0014): the Gallery is open to everyone on the Project.
- **No inquiry number.** Legacy had none and the numbering module has no Inquiry rule (`modules/09`).

### 4. Follow-ups, Overdue and Call Activity (open questions 9, 10)

- A **follow-up** records something that happened: an **Activity** (Call, Site visit, Meeting, WhatsApp, Email, Other), **Done on** (date and time, not in the future, back-dated window `inquiry_follow_up`), **Remarks**, an optional **stage move**, and the **next follow-up** (date and optional time after Done on, or none). Saving it sets the inquiry's next follow-up and stage.
- **The newest follow-up decides the next step.** A follow-up whose Done on is before another live follow-up's (an older call keyed in late) is recorded, but it does not change the inquiry's next follow-up or stage.
- Follow-ups are added only to Open inquiries. They are **append-only**: no edit. An Inquiry Delete holder can remove one entered by mistake (soft, audited); the inquiry's next follow-up does not change.
- **Overdue** = Open inquiries whose next follow-up is before now. The list filters by **Overdue / Today / Upcoming / None**, so Overdue is a list, not only a KPI (rebuild recommendation 9).
- **Call Activity** counts follow-ups whose Activity is **Call**, by Done on (rebuild recommendation 10). The dashboard shows all activities too.
- A daily notice tells each assignee how many of their follow-ups are due today or overdue (§10).

### 5. Inquiry Tasks (open question 12)

- An Inquiry Task is a to-do on one inquiry: **Title** (≤ 200), optional **Due date**, optional **Assignee** (on the Project), **Open / Done** (with who and when). They need Inquiry Update and follow the inquiry's View all rule.
- They are **not** Tasks of module 05: they have no quantity, dates, Gantt or progress, and they do not appear there.

### 6. Close as Converted or Lost, Reopen (owner; open questions 4, the reopen edge case)

- **Converted** needs a **unit** of the Project and a booking date (default today). In one transaction it creates a **Booked** booking for that unit, linked to the inquiry, with the customer's name, mobile, email and address copied from the inquiry. The unit must be bookable (§7): not unavailable and with no active booking. A hold past its hold-until date does not block. Closing as Converted needs Inquiry Update **and** Booking Create.
- **Lost** needs a live **Lost Reason** and takes optional remarks.
- **Reopen** (Inquiry Update) returns a closed inquiry to Open at the stage it had. A Converted inquiry reopens only when its booking is cancelled or deleted (409 `INQUIRY_BOOKING_ACTIVE`); reopening never releases a unit by itself.
- Two inquiries cannot convert to the same unit: the second is refused because the unit is booked (the "two inquiries to one unit" edge case; no waitlist).

### 7. Bookings (owner; open questions 5, 6, 17, the hold edge case)

- **Statuses** are **On Hold**, **Booked** and **Cancelled**. "Available" is not a booking status: it is a unit's sales status when it has no active booking (open question 6).
- **One active booking per unit**: On Hold or Booked. A partial unique index enforces it.
- **A hold can carry a hold-until date** (optional, not before the booking date). After it the booking shows **Hold expired** and the unit counts as Available. Booking that unit again cancels the expired hold in the same transaction with the reason "Hold expired".
- **Fields:** Unit (its Wing follows), status at create (On Hold or Booked), Booking Date (not in the future, back-dated window `booking`), Hold until, **Customer name** (required), Mobile, Email, Address, Referred By name and contact, Remarks, the **Booking Form** (PDF or image) and photos. A booking made by conversion shows its inquiry.
- **Actions:** **Confirm** (On Hold → Booked, with a date), **Extend hold**, **Cancel** (a reason ≤ 500 and a date; frees the unit), **Edit** details (status unchanged), **Delete** (Booking Delete; soft; for a booking entered by mistake; frees the unit). Every status change is kept in the booking's history with date, who and reason (rebuild recommendation 13); edits are audited.
- **No money in M10.** Legacy had no price and Booking has no Financial flag. Unit pricing, payment plans, demand letters, collections, GST on sales and the RERA registration gate are later work (M11 India compliance, M12 allottee portal).
- **Structure stays stable** (`modules/09` → integrity rules): a unit that any booking names (active or not) cannot be removed in the Wing editor, and its Floor and Wing cannot be deleted (409 `UNIT_IN_USE` / `FLOOR_IN_USE` / `WING_IN_USE` through `StructureUsage`). Renaming a unit keeps its bookings. A Project with inquiries or bookings cannot be deleted.
- Booking files are personal data too and are not indexed in the Gallery.

### 8. Unit sales details, unavailable units, unit import (open questions 7, 8)

- The sales context keeps a **sales profile per unit**: **Unit type** (≤ 60, e.g. "2BHK", "Shop"), **Carpet area**, **Built-up area**, **Super built-up area** (each optional, > 0, two decimals) and the **area unit** (sq ft or sq m, default sq ft). Carpet area is the RERA basis. They need Booking Update.
- **Unavailable** (open question 8): a unit can be marked not for sale with a reason — **Landowner share, Reserved, Not for sale, Other** — and a note. It can be made available again. A unit with an active booking cannot be marked unavailable (409 `UNIT_HAS_BOOKING`); an unavailable unit cannot be booked (409 `UNIT_UNAVAILABLE`).
- **Unit import** (Booking Update): an Excel file of Wing, Unit No, Unit type, the three areas, Area unit, Unavailable (Yes/No) and Unavailable reason updates the sales profiles of **existing** units, matched by Wing name and Unit No ignoring case. It does not create Wings, Floors or Units: those stay in the Wing editor (CM-402). The sample is prefilled with the Project's units. All or nothing, at most 2,000 rows, errors by row.
- **Units chart:** the Bookings module shows each Wing's floors × units grid coloured by sales status — **Available, On Hold, Booked, Unavailable** — with counts per status. Selecting a unit shows its sales details and booking with the actions the member holds.

### 9. Inquiry import

- An Excel file (Inquiry Create) with Inquiry Date, Name, Mobile, Email, Address, Occupation, Interest Type, Interested In Wing, Unit type, Lead Source, Funnel Stage, Assignee, Next follow-up and Remarks. Lead Source, Stage and Wing must match live names of the Project; they are not created by import. The Assignee is matched by a Project Team Member's name or mobile and must be unique.
- All or nothing, at most 1,000 rows, errors by row (`IMPORT_HAS_ERRORS`). Duplicates (an existing inquiry or another row with the same mobile or email) are errors unless the request sets **Import duplicates too**. The back-dated window applies to each row's date.

### 10. Notifications (messaging, CM-904)

- **`inquiry.assigned`** to the new assignee when someone else assigns an inquiry (Inquiry Read and Notification).
- **`inquiry.follow_ups_due`**: the daily scheduled drain sends each assignee one notice with the count of their follow-ups due today and overdue, linking the Overdue filter.
- **`booking.created`**, **`booking.confirmed`** and **`booking.cancelled`** to Booking Read + Notification holders on the Project (open question 16).
- Follow-up reminders at the exact time, WhatsApp and telephony are not in M10 (Vercel Hobby has daily crons only).

### 11. Reports and dashboard

- Two report kinds in a new **Sales** group of the catalogue, Excel and PDF, needing the Report flag of their menu:
  - **Inquiry Report** — inquiries by Inquiry Date in a range; filters Interest Type, Lead Source, Funnel Stage, Status, Lost Reason and Assignee; honours View all.
  - **Booking Report** — bookings by Booking Date in a range; filters Status and Wing; columns Booking Date, Customer, Wing, Unit, Unit type, Carpet area, Status, Referred By, Remarks.
- **Inquiry section** on the Project Dashboard (Inquiry Read; View all scopes it like the list): **Total** (by Inquiry Date in the dashboard duration), **Open**, **Converted**, **Lost**, **Conv. Rate** = Converted ÷ Total × 100 (open question: legacy's denominator), **Overdue** (now); the **funnel** (Open inquiries per stage, in stage order); **lead source performance** (total, converted, conversion %); **sales team performance** per assignee (inquiries, follow-ups, conversions); **Call Activity** with its own period — Today, Yesterday, This Week, This Month, All Time.
- **Booking section** (Booking Read): units by sales status for the Project and per Wing, and the five latest bookings.
- **Backups** (CM-906) gain Inquiries (with follow-ups, tasks and history) and Bookings (with history and unit sales details) as Project modules.
- **Print** (open question 15) means the reports: no single-inquiry or single-booking sheet in M10.

### 12. Not in M10

Unit pricing and payment schedules, demand letters and collections, allottee records and portal, RERA registration and its booking gate, GST on unit sales, lead capture from portals, telephony or WhatsApp, consent records for leads, a Company-wide sales view (open question 19), moving an inquiry to another Project (open question 18), follow-up reminders at the minute, and the Booking tutorial (open question 13).

## Consequences

- `construction_sales` is a new schema with its own migration; seeding existing Projects is a data migration in that schema.
- `ProjectCreated` becomes the projects context's first event; later modules that need per-Project data react to it the same way.
- `StructureUsage` and the Project delete guard learn the sales tables.
- Sales data is personal data. It stays out of the Gallery, is scoped by View all, and leaves the system only through reports, backups and the Company purge.
