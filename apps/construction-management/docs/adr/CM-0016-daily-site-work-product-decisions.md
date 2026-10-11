# CM-0016 — Daily site work product decisions for M6

- Status: accepted
- Date: 2026-10-11
- Tickets: CM-601 … CM-608 (M6)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0004](CM-0004-ledger-first-balances.md) (ledger-first balances), [CM-0013](CM-0013-projects-structure-product-decisions.md) (`LocationRef`, structure usage), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments, Gallery), [CM-0015](CM-0015-procurement-inventory-product-decisions.md) (stock ledger, approval)

`modules/04` ends with sixteen open questions, and its "Rebuild recommendations" ask for more than the legacy product did. The owner answered four before M6 started (§3, §6, §14–§16 and the fuel rule in §12):

- **Approval:** Approve / Reject with a reason, like M5 — not legacy's approve-only.
- **Labour:** two headcounts (skilled, unskilled), prefilled from that day's attendance with the difference shown.
- **Daily Progress Report:** a full **site diary** — weather, visitors, instructions and a **Hindrance register** feed the DPR, as well as labour, equipment, worksheets and materials.
- **Fuel:** recorded on the usage sheet only; it does not come out of inventory.

Every other question is answered here with the default we recommend; the M6 handoff lists them again for the owner.

**Delivery.** One milestone, built on one branch and opened as a native GitHub stack of pull requests of at most 300 files each (CodeRabbit's limit), like M5.

## Decisions

### 1. A `site-work` context; Equipment lives there; Work Types are masters

- Daily Worksheets, the Equipment register (with its movements and maintenance), Equipment Usage sheets, Site Diaries, the Hindrance register and Daily Progress Report numbers live in `src/site-work`, Postgres schema `construction_site_work`, API prefix `/api/construction/site-work`, Prisma prefix `ConstructionSiteWork` (`03-target-architecture`).
- **Equipment moves from masters to site-work.** `03-target-architecture` listed equipment under masters. Its Project, maintenance and availability are operational state that every usage sheet checks in the same transaction, so the register lives with the sheets. The **Masters → Equipments** screen and the `masters.equipments` menu stay; only the code's home changes.
- **Work Types** (name, Department, assigned Materials) are a master in `construction_masters`. Every Company is seeded with **RCC** under the RCC department (`modules/02` "Seed data").
- **Fuel Types** (CNG, Diesel, Petrol) and **Fuel Units** (Barrel, Gallon, Kg, Litre, Unit) are fixed lists in code, not masters. Nobody asked to edit them, and fixed lists keep the efficiency check simple.

### 2. Form settings are per Project (open question 1)

- Each Project has **worksheet settings** (show or hide Location, Work Type, Approx Work Done, Labour, Material consumption, Remark, Work Photos; the order of the four sections Location / Basic / Materials / Other; approval on or off) and **equipment-sheet settings** (show or hide Operator, Supervisor, Location, Approx Work Done, Billable quantity, Fuel, Remarks, Files, Material consumption, Meter readings, Breakdown hours; approval on or off).
- Defaults: everything shown, approval off. A Project without a row uses the defaults.
- Changing them needs Update on the menu, and they apply to new and edited sheets. A hidden section is neither validated nor stored on save. Data already on a sheet is kept, and the detail page still shows it.
- A Company-wide default with Project overrides (recommendation 14) is not built. Each Project's settings start from the defaults.

### 3. Approval: pending → approved or rejected (owner; open questions 2, 3)

- With approval **off**, a sheet is saved with approval status `not_required`.
- With approval **on**, it starts `pending`. A member with the menu's Approve flag can approve it, or reject it with a reason. Both work singly and in bulk (all or none, as in CM-0015 §2), and each sheet keeps a remarks thread.
- **Reject (J) is added** to the Daily Worksheet and Equipment Usage menus.
- Editing an approved or rejected sheet sends it back to `pending`. Save & Approve is offered to members with Approve.
- Turning approval on or off never changes sheets already saved.
- **Partially Approved and the separate "completion status" are dropped.** One approver decides the whole sheet, and a remark says what is left. Per-line approval and multi-level approval (recommendation 10) are not built.
- **Approval does not gate stock.** Material lines post when the sheet is saved, as in legacy. A rejected sheet keeps its postings until it is edited or deleted.

### 4. Numbers come from the numbering rules (open questions 4, 13)

New numbering modules with standard prefixes, each overridable per Project like M5's:

| Module                | Number            |
| --------------------- | ----------------- |
| Daily Worksheet       | `WS/26-27/00001`  |
| Equipment Usage       | `EU/26-27/00001`  |
| Daily Progress Report | `DPR/26-27/00001` |
| Hindrance             | `HR/26-27/00001`  |

### 5. Material consumption posts to the stock ledger and never goes below zero (open questions 5, 16)

- Each material line on a worksheet **or** an equipment usage sheet posts a **Consumed** entry at the Project on the sheet date, with the sheet's site location. The ledger gets two new source types, `daily_worksheet` and `equipment_usage`, so Current Inventory's history links back to the sheet.
- The no-negative-stock rule of CM-0015 §3 applies: a line that would leave less than zero at that date or any later date refuses the whole save (409 `STOCK_INSUFFICIENT`, naming the material and the shortfall).
- Editing a sheet replaces its postings (a reversal plus new entries, checked together). Deleting a sheet reverses them.
- The worksheet's own Create or Update flag is enough. The author does not also need Current Inventory Create.
- Lines are in the material's unit (no unit conversion, CM-0015 §14). A Work Type's assigned Materials are offered first in Bulk Select. They do not restrict the choice.

### 6. Labour: two headcounts, prefilled from attendance (owner; open question 7)

- A worksheet records **skilled** and **unskilled** headcounts for the contractor's crew. With the Labour section shown, at least one must be above zero.
- **Labour Categories get a skill** (skilled or unskilled). The seeds Helper, Labour and Unskilled are unskilled, the others skilled, and existing Companies are backfilled. A labourer with no category counts as unskilled.
- **Prefill.** Labour attendance is not linked to Contractors, so the form shows the Project's attendance for the sheet date:
  - labourers present or on a half day count as one head each;
  - vendor gangs count full-day plus half-day heads.
  - Both are split by category skill.
  - The form subtracts the headcounts already on the Project's other live worksheets for that date. **Use remaining** fills the two counts.
- The difference is shown, not enforced. The DPR prints attendance next to worksheet totals.
- Counts per Labour Category (recommendation 5) are not built.

### 7. Location, Contractor, Department, Work Type, Task (open question 6)

- A worksheet's location is a `LocationRef` (Wing with floors and units, Amenity, Common Development, or a Location) picked with the `LocationPicker`. It is required when the Location section is shown.
- **Contractor\*** must be assigned to the Project (Resources). **Department\*** must be one of that Contractor's Departments. **Work Type** must belong to that Department. **Work Shift\*** is Shift 1, 2 or 3.
- Approx Work Done is a quantity with a Measurement Unit, and the unit is required when a quantity is given.
- **No Task link in M6.** Tasks arrive in M8, which adds the link and the roll-up of work done (recommendation 3).
- **Structure in use.** The `StructureUsage` stub of CM-0013 is replaced. A floor, unit, Wing or Location named by a worksheet, usage sheet, hindrance, or any M5 stock entry, movement or document counts as used, so it cannot be removed (409 `*_IN_USE`).

### 8. Photos and files

- Worksheet photos (images only), usage-sheet files, site-diary photos and hindrance files go through the attachments service (CM-0014): 25 MB a file, at most 20 on a sheet.
- Images appear in the Project **Gallery** with their source (Worksheet, Equipment Usage, Site Diary, Hindrance), shown to members who can read that source.
- Remarks and files share one thread per sheet, as procurement documents do (CM-0015 §13).

### 9. Duplicate and Save & Add New (recommendation 7)

- **Duplicate** opens a new form prefilled from the source, dated today. It copies everything except photos and approval.
- **Save & Add New** keeps the date, location, contractor and shift, and clears the rest.
- Geo-tagged photos, drawing pins, an offline outbox and WhatsApp submission (recommendations 7–9) are later work (M12).

### 10. The Equipment register (open questions 10, 12)

- **Fields:**
  - Name\*, Equipment Number\* (unique in the Company among live equipment), Ownership\* (Company owned or Rented), Purchase Year (owned only).
  - Fuel Type, Fuel Unit.
  - Utilisation Basis\* (Hourly, Km or Trip) and Working Time Method\* (Time Shifts, Meter Reading, or Both — Both only for Hourly).
  - Target (with its unit), Min Utilisation %, Expected Fuel Efficiency (fuel units per hour, km or trip).
  - Photo, contact person, company name.
- **Rented equipment** names its **hire party, a Contractor** (legacy's "Contractor Name\*"; not a labour Vendor). It also has a **hire basis** (Hourly, Daily, Monthly, Trip) and a **hire rate** in paise.
- **"Chargeable" means idle time is billed.** With it on, idle hours count towards an hourly hire.
- Rates and costs need **Financial** on Equipments (master) or on Equipment Usage (sheets).
- Equipment is added from **Masters → Equipments** (to a Project or to the warehouse) or from a Project's Equipment list (to that Project).

### 11. Equipment lifecycle: movements, maintenance, availability (open question 12)

- **Where it is.** Equipment is at one Project or at the **Warehouse / off system**.
- **Transfer.** Transfer to Project or Transfer to Warehouse (Equipments **T**) records a movement with a date, a location name and a remark.
  - The date cannot be in the future, before the last movement, or before the last usage sheet at the source Project.
  - The destination must differ from the source.
  - The movement history is the Transfer Report.
- **Maintenance.**
  - **Log Maintenance** (Equipments U) opens a maintenance entry: start date, kind (Breakdown, Service, Repair, Other), description, workshop and cost (Financial). Only one entry can be open at a time.
  - **Return to Service** closes it with an end date, the final cost and a remark.
  - While maintenance is open, the equipment is **in maintenance**. It does not move, and that alone blocks usage sheets. Log Maintenance does not touch the availability flag.
- **Availability.** **Mark unavailable for worksheet entry** / **Make it available** is a separate flag with a "since" date.
- **When a usage sheet is allowed.** All of these must hold, checked on the server:
  - the equipment was at this Project on the sheet date;
  - no maintenance entry covers that date;
  - the equipment is not marked unavailable now.
- Maintenance schedules from meter readings (recommendation 12) and posting maintenance cost to expenses wait for M7 and later.

### 12. Equipment usage sheets (open questions 8, 9, 11, 13)

- **One sheet per equipment, per date, per shift** (409 `EQUIPMENT_SHEET_EXISTS`).
- **What it records:**
  - **Operator** is free text, because operators often do not log in.
  - **Supervisor** is a Team Member.
  - **Work Item** is free text, not a worksheet link.
  - Contractor, Department and location work as on worksheets, but are optional.
- **Utilisation follows the equipment's basis:**
  - **Time shifts:** start and end as `HH:MM`. Crossing midnight is allowed, shifts must not overlap, and hours are computed.
  - **Meter readings:** opening and closing. Closing must be ≥ opening. Opening defaults to the last closing reading, and a gap between the two is shown.
  - **Both:** usage comes from the shifts, and a mismatch with the meter is shown.
  - **Km** basis records distance; **Trip** basis records trips.
  - Usage, idle and breakdown hours together cannot exceed 24.
- **Fuel** (owner): quantity in the equipment's fuel unit, and **Borne by** (Company or Hire party). It is recorded only and never touches inventory.
  - When fuel ÷ usage exceeds Expected Fuel Efficiency, the sheet is flagged **Fuel overrun** and an `EquipmentFuelOverrun` event is raised. Notifications for it come with M9.
- **Hire cost (rented):**
  - Unit Rate defaults from the hire rate.
  - **Billable quantity** defaults from the basis and can be overridden:
    - Hourly: usage hours, plus idle hours when chargeable.
    - Trip: trips.
    - Daily: 1.
    - Monthly: 1 day at rate ÷ days in that month.
  - Hire Cost = Unit Rate × Billable quantity, in paise, rounded half-up.
  - A rented sheet that is approved, or saved with approval off, raises `EquipmentHireAccrued` for M7's payables. The hire bill and TDS 194I wait for M7 / M11.
- **Duplicate** copies everything except readings, files and approval. Opening becomes the last closing reading.

### 13. Site Diary (owner; recommendation 1)

- **One Site Diary per Project per date** (409 `SITE_DIARY_EXISTS`).
- **Contents:**
  - weather in the morning and the afternoon (Sunny, Cloudy, Light rain, Heavy rain, Windy, Foggy, Very hot);
  - rainfall in mm;
  - site condition;
  - **Visitors** (name, organisation, purpose, time in, time out);
  - **Instructions** (given by, given to, instruction, action taken);
  - general notes and photos.
- New menu **Site Diary** (`site_work.site_diary`, C R U D P, Project-scoped) and back-dated module `site_diary` (Site group).

### 14. Hindrance register (owner; recommendation 2)

- **A hindrance has:**
  - a number;
  - a start date, and an end date (empty while it continues);
  - optional hours lost;
  - a **cause**: Weather, Material shortage, Labour shortage, Drawing / design delay, Client decision, Payment delay, Equipment breakdown, Power / water, Statutory / permit, Other;
  - the affected activity and an optional location;
  - a **responsible party**: Company, Contractor (with the Contractor), Client, Consultant, Supplier, Force majeure;
  - a description and files.
- **Joint sign-off** is recorded on the hindrance: the Company's Team Member, the other party's name and role, and the date. It is not an approval; the paper is still signed on site.
- Open hindrances (no end date) and those overlapping a date appear on that date's DPR.
- From a usage sheet with breakdown hours, **Record hindrance** opens a hindrance prefilled with Equipment breakdown, the date and a link to the sheet.
- New menu **Hindrance Register** (`site_work.hindrances`, C R U D P O, Project-scoped) and back-dated module `hindrance` (Site group).

### 15. Daily Progress Report (owner; open questions 14, 15)

- **Numbering.** Each Project gets one DPR number per date, the first time a DPR for that date is generated. Regenerating keeps the number and makes a new file.
- **Report Filled By** is optional. When chosen, it limits worksheets and usage sheets to that author, and the name is printed.
- **Contents, in order:**
  - header (Company, Project, address, Project logo when "Use Project logo on reports" is on, DPR number, date, filled by);
  - weather and site condition;
  - labour (attendance vs worksheet headcounts, by contractor);
  - worksheets;
  - equipment usage, with hire cost only for members with Financial on Equipment Usage;
  - materials received (GRNs and deliveries that day) and consumed;
  - visitors and instructions;
  - hindrances;
  - photos, when "Include images" is ticked.
- **Generation.** A report job runs inline with a 60-second limit, as other reports do until M9's queue. It moves through queued → running → done or failed, and can be retried.
- **Images.** The PDF prints Indian scripts (Noto) and at most 60 images, using their thumbnails.
- **Lifecycle.** Generated PDFs are kept until deleted (Progress Report D), and View Reports lists them. Push and "report ready" popups wait for M9.
- The **Task Progress Report** needs Tasks (M8). The Create screen names it as coming with M8.

### 16. Reports and dashboard

- **Reports.** The Project's Reports page gains:
  - **Daily Work** (worksheets for a date range);
  - **Company Owned Equipment Usage** and **Rented Equipment Usage** (hire cost with Financial);
  - **Equipment Maintenance** and **Equipment Transfers**.

  Each is an Excel and a PDF in the reporting pipeline.

- **Dashboard.** The Project Dashboard's **Daily Work** section (labour availability trend, contractor-wise skilled and unskilled) and **Equipment Usage** section (top equipment by work hours, owned vs rented hours) replace the M6 stubs of CM-412.

### 17. Not in M6

- per-line or multi-level approval;
- the Task link and BOQ-measured work done (M8 / M11);
- material reconciliation per contractor;
- counts per Labour Category;
- fuel from inventory;
- hire bills, TDS 194I and maintenance expenses (M7 / M11);
- maintenance schedules;
- offline outbox, WhatsApp submission, geo-tagged and drawing-pinned photos (M12);
- worksheet backups (M9).

## Consequences

- One new schema (`construction_site_work`) with one migration. Small migrations also touch:
  - `construction_masters`: Work Types; Labour Category skill and its backfill;
  - `construction_procurement`: two stock source types;
  - `construction_reporting`: six report kinds.

  Each touches only its own schema (ADR-0030).

- Site-work never imports procurement, labour or reporting. It posts stock and reads attendance through ports that `src/composition` implements, and the DPR is a reporting job fed by a site-work read model.
- The Permission Matrix gains Reject on two menus and two new menus, and the numbering settings gain four modules. Existing grants are unchanged.
