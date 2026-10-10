# 03 — Projects, Structure, Drawings & Gallery

A **Project** is the construction site or development every site entry, purchase, payment, attendance and sale belongs to. This module covers creating and managing projects (two-step wizard, status, type, budget, logo, resource assignment), the project home (tiles, pinning, hiding modules, tile order, backup, project chat), the **physical structure** of a building project — **Phases → Wings → Floors → Units** — and **Locations** for non-building projects, the **Location Type** taxonomy every site entry uses, **Project Drawings** (albums of files), the **Gallery** of project media, **Testing Reports**, and the **Project Dashboard**.

Who uses it:

- **Owner / project manager** creates projects, sets budget and status, assigns team and parties, configures wings and floors, reads the dashboard.
- **Site engineer / supervisor** picks locations on daily entries, uploads drawings, photos and test reports.
- **Sales** uses Units as the sellable inventory for Booking (09).
- **Quality / testing** staff upload lab reports per testing item.
- **Every project member** sees the tiles they have permission for, pins projects, and uses project chat.

---

## Legacy behaviour

### Projects home (bottom tab **Projects**)

- Project cards with status filter **All / Ongoing / Completed / Not started / On hold**, search, **pinned projects** first (`home/projects/pinned`).
- HRMS banner "Not checked in / Check In" (attendance state from `home/projects`, with `geo_fence_required`; see 10).
- `home/projects` (v2) returns: organization block, permissions summary, attendance state, `status_counts` (counts per status for the filter chips).
- **Project card**: initials avatar (or logo), name, address, start and end dates, **progress %**, kebab menu (**Pin**, **Edit**, **Hide modules**).
- Lists: `Project/GetAll`, `Project/Combo`, `projects/combo`, `projects/by-employee` (projects a member is assigned to), `v2/projects`.

### Create / edit project (`#/projectadd`, two steps)

| Step                               | Fields                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Details                         | Project Name*, Start Date, Expected Completion, Project Address, Project Status* (Ongoing / Completed / Not started / On hold), Project Type* (from master, `Project/Combo`), **Financials**: Budget Value, Project Logo upload |
| 2. Resources (Resource Assignment) | Assign Team Members, Contractors, Suppliers, Vendors, Contacts                                                                                                                                                                  |

- Save: `Project/Store` (legacy), `v2/projects/{id}` (read/update).
- The record also carries `useProjectLogoInReport` and `noOfPhase`.

**Contract Details, Custom Fields and Documents (CM-413, CM-414, [ADR CM-0010](../adr/CM-0010-project-contract-details-and-documents.md)).** These are not in the legacy app. The owner asked for them on 2026-10-09. The rebuilt form groups the Project into four cards:

- **Project:** the existing fields, the only required card.
- **Client:** name and mobile.
- **Contract:** Order Value (₹, excluding GST), then one row per paper with its number, date and attached files. The rows are Tender / RFQ ref., Quotation, LOA, PO / WO and Agreement. Quotation and PO / WO always show; the others appear on demand.
- **Additional details:** Custom Fields as name and value pairs, with names suggested from other Projects.

The optional cards start collapsed and show a one-line summary. Every field in the Client, Contract and Additional details cards is optional; the Project card keeps its required name and status. A **Documents** tab in the project shell lists every file grouped by paper, with view (PDFs and images only), download and delete. Files picked on Add Project upload once the Project is saved.

### Project options menu

- **View project details**.
- **Backup** — project data export (see Backup below).
- **Hide / Show Modules** — per-project module visibility.
- **Tile ordering** — drag order stored as `projectMenuOrderIds` (browser storage in legacy).

### Project home tiles (17)

Dashboard, Create Wing, Project Drawings, Testing Reports, Equipment Usage, Daily Worksheet, Manage Materials, Issues and snags, Reports, Payments, Inquiry, Booking Details, Progress Report, Task, Inspection Request, Gallery, Attendance. **Create Location** appears for non-building projects. A **project chat** icon sits top-right (one group chat per project, Firebase RTDB; see 13).

Project-level menu tree (`MenuPermission/MenuList`, parent Project#4): Dashboard, Wings, Create Location, Project Drawings, Testing Report, Equipment Usage, Worksheet, Issues and snags, Manage Materials {Central Store (MR), Current Inventory, Goods Received, Material Transfer, Purchase Order, Purchase Request}, Reports, Payments {Petty Cash, Transactions}, Inquiry, Booking, Progress Report, Task, Inspection Request, Gallery, Attendance {Labour, Vendor}.

| Tile                                                                                 | Owning module |
| ------------------------------------------------------------------------------------ | ------------- |
| Dashboard, Create Wing / Create Location, Project Drawings, Testing Reports, Gallery | 03 (this doc) |
| Daily Worksheet, Equipment Usage, Progress Report                                    | 04            |
| Task, Issues and snags, Inspection Request                                           | 05            |
| Manage Materials                                                                     | 06            |
| Payments                                                                             | 07            |
| Attendance                                                                           | 08            |
| Inquiry, Booking Details                                                             | 09            |
| Reports                                                                              | 11            |

### Project Dashboard (`#/chartsDashboard`) — "Charts & Performance Overview"

- **Filter duration**, default last 1 year.
- **KPI tiles**: Material Approvals, Payment Approvals, Pending Issues & Snags, Pending Inspections.
- **Manage Dashboard**: toggle and reorder sections — Task, Payments, Daily Work, Equipment Usage, Materials, Issue And Snag, Attendance, Inspection Request, Booking, Inquiry.

| Section            | Widgets                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task               | Project Progress % gauge (with start/end date); Value Earned By Task (task value vs earned value); Filtered By Status (Not Started / In Progress / Delayed / Completed counts)                                           |
| Payments           | Payment In & Out & Balance + trend chart; Due Payments table (party, total invoice, paid, due; export); Module Wise Payment pie (Contractor / Vendor / Supplier / Labour / Other Expenses)                               |
| Daily Work         | Total Labours Availability trend; Contractor-wise Labour (contractor, department, skilled, unskilled)                                                                                                                    |
| Equipment Usage    | Top Equipment by Work Hours; Category-wise (Owned vs Rented)                                                                                                                                                             |
| Materials          | Material Summary (total materials, in stock, low stock, out of stock, total PO, total PO value); Month-wise PO Value; Stock Register Report (movement and balance per material)                                          |
| Issues & Snags     | Status charts                                                                                                                                                                                                            |
| Attendance         | Labour Attendance present / absent; Labours Present At Site day-wise; Labour Payment Status (balance per labour); Vendor's Labour Attendance (present / half / OT); Vendor-wise Labour Allocation; Vendor Payment Status |
| Inspection Request | Total / approved / pending / rejected + Success Rate gauge                                                                                                                                                               |
| Booking            | Booking by Status (units booked vs available); Booking Report                                                                                                                                                            |
| Inquiry            | Funnel                                                                                                                                                                                                                   |

### Create Wing (`#/winglist`) — building structure

- **Phases**: Phase 1 … n (`noOfPhase` on project; `Phase/Combo`; wings are created under a phase with `Phase/CreateWingByPhase`).
- **Add Wing** form:
  - Wing Type* — one of 8: **Commercial, Residential, Bungalow scheme, Residential & Commercial, Plotting scheme, Institutional, Individual Unit, Industrial**.
  - Wing Name*.
  - Type-specific floor configuration, e.g. for Commercial: **Commercial Floors*** (count), **Start Number***, **Number Of Units Per Floor***, **Basement Parking Floors**.
  - **Continue to Units** → generated floor list, top to bottom: **Terrace Floor**, typed floors (e.g. Commercial Floor 5 … 1), **Ground Floor**, **Basement Floor 2 … 1**. Each floor shows unit chips: unit names editable, remove a unit, **+ Add** a unit; a floor can be renamed. Totals shown (example: Floors 9, Units 24).
- **Wing chart view** (`#/wingChartRoute`) — visual grid of floors × units.
- `Wings/GetAll` lists wings.
- Units are the **sales inventory** for Booking (09: `Booking/AddArea` unit areas, `Booking/AddUnavailableUnit`, `Booking/UnitImport` Excel) and the **location target** for worksheets, issues, inspections, tasks.

### Create Location (non-building projects)

- Menu **Create Location #74** for projects that are not wing/floor/unit buildings (roads, infrastructure, etc. — inferred). Locations are a flat named list used where wings would be (inferred: the notes give the menu, not the form).

### Location Type taxonomy (used by every site entry)

Every site entry (Daily Worksheet, Equipment Usage, Issues & Snags, Inspection Request, Task, Purchase Order, Purchase Request, Central Store MR) has a **Location Type** selector:

| Location Type                    | Then pick                                           |
| -------------------------------- | --------------------------------------------------- |
| **Wing**                         | Wing → Floor (multi-select) → Unit                  |
| **Amenities**                    | Amenity (from 02 Amenities assigned to the project) |
| **Common Developments**          | Common Development (from 02)                        |
| Location (non-building projects) | Location (from Create Location) — inferred          |

Task uses "Location Type / Wing / Locations"; MR uses "Location Type / Wing / Location".

### Project Drawings (`#/projectplanalbum`)

- **Albums** — seeded per project: **Architect, Electrical, Plumbing, Structural Drawing**; add album (Album Name*); delete album.
- Inside an album: upload drawing files; built-in image / PDF viewer.
- `Drawing/Combo` feeds pickers; Inspection Requests link drawings ("Upload Drawings and site photographs"; `TestingItemDrawing/Combo`).
- **Notification** permission: members are notified of new drawings.
- Reports: "Drawings Data" in the project report set; drawings are part of the Media Backup.

### Testing Reports (`#/testingReport`)

- **Testing Items** per project — seeded **Rcc cube, Steel, Cement, Bricks**; add item (Testing Material Name*).
- Inside an item: **reports** — Name*, Report Date*, Upload Test Report (file).
- Search by report name. `MaterialTestingReport/GetAll`.
- "Testing Report Data" in the project report set; "Material Testing Report" is a back-dated-entry module (12).

### Gallery

- Tile **Gallery #55** (read only). Shows project media gathered from entries (worksheet work photos, issue images, inspection images, equipment usage files, drawings) — inferred from the "Project All Media" report and Media Backup.
- Endpoints that serve media: `File/Images`, `Photo/Document`, `WorkSheetImages/Upload`.
- The brief describes search across images / PDF and an "uploaded by" attribute; the notes only confirm the tile, its read-only permission, and the "Project All Media" report. Treat search and uploaded-by as required behaviour to confirm (see Open questions).

### Backup (project options and Reports tile)

- **Data Backup** and **Media Backup**, each with a **date range**.
- **Generate Backup** runs asynchronously; result is emailed / OTP-protected.
- Option **"Only Current Project Report"**.
- Daily worksheet has its own backup route (`#/dailyWorkBackupRoute`, see 04).
- Reports render as PDF or Excel with header Organisation, Project, Address, Duration and "Page x of y".

### Project chat

- One group chat per project (`GroupChat/GroupList`), opened from the project top bar; Firebase RTDB (see 13).

---

## Entities & fields

### Project

| Field                  | Type                                                 | Required | Notes                                                                                    |
| ---------------------- | ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| id                     | int                                                  | yes      |                                                                                          |
| companyId              | FK → Organization                                    | yes      |                                                                                          |
| name                   | string                                               | yes      | "Project Name".                                                                          |
| startDate              | date                                                 | no       |                                                                                          |
| endDate                | date                                                 | no       | "Expected Completion".                                                                   |
| address                | text                                                 | no       | "Project Address".                                                                       |
| projectTypeId          | FK → ProjectType                                     | yes      |                                                                                          |
| status                 | enum{Ongoing=1, Completed=2, NotStarted=3, OnHold=4} | yes      | Numeric mapping follows the listed order "Ongoing/Completed/Not started/On hold → 1..4". |
| budgetValue            | decimal(14,2)                                        | no       | Financials.                                                                              |
| logoImage              | file                                                 | no       |                                                                                          |
| useProjectLogoInReport | bool                                                 | no       | Report header uses project logo instead of company logo (inferred).                      |
| noOfPhase              | int                                                  | no       | Phases on the structure screen.                                                          |
| employeeIds            | FK[] → TeamMember                                    | no       | Resources.                                                                               |
| contractorIds          | FK[] → Contractor                                    | no       | Resources.                                                                               |
| supplierIds            | FK[] → Supplier                                      | no       | Resources.                                                                               |
| vendorDetailIds        | FK[] → Vendor                                        | no       | Resources.                                                                               |
| contactIds             | FK[] → Contact                                       | no       | Resources (`Contact/GetAll`).                                                            |
| progressPct            | decimal(5,2)                                         | system   | Shown on card; source likely Task progress (inferred).                                   |
| clientName             | string ≤ 120                                         | no       | Client. Who gave the work (CM-413, ADR CM-0010).                                         |
| clientPhone            | E.164 Indian mobile                                  | no       | Client's mobile.                                                                         |
| tenderRef              | string ≤ 60                                          | no       | "Tender / RFQ ref." — the client's tender or RFQ number.                                 |
| quotationNo / Date     | string ≤ 60 / date                                   | no       | The Company's Quotation to the client.                                                   |
| loaNo / Date           | string ≤ 60 / date                                   | no       | Letter of Award (government and EPC work).                                               |
| clientOrderNo / Date   | string ≤ 60 / date                                   | no       | "PO / WO" — the Client Order. Not the procurement Purchase Order (06).                   |
| agreementNo / Date     | string ≤ 60 / date                                   | no       | The signed contract agreement.                                                           |
| orderValue             | paise (bigint)                                       | no       | Client Order value excluding GST; Financial flag only.                                   |
| customFields           | {label, value}[] ≤ 20                                | no       | Per-Project fields the Company names; labels unique ignoring case.                       |
| documents              | ProjectDocument[] ≤ 50                               | no       | Files filed under tender / quotation / loa / client_order / agreement / other (CM-414).  |

### ProjectType

| Field | Type   | Required | Notes                            |
| ----- | ------ | -------- | -------------------------------- |
| id    | int    | yes      | From master via `Project/Combo`. |
| name  | string | yes      | Values not captured in notes.    |

### ProjectMemberPreference

| Field      | Type            | Required | Notes                                            |
| ---------- | --------------- | -------- | ------------------------------------------------ |
| employeeId | FK → TeamMember | yes      |                                                  |
| projectId  | FK → Project    | yes      |                                                  |
| isPinned   | bool            | no       | `projects/pinned`.                               |
| tileOrder  | FK[] → Menu     | no       | `projectMenuOrderIds` (legacy: browser storage). |

### ProjectModuleVisibility

| Field     | Type         | Required | Notes                                                           |
| --------- | ------------ | -------- | --------------------------------------------------------------- |
| projectId | FK → Project | yes      |                                                                 |
| menuId    | FK → Menu    | yes      |                                                                 |
| isHidden  | bool         | yes      | "Hide/Show Modules"; per project (whether per user is unclear). |

### Contact

| Field         | Type   | Required | Notes                |
| ------------- | ------ | -------- | -------------------- |
| id            | int    | yes      | `Contact/GetAll`.    |
| name / mobile | string | inferred | Fields not in notes. |

### Phase

| Field     | Type         | Required       | Notes                 |
| --------- | ------------ | -------------- | --------------------- |
| id        | int          | yes            |                       |
| projectId | FK → Project | yes            |                       |
| name      | string       | yes            | "Phase 1", "Phase 2"… |
| sequence  | int          | yes (inferred) |                       |

### Wing

| Field                 | Type                                                                                                                               | Required                  | Notes                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| id                    | int                                                                                                                                | yes                       |                                                                     |
| projectId             | FK → Project                                                                                                                       | yes                       |                                                                     |
| phaseId               | FK → Phase                                                                                                                         | yes                       | `CreateWingByPhase`.                                                |
| wingType              | enum{Commercial, Residential, BungalowScheme, ResidentialAndCommercial, PlottingScheme, Institutional, IndividualUnit, Industrial} | yes                       |                                                                     |
| name                  | string                                                                                                                             | yes                       |                                                                     |
| typedFloorCount       | int                                                                                                                                | yes for floor-based types | e.g. "Commercial Floors*".                                          |
| startNumber           | int                                                                                                                                | yes for floor-based types | First floor / unit number.                                          |
| unitsPerFloor         | int                                                                                                                                | yes for floor-based types |                                                                     |
| basementParkingFloors | int                                                                                                                                | no                        |                                                                     |
| hasTerrace            | bool                                                                                                                               | system                    | Terrace generated in the example (inferred always for floor types). |

### Floor

| Field  | Type                                   | Required | Notes                                        |
| ------ | -------------------------------------- | -------- | -------------------------------------------- |
| id     | int                                    | yes      |                                              |
| wingId | FK → Wing                              | yes      |                                              |
| kind   | enum{Terrace, Typed, Ground, Basement} | yes      | Typed = Commercial / Residential … floor.    |
| name   | string                                 | yes      | Generated ("Commercial Floor 5"), renamable. |
| level  | int                                    | yes      | Order; basements negative (inferred).        |

### Unit

| Field         | Type                            | Required | Notes                         |
| ------------- | ------------------------------- | -------- | ----------------------------- |
| id            | int                             | yes      |                               |
| floorId       | FK → Floor                      | yes      |                               |
| name          | string                          | yes      | Generated, editable chip.     |
| areas         | {label, value, uom}[]           | no       | `Booking/AddArea` (see 09).   |
| isUnavailable | bool                            | no       | `Booking/AddUnavailableUnit`. |
| bookingStatus | enum{Available, Booked, OnHold} | system   | Owned by 09.                  |

### Location (non-building)

| Field     | Type         | Required | Notes     |
| --------- | ------------ | -------- | --------- |
| id        | int          | yes      | Inferred. |
| projectId | FK → Project | yes      |           |
| name      | string       | yes      |           |

### LocationRef (embedded in every site entry)

| Field             | Type                                             | Required                       | Notes                                                |
| ----------------- | ------------------------------------------------ | ------------------------------ | ---------------------------------------------------- |
| locationType      | enum{Wing, Amenity, CommonDevelopment, Location} | depends on entry               | `Location` value inferred for non-building projects. |
| wingId            | FK → Wing                                        | if Wing                        |                                                      |
| floorIds          | FK[] → Floor                                     | no                             | Multi-select.                                        |
| unitId            | FK → Unit                                        | no                             | Some forms allow multiple (inferred).                |
| developmentTypeId | FK → DevelopmentType                             | if Amenity / CommonDevelopment | 02.                                                  |
| locationId        | FK → Location                                    | if Location                    | Inferred.                                            |

### DrawingAlbum

| Field     | Type         | Required | Notes                                                                     |
| --------- | ------------ | -------- | ------------------------------------------------------------------------- |
| id        | int          | yes      |                                                                           |
| projectId | FK → Project | yes      |                                                                           |
| name      | string       | yes      | "Album Name". Seeds: Architect, Electrical, Plumbing, Structural Drawing. |

### Drawing

| Field      | Type              | Required          | Notes                                                                         |
| ---------- | ----------------- | ----------------- | ----------------------------------------------------------------------------- |
| id         | int               | yes               |                                                                               |
| albumId    | FK → DrawingAlbum | yes               |                                                                               |
| file       | file              | yes               | Image or PDF viewable; .dwg storable (per brief; viewer support unconfirmed). |
| name       | string            | no (inferred)     |                                                                               |
| uploadedBy | FK → TeamMember   | system (inferred) |                                                                               |
| uploadedAt | datetime          | system (inferred) |                                                                               |

### TestingItem

| Field     | Type         | Required | Notes                                                            |
| --------- | ------------ | -------- | ---------------------------------------------------------------- |
| id        | int          | yes      |                                                                  |
| projectId | FK → Project | yes      |                                                                  |
| name      | string       | yes      | "Testing Material Name". Seeds: Rcc cube, Steel, Cement, Bricks. |

### TestingReport

| Field         | Type             | Required       | Notes                            |
| ------------- | ---------------- | -------------- | -------------------------------- |
| id            | int              | yes            |                                  |
| testingItemId | FK → TestingItem | yes            |                                  |
| name          | string           | yes            | Searchable.                      |
| reportDate    | date             | yes            | Back-dated control applies (12). |
| file          | file             | yes (inferred) | "Upload Test Report".            |
| createdBy     | FK → TeamMember  | system         |                                  |

### MediaItem (Gallery)

| Field        | Type                                                                                               | Required | Notes                                            |
| ------------ | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| id           | int                                                                                                | yes      | Inferred aggregate view over module attachments. |
| projectId    | FK → Project                                                                                       | yes      |                                                  |
| sourceModule | enum{Worksheet, EquipmentUsage, Issue, Inspection, Task, Drawing, TestingReport, PettyCash, Other} | yes      | Inferred.                                        |
| sourceId     | int                                                                                                | yes      |                                                  |
| file         | file                                                                                               | yes      | Image or PDF.                                    |
| uploadedBy   | FK → TeamMember                                                                                    | yes      | Per brief.                                       |
| uploadedAt   | datetime                                                                                           | yes      |                                                  |

### DashboardLayout

| Field          | Type                                                                                                                                                          | Required       | Notes                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------- |
| employeeId     | FK → TeamMember                                                                                                                                               | yes (inferred) |                      |
| projectId      | FK → Project                                                                                                                                                  | no             |                      |
| sections       | {key: enum{Task, Payments, DailyWork, EquipmentUsage, Materials, IssueAndSnag, Attendance, InspectionRequest, Booking, Inquiry}, visible: bool, order: int}[] | yes            | "Manage Dashboard".  |
| durationFilter | date range                                                                                                                                                    | no             | Default last 1 year. |

### BackupJob

| Field              | Type                                    | Required | Notes                          |
| ------------------ | --------------------------------------- | -------- | ------------------------------ |
| id                 | int                                     | yes      |                                |
| projectId          | FK → Project                            | yes      | Unless all projects.           |
| kind               | enum{Data, Media}                       | yes      |                                |
| fromDate / toDate  | date                                    | yes      |                                |
| onlyCurrentProject | bool                                    | no       | "Only Current Project Report". |
| status             | enum{Queued, Generating, Ready, Failed} | system   | Inferred.                      |
| deliveredTo        | string                                  | system   | Email; OTP to open (inferred). |

---

## Workflows & states

1. **Create project** — Projects home FAB → Step 1 Details (name, status, type required; dates, address, budget, logo optional) → Step 2 Resources (team members, contractors, suppliers, vendors, contacts) → Save. Plan limit on projects checked (01). Project appears on home under its status chip.
2. **Edit project** — card kebab → Edit → same two steps.
3. **Change status** — edit Project Status (Ongoing / Completed / Not started / On hold); home status counts update.
4. **Pin / unpin** — card kebab → Pin; pinned projects listed first.
5. **Hide / show modules** — project options → toggle tiles; hidden tiles disappear from the project home.
6. **Reorder tiles** — drag tiles; order saved (`projectMenuOrderIds`).
7. **Build structure** — Create Wing → choose Phase (add phases) → Add Wing (type, name, floor counts, start number, units per floor, basements) → Continue to Units → review generated floors (Terrace, typed floors, Ground, Basements) → rename floors, edit/remove/add unit chips → Save → view as wing chart.
8. **Non-building project** — Create Location → add named locations → entries pick Location Type = Location (inferred).
9. **Assign amenities / common developments** — from 02 (`DevelopmentType/AssignItem`) so they are selectable as location types in this project.
10. **Drawings** — open album (or create one) → upload files → members with notification permission are notified → open in viewer; delete album removes its files (inferred cascade).
11. **Testing report** — open Testing Reports → choose testing item (or add one) → add report (name, date, file) → searchable list.
12. **Gallery** — open Gallery → browse project media (read only).
13. **Dashboard** — open Dashboard → pick duration → view KPI tiles and sections → Manage Dashboard to show/hide/reorder sections.
14. **Backup** — project options → Backup → choose Data or Media, date range, current project only → Generate → notification when ready → download via emailed link with OTP.
15. **Project chat** — tap chat icon → project group conversation (13).

### Project status

```mermaid
stateDiagram-v2
    [*] --> NotStarted
    [*] --> Ongoing
    NotStarted --> Ongoing
    Ongoing --> OnHold
    OnHold --> Ongoing
    Ongoing --> Completed
    Completed --> Ongoing: Reopen (legacy allows any edit)
```

Legacy allows any status to be chosen on edit; the transitions above are the expected business path.

### Wing configuration

```mermaid
stateDiagram-v2
    [*] --> WingDetails: Add Wing
    WingDetails --> FloorsGenerated: Continue to Units
    FloorsGenerated --> FloorsGenerated: Rename floor / add or remove unit
    FloorsGenerated --> Saved: Save
    Saved --> FloorsGenerated: Edit wing
```

### Backup job

```mermaid
stateDiagram-v2
    [*] --> Queued: Generate Backup
    Queued --> Generating
    Generating --> Ready: Notification / email sent
    Generating --> Failed
    Ready --> [*]
```

### Unit availability (owned by 09, shown here for structure)

```mermaid
stateDiagram-v2
    [*] --> Available
    Available --> OnHold
    Available --> Booked
    OnHold --> Booked
    OnHold --> Available
    Booked --> Available: Booking cancelled (inferred)
    Available --> Unavailable: AddUnavailableUnit
```

---

## Business rules & validations

- Project required: Project Name, Project Status, Project Type. Start Date, Expected Completion, Address, Budget, Logo optional.
- Expected Completion should not be before Start Date (inferred).
- Project count is limited by the subscription (plan includes + project add-ons, 01).
- A member sees only projects they are assigned to (`projects/by-employee`), unless their role grants otherwise (inferred).
- Parties assigned in Resources (and from party forms in 02) are the only ones offered in that project's pickers.
- Hidden modules are hidden for the project; permission still governs access (hiding does not grant).
- Wing required: Wing Type, Wing Name; for floor-based types, typed-floor count, Start Number, Units Per Floor are required; Basement Parking Floors optional.
- Floor generation order: Terrace → typed floors from highest number down to Start Number → Ground → Basement floors from deepest number to 1 shown as "Basement Floor 2 … 1".
- Generated units per floor = Units Per Floor; individual floors can then deviate (add/remove units).
- Unit names are editable and should be unique within a wing (inferred; Booking identifies units by Wing + Unit No).
- A unit with bookings, worksheet entries, issues or inspections should not be removable (inferred guard).
- Floor selection on site entries is multi-select; unit selection depends on the chosen floor(s).
- Album name required; Testing Material Name required; Testing report Name and Report Date required.
- Testing report date and other site-entry dates are subject to back-dated entry limits and the financial closing date (12).
- Gallery is read only; media is added from the source module.
- Backups are asynchronous and protected (email / OTP); user is told "You will receive a popup once the report is ready" (same pattern as progress reports).
- Storage used by drawings, reports and photos counts against the plan's Storage GB (01).
- Permission gates: Project #4 create/update/delete for project edit; Create Wing #6 for structure; Create Location #74; Project Drawings #21; Testing Reports #44; Gallery #55 read; Dashboard #65 read; financial flag on Project #4 for budget (inferred).
- "Discard changes?" confirmation when leaving the wizard with unsaved input (inferred).

---

## Permissions

| Feature                                    | Menu # | Flags honoured                                                     |
| ------------------------------------------ | ------ | ------------------------------------------------------------------ |
| Project (create, edit, delete, budget)     | 4      | create, read, update, delete, financial (Budget Value — inferred)  |
| Create Wing (phases, wings, floors, units) | 6      | create, read, update, delete                                       |
| Create Location                            | 74     | create, read, update, delete                                       |
| Project Drawings                           | 21     | create, read, update, delete, notification                         |
| Testing Reports                            | 44     | create, read, update, delete                                       |
| Gallery                                    | 55     | read                                                               |
| Dashboard                                  | 65     | read (each widget also needs read on its source menu — inferred)   |
| Reports / Backup                           | 20     | read, print                                                        |
| Project membership                         | —      | Resource assignment in step 2 decides which projects a member sees |

Dashboard widgets showing money (Payments, Value Earned, PO value, labour/vendor payment status) should honour the **financial** flag of the source menu (inferred).

---

## Relationships

- → depends on 01 Organization/Identity/Access: company scope, team members, permissions, subscription project/storage limits.
- → depends on 02 Master Records: Project Type, Contractors, Suppliers, Vendors, Amenities, Common Developments, Contacts.
- ← used by 04 Daily Site Work: project scope, Location Type / Wing / Floor / Unit on worksheets and equipment usage; progress report header (organisation, project, address, logo).
- ← used by 05 Tasks/Issues/Inspections: locations; drawings linked to inspections; task progress drives the project progress % and dashboard.
- ← used by 06 Procurement & Inventory: project as store / stock owner, delivery address default = project address, location on PR/PO/MR.
- ← used by 07 Payments & Accounting: project on every payment, budget vs spend (inferred), dashboard payment widgets.
- ← used by 08 Labour & Vendor Attendance: labour/vendor assignment to projects; attendance widgets.
- ← used by 09 Sales CRM: Units as booking inventory; Wing for Interested In; lead sources per project; booking/inquiry widgets.
- ← used by 10 HRMS: project site geo-fences (`hrms/branches/project-sites`).
- ← used by 11 Reports/Dashboards/Backup: project report set, backups, central reports across projects.
- ← used by 12 Settings: numbering rules per project ("Project Id" segment such as `PX`), back-dated limits for Material Testing Report.
- ← used by 13 Chat/Notifications/Support: project group chat; drawing notifications.

---

## Reports & exports

- **Project report set** (Reports tile, 11) includes, from this module: **Drawings Data**, **Testing Report Data**, **Project All Media**.
- **Backup**: Data Backup and Media Backup with date range, current project only, async, emailed and OTP-protected.
- **Dashboard**: Due Payments table export; Stock Register Report and Booking Report widgets link to full reports.
- **Wing chart** view (visual only).
- Report header: Organisation, Project, Address, Duration, project or company logo (`useProjectLogoInReport`), "Page x of y"; output PDF or Excel.

---

## Rebuild recommendations

1. **Persist preferences server-side.** Pin state, tile order (`projectMenuOrderIds`) and dashboard layout lived partly in browser storage; store them per member so they follow the user across devices.
2. **One location model.** Replace "Wing → Floor → Unit | Amenity | Common Development | Location" with a single location tree per project (site → phase → wing → floor → unit, plus amenity and common-development nodes, plus free locations for non-building projects). Every entry stores one location id (or a set), which makes progress, issues and cost roll up by any node.
3. **RERA fields on Project and Wing** (research doc §2 RERA): RERA registration number and state, whether registration is required (> 500 sq m or > 8 units), designated bank account (70% rule), quarterly progress-report schedule configurable per state, and physical % complete per wing/building as the input for architect/engineer/CA certificates (Forms 1–3). Inventory status sold/unsold per unit comes from 09.
4. **Unit handover and DLP.** Add handover date per unit and a defect-liability phase so snags after handover fall under the 5-year RERA structural warranty or contractual DLP (research doc §2 RERA, §3 DLP).
5. **Project tax profile** (research doc §2 GST): project category (affordable residential 1%, other residential 5% without ITC, commercial, works-contract for a client) drives the ITC-eligible flag on purchases and the 80/20 registered-supplier test per project per FY; BOCW cess = 1% of cost of construction excluding land, so record land cost separately from construction budget.
6. **Budget beyond a single number.** Keep Budget Value but plan for a BOQ / cost-code budget (research doc §3 BOQ) so the dashboard can show planned vs actual by trade.
7. **Testing registers per IS 456** (research doc §3 Concrete testing): turn "testing item → file" into pour register → cube sample (3 cubes, sample count by m³ poured) → 7/28-day results → acceptance flag (individual ≥ fck − 3; mean ≥ fck + 0.825σ or fck + 4), with lab report file attached; keep a free-form report for steel (IS 1786), bricks (IS 3495), aggregates (IS 2386), MTC per batch.
8. **Drawing-pinned work** (research doc §4.8, §4.5): let users pin photos, issues and progress to a point on a drawing sheet; keep drawing revisions (revision number, date, superseded flag) instead of overwriting files; support .dwg storage with PDF preview.
9. **Gallery as an index, not a copy.** Build Gallery from attachments of all modules with source, location, uploader, timestamp and geo-tag; filter by type (image / PDF), date, module, uploader, location. Geo-tagged photos feed DPR and RERA % complete (research doc §4.5).
10. **Backups as tracked jobs** with signed, expiring download links; record who requested and downloaded them (audit). Keep full export available regardless of plan status (research doc §4.9).
11. **Status transitions with history.** Record each project status change with date and user; completing a project should warn about open POs, unpaid invoices, open issues.
12. **Soft delete projects and structure.** Archive instead of delete; block removing floors/units that carry bookings or entries.
13. **Offline structure cache** (research doc §4.2): site entries need the location tree offline; keep it small and versioned for sync.
14. **Geo-fence per project site** is already in HRMS (`hrms/branches/project-sites`); store project coordinates on the Project so attendance, photos and the map can share them.

---

## Decisions for the build

M4 answered the open questions below with recommended defaults in [ADR CM-0013](../adr/CM-0013-projects-structure-product-decisions.md) (product) and [ADR CM-0014](../adr/CM-0014-attachments-and-gallery-index.md) (attachments and the Gallery index). Rules the build settles are added here by ticket.

### CM-401

- **Project Type** is required on Add Project: missing or `null` is 400 `PROJECT_TYPE_REQUIRED`; an unknown key is 400 `VALIDATION_ERROR`. An edit that leaves `projectType` out keeps the stored type (so a pre-M4 Project stays "Not set"); an edit that sends `null` is 400 `PROJECT_TYPE_REQUIRED`, so a type, once set, can be changed but not removed. The form requires it on Add only; on Edit of a Project without one it may stay blank and is then left out of the request.
- The Project response carries `projectType` (null only before M4) and `structure` (`"wings" | "locations"` from `projectStructure()`; no type means Wings). Options for pickers stay `{ id, name, status }`: pickers show names only, and the Projects list carries what the card needs.
- **Budget** (`budgetValue`) is paise, 0 to ₹1,000 crore (the Order Value guard), 400 `PROJECT_BUDGET_INVALID` otherwise; omitted keeps it, `null` clears it. Without the Project menu's Financial flag it is `null` in every response and ignored in a create or edit, so the stored value survives — exactly the Order Value rule.
- The Projects list response gains `financial` (the caller's Project menu Financial flag). The Add and Edit forms read it: without it the Budget field is not drawn, the Order value field is hidden, and neither is sent.
- `useLogoInReports` defaults to false; omitted keeps it. Nothing reads it until M9.
- **Logo**: `POST …/projects/{id}/logo` (raw image body, `projects.project` Update), `POST …/logo/remove` (Update; fine without a logo), `GET …/logo` (Read; streams privately). PNG, JPEG or WebP by content, at most 2 MB (`IMAGE_LIMITS.project_logo`), key `companies/<workspaceId>/project-logos/<projectId>/<uuid>.<ext>`, a `stored_files` row of kind `project_logo` written with the Project, the replaced file marked deleted and removed from storage, audited as `project.logo_changed` / `project.logo_removed`. The upload asks the plan for the storage first (402 when full). Project visibility applies: another Company's Project or one a Member is not on is 404. A logo change bumps the Project's `updatedAt`.
- `logoUrl` is `/api/construction/projects/projects/{id}/logo?v=<file id>`, so it changes with the logo and browsers refetch.
- **On the form** the Project card holds Project Type (beside Status), Budget (after the dates, Financial only) and, at its foot, the Project logo with "Use Project logo on reports". The Contract card is unchanged apart from hiding the Order value without Financial. A logo picked or removed on Add or Edit waits in the browser and is applied right after the Project is saved, so it never makes the form's `updatedAt` stale; if it fails the Project opens with "The logo couldn't be saved. Try again from Edit Project."
- The Projects home row shows the logo (initials without one) and the Project Type label ("Project Type not set" before M4); the project shell header shows the logo when there is one and the type beside the status; the Overview's Details show Project Type and, with Financial, Budget.
- **Seeds**: a new Project gets the albums Architect, Electrical, Plumbing, Structural Drawing and the testing items Rcc cube, Steel, Cement, Bricks (`project-seeds.ts`, `is_seed = true`) in the same transaction as the Project insert.
- **Delete guard**: live Wings, Locations, drawings and testing reports now make 409 `PROJECT_IN_USE` (alongside labours, vendors, attendance, wage payments and documents). Albums and testing items, seeded or not, do not block on their own; deleting a Project leaves them with the tombstoned Project.

### CM-402

- **Generator** (`src/projects/domain/wing-generator.ts`, pure, imported by the editor and the server): typed floors 0–150, start number 0–999, units per floor 1–50, basements 0–10 (default 0), terrace on by default, scheme units 1–2,000 (start number default 1); at most 5,000 units a Wing. Errors carry `details.field`. Typed floors are named after the Wing Type ("Commercial Floor 5", "Institutional Floor 2"; Individual Unit "Floor 3"); Terrace Floor, Ground Floor, Basement Floor N. Residential & Commercial: Ground takes the commercial units per floor; commercial and residential floors together ≤ 150. A scheme's row is "Plots" / "Bungalows".
- **Stored configuration** keeps only the Wing Type's fields (`wingConfig`), shown read-only on Edit Wing. Edit Wing does not regenerate: the Wing Type and configuration stay; the editor changes floors and units.
- **Save validation** (`wing-floors.ts`, browser and server): 1–200 floors; floor names ≤ 60 and unit names ≤ 30, spaces tidied, **both unique in the Wing ignoring case**; kinds in order Terrace → typed → Ground → basements (each of terrace and ground at most once; `other` anywhere); a scheme is exactly one `site` row and no other kind; `site` only in schemes. Errors name the row (`details.floorIndex`, `unitIndex`).
- **Levels**: Ground 0, floors above count up, below count down; without Ground the floors above the first basement end at 1; a scheme row is 0.
- **Edit**: the request carries every floor the Wing keeps, top to bottom; a row with an id is updated, without one created, a stored row left out is tombstoned (units on a removed floor go with it unless sent under another floor). A stored floor keeps its stored kind. An id not on the Wing (or sent twice) is 400 `WING_FLOOR_NOT_FOUND` / `WING_UNIT_NOT_FOUND`. Guarded by the Wing's `updatedAt` (409 `WING_CHANGED`, checked before and as compare-and-set in the write). Renamed units are parked on a placeholder name in the transaction so swaps pass the live-name index. Only changed rows are written.
- **StructureUsage** port (`domain/structure-repository.ts`) is asked before removing floors, units, a Wing or a Location (409 `UNIT_IN_USE` with the unit names, `FLOOR_IN_USE`, `WING_IN_USE`, `LOCATION_IN_USE`). M4's `UnusedStructure` answers "not used"; M6 / M8 / M10 replace it with a reader of their tables by id.
- **Phases**: names ≤ 60, unique in the Project ignoring case; new Phases go last; Add Phase suggests "Phase N". A Wing created without `phaseId` goes into the first Phase, and a Project with none gets "Phase 1" in the same transaction. Rename is guarded by `updatedAt` (409 `PHASE_CHANGED`); delete is refused while the Phase holds live Wings (409 `PHASE_NOT_EMPTY`, checked under a row lock). A Wing can move to another Phase on Edit (it goes last there). A `phaseId` of another Project is 400 `WING_PHASE_INVALID`.
- **Wing name** ≤ 60, unique in the Project ignoring case (409 `WING_NAME_IN_USE`). Wing delete tombstones the Wing, its floors and units; the name is free again.
- **Permissions**: phases and wings use `projects.wings` (create / read / update / delete); routes pass no `projectId` to `requireAccess`, so a Member not on the Project gets 404 `PROJECT_NOT_FOUND` from the handlers, like Documents.
- **Project delete** (CM-0013 §13): live Wings and Locations now keep a Project from being deleted (`PrismaProjectUsage`).
- **Read models for CM-403**: `ProjectStructureReader` (`src/projects/application/structure-read-model.ts`), built by `createProjectStructureReader()` (`src/projects/infrastructure/create-project-structure.ts`): `wings(workspaceId, projectId)` → live Wings (Phase order, then Wing order) with live floors top to bottom and live units in order; `locations(workspaceId, projectId)` → live Locations in order. No visibility check: callers check first.
- **Screens**: Wings (`/app/projects/{id}/wings`), Add Wing (`…/wings/new?phase=`), the wing chart (`…/wings/{wingId}`, scrolls inside its own frame), Edit Wing (`…/wings/{wingId}/edit`). Add Wing returns to the details when Save answers `WING_NAME_IN_USE`; going back to the details and continuing again regenerates the floors. Removing a floor in the editor is offered only for named (`other`) floors.

### CM-403

- **LocationRef** (`src/shared-kernel/location-ref.ts`, ADR CM-0013 §7): `wing` (`wingId`, `floorIds[]`, `unitIds[]`), `amenity` / `common_development` (`developmentId`), `location` (`locationId`). `locationRef(input)` cleans and checks the shape: type required (400 `LOCATION_TYPE_REQUIRED`) and known (`LOCATION_TYPE_INVALID`); the type's id required (`LOCATION_ID_REQUIRED`, message per type) and a uuid (`LOCATION_ID_INVALID` with `details.ids`); ids trimmed, lower-cased, de-duplicated in order; at most 200 Floors and 5,000 Units (`LOCATION_TOO_MANY_FLOORS` / `_UNITS`, a Wing's own limits); fields of other types dropped. Every error has `details.field`. A site entry with no location stores no LocationRef; whether one is required is the entry's rule.
- **400, not 422**: an id that is not the Project's is 400, like every unknown-id check in the app (`*_NOT_FOUND`, CM-406).
- **Resolver** (`src/composition/location-resolver.ts`, `ProjectLocations`, built by `createProjectLocations()`): reads Wings and Locations from the projects context (`ProjectStructureReader`, which gained `wing(workspaceId, projectId, wingId)` so a check reads one Wing) and the assigned developments from the masters context (`ProjectDevelopmentHandlers.assigned`). Rules: the Wing is live and the Project's (`LOCATION_WING_NOT_FOUND`); every Floor is on it (`LOCATION_FLOOR_NOT_ON_WING`); every Unit is on the Wing (`LOCATION_UNIT_NOT_ON_WING`) and, when Floors are chosen, on one of them (`LOCATION_UNIT_NOT_ON_FLOORS`); no Floors and no Units means the whole Wing. An Amenity or Common Development must be assigned to the Project (`LOCATION_AMENITY_NOT_ASSIGNED` / `LOCATION_COMMON_DEVELOPMENT_NOT_ASSIGNED`; the other kind's id fails too); a **disabled** one still assigned is accepted, so an entry made before it was disabled can be edited and saved again — the picker just does not offer it. A Location must be live and the Project's (`LOCATION_NOT_ON_PROJECT`). Errors carry `details.field` and the offending `details.ids`. The resolver does not check visibility: the site entry's handlers check the Project first.
- **Options**: `GET /api/construction/projects/projects/{id}/location-options` (`projects.project` Read; another Company's Project or one a Member is not on is 404) returns `{ structure, types, wings: [{ id, name, phaseName, floors: [{ id, name, kind, units: [{ id, name }] }] }], amenities, commonDevelopments, locations }`. `types` lists only the Location Types with rows, in `LOCATION_TYPES` order; amenities and common developments are the assigned **enabled** ones by name; a Project whose only developments are disabled offers no such type. `structure` tells the picker which page to send someone to when `types` is empty.
- **Picker** (`components/locations/location-picker.tsx`): `LocationPicker` (`projectId`, `value`, `onChange`, `id`, `ref`, `label`, `required`, `disabled`, `invalid`) works under a react-hook-form `Controller`; `onChange` gets a complete LocationRef or `null` (a type alone is not a location, so a required field stays empty until the Wing, Amenity, Common Development or Location is chosen). Location Type is hidden when the Project offers one type. Wing is grouped by Phase when there are several; Floors and Units are chip multi-selects with search; Units list the chosen Floors' Units (all of the Wing's when none) with the Floor beside each, 100 at a time with "Type a Unit number to find the rest"; a plot or bungalow scheme shows no Floors. Changing the type clears the value; changing the Wing clears Floors and Units; unchoosing a Floor drops its Units. A stored value whose Wing or development is no longer offered stays chosen ("No longer available") until changed. An empty Project shows "Nothing to locate this at yet" with **Open Wings** or **Open Locations** by its structure. `LocationLabel` and `locationLabel()` give the one-line label ("Wing A · Ground Floor, Floor 1 · Units G01, 101", "Amenity · Swimming Pool"; at most three names, then "+N more").
- The options query is always stale (`staleTime: 0`), so a form opened after a Wing, Location or assignment changed refetches in the background.
- **No site entry consumes it yet**: Purchase Requests (M5), Daily Worksheets and Equipment Usage (M6) and Tasks, Issues and Inspections (M8) will store a LocationRef, call `locationRef()` then `LocationResolver.assertOnProject`, and point `StructureUsage` at their rows.

### CM-404

- **Amenities** (`masters.amenities`) and **Common Developments** (`masters.common_developments`) are one table with a kind and follow the Labour Category rules exactly: names trimmed, required, at most 100, unique per kind ignoring case among live rows (409 `AMENITY_NAME_IN_USE` / `COMMON_DEVELOPMENT_NAME_IN_USE`; the same name may exist in both kinds); seed rows can be disabled and enabled but not renamed or deleted (409 `SEED_IS_READ_ONLY`); rename is guarded by `updatedAt` (409 `AMENITY_CHANGED`); delete is a tombstone. The `SeedCompanyMastersListener` copies `development-seeds.ts` to each new Company (idempotent, any case).
- **Delete is refused while any live Project has the row** (409 `AMENITY_IN_USE` / `COMMON_DEVELOPMENT_IN_USE`), whoever asks; links to a deleted Project do not count. Disabling never removes links: a disabled row stays on its Projects (shown with a Disabled mark) and leaves the pickers.
- **From the master**: `POST /api/construction/masters/{amenities|common-developments}/{id}/projects` (`{ projectIds }`, the list's Update flag) sets the row's Projects among those the caller may see; links to Projects a Member is not on are kept and never shown to them. 400 `PROJECT_NOT_FOUND` (with `details.projectIds`) for an id that is not a live Project the caller sees. Add accepts `projectIds` too. Rows list `projectIds` by Project name.
- **From the Project**: `GET /api/construction/projects/projects/{id}/developments` (`projects.project` Read) returns per kind `assigned` (live rows the Project has, disabled included, `{ id, name, disabled }`, by name) and `choices` (the Company's live enabled rows). `POST …/developments/update` (`projects.project` Update) takes `{ amenityIds?, commonDevelopmentIds? }`, each the full set for its kind; a kind left out keeps its rows. Ids must be live rows of that kind of the Company (400 `AMENITY_NOT_FOUND` / `COMMON_DEVELOPMENT_NOT_FOUND` with `details.ids`). A row the Project does not have yet must be enabled (400 `AMENITY_DISABLED` with `details.ids`); a disabled row it already has may stay. Another Company's Project, or one a Member is not on, is 404. The route composes the projects context (visibility) and the masters context (storage); neither imports the other.
- A disabled row cannot gain Projects from the master either (400 `AMENITY_DISABLED`); it may lose them.
- Assignment sets are last-save-wins: the links carry no `updatedAt`. Every change is audited: `amenity.projects_assigned` on the row from the master, `project.amenity_assigned` / `project.common_development_assigned` on the Project from the Project.
- Screens: Masters → **Projects** group → Amenities and Common Developments (list with each row's Projects, Add with a Projects checklist, Rename, Assign Projects, Disable / Enable, Delete); the Project's **Amenities** page (`/app/projects/{id}/amenities`, both kinds as checklists with Save; read-only without Update).

### CM-405

- A Location's name ≤ 80 and unique in the Project ignoring case (409 `LOCATION_NAME_IN_USE`), description ≤ 300 (blank is none). New Locations go last.
- **Reorder** is one Location at a time: `POST …/locations/{locationId}/move` with `up` / `down` swaps positions with the neighbour (both rows compare-and-set; nothing happens at the ends) and answers the list in its new order. Edit is guarded by `updatedAt` (409 `LOCATION_CHANGED`); a move bumps both rows' `updatedAt`.
- Delete is a tombstone, refused through `StructureUsage` (409 `LOCATION_IN_USE`); the name is free again.
- Permissions: `projects.locations` (create / read / update, which covers moving, / delete) plus project visibility (404). Screen: `/app/projects/{id}/locations`.

### CM-406

- **Resources** is a Project section at `/app/projects/{id}/resources` (module `resources`, menu `projects.project`). It shows four sections — Team Members, Contractors, Suppliers, Vendors — each listing who is on the Project by name with a second line (Designation and "Joining Pending" for Team Members, Departments for Contractors, the contact person for Suppliers, otherwise the mobile) and an Inactive badge.
- Each party keeps its Projects in its own context (ADR CM-0013 §6): Team Members in organization (`team_member_projects`), Vendors in labour (`vendor_projects`), Contractors and Suppliers in masters. `src/composition/project-resources.ts` is where the contexts meet: it checks the Project is visible (projects context) and calls the owning context's application layer; no context imports another.
- `GET …/projects/{id}/resources` needs `projects.project` Read; `GET …/resources/{team-members|contractors|suppliers|vendors}/options` and `POST …/resources/{kind}` need Update. A Project of another Company, or one a Member is not on, is 404 `PROJECT_NOT_FOUND`.
- `POST …/resources/{kind}` takes `{ ids, expectedIds }`: every party of that kind that should be on the Project, and the ones the screen loaded. If the Project's set moved since, 409 `PROJECT_RESOURCES_CHANGED` and nothing changes. Each changed party's `updatedAt` moves (so a master form open on it gets its own 409) and gets one audit row (`<kind>.projects_changed`, before/after Projects), all in one transaction per kind. The response is the whole Resources.
- Ids that are not live parties of the Company (unknown, deleted, another Company's) are 400 `TEAM_MEMBER_NOT_FOUND` / `CONTRACTOR_NOT_FOUND` / `SUPPLIER_NOT_FOUND` / `VENDOR_NOT_FOUND` with the ids in `details` — 400 like every other unknown-id check in the app (Vendors' and Team Members' `PROJECT_NOT_FOUND`), not 422.
- **Inactive** Contractors, Suppliers and Vendors already on the Project may stay (sent again in `ids`) and are shown in the Edit dialog to be taken off; adding one is 400 `<KIND>_INACTIVE`, and the options list only active ones. A Team Member who declined the Join Request is treated the same way (`TEAM_MEMBER_DECLINED`).
- **Team Members** keep Assign Projects' rules: an HRMS Team Member is on no Project (400 `HRMS_MEMBER_HAS_NO_PROJECTS`, and they are not offered), and the **Owner** is on every Project without being assigned — listed first with an Owner badge, never in the dialog, and their id in `ids` is ignored. Joining Pending members can be added (as on Add Team Member). A Member who takes themselves off loses the Project.
- **Add Project** opens the new Project on `…/resources?step=resources`: a "Step 2 of 2 · Assign resources" banner with **Skip** (nothing assigned yet) or **Done**, both to the Overview, where any upload message from step 1 is shown. Only Add Project's destination changed; the Project form is CM-401's.
- Contacts are not built (ADR CM-0013 §6).

### CM-407

- The kernel service is `src/shared-kernel/attachments`: `UploadPolicy` (purpose = key folder, accept, largest file, multipart threshold 8 MB), `AttachmentUploads` (`start` → `answerDirectUpload` / `receive` → `receiveThumbnail` → `complete`), `CheckedUpload` and `storedFilesOf`. Owners keep their own rows and call `complete` with `recorded` (what they already have for the key) and `record` (their transaction); completion stays idempotent on the key, and a refused or failed completion deletes the object and any thumbnail sent for it.
- Accept kinds: `images` (PNG, JPEG, WebP), `pdf_or_image`, `any_but_programs`, `drawing` (PDF, images, DWG, DXF). Names are checked at start (programs always refused; restricted kinds need an accepted extension) and content at completion. DWG is known by `AC10nn`; DXF has no magic number, so text counts as DXF only under a `.dxf` name (a `0`/`SECTION` pair or a `999` comment first; binary DXF by its sentinel). DWG and DXF are served as `application/octet-stream` and always download.
- Keys: `companies/<workspaceId>/<purpose>/<ownerId>/<uuid>.<ext>`. In M4 every owner is the Project: purposes `project-documents` (unchanged keys), `drawings`, `testing-reports`.
- Thumbnails go up **between sending the file and completing**, not after: `POST <owner>/uploads/thumbnail?key=` with a WebP ≤ 300 KB (sniffed), stored at `<key>.thumb.webp` once the file itself is in storage; completion records it (its own `stored_files` row, kind `<kind>_thumbnail`) in the owner's transaction, only for an image. A browser that can't make one (no `createImageBitmap`, no canvas, no WebP encoder) silently sends none; a thumbnail failure never fails the upload. Each owner has a `…/thumbnail` read route.
- Every owner has the same four upload routes under its own path (`uploads`, `uploads/presign`, `uploads/app`, `uploads/thumbnail`), built by `projectUploadRoutes` in `app/api/construction/projects/project-upload-routes.ts`; `requireAnyAccess` lets either of two flags upload (Drawings and Testing Reports: create or update).
- File routes stream the file as Documents always have (`storedFileResponse`: inline for PDFs and images, attachment otherwise, `nosniff`, CSP, `no-store`); there is no signed redirect yet.
- The Gallery index is `media_items`, written by the projects context in the owner's transaction for every PDF or image (Documents: on add and delete, with the thumbnail key). `ProjectMediaAttached` / `ProjectMediaRemoved` (kernel types in `src/shared-kernel/project-media.ts`) feed the same index for later contexts through `ProjectMediaListener`, composed in `src/composition/project-media-listeners.ts`; a replayed event never adds a second row, and an event for another Company's Project writes nothing.
- Browser: `directUpload` (`src/queries/direct-upload.ts`) runs one file; `useDirectUpload` (`components/uploads/use-direct-upload.ts`) runs many with progress, cancel and retry. Documents run on both with no change on screen.

### CM-408

- Albums are listed by name; names are unique in the Project ignoring case (409 `ALBUM_NAME_IN_USE`), at most 80 characters. Renames send `updatedAt` (409 `ALBUM_CHANGED`). An album with drawings answers 409 `ALBUM_NOT_EMPTY`.
- A new drawing's name defaults to the file name without its extension (at most 120 characters). A drawing's album page lists drawings by most recent change, whole (an album holds tens of sheets, not thousands).
- Revisions are numbered in the transaction that adds them (the drawing row is locked); a new revision moves the drawing's `updatedAt`, so a rename or move loaded before it gets 409 `DRAWING_CHANGED`.
- Flags: read lists and opens files; create adds albums and new drawings; update renames albums, adds revisions, renames and moves drawings; delete removes albums and drawings. Uploading needs create or update.
- Deleting a drawing tombstones every revision, their `stored_files` rows and Gallery rows, then deletes the files. Each PDF or image revision is its own Gallery row (source `drawing`, source id = the drawing); DWG and DXF are not in the Gallery.
- A Project with live drawings or testing reports cannot be deleted (409 `PROJECT_IN_USE`, CM-0013 §13).

### CM-409

- Testing materials are listed by name, unique in the Project ignoring case (409 `TESTING_ITEM_NAME_IN_USE`), ≤ 80; rename with `updatedAt` (409 `TESTING_ITEM_CHANGED`); an item with reports answers 409 `TESTING_ITEM_NOT_EMPTY`.
- A report: name (required, ≤ 120), report date (required), remark (optional, ≤ 500, blank is none), exactly one PDF or image ≤ 25 MB. Reports are listed newest report date first, then newest id, 25 a page with cursors both ways and the total; search matches the name ignoring case. The cursor is the kernel's `ListCursor` with the report date in place of `createdAt`.
- Back-dated policy `material_testing_report`: `create` on the report date when adding; `edit` on the stored date and, when it changes, on the new one; `edit` on the stored date before deleting (as holidays do). A refused add drops the uploaded file.
- Replacing a report's file retires the old one in the same transaction (its `stored_files` rows deleted, its Gallery row tombstoned, a new Gallery row for the new file uploaded by the editor) and then deletes the old object. A key that was replaced cannot be completed again.

### CM-410

- `GET …/projects/{id}/gallery`: live `media_items`, newest upload first, 48 a page, cursors both ways, total. Filters: `type` (image | pdf), `source` (any string; `document`, `drawing`, `testing_report` in M4), `uploadedBy` (User id), `from` / `to` (upload day in the Company time zone, inclusive), `q` (file name contains, case-insensitive, `%` and `_` literal). `GET …/gallery/uploaders` lists who uploaded what the viewer can see.
- Visibility: the Gallery lists only sources whose menu the viewer may read (`MEDIA_SOURCE_MENUS`: documents → `projects.project`, drawings → `projects.drawings`, testing reports → `projects.testing_reports`); a source with no menu entry (a later module's, until it adds one) is never listed. Each item's `fileUrl` / `thumbUrl` are the source's own routes, which check that flag again — so a link opened by someone without it answers 403 (404 for a Project they are not on). The Gallery serves no file itself.
- A drawing's Gallery row links to its revision's file route (joined by file key); a drawing row without a live revision is left out.

### CM-411

- **Home**: `GET /api/construction/projects/projects/{id}/home` (`projects.project` Read; another Company's Project or one a Member is not on is 404) returns `{ modules: [{ key, label, description, segment, hidden }], pinned, canHideModules }`. A module is listed when the caller has Read on its `menu` for this Project (`can(..., { projectId })`); `wings` when the Project's `structure` is `wings` or it has live Wings, `locations` likewise, so a change of Project Type never hides rows. Modules come from `project-modules.ts` (keys are stored: never rename one; `description` is the tile's line). No "coming soon" tiles: a module is in the list once its page exists in its milestone.
- **Hidden modules** are per Project, for everyone on it: `POST …/{id}/hidden-modules/update` with `{ hiddenModules }`, the full set (Project menu Update; 400 `PROJECT_MODULE_UNKNOWN` with `details.keys`; duplicates collapse). Hidden modules are left out of the home for everyone without Update, and listed with `hidden: true` for those with it so they can show them again. Hiding never grants or removes access; the section bar and the tiles follow it, the pages do not. Audited `project.modules_hidden` with before and after.
- **Tile order** is per member for every Project: `POST /api/construction/projects/tile-order/update` with `{ tileOrder }` (any Team Member with a Session; 400 `PROJECT_MODULE_UNKNOWN`). Keys listed come first, the rest follow in the default order; stored keys that stop being modules are skipped; an empty list resets. Arrange tiles moves with Up / Down buttons (focus stays on the moved tile) and Reset to default sends `[]`. Audited `member.tile_order_changed`.
- **Pin** is per member per Project: `POST …/{id}/pin` and `…/{id}/unpin` (`projects.project` Read and the Project visible; idempotent; `{ pinned }`). The Projects list gains `pinned` per item and lists the caller's pinned Projects first, each group in the existing status-then-name order. Pins of deleted Projects stay in the table and are never shown. Audited `project.pinned` / `project.unpinned` (only when it changed).
- **Shell**: the tab bar is a section bar built from the home — Home, then the member's non-hidden modules in their order — that scrolls sideways inside itself (the page never does at 375 px). Until the home loads, or if it cannot, the bar lists every module of the Project's structure in the default order (each page still checks access). The header carries a Pinned mark and, next to Edit, **Project options**: Pin to top / Unpin, Hide / show modules (Update flag only) and Arrange tiles.
- **Home page**: `/app/projects/{id}` is the home: tiles (icon, label, description) in the member's order, a note of how many modules are hidden for those who may show them, then Labour today and the Project's details as before.
- **Projects home**: each row has a kebab (Pin to top / Unpin, Edit, Hide modules) and a pin mark; Hide modules opens the same dialog, which says the Update permission is needed when the caller lacks it.

### CM-412

- **Page** `/app/projects/{id}/dashboard` behind `reporting.project_dashboard` Read (a page without it says so). Every route below needs that flag; the Project ones also need the Project visible (404 otherwise).
- **Duration filter**: Last 30 days, Last 3 months, Last 6 months, **Last 12 months** (default), This financial year (from 1 April), Custom range. Presets end today (the browser's date) and start the day after the same date back; a custom range must run forwards and cover at most 366 days (the attendance series' limit) or the page says why and leaves Attendance out. The Project summary is "now" and does not follow the duration.
- **KPI tiles** Material Approvals (M5), Payment Approvals (M7), Pending Issues & Snags (M8), Pending Inspections (M8) are stubs showing "—" and the milestone that fills them.
- **Sections** (`src/projects/domain/dashboard-sections.ts`, keys stored, never renamed): Project summary and Attendance have data; Task (M8), Payments (M7), Daily Work and Equipment Usage (M6), Materials (M5), Issue & Snag and Inspection Request (M8), Booking and Inquiry (M10) are stubs naming the milestone and what they will show.
- **Project summary**: `GET /api/construction/projects/projects/{id}/dashboard/summary` returns `{ project: { id, name, status, projectType, structure, startDate, endDate, budgetValue }, counts: { wings, floors, units, locations, drawings, testingReports, documents }, financial }`. Counts are live rows (floors and units of live Wings only; a unit on a removed floor does not count), read by a projects-context query straight from the tables, including the ones CM-402/405/408/409 fill. `budgetValue` follows the Project menu's Financial flag (null without it, and the tile is not drawn). Wings / Floors / Units show for a Wings Project or one with Wings; Locations likewise.
- **Attendance** reuses the labour context's `GET /api/construction/labour/summary` (`labour.attendance` Read) from the browser — no projects-to-labour import. The route gained an optional `from`: the day-wise series then runs from `from` to `date` (at most 366 days; 400 `SUMMARY_RANGE_INVALID` otherwise); without it it is still the last 14 days, so the home's Labour today is unchanged. The section shows labours present (present + half day of those on the Project), absent, not marked and vendor heads on the duration's last day ("today" when it ends today), and a line chart of labours present per day with a crosshair readout (pointer or arrow keys) and a screen-reader table. Without attendance Read it says the permission is needed.
- **Manage Dashboard**: `GET /api/construction/projects/dashboard-layout` and `POST …/dashboard-layout/update` with `{ sections: [{ key, visible }] }`, per member for every Project, stored in `member_preferences.dashboard_sections`; the dashboard's Read flag is enough. Sections listed come first; ones left out follow, shown, in the default order (so new sections appear for everyone); an empty list resets. 400 `DASHBOARD_SECTION_UNKNOWN` (with `details.keys`) or `DASHBOARD_SECTION_DUPLICATE`. A stored layout with keys that stop existing drops them when read. The dialog ticks sections and moves them with Up / Down buttons (focus follows the moved row) and has Reset to default. Audited `member.dashboard_layout_changed`.

## Open questions

1. What are the Project Type values (`Project/Combo`)?
2. How is the card's **progress %** computed — from tasks (dashboard gauge), worksheets, or entered manually?
3. Is **Hide Modules** per project for everyone or per user?
4. What are the "Contacts" assigned in Resources (phone contacts, a Contact master, customers)?
5. Floor configuration for non-Commercial wing types: Residential & Commercial (two typed-floor counts?), Bungalow scheme, Plotting scheme and Individual Unit (no floors?) — the notes only show the Commercial example.
6. Is the Terrace Floor always generated? Can there be podium / stilt / mezzanine floors?
7. What does a non-building **Location** record contain, and can a project use both wings and locations?
8. Can a site entry select multiple units, or only multiple floors?
9. Can a drawing be replaced by a newer revision, and is .dwg previewable or download-only?
10. Gallery: is it only an aggregate of module attachments, or can users upload directly? Which filters (image/PDF, uploaded by, date) exist?
11. Does deleting an album delete its drawings, and what happens to inspections linked to a deleted drawing?
12. Who receives the backup (requester only, owner)? How long is the link valid?
13. Is the dashboard layout saved per user, per project, or both?
14. Does Budget Value feed any comparison (dashboard, reports) or is it informational only?
15. Can a project be deleted when it has transactions? Is there an archive?
