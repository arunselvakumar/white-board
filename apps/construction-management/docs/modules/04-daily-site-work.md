# 04 — Daily Site Work

Daily Site Work is the record of what happened on a project site on a given day. It covers four related things:

- **Daily Worksheet.** Each entry records work done at a location by a contractor's crew: the labour headcount, the approximate quantity of work done, the materials consumed and photos. Material consumption reduces project inventory.
- **Equipment Usage.** One usage sheet per equipment per day (or per shift). It applies to company-owned and rented plant, and records hours, distance or trips, idle and breakdown time, fuel, meter readings and hire cost.
- **Equipment lifecycle.** Equipment can move between projects and a warehouse, go into maintenance and come back. While it is unassigned or in maintenance it should not be selectable on a usage sheet.
- **Progress Reports.** The Daily Progress Report (DPR) and the Task Progress Report are generated in the background as PDFs from worksheets, equipment sheets and tasks.

Testing Reports (material tests such as RCC cube, steel, cement and bricks) belong to **03 Projects/Structure/Drawings/Gallery**. They show up in the back-dated-entry "Site" group next to this module, but they are documented in module 03.

**Who uses it**

| Role (seed designations)                                     | Use                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site Engineer / Site Supervisor / Foreman                    | Fills worksheets and equipment usage sheets every day. Uploads photos. Records material used.                                                    |
| Project Manager / Construction Manager                       | Reviews and approves worksheets and equipment sheets. Generates the DPR. Checks contractor-wise labour on the dashboard.                         |
| Store Keeper                                                 | Watches how worksheet consumption reduces Current Inventory (module 06).                                                                         |
| Owner / Admin                                                | Configures the worksheet form (section visibility and order, approval on or off) and the equipment-sheet field toggles. Reads the dashboards.    |
| Accountant                                                   | Uses rented-equipment hire cost as the basis for payables (module 07). Uses the F (financial) permission on Equipment Usage and Progress Report. |
| Heavy Equipment Operator / Machine Operator / Crane Operator | Named as **Operator** on equipment usage sheets. They do not necessarily log in.                                                                 |

---

## Legacy behaviour

### Navigation

- Project Home tile **Daily Worksheet**. Project-level menu name: **Worksheet** (permission menu #19).
- Project Home tile **Equipment Usage** (menu #56). The Master tile **Equipments** (#22) holds the company equipment register (module 02).
- Project Home tile **Progress Report** (menu #73).
- Project Home tile **Reports** (#20). This report set includes Daily Work, Rented Equipment Usage and Company Owned Equipment Usage (module 11).
- Project Dashboard (`#/chartsDashboard`) has two sections fed by this module:
  - **Daily Work**: Total Labours Availability trend; Contractor-wise Labour (contractor, department, skilled, unskilled).
  - **Equipment Usage**: Top Equipment by Work Hours; Category-wise (Owned vs Rented).
- Project options menu **Backup** and the worksheet backup route `#/dailyWorkBackupRoute` (module 11).

### Daily Worksheet screens

| Route / screen                                                                                                                                     | Behaviour                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/worksheetList`                                                                                                                                  | List of worksheets for the project. **Search** by sheet number, name or date. **Filters**: Sheet Date, Filled By (team member), Department. A FAB opens Add Worksheet. A gear icon opens "Setting for the work item form".                                                                                                                     |
| Add / Edit Worksheet                                                                                                                               | A date stepper at the top moves the sheet date back and forward one day; back-dated rules apply (module 12). Sections are rendered in the configured order: **Location Details**, **Basic Details**, **Material Consumption**, **Other Details**. Buttons: **Save** and **Save & Add New** (save, then reopen a blank form).                   |
| Location Details                                                                                                                                   | Location Type is one of **Wing**, **Amenity** or **Common Development**. Wing → Floor(s) (multi-select) → Unit. Amenity → amenity picker. Common Development → picker. These come from module 03 (wings, floors, units) and module 02 (Amenities & Common Development). The Create Location menu (#74) covers projects that are not buildings. |
| Basic Details                                                                                                                                      | Contractor\*, Department\*, Work Type, Skilled Labours (count), Unskilled Labours (count), Work Shift\* (Shift 1 / Shift 2 / Shift 3), Approx Work Done (a value plus a unit select from Measurement Units).                                                                                                                                   |
| Material Consumption                                                                                                                               | **Bulk Select Materials** (multi-pick dialog), or add rows one at a time (Material, Used Qty, "+"). Saving creates material-consumed entries against project inventory (`MaterialConsumed/AddMultiple`).                                                                                                                                       |
| Other Details                                                                                                                                      | Remark (max 500 characters). Work Photos (multiple images, uploaded via `WorkSheetImages/Upload`).                                                                                                                                                                                                                                             |
| Worksheet detail / report row                                                                                                                      | Columns: Date, Department, Contractor, Skilled Workers, UnSkilled Workers, LocationType, Location, App. Work Done, TaskName, Shift, Work Images, Consumed Material, Labour Details.                                                                                                                                                            |
| Settings: "Setting for the work item form" (`WorkItem/GetSettings`, `WorkItem/SaveSettings`, `WorkItem/ColumnSettings`, `WorkItem/SaveFormConfig`) | Toggles to show or hide each section or field group: **Location Type**, **Work Type**, **Approx Work Done**, **Labour Details**, **Material consumption**, **Remark**, **Work Images**. A reorder list sets the section order (Location, Basic, Material Consumption, Other).                                                                  |
| Worksheet Approval Settings (`WorkItem/ApprovalSetting`, `approvalStatus: bool`)                                                                   | A switch for "approve worksheet" on or off. When it is on, worksheets carry the status **Pending**, **Partially Approved** or **Approved**.                                                                                                                                                                                                    |
| Approval actions (`WorkItem/SetStatus`, `WorkItem/Remark`, `WorkSheets/UpdateWorksheetCompletStatus`)                                              | Approve or reject with remarks. A separate completion-status update exists; see Open questions.                                                                                                                                                                                                                                                |
| Duplicate (`WorkItem/Duplicate`)                                                                                                                   | Copies an existing worksheet into a new one.                                                                                                                                                                                                                                                                                                   |
| Backup (`#/dailyWorkBackupRoute`)                                                                                                                  | Export of worksheet data and media for a date range (module 11).                                                                                                                                                                                                                                                                               |

### Equipment Usage screens

| Route / screen                                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#/EquipmentSheetList`                                 | List of usage sheets. **Search** by sheet number, name or date. **Filters**: Sheet Date, Filled By. FAB flow: **Select Equipment Type** (Company Owned or Rented) → **Select Equipment** (the project's equipment list, with "+" to add equipment inline).                                                                                                                                                                                                                           |
| `#/ownedEquipmentForm` (Add Equipment — Company Owned) | Equipment Name\*, Equipment Number\*, Purchase Year, Fuel Type, Unit (fuel unit). **Utilization Basis**: Hourly / Km / Trip. **Working Time Method**\*: Time Shifts (the engineer logs start and end per shift and hours are calculated), Meter Reading, or Both. **Target & Performance**: Target (hrs/day, days/month, Km/day or trips/day depending on basis), Min Utilization %, Expected Fuel Efficiency (L/hr; an alert fires when the burn rate exceeds it). Equipment Photo. |
| `#/rentedEquipmentForm` (Add Equipment — Rented)       | Same as the owned form, plus contractor/owner, rate and rented hours. **Hire Details**: Vendor, Hire basis (Daily / Monthly / Trip / Hourly), Rate, Chargeable, Hire amount.                                                                                                                                                                                                                                                                                                         |
| Usage sheet form                                       | Fields are shown according to the settings toggles listed below. The detail view shows: Equipment No, Operator, Supervisor, Utilisation (Usage hrs / Distance / Trips), Idle, Breakdown hours, Approx work done, Fuel Consume, Meter Reading (Both / Time Shifts), Target, Unit Rate, Hire Cost, Consumed Material, Images, Work Item, Department, Location, Contractor, Shift, Remark. The fuel section has **Fuel consumed** and **Borne by**.                                     |
| Usage-sheet settings (`v2/equipment-usage/settings`)   | Toggles: **Operator**, **Supervisor**, **Location Type**, **Approx Work Done**, **Rented hour**, **Add Fuel Consumption**, **Remarks**, **Upload File**, **Material consumption**, **Meter Readings**, **Breakdown Hours**, **Approval**.                                                                                                                                                                                                                                            |
| Duplicate (`v2/equipment-usage/duplicate`)             | Copies a sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Equipment Transfer                                     | Two options: **Transfer to Project** ("Another Project") or **Transfer to Warehouse** ("Warehouse / Off system"). Fields: Transfer Date\*, Destination Project\* (project transfers), Location Name\*, Remark. Shows "Effect on Tracking".                                                                                                                                                                                                                                           |
| Equipment statuses                                     | **Unassigned**, **In maintenance**. Being assigned to a project is implied (inferred).                                                                                                                                                                                                                                                                                                                                                                                               |
| Equipment detail actions                               | **Log Maintenance**, **Return to Service**, and a worksheet-availability toggle: **Mark unavailable for worksheet entry** / **Make it available for worksheet entry**. While unavailable, the detail shows the banner "Unavailable for worksheet entry — Since <date>".                                                                                                                                                                                                              |
| Maintenance log / report                               | A route exists ("maintenance log/report") and entries are created with **Log Maintenance**. The fields of a maintenance entry are not captured in the notes.                                                                                                                                                                                                                                                                                                                         |
| Equipment dashboard & reports                          | Usage, maintenance and transfer reports. The Transfer Report columns are: Equipment Name, Number, Purchase Year, Transfer Date, Location Before, Transfer To Project, Latest Location, Remarks, Entry By.                                                                                                                                                                                                                                                                            |

### Progress Report screens

| Route / screen               | Behaviour                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/progressReport`           | Two actions: **Create new** and **View Reports**. Report types: **Daily Progress Report** and **Task Progress Report**.                                                                                                                                 |
| Create Daily Progress Report | Pick a Date and Report Filled By. Option: "Include images in report". Generation runs in the background; the user sees "You will receive a popup once the report is ready" and a push notification arrives when it is done.                             |
| DPR PDF content              | Organisation, Project, Address, Report Filled By, Date, Total Skilled / Unskilled / Total Labour, Equipment Details, then the worksheets (per the worksheet report columns). The project logo appears when `useProjectLogoInReport` is set (module 03). |
| Task Progress Report         | Columns: duration, location, task, progress %. Tasks are owned by module 05.                                                                                                                                                                            |
| View Reports                 | A list of generated reports. They can be opened or downloaded and deleted (Progress Report has the D flag).                                                                                                                                             |

---

## Entities & fields

Types: `FK → X` is a reference. `enum{}` lists the observed values. Fields marked "(inferred)" do not appear verbatim in the notes.

### WorksheetFormSettings (per project — scope inferred)

| Field                   | Type                                                | Required | Notes                                                                 |
| ----------------------- | --------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| id                      | uuid                                                | yes      |                                                                       |
| projectId               | FK → Project                                        | yes      | Company-wide vs per-project scope is not settled; see Open questions. |
| showLocationType        | bool                                                | yes      | Toggle "Location Type".                                               |
| showWorkType            | bool                                                | yes      | Toggle "Work Type".                                                   |
| showApproxWorkDone      | bool                                                | yes      | Toggle "Approx Work Done".                                            |
| showLabourDetails       | bool                                                | yes      | Toggle "Labour Details" (skilled and unskilled counts).               |
| showMaterialConsumption | bool                                                | yes      | Toggle "Material consumption".                                        |
| showRemark              | bool                                                | yes      | Toggle "Remark".                                                      |
| showWorkImages          | bool                                                | yes      | Toggle "Work Images".                                                 |
| sectionOrder            | enum[]{Location, Basic, MaterialConsumption, Other} | yes      | Reorderable (`WorkItem/SaveFormConfig`).                              |
| approvalEnabled         | bool                                                | yes      | `WorkItem/ApprovalSetting.approvalStatus`.                            |
| columnSettings          | json                                                | no       | `WorkItem/ColumnSettings`. List/report column visibility (inferred).  |

### Worksheet (Daily Worksheet; legacy "WorkItem")

| Field                 | Type                                       | Required    | Notes                                                                                                                                  |
| --------------------- | ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| id                    | uuid                                       | yes         |                                                                                                                                        |
| projectId             | FK → Project                               | yes         |                                                                                                                                        |
| sheetNo               | string                                     | yes         | Searchable "sheet no". Not one of the configurable Sequence IDs (module 12), so it is probably a plain per-project counter (inferred). |
| sheetDate             | date                                       | yes         | Set from the date stepper. Subject to back-dated create and edit limits.                                                               |
| filledById            | FK → TeamMember                            | yes         | "Filled By" filter. The user who created the sheet.                                                                                    |
| locationType          | enum{Wing, Amenity, CommonDevelopment}     | conditional | Required when the Location section is shown (inferred).                                                                                |
| wingId                | FK → Wing                                  | conditional | When locationType = Wing.                                                                                                              |
| floorIds              | FK[] → Floor                               | conditional | Multi-select.                                                                                                                          |
| unitId                | FK → Unit                                  | no          | A single unit under the selected floor(s).                                                                                             |
| amenityId             | FK → DevelopmentType (type 2)              | conditional | When locationType = Amenity.                                                                                                           |
| commonDevelopmentId   | FK → DevelopmentType (type 1)              | conditional | When locationType = CommonDevelopment.                                                                                                 |
| locationId            | FK → Location                              | conditional | For non-building projects (Create Location menu #74) (inferred).                                                                       |
| contractorId          | FK → Contractor                            | yes         | `Contractor/Combo`. Should be filtered to contractors assigned to the project (inferred).                                              |
| departmentId          | FK → Department                            | yes         | `DepartmentWork/Combo`. Should be filtered to the contractor's departments (inferred from Contractor.departments).                     |
| workTypeId            | FK → WorkType                              | no          | Filtered by department (`WorkerType/Combo`). Optional and toggleable.                                                                  |
| skilledLabourCount    | int ≥ 0                                    | no          | "Skilled Labours".                                                                                                                     |
| unskilledLabourCount  | int ≥ 0                                    | no          | "Unskilled Labours".                                                                                                                   |
| workShift             | enum{Shift1, Shift2, Shift3}               | yes         | "Work Shift\*".                                                                                                                        |
| approxWorkDoneQty     | decimal(14,3)                              | no          | Value for "Approx Work Done".                                                                                                          |
| approxWorkDoneUomId   | FK → MeasurementUnit                       | conditional | Required if qty is given (inferred).                                                                                                   |
| taskId                | FK → Task                                  | no          | The report column "TaskName" suggests a link to a Task (module 05) (inferred).                                                         |
| remark                | text(500)                                  | no          |                                                                                                                                        |
| photos                | file[] (image)                             | no          | `WorkSheetImages/Upload`.                                                                                                              |
| approvalStatus        | enum{Pending, PartiallyApproved, Approved} | conditional | Only when approvalEnabled. Whether a Rejected state exists is open.                                                                    |
| completionStatus      | enum (values unknown)                      | no          | `WorkSheets/UpdateWorksheetCompletStatus` (sic).                                                                                       |
| duplicatedFromId      | FK → Worksheet                             | no          | Set by the Duplicate action (inferred).                                                                                                |
| createdAt / updatedAt | datetime                                   | yes         |                                                                                                                                        |

### WorksheetMaterialConsumption (line)

| Field                  | Type                      | Required | Notes                                                                                                                                      |
| ---------------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| id                     | uuid                      | yes      |                                                                                                                                            |
| worksheetId            | FK → Worksheet            | yes      |                                                                                                                                            |
| materialId             | FK → Material             | yes      | Picked one at a time or via Bulk Select Materials. Work Type ↔ material assignment (`WorkerType/AssignItem`) narrows the list (module 02). |
| usedQty                | decimal(14,3)             | yes      | > 0.                                                                                                                                       |
| uomId                  | FK → MeasurementUnit      | yes      | Defaults to the material's `defaultUoMId`.                                                                                                 |
| inventoryLedgerEntryId | FK → InventoryLedgerEntry | yes      | The Consumed entry created in module 06 (`MaterialConsumed`).                                                                              |

### WorksheetRemark / approval action

| Field       | Type                                          | Required    | Notes                                                               |
| ----------- | --------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| id          | uuid                                          | yes         |                                                                     |
| worksheetId | FK → Worksheet                                | yes         |                                                                     |
| action      | enum{Remark, Approve, PartialApprove, Reject} | yes         | `WorkItem/SetStatus`, `WorkItem/Remark`. The value set is inferred. |
| remark      | text                                          | conditional |                                                                     |
| byId        | FK → TeamMember                               | yes         |                                                                     |
| at          | datetime                                      | yes         |                                                                     |

### Equipment (project-level view of the module 02 master)

The master record lives in module 02 with these fields: Equipment Name\*, Contractor Name\* (owner/renter), Equipment Number\*, Fuel Type, Fuel Measurement Unit, Contact Person Name/Number and Company Name. The project-level owned and rented forms add the fields below.

| Field                                   | Type                                                 | Required     | Notes                                                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                                      | uuid                                                 | yes          |                                                                                                                                                              |
| ownership                               | enum{CompanyOwned, Rented}                           | yes          | Chosen in "Select Equipment Type".                                                                                                                           |
| name                                    | string                                               | yes          |                                                                                                                                                              |
| equipmentNumber                         | string                                               | yes          | Registration or asset number. Unique per company (inferred).                                                                                                 |
| purchaseYear                            | int (YYYY)                                           | no           | Owned only.                                                                                                                                                  |
| fuelTypeId                              | FK → FuelType {CNG, Diesel, Petrol}                  | no           |                                                                                                                                                              |
| fuelUnitId                              | FK → FuelUnit {Barrel, Gallon, Kg, Litre, Unit}      | no           |                                                                                                                                                              |
| utilizationBasis                        | enum{Hourly, Km, Trip}                               | yes          | Decides whether utilisation is captured as hours, distance or trips.                                                                                         |
| workingTimeMethod                       | enum{TimeShifts, MeterReading, Both}                 | yes          | "Meter Reading (Both / Time Shifts)".                                                                                                                        |
| targetValue                             | decimal(10,2)                                        | no           | Target hrs/day, days/month, Km/day or trips/day.                                                                                                             |
| targetUnit                              | enum{HrsPerDay, DaysPerMonth, KmPerDay, TripsPerDay} | conditional  |                                                                                                                                                              |
| minUtilizationPct                       | decimal(5,2)                                         | no           | 0–100.                                                                                                                                                       |
| expectedFuelEfficiency                  | decimal(10,3)                                        | no           | L/hr (or per km/trip, inferred). An alert fires when actual burn exceeds it.                                                                                 |
| photo                                   | file (image)                                         | no           |                                                                                                                                                              |
| contractorId                            | FK → Contractor                                      | yes (master) | Owner or renter per the master. For rented equipment, the "contractor/owner".                                                                                |
| contactPersonName / contactPersonNumber | string                                               | no           | Master.                                                                                                                                                      |
| companyName                             | string                                               | no           | Master.                                                                                                                                                      |
| currentProjectId                        | FK → Project                                         | no           | Null when at a warehouse or off system (inferred).                                                                                                           |
| status                                  | enum{Assigned, Unassigned, InMaintenance}            | yes          | "Unassigned" and "In maintenance" are observed. "Assigned" is inferred. **Log Maintenance** gives InMaintenance. **Return to Service** leaves InMaintenance. |
| availableForWorksheet                   | bool                                                 | yes          | Toggled by "Mark unavailable for worksheet entry" / "Make it available for worksheet entry". Independent of status.                                          |
| unavailableSince                        | date                                                 | conditional  | Set when marked unavailable. Shown as "Unavailable for worksheet entry — Since <date>".                                                                      |

### EquipmentHireDetails (rented only)

| Field       | Type                               | Required | Notes                                                        |
| ----------- | ---------------------------------- | -------- | ------------------------------------------------------------ |
| equipmentId | FK → Equipment                     | yes      |                                                              |
| vendorId    | FK → Vendor or Contractor          | yes      | Labelled "Vendor". Which master it points to is open.        |
| hireBasis   | enum{Daily, Monthly, Trip, Hourly} | yes      |                                                              |
| rate        | decimal(14,2)                      | yes      | Per hire-basis unit.                                         |
| chargeable  | bool                               | no       | Label "Chargeable". Meaning not settled; see Open questions. |
| hireAmount  | decimal(14,2)                      | no       | Computed or entered.                                         |
| rentedHours | decimal(10,2)                      | no       | "rented hours" on the rented form.                           |

### EquipmentUsageSettings (`v2/equipment-usage/settings`)

| Field                   | Type         | Required | Notes                   |
| ----------------------- | ------------ | -------- | ----------------------- |
| projectId               | FK → Project | yes      | Scope inferred.         |
| showOperator            | bool         | yes      |                         |
| showSupervisor          | bool         | yes      |                         |
| showLocationType        | bool         | yes      |                         |
| showApproxWorkDone      | bool         | yes      |                         |
| showRentedHour          | bool         | yes      |                         |
| showFuelConsumption     | bool         | yes      | "Add Fuel Consumption". |
| showRemarks             | bool         | yes      |                         |
| showUploadFile          | bool         | yes      |                         |
| showMaterialConsumption | bool         | yes      |                         |
| showMeterReadings       | bool         | yes      |                         |
| showBreakdownHours      | bool         | yes      |                         |
| approvalEnabled         | bool         | yes      | "Approval".             |

### EquipmentUsageSheet

| Field                        | Type                                 | Required    | Notes                                                                                                                                                                       |
| ---------------------------- | ------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                           | uuid                                 | yes         |                                                                                                                                                                             |
| projectId                    | FK → Project                         | yes         |                                                                                                                                                                             |
| sheetNo                      | string                               | yes         | Searchable. Numbering scheme unknown.                                                                                                                                       |
| sheetDate                    | date                                 | yes         | Back-dated control: "Equipment Usage".                                                                                                                                      |
| equipmentId                  | FK → Equipment                       | yes         | Must be assigned to this project and not in maintenance (inferred).                                                                                                         |
| ownership                    | enum{CompanyOwned, Rented}           | yes         | Copied from the equipment (it drives two separate reports).                                                                                                                 |
| filledById                   | FK → TeamMember                      | yes         |                                                                                                                                                                             |
| operatorName / operatorId    | string or FK → Labour/TeamMember     | toggle      | Whether this is free text or a reference is open.                                                                                                                           |
| supervisorId                 | FK → TeamMember                      | toggle      | `Supervisor/Combo`.                                                                                                                                                         |
| contractorId                 | FK → Contractor                      | no          |                                                                                                                                                                             |
| departmentId                 | FK → Department                      | no          |                                                                                                                                                                             |
| workItem                     | string or FK → Worksheet             | no          | Label "Work Item". It may link to a worksheet (inferred).                                                                                                                   |
| locationType + location refs | as Worksheet                         | toggle      |                                                                                                                                                                             |
| shift                        | enum{Shift1, Shift2, Shift3}         | no          |                                                                                                                                                                             |
| usageHours                   | decimal(8,2)                         | conditional | When utilizationBasis = Hourly. Calculated from shift times or meter readings.                                                                                              |
| distanceKm                   | decimal(10,2)                        | conditional | Basis = Km.                                                                                                                                                                 |
| trips                        | int                                  | conditional | Basis = Trip.                                                                                                                                                               |
| idleHours                    | decimal(8,2)                         | no          | "Idle".                                                                                                                                                                     |
| breakdownHours               | decimal(8,2)                         | toggle      | "Breakdown Hours".                                                                                                                                                          |
| approxWorkDoneQty / Uom      | decimal(14,3) / FK → MeasurementUnit | toggle      |                                                                                                                                                                             |
| rentedHours                  | decimal(8,2)                         | toggle      | "Rented hour". Rented only.                                                                                                                                                 |
| unitRate                     | decimal(14,2)                        | conditional | Rented. Defaults from the hire rate.                                                                                                                                        |
| hireCost                     | decimal(14,2)                        | conditional | Rented. unitRate × billable quantity (inferred).                                                                                                                            |
| fuelConsumedQty              | decimal(10,3)                        | toggle      | "Fuel Consume". Unit = the equipment's fuel unit.                                                                                                                           |
| fuelBorneBy                  | enum                                 | no          | "Borne by" in the fuel section, next to "Fuel consumed". The option values were not captured; likely Company vs Owner/Vendor (inferred). Matters for rented equipment cost. |
| remark                       | text                                 | toggle      |                                                                                                                                                                             |
| files                        | file[]                               | toggle      | "Upload File" / Images.                                                                                                                                                     |
| approvalStatus               | enum{Pending, Approved}              | conditional | Only when approvalEnabled. Equipment Usage (#56) carries A (approve) but not J (reject), so there is no reject action. A Rejected state is not expected.                    |
| duplicatedFromId             | FK → EquipmentUsageSheet             | no          | `v2/equipment-usage/duplicate` (inferred).                                                                                                                                  |

### EquipmentTimeShift (child of a usage sheet; Working Time Method includes TimeShifts)

| Field        | Type                     | Required | Notes                                                      |
| ------------ | ------------------------ | -------- | ---------------------------------------------------------- |
| id           | uuid                     | yes      |                                                            |
| usageSheetId | FK → EquipmentUsageSheet | yes      |                                                            |
| startTime    | time                     | yes      |                                                            |
| endTime      | time                     | yes      | Later than start. Crossing midnight is allowed (inferred). |
| hours        | decimal(6,2)             | yes      | Auto-calculated.                                           |

### EquipmentMeterReading (Working Time Method includes MeterReading)

| Field          | Type                     | Required | Notes                                                                                |
| -------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------ |
| usageSheetId   | FK → EquipmentUsageSheet | yes      |                                                                                      |
| openingReading | decimal(12,2)            | yes      | Hour meter or odometer. Defaults to the previous sheet's closing reading (inferred). |
| closingReading | decimal(12,2)            | yes      | Must be ≥ opening.                                                                   |
| reading delta  | decimal(12,2)            | derived  | Usage hours or km.                                                                   |

### EquipmentUsageMaterialConsumption (line)

Same shape as WorksheetMaterialConsumption, with usageSheetId instead of worksheetId. The "Material consumption" toggle and the "Consumed Material" column suggest it also posts to inventory (inferred).

### EquipmentTransfer

| Field                | Type                         | Required    | Notes                                                                                               |
| -------------------- | ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| id                   | uuid                         | yes         |                                                                                                     |
| equipmentId          | FK → Equipment               | yes         |                                                                                                     |
| transferType         | enum{ToProject, ToWarehouse} | yes         | "Transfer to Project" / "Transfer to Warehouse" ("Warehouse / Off system").                         |
| transferDate         | date                         | yes         |                                                                                                     |
| fromProjectId        | FK → Project                 | no          | Reported as "Location Before".                                                                      |
| destinationProjectId | FK → Project                 | conditional | Required for ToProject.                                                                             |
| locationName         | string                       | yes         | "Location Name\*". Free text for the warehouse or site area.                                        |
| remark               | text                         | no          |                                                                                                     |
| entryById            | FK → TeamMember              | yes         | "Entry By".                                                                                         |
| effectOnTracking     | text/derived                 | —           | The UI explains that the equipment stops appearing on the source project's usage sheets (inferred). |

### EquipmentMaintenanceLog (the **Log Maintenance** and **Return to Service** actions are observed; the field list below is inferred)

| Field                         | Type           | Required | Notes                                                                                     |
| ----------------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------- |
| id                            | uuid           | yes      |                                                                                           |
| equipmentId                   | FK → Equipment | yes      |                                                                                           |
| startDate                     | date           | yes      | Set by Log Maintenance. Equipment status → InMaintenance.                                 |
| endDate / returnedToServiceOn | date           | no       | Set by Return to Service. Status → Assigned or Unassigned (the target state is inferred). |
| description                   | text           | no       | (inferred)                                                                                |
| cost                          | decimal(14,2)  | no       | (inferred). Would feed module 07.                                                         |
| attachments                   | file[]         | no       | (inferred)                                                                                |

### ProgressReport

| Field                     | Type                                    | Required    | Notes                                                                        |
| ------------------------- | --------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| id                        | uuid                                    | yes         |                                                                              |
| projectId                 | FK → Project                            | yes         |                                                                              |
| type                      | enum{DailyProgress, TaskProgress}       | yes         |                                                                              |
| reportDate                | date                                    | conditional | DPR.                                                                         |
| fromDate / toDate         | date                                    | conditional | Task Progress Report "duration".                                             |
| filledById                | FK → TeamMember                         | conditional | DPR "Report Filled By". It filters which worksheets are included (inferred). |
| includeImages             | bool                                    | yes         | "Include images in report".                                                  |
| status                    | enum{Queued, Generating, Ready, Failed} | yes         | (inferred). Generation is asynchronous.                                      |
| file                      | file (PDF)                              | no          | Set when Ready.                                                              |
| requestedById             | FK → TeamMember                         | yes         |                                                                              |
| requestedAt / completedAt | datetime                                |             |                                                                              |

---

## Workflows & states

### W1 — Configure the worksheet form (Owner/Admin)

1. On `#/worksheetList`, tap the gear icon to open "Setting for the work item form".
2. Toggle sections or fields: Location Type, Work Type, Approx Work Done, Labour Details, Material consumption, Remark, Work Images.
3. Drag to reorder the sections Location / Basic / Material Consumption / Other.
4. Worksheet Approval Settings: turn "approve worksheet" on or off.
5. Save (`WorkItem/SaveSettings`, `WorkItem/SaveFormConfig`, `WorkItem/ApprovalSetting`). The settings apply to new and edited worksheets.

### W2 — Fill a Daily Worksheet (Site Engineer)

1. `#/worksheetList` → FAB.
2. Choose the sheet date with the date stepper. It defaults to today. Earlier dates are allowed only within the back-dated create window.
3. Location Details: pick a Location Type, then Wing → Floor(s) → Unit, or an Amenity, or a Common Development.
4. Basic Details: Contractor\* → Department\* → Work Type. Enter the skilled and unskilled counts, choose the Work Shift\*, and enter Approx Work Done with its unit.
5. Material Consumption: Bulk Select Materials, or add rows. For each, enter Used Qty. The current stock is shown (inferred from `Inventory/GetAvailableStock`).
6. Other Details: Remark and Work Photos.
7. **Save** returns to the list. **Save & Add New** saves and opens a blank form. Keeping the date and location is a candidate improvement.
8. On save, each consumption line posts a **Consumed** ledger entry to Current Inventory (module 06), and project stock goes down.
9. If approval is enabled, the worksheet starts in **Pending**.

### W3 — Approve a worksheet

1. An approver with the Daily Worksheet A flag opens the worksheet.
2. They approve or partially approve, optionally with a remark (`WorkItem/SetStatus`, `WorkItem/Remark`). There is no reject action: Daily Worksheet (#19) has A but not J.
3. The status becomes Approved or Partially Approved. An approver who disagrees leaves a remark and the sheet stays Pending (inferred).

```mermaid
stateDiagram-v2
    [*] --> NoApproval: approval setting OFF
    [*] --> Pending: approval setting ON, worksheet saved
    Pending --> PartiallyApproved: approver approves part (e.g. some lines / quantities)
    Pending --> Approved: approver approves all
    PartiallyApproved --> Approved: remaining approved
    Pending --> Pending: remark added, no reject action
    Approved --> Pending: edited after approval (inferred)
    NoApproval --> [*]
    Approved --> [*]
```

### W4 — Duplicate a worksheet

1. Row action Duplicate (`WorkItem/Duplicate`) opens a new worksheet prefilled from the source.
2. Whether the date resets to today and whether material lines are copied is unknown. The rebuild should reset the date and copy lines as a draft.

### W5 — Add project equipment

1. `#/EquipmentSheetList` → FAB → Select Equipment Type: **Company Owned** or **Rented**.
2. Select Equipment from the project list, or "+" to add one (`#/ownedEquipmentForm` / `#/rentedEquipmentForm`).
3. Owned: identity, fuel, utilisation basis, working time method, target and performance, photo.
4. Rented: the same, plus owner/contractor, Hire Details (vendor, basis, rate, chargeable, hire amount) and rented hours.

### W6 — Fill an Equipment Usage sheet

1. Pick the equipment. Its utilisation basis and working time method decide which inputs appear.
2. Enter the date, operator, supervisor, location, contractor, department, work item and shift (depending on toggles).
3. Utilisation:
   - **Time Shifts**: add one or more start/end pairs. Hours are summed.
   - **Meter Reading**: opening and closing. The delta is hours or km.
   - **Both**: capture both. A mismatch is shown (inferred).
   - **Km** basis: distance. **Trip** basis: trip count.
4. Idle hours and breakdown hours.
5. **Fuel consumed** and **Borne by** (who bears the fuel cost). Compare it with Expected Fuel Efficiency and alert if exceeded.
6. Approx work done, material consumption, files and remark.
7. Rented: unit rate defaults from the hire rate, and Hire Cost is calculated.
8. Save. If approval is enabled, the status is Pending.

```mermaid
stateDiagram-v2
    [*] --> Saved: approval OFF
    [*] --> Pending: approval ON
    Pending --> Approved: approve (Equipment Usage A)
    Pending --> Pending: remark added, no reject action (no J on menu 56)
    Approved --> [*]
    Saved --> [*]
```

### W7 — Equipment lifecycle (transfer and maintenance)

1. **Transfer to Project**: Transfer Date\*, Destination Project\*, Location Name\*, Remark. The equipment leaves the source project's selectable list and appears in the destination's ("Effect on Tracking").
2. **Transfer to Warehouse**: Transfer Date\*, Location Name\*, Remark. The status becomes **Unassigned** ("Warehouse / Off system").
3. **Log Maintenance**: opens a maintenance-log entry. The status becomes **In maintenance**. Whether this alone blocks usage sheets is inferred.
4. **Return to Service**: closes the maintenance entry. The equipment goes back to its project, or to Unassigned if it was off system (the target state is inferred).
5. **Mark unavailable for worksheet entry**: the equipment is excluded from usage-sheet entry, and the detail shows "Unavailable for worksheet entry — Since <date>". **Make it available for worksheet entry** reverses this. The flag is independent of the transfer and maintenance status.
6. Every movement appears in the Transfer Report (Location Before → Latest Location).

```mermaid
stateDiagram-v2
    [*] --> Assigned: created inside a project
    [*] --> Unassigned: created from Master without project (inferred)
    Assigned --> Assigned: Transfer to Project (other project)
    Assigned --> Unassigned: Transfer to Warehouse / Off system
    Unassigned --> Assigned: Transfer to Project
    Assigned --> InMaintenance: Log Maintenance
    Unassigned --> InMaintenance: Log Maintenance
    InMaintenance --> Assigned: Return to Service
    InMaintenance --> Unassigned: Return to Service, was off system (inferred)
    note right of InMaintenance: not selectable on usage sheets (inferred)
    note right of Unassigned: not selectable on any project's usage sheet
```

### W8 — Generate a Daily Progress Report

1. `#/progressReport` → Create new → Daily Progress Report.
2. Choose the Date and Report Filled By, and optionally tick "Include images in report".
3. Submit. The job is queued. The UI shows "You will receive a popup once the report is ready."
4. The server assembles the header (Organisation, Project, Address, Filled By, Date), the labour totals (sum of skilled and unskilled across that day's worksheets), Equipment Details (that day's usage sheets) and the worksheet rows (with images if requested).
5. A push notification / popup fires (N flag). The report appears under View Reports.

```mermaid
stateDiagram-v2
    [*] --> Queued: Create new
    Queued --> Generating
    Generating --> Ready: PDF stored, popup + push
    Generating --> Failed: error (inferred)
    Failed --> Queued: retry (inferred)
    Ready --> Deleted: delete (Progress Report 'd')
    Deleted --> [*]
```

### W9 — Generate a Task Progress Report

1. Create new → Task Progress Report. Choose the duration (from/to) and optionally a location.
2. Asynchronous generation as in W8. Output: task, location, progress %, duration (data from module 05).

---

## Business rules & validations

**Worksheet**

- Contractor, Department and Work Shift are required. When the Location section is shown, Location Type is required, along with the leaf it implies (inferred).
- Department options are limited to the selected contractor's departments. Work Type options are limited to the selected department (Work Type has Department\*) (inferred).
- Contractors offered are those assigned to the project in Project → Resources (inferred).
- Labour counts are whole numbers ≥ 0. If Labour Details is shown, at least one count should be > 0 (inferred; not enforced in legacy as far as is known).
- If Approx Work Done is entered, its unit is required.
- Remark is at most 500 characters.
- Material consumption lines need a material and a used quantity > 0. Each line creates a **Consumed** inventory ledger entry for the project. Editing or deleting the worksheet must reverse or adjust those entries (inferred; legacy allows editing and deleting inventory history entries).
- **Stock check**: whether consumption above available stock is blocked is unknown. `Inventory/GetAvailableStock` is called, which suggests a warning. See Open questions.
- Hidden sections are neither validated nor stored. Toggling a section off does not delete existing data (inferred).
- Section order is a display concern only.
- **Back-dated entry** (module 12, group "Site", module key Daily Worksheet): creating sheets older than N days is blocked unless the user's designation is in the override list. Editing sheets older than N days is restricted the same way. Nothing can be created or edited before the financial closing date. Per-user `backdatedCreateDays` and `backdatedEditDays` also apply.
- **Approval gate**: when approval is enabled, only users with Daily Worksheet A can change the status. Editing an approved sheet should require U and send it back to Pending (inferred).
- Dirty-form guard: leaving the form with unsaved changes asks "Discard changes?" (a standard legacy pattern; inferred for this screen).
- Daily Worksheet (#19) has no V (view all) flag, so everyone with R sees all of the project's sheets (inferred).

**Equipment / usage**

- Equipment Name\*, Equipment Number\*, Contractor Name\* (master), Utilization Basis and Working Time Method\* are required.
- Equipment Number should be unique per company (inferred).
- Time shifts: end > start for each shift, and shifts must not overlap within a sheet (inferred). Hours are auto-calculated.
- Meter reading: closing ≥ opening. Opening defaults to the last closing reading. A gap between sheets is flagged (inferred).
- Usage hours + idle + breakdown should not exceed 24 per day (inferred).
- Fuel efficiency alert: when fuelConsumed ÷ usageHours > Expected Fuel Efficiency, raise an alert (notification, N flag).
- Utilisation below Min Utilization % against Target is flagged on the dashboard (inferred).
- Rented: Hire Cost = Unit Rate × billable quantity for the hire basis (hours, trips, days; monthly is pro-rated) (inferred).
- Equipment marked "Unavailable for worksheet entry" cannot be selected for a usage sheet. Only equipment currently assigned to the project and not In maintenance should be selectable (inferred).
- Transfer: Transfer Date\*, Location Name\* and (for project transfers) Destination Project\* are required. The destination must differ from the source. The transfer date cannot be earlier than the last usage sheet date on the source project (inferred).
- Back-dated control applies (module key Equipment Usage).
- The fields shown are governed by `v2/equipment-usage/settings`. The approval gate applies when the Approval toggle is on.

**Progress reports**

- The DPR needs a date. Filled By is optional and narrows the report (inferred).
- Generation is asynchronous. The user is notified on completion and must not be blocked.
- Including images can make the PDF large. A size or page cap is open.
- Only users with Progress Report C can generate and only those with D can delete. F (financial) hides or shows cost values such as hire cost (inferred).

---

## Permissions

From `RolePermissions/DefaultMenuPermission/GetAllV3`, decoded with the legend in `_working-notes.md`:

| Letter | Meaning        | Letter | Meaning      |
| ------ | -------------- | ------ | ------------ |
| C      | create         | N      | notification |
| R      | read           | V      | view all     |
| U      | update         | T      | transfer     |
| D      | delete         | O      | report       |
| A      | approve        | F      | financial    |
| J      | reject         | E      | export       |
| P      | print/download | I      | import       |

The UI matrix columns are ADD, VIEW, EDIT, DELETE, APPROVE, REJECT, DOWNLOAD, REPORT, VIEW ALL, NOTIFICATION, TRANSFER, FINANCIAL.

| Menu (id)                               | Flags             | Effect in this module                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily Worksheet (#19)                   | C R U D A P N O   | Create, view, edit and delete sheets. **A** = approve or partially approve. There is **no J (reject)** flag, which matches the status set Pending / Partially Approved / Approved having no Rejected state. **P** = download/print. **N** = notified of new sheets and approvals. **O** = Daily Work report. No V, F, E or I. |
| Equipment Usage (#56)                   | C R U D A P N O F | Same as Daily Worksheet (no J), plus **F** = see unit rate, hire cost and other financial values.                                                                                                                                                                                                                             |
| Equipments (#22, master)                | C R U D P N T O F | **T** = transfer equipment between projects or to a warehouse. **F** = hire rates. **O** = reports (usage, maintenance, transfer). **N** = equipment notifications (for example, fuel-efficiency alerts, inferred).                                                                                                           |
| Progress Report (#73)                   | C R D N F         | Generate (C), view (R), delete (D), get the ready popup/push (N), include financial data (F, inferred). There is no U, because reports are immutable.                                                                                                                                                                         |
| Reports (#20)                           | R P               | Project report set: Daily Work, Rented / Company Owned Equipment Usage.                                                                                                                                                                                                                                                       |
| Dashboard (#65)                         | R                 | Daily Work and Equipment Usage dashboard sections.                                                                                                                                                                                                                                                                            |
| Create Wing (#6), Create Location (#74) | C R U D           | Provide the location pickers (module 03).                                                                                                                                                                                                                                                                                     |
| Current Inventory (#16)                 | C R U D P N O     | Consumption posting relies on inventory create rights. Whether a worksheet author needs #16 C is open.                                                                                                                                                                                                                        |

Back-dated limits come from the user permission row (`backdatedCreateDays`, `backdatedEditDays`, `financialClosingDate`) and from module 12 settings.

---

## Relationships

- → depends on **01 Organization/Identity/Access**: team members (Filled By, Supervisor, approvers), permission flags, designation-based back-dated overrides.
- → depends on **02 Master Records**: Contractors, Departments, Work Types (and their assigned materials), Materials, Measurement Units, Equipments, Fuel Types and Units, Amenities & Common Development, Labour Categories (operators, inferred), Vendors (hire vendor, inferred).
- → depends on **03 Projects/Structure/Drawings/Gallery**: project, project resources (assigned contractors and equipment), Phases → Wings → Floors → Units, Locations, project logo for reports. Testing Reports live in 03. Worksheet and usage-sheet photos likely surface in the project **Gallery** (inferred).
- → depends on **12 Settings**: back-dated entry control (Site group: Daily Worksheet, Equipment Usage), worksheet form config, financial closing date.
- ← used by **05 Tasks/Issues/Inspections**: worksheets may reference a Task (TaskName column). The Task Progress Report reads task progress.
- ← used by / writes to **06 Procurement & Inventory**: worksheet and equipment-sheet material consumption creates Consumed entries in Current Inventory and the Stock Register.
- ← used by **07 Payments & Accounting**: rented-equipment hire cost and fuel are the basis for contractor/vendor payables (inferred). Maintenance cost goes to expenses (inferred).
- ← used by **08 Labour & Vendor Attendance**: contractor-wise skilled and unskilled counts complement the labour and vendor attendance figures. The two are not reconciled in legacy (inferred).
- ← used by **11 Reports/Dashboards/Backup**: Daily Work report, Rented / Company Owned Equipment Usage reports, Project Dashboard (Daily Work, Equipment Usage), worksheet backup, Project All Media.
- ← used by **13 Chat/Notifications/Support**: "report ready" popups, approval and new-sheet notifications, fuel-efficiency alerts.

---

## Reports & exports

| Report                                      | Source                        | Format                 | Notes                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily Work report                           | Worksheets                    | PDF / Excel            | Columns: Date, Department, Contractor, Skilled Workers, UnSkilled Workers, LocationType, Location, App. Work Done, TaskName, Shift, Work Images, Consumed Material, Labour Details. Header: Organisation, Project, Address, Duration, Page x of y. |
| Daily Progress Report (DPR)                 | Worksheets + equipment sheets | PDF (async)            | Organisation, Project, Address, Report Filled By, Date, skilled/unskilled/total labour, Equipment Details, worksheets, optional images.                                                                                                            |
| Task Progress Report                        | Tasks (module 05)             | PDF (async)            | Duration, location, task, progress %.                                                                                                                                                                                                              |
| Company Owned Equipment Usage report        | Usage sheets (owned)          | PDF / Excel            |                                                                                                                                                                                                                                                    |
| Rented Equipment Usage report               | Usage sheets (rented)         | PDF / Excel            | Includes hire cost (needs F).                                                                                                                                                                                                                      |
| Equipment maintenance report                | Maintenance log               | PDF / Excel (inferred) |                                                                                                                                                                                                                                                    |
| Equipment Transfer Report                   | Transfers                     | PDF / Excel            | Equipment Name, Number, Purchase Year, Transfer Date, Location Before, Transfer To Project, Latest Location, Remarks, Entry By.                                                                                                                    |
| Equipment dashboard                         | Usage sheets                  | Charts                 | Top Equipment by Work Hours; Owned vs Rented.                                                                                                                                                                                                      |
| Daily Work dashboard                        | Worksheets                    | Charts                 | Total Labours Availability trend; Contractor-wise Labour (contractor, department, skilled, unskilled).                                                                                                                                             |
| Worksheet backup (`#/dailyWorkBackupRoute`) | Worksheets + media            | Archive                | Data Backup / Media Backup by date range; async, emailed/OTP-protected (module 11).                                                                                                                                                                |

---

## Rebuild recommendations

1. **The DPR should be a real site diary.** The research describes the site diary as a serially numbered record of weather, manpower by trade, plant, materials received and consumed, work done by location, visitors and instructions (research §3 "DPR / site diary / hindrance register"). Legacy DPR only has labour totals, equipment and worksheets. Add weather, visitors/instructions and materials received that day (from GRNs, module 06), and give the DPR a per-project serial number.
2. **Add a Hindrance register.** Record date, cause, affected activity/location, duration and responsible party, with joint sign-off. It is the evidence base for extension-of-time and 10CC escalation claims (research §3, §5 "Hindrance register and site diary with joint sign-off"). Link equipment breakdown hours and idle reasons to hindrance entries.
3. **Structure "Approx Work Done" against BOQ / Task quantities.** Instead of a free value plus unit, let a worksheet line point at a Task or BOQ item (module 05) so measured quantity rolls up into task progress and earned value. This is also the input for Measurement Book / JMR and RA bills (research §3 "Measurement Book (MB) and RA bills"). Keep the free-form value for crews without a BOQ.
4. **Material reconciliation per contractor.** Worksheet consumption is already tagged with the contractor. Combine it with work done × rate-analysis coefficients to produce theoretical vs actual consumption and the variance against permissible wastage (often 2–5%), recovered at a penal rate (research §3 "Material reconciliation"). This needs consumption stored as immutable ledger entries, not editable history rows.
5. **Labour counts by category, reconciled with attendance.** Replace the two counts (skilled/unskilled) with counts per Labour Category, and show the difference against module 08 labour/vendor attendance for the same contractor and date. Statutory registers (Form XVI/XVII) come from attendance, not worksheets (research §2 "Labour and welfare"), but the DPR should not contradict them.
6. **Rented equipment cost should flow into payables with TDS.** Hire of plant and machinery is TDS u/s 194I at 2% above ₹6L/yr (research §2 TDS table). Approved usage sheets should accumulate a hire bill per vendor per period (module 07), with fuel-borne-by deciding who pays for fuel.
7. **Offline-first, fewer taps.** Site entry needs offline capture with auto-sync for basements and remote sites, and "prefilled from yesterday" one-tap repeat entries (research §4 items 2, §5 differentiator 2). Make Duplicate the default ("copy yesterday's sheet for this contractor") and keep the date and location on Save & Add New.
8. **Geo-tagged, drawing-pinned photos.** Store EXIF/GPS and the capture time on work photos, and allow pinning a photo to a location on a project drawing (module 03). Reviewers asked to "tap a drawing to update work done" (research §4 items 5 and 8). This later feeds RERA physical % complete per wing (research §2 RERA).
9. **WhatsApp submission.** Allow supervisors to submit DPR photos and labour counts through a WhatsApp Business bot (research §4 item 1, §5 differentiator 1). Model worksheets so a partial entry (photo + location + contractor) is valid as a draft.
10. **Approval model.** Replace the bool switch and three statuses with an explicit state machine (Draft → Submitted → Approved / Rejected / PartiallyApproved) with reasons, and a per-line approval for partial approval. Optional multi-level approval is something Onsite Business+ sells (research §1 table).
11. **Audit trail and soft delete.** Worksheets and usage sheets change inventory and cost, so keep an append-only audit log (who, what, before/after) and soft-delete with automatic reversal of inventory postings. Edits after approval or after the financial closing date must be blocked by the module 12 rules on the server, not only in the UI.
12. **Equipment as an asset register.** Add a maintenance schedule (hours/km-based service intervals from meter readings), maintenance cost and downtime on Log Maintenance / Return to Service, and server-side (not only UI) exclusion of equipment marked unavailable for worksheet entry. Use fuel issue from inventory (diesel as a material) so fuel consumed reconciles with fuel stock.
13. **Typed async report jobs.** Model reports as a job table (Queued/Generating/Ready/Failed) with retry, an expiry for stored PDFs, an image-size budget, and push plus in-app notification. Keep generated PDFs immutable and regenerate on demand.
14. **Configurable form settings with explicit scope.** Store worksheet and equipment-sheet field configuration at company level with optional project override. Version it so old sheets render with the configuration they were captured under.

---

## Open questions

1. Is the worksheet form configuration (section toggles, order, approval switch) per project or per company?
2. What do **Partially Approved** and `WorkSheets/UpdateWorksheetCompletStatus` mean? Is partial per line or per field, and is "complete status" separate from approval (for example, work at that location marked complete)?
3. Neither Daily Worksheet (#19) nor Equipment Usage (#56) has J (reject). Should the rebuild add a reject path with a reason, or keep approve and remark only?
4. What is the worksheet **sheet number** format? It is not a configurable Sequence ID in module 12.
5. Does worksheet **material consumption** block when stock is insufficient, warn, or allow negative stock?
6. How does a worksheet link to a **Task** (the "TaskName" column)? Is it one task per sheet, does it update task progress, and are approx-work-done quantities rolled up?
7. What exactly does the worksheet "Labour Details" report column hold, given the skilled/unskilled counts are separate columns? It may be a per-category breakdown.
8. Equipment usage "**Work Item**": is it a link to a Daily Worksheet (legacy calls worksheets "WorkItem")?
9. Is "**Operator**" free text, a Labour, or a Team Member?
10. Rented "**Chargeable**" and "Vendor" in Hire Details: does Vendor mean the labour-supply Vendor master or the Contractor (the equipment master uses "Contractor Name\*")? Does Chargeable mean billable to the client, or chargeable idle time?
11. What are the option values of fuel **"Borne by"**, and does it change hire-cost or payable calculations?
12. What are the maintenance log fields? Does "In maintenance" block usage sheets by itself, or only the "unavailable for worksheet entry" flag? Does Log Maintenance set that flag automatically?
13. Is the equipment sheet number configurable, and does Duplicate copy meter readings and time shifts?
14. Does the DPR's "Report Filled By" filter worksheets by author, or only print the name of the person generating the report?
15. Retention period and size limits for generated progress-report PDFs and included images.
16. Does equipment-usage material consumption post to inventory like worksheet consumption does?

---

## Decisions for the build

The open questions above are answered in [ADR CM-0016](../adr/CM-0016-daily-site-work-product-decisions.md); the owner settled approval (Approve / Reject), labour (two counts prefilled from attendance), the DPR (a full site diary with a Hindrance register) and fuel (recorded only). Rules each ticket settled while building are listed here.

### CM-601

- Equipment lives in the `site-work` context (CM-0016 §1); Work Types are a master with assigned Materials. Fuel Types and Units are fixed lists.
- Labour Categories carry a skill (skilled / unskilled); Helper, Labour and Unskilled are unskilled.
- A floor, unit, Wing or Location named by a worksheet, usage sheet, hindrance, or an M5 document, movement or ledger entry cannot be removed.
- Work Types and the Labour Category skill are masters; their rules are in [`modules/02`](./02-master-records.md) → "Decisions for the build" → CM-601. A worksheet's Work Type picker reads `GET /api/construction/masters/work-types?status=enabled` (each with its Department and Materials).
- Masters cannot delete a Work Type, Department, Contractor or Material that live site-work rows name (`*_IN_USE`); a deleted sheet no longer counts. A Work Type's own Material list does not block deleting the Material.

### Shared — the site-work document thread (built under CM-602)

- Every site-work document (worksheet, equipment_usage, site_diary, hindrance) has one remarks thread and one file list, ported from procurement's (CM-0015 §13) into `src/site-work` (`SiteWorkDocumentThread`). Routes: `/api/construction/site-work/documents/{type}/{id}/remarks|files/…`.
- Rights: Read on the document's menu, on its Project, reads and comments; Create or Update uploads; Update removes any file, Create only one's own. A deleted, unknown or another Company's document is 404 `WORKSHEET_NOT_FOUND` / `EQUIPMENT_SHEET_NOT_FOUND` / `SITE_DIARY_NOT_FOUND` / `HINDRANCE_NOT_FOUND`; an unknown type is 404 `DOCUMENT_NOT_FOUND`.
- Worksheets and Site Diaries take images only (PNG, JPEG, WebP); usage sheets and hindrances take a PDF or an image. 25 MB a file. **20 files a document counts its remarks' files too**; 10 a remark.
- **Only images join the Project Gallery** (sources `worksheet`, `equipment_usage`, `site_diary`, `hindrance`, shown with Read on that menu); a usage sheet's or hindrance's PDF stays on the document. Removing a file takes it out of the Gallery. A document's own delete dispatches `siteWorkDocumentMediaRemoved(...)` after commit so its photos leave the Gallery.
- A Site Diary is labelled by its date (`2026-10-08`) in audit events; the others by their number.
- New forms hold picked photos as `File`s (`PendingFilesField`) and upload them after the create succeeds (`useUploadPendingFiles`). A failed upload never undoes the save: the page names the files that did not go up and the detail page's files section takes them again.

### CM-607

- **Site Diary.** One per Project per date (409 `SITE_DIARY_EXISTS`, also when an edit moves a diary onto a taken date; the live-date unique index backs it under races). The date is not after the Company's today. A deleted diary frees its date.
- Weather (morning, afternoon) is optional; "Not recorded" is a choice. Rainfall is mm, 0–9999.9 with one decimal (trailing zeros are accepted: `12.50` is stored as `12.5`).
- Visitors (≤ 50) need a name; organisation ≤ 120, purpose ≤ 200; times are `HH:MM` and time out may equal time in but not be before it. Instructions (≤ 50) need given by and the instruction (≤ 1000); given to ≤ 120, action taken ≤ 1000. Row errors name their field as `visitors.1.timeOut`. Rows are replaced as a set on edit.
- The module opens on today (or `?date=`), steps a day at a time and never past today, and lists the month's diaries beside the day (`GET …/site-diary?projectId&from&to`, at most a year). The day's read is `GET …/site-diary/by-date?projectId&date` → `{ date, diary | null }`.
- **Hindrances.** Numbered `HR/…` on the start date. Start and end dates are not after today; end ≥ start; hours lost ≥ 0 with two decimals. Status is derived: Open without an end date, Closed with one.
- **Days lost** count both ends: end − start + 1, or up to today while open. The DPR read counts up to the report date and calls a hindrance Closed only when it ended on or before that date.
- **Contractor** is required when the party is Contractor and must be live and assigned to the Project (400 `CONTRACTOR_NOT_ON_PROJECT`); for any other party the Contractor is dropped. The Contractor, the sign-off Team Member and the usage sheet are checked only when set or changed, so an old hindrance stays editable after the Contractor leaves the Project.
- **Joint sign-off:** the other party's name and the signed-on date go together; the Team Member (on the Project, or the Owner; 400 `SIGN_OFF_MEMBER_NOT_FOUND`) and the party's role are optional but need them. The date is not before the start nor after today.
- **Close** needs Update and sets the end date and, when given, the hours lost (null clears them, omitted keeps them). A closed hindrance cannot be closed again (409 `HINDRANCE_CLOSED`); edit it to change the end date. **Close checks the back-dated edit limit on the end date, not the start date**, so a long hindrance can still be closed; create, edit and delete check the start date.
- The list filters by status, cause, party, Contractor, a date range it overlaps (started on or before `to`, not ended before `from`) and a search on the number or activity; newest recorded first.
- **Record hindrance from a usage sheet:** link to `/app/projects/{id}/hindrances/new?cause=equipment_breakdown&date=YYYY-MM-DD&equipmentUsageSheetId=<id>&activity=<text>` (`newHindranceFromUsageSheetPath` in `src/queries/hindrances.ts`). The sheet must be live and on the Project (400 `EQUIPMENT_USAGE_SHEET_NOT_FOUND`).
- **DPR reads** (`createSiteRecordQueries()` in `src/composition/site-records.ts`): `diaryForDate(workspaceId, projectId, date)` → `DprSiteDiary | null` and `hindrancesOn(workspaceId, projectId, date)` → `DprHindrance[]` (open on that date: start ≤ date and no end or end ≥ date), with labels resolved.
- Diary photos and hindrance files use the shared document thread; picked on a new form, they upload after the save. Deleting a diary or hindrance removes its photos from the Gallery; a Gallery failure is logged and never fails the delete.

### CM-602 — Daily Worksheet

- **Settings** live per Project in `worksheet_settings`; a Project without a row reads the defaults (everything shown, approval off, order Location / Basic / Materials / Other). Saving needs Daily Worksheet Update and sends the `updatedAt` last read (null on the defaults); a stale one is 409 `WORKSHEET_SETTINGS_CHANGED`. Routes: `GET|POST /api/construction/site-work/settings/worksheets`.
- **Hidden sections** are neither validated nor stored. On create they stay empty; on edit the sheet **keeps what it already had** for a hidden section (material lines included, re-posted at the new date if the date changes). The detail page shows everything the sheet holds.
- **Location is required only when the section is shown and the Project has a place to pick** (a Wing, an assigned Amenity or Common Development, or a Location — what the picker offers). A new Project with none saves sheets without a location; the picker's empty state is a hint. The server decides through `WorksheetDirectory.hasPlaces` (the location resolver's options), not the client.
- **No location is SQL NULL.** The worksheet store leaves `site_location` out and writes NULL with raw SQL, because `next dev` turns `Prisma.DbNull` into `{}`. Reads go through `storedLocationRef` (shared kernel), which reads anything without a known `type` and its id as no location; Current Inventory's history uses it too. The detail shows "—".
- Approve and reject put the returned sheet straight into its detail query before the list and detail are invalidated, so the badge changes at once.
- **Material lines: 0–100.** A crew often consumes nothing, so the Materials section does not require a line (`WORKSHEET_LIMITS.minMaterials`; raise it to 1 to require one). Each Material once (`MATERIAL_REPEATED`), quantity > 0 with ≤ 3 decimals (`QUANTITY_INVALID` with `details.index`). A disabled Material, Department, Work Type or unit is refused unless the sheet already named it; an inactive Contractor likewise.
- **Approx Work Done** needs a quantity > 0 (`APPROX_WORK_QTY_INVALID`) and then a unit (`APPROX_WORK_UNIT_REQUIRED`); a unit without a quantity is dropped.
- **Labour counts** are whole numbers 0–10,000; with Labour shown, at least one is above zero (`LABOUR_COUNT_REQUIRED`). An empty count is saved as 0.
- **Refusals:** Contractor not on the Project → 400 `CONTRACTOR_NOT_ON_PROJECT`; Department not the Contractor's → 400 `DEPARTMENT_NOT_CONTRACTORS`; Work Type of another Department → 400 `WORK_TYPE_NOT_DEPARTMENTS`; a sheet date after the Company's today → 400 `SHEET_DATE_IN_FUTURE`; stale edit or delete → 409 `WORKSHEET_CHANGED`.
- **Approval on save, create and edit alike:** approval off → `not_required`; on → `pending`, or `approved` with Save & Approve (Approve needed; with approval off the flag only checks the permission). So an edited approved or rejected sheet goes back to pending, and **an edit made while approval is off clears the old decision** (`not_required`). Toggling the setting alone never touches saved sheets. Approved sheets stay editable (Update) — CM-0016 §3 says an edit sends them back.
- Approve / reject only a `pending` sheet (409 `WORKSHEET_NOT_PENDING`, also for `not_required`). Bulk reject checks the one reason first (400 `REJECTION_REASON_REQUIRED`), then decides all or none (409 `BULK_DECISION_REFUSED`).
- **Stock:** lines post `Consumed` at the Project on the sheet date with the sheet's location, labelled "Consumed by WS/…", through `SiteStock.replace` in the save's transaction; delete reverses them. The form's "Available" is the stock on the sheet date; when editing it adds back the sheet's own lines if the sheet is dated on or before that date (`GET …/worksheets/available-stock?excludeWorksheetId=`). Over-stock lines are flagged in the form, refused by the server.
- **Attendance panel** (`GET …/worksheets/attendance?projectId&date&excludeWorksheetId`): labour attendance present or half day = one head each (live rows); vendor lines = full-day + half-day heads; split by the Labour Category's skill, no category = unskilled. "On other worksheets" sums the Project's live sheets that date except the one being edited; remaining never goes below zero.
- **Form options** (`GET …/worksheets/form-options`) return the settings, the Project's active Contractors with their enabled Departments, those Departments' enabled Work Types with assigned Materials, and enabled units, read from masters tables in `src/composition/worksheet-directory.ts`. Bulk Select lists the Work Type's Materials first, then any Material by search.
- **List** order is newest saved first (`createdAt`, the cursor every list uses), filtered by Sheet Date range, Filled By (creator), Contractor, Department and approval status; the approval column, filter and bulk approval appear while approval is on or once a sheet carries a decision.
- **Duplicate** is `new?from=<id>`: everything but the date (today), photos and approval; the new sheet keeps `duplicated_from_id` when the source is on the same Project. **Save & Add New** keeps date, location, contractor and shift.
- **Photos** are picked on new sheets and uploaded after the save; edits add or remove them on the detail page (the shared thread). Deleting a sheet dispatches `siteWorkDocumentMediaRemoved` so its photos leave the Gallery.

### CM-603

- **Who may do what.** The register is the Company-level `masters.equipments` menu: Create, Update, Delete, Transfer (T), Financial (F). On a Project, the equipment there is also open to `site_work.equipment_usage`:
  - listing it (`GET /equipment?projectId=`) and reading one machine's detail need Equipments Read **or** Equipment Usage Read on the Project it is at;
  - adding one to that Project needs Equipments Create **or** Equipment Usage Create on that Project; adding to the warehouse or another Project needs Equipments Create;
  - the photo can be changed with Equipments Update, or Equipment Usage Create at the Project the machine is at.
- **Rates and costs.** A hire rate shows with Financial on Equipments, or Financial on Equipment Usage at the Project the machine is at (CM-0016 §10); maintenance costs only with Financial on Equipments. Sending a rate or a cost without Financial is 403; an edit that leaves the rate out keeps the stored one. So adding **rented** equipment needs Financial (its rate is required); the form says so instead of offering Rented.
- **Fields.** Name and number are trimmed with single spaces; the number is unique among live equipment ignoring case (409 `EQUIPMENT_NUMBER_TAKEN`, `details.field`). A target unit with no target value is dropped; a target needs a unit that fits the basis (Hourly: hrs/day or days/month; Km: km/day; Trip: trips/day). Owned equipment refuses hire details and Chargeable (400 `HIRE_DETAILS_RENTED_ONLY`, `IDLE_CHARGEABLE_RENTED_ONLY`) rather than dropping them.
- **Hire party.** A live Contractor of the Company (400 `HIRE_PARTY_NOT_FOUND`); a disabled Contractor stays on the machines it is already on but cannot be chosen anew.
- **First place.** Adding records an `added` movement at a Project or the warehouse, dated **Placed on** (default today, never later), so back-dated usage sheets can find it there. Its location name defaults to the Project's name, or "Warehouse / off system".
- **State column.** In maintenance (an open entry) wins over the availability flag: Available / In maintenance / Unavailable.
- **Delete** tombstones the row and is refused while any live usage sheet names it (409 `EQUIPMENT_IN_USE`). Its movements, maintenance and photo stay with the tombstone.
- **Photo.** One image (PNG, JPEG, WebP) up to 5 MB through the attachments service with the browser's WebP thumbnail (`equipment-photos` folder, `stored_files` kind `equipment_photo`), uploaded after the machine is saved; a new photo replaces the old one, whose files stop counting. Photo writes are last-wins and do not take `expectedUpdatedAt`.
- **Equipment has no remarks thread.** It is a register entry, not a site-work document; usage sheets carry theirs (CM-604).

### CM-605

- **One concurrency token.** Every lifecycle write (transfer, maintenance open / close / edit / delete, availability) takes the equipment's `expectedUpdatedAt` and bumps it, so one token guards the whole detail page (409 `EQUIPMENT_CHANGED`).
- **Transfer.** Checked in this order: not in maintenance (409 `EQUIPMENT_IN_MAINTENANCE`), to the warehouse only from a Project (409 `EQUIPMENT_AT_WAREHOUSE`), a Project other than the current one (400 `TRANSFER_SAME_PROJECT`), then the date: not after today (400 `TRANSFER_DATE_IN_FUTURE`), not before the last movement (400 `TRANSFER_BEFORE_LAST_MOVEMENT`), after the last live usage sheet at the source Project (400 `TRANSFER_BEFORE_LAST_SHEET`). The same day as the last movement is allowed; the same day as the last sheet is not, since a machine is at one Project on a date (review of #54). Date refusals are 400 with `details.field = movementDate` so the dialog shows them under the date. The movement and `current_project_id` / `current_location_name` change in one transaction.
- **Where it was on a date** is the latest movement on or before that date, ties broken by when it was recorded. Before its first movement it was nowhere.
- **Maintenance.** One open entry (409 `MAINTENANCE_ALREADY_OPEN`, also held by the partial unique index). The start date cannot be after today. Return to Service needs an end date on or after the start and not after today (400 `MAINTENANCE_END_BEFORE_START` / `MAINTENANCE_DATE_IN_FUTURE`); a closed entry cannot be closed again (409 `MAINTENANCE_NOT_OPEN`). Editing keeps an open entry open (an end date there is 400 `MAINTENANCE_STILL_OPEN`) and a closed one closed. Deleting an entry is a tombstone; deleting the open one returns the machine to service. Maintenance needs Equipments Update.
- **Availability** sets `unavailable_since` to the Company's today, or clears it; repeating the current state changes nothing.
- **Usage-sheet options** (`GET /equipment/sheet-options?projectId=&date=`, Equipment Usage Create or Update on the Project) list the equipment ever moved to the Project that passes `equipmentSheetBlocker` on the date, with its basis, method, fuel unit, hire terms (rate with Financial) and the closing reading of its latest live sheet on or before the date (by date, then shift). It also lists, with the reason, machines at the Project that day or now that are blocked by maintenance or unavailability.
- **Reports.** The Equipment Maintenance and Equipment Transfers reports (xlsx + PDF) are built from `equipment_movements` and `equipment_maintenance` (see the next bullets); the detail page shows the Transfer Report columns (Transfer Date, Location Before, Transfer To Project, Latest Location, Remarks, Entry By).
- **Report access.** Both reports sit under **Equipments** (`masters.equipments`): requesting needs its Report flag, and the maintenance cost prints only with its Financial (`includesMoney`; a member without Financial cannot download a file that carries it). Equipments is a Company menu, so the Project is not checked for these two.
- **Central or Project.** Masters → Equipments → **Reports** opens a dialog that requests them with `projectId: null` (every machine, at any Project or the warehouse); the dialog's recent list is the requester's own central jobs of these two kinds. From a Project's Reports page they are Project-scoped.
- **Equipment Maintenance** lists live entries of live equipment that overlap the period (started on or before its end, not ended before its start). Days count both ends; an entry still open counts to the period's end and prints "In maintenance". From a Project it lists the machines that were at that Project **when the entry started** (the latest movement on or before the start date, ties by when it was recorded); the central report adds a Project column with that place.
- **Equipment Transfers** lists `to_project` and `to_warehouse` movements of live equipment in the period (`added` is not a transfer). Location Before is the previous movement's place and location name; Latest Location is the location name recorded with the transfer; Entry By is the Team Member who recorded it. From a Project it lists transfers out of or into it (`from_project_id` or `to_project_id`).

### CM-604 — Equipment Usage sheets

- **Settings** live per Project in `equipment_sheet_settings` (defaults: every field shown, approval off). Saving needs Equipment Usage Update and the `updatedAt` last read (null on the defaults); stale is 409 `EQUIPMENT_SHEET_SETTINGS_CHANGED`. Routes `GET|POST /api/construction/site-work/settings/equipment-sheets`. A hidden field is neither validated nor stored: on create it stays empty (breakdown 0), on edit the sheet keeps what it had. **With meter readings hidden**, an Hourly machine on the Meter Reading method takes the hours typed (`usageHours`, 400 `USAGE_HOURS_REQUIRED`), a Km machine the distance typed, and Both falls back to its shifts.
- **The machine is fixed on edit.** `equipmentId`, ownership, basis and method are copied at create and never change; to use another machine, delete and add. Create locks the equipment row and re-checks `equipmentSheetBlocker` in the transaction (409 `EQUIPMENT_NOT_ON_PROJECT` / `EQUIPMENT_IN_MAINTENANCE` / `EQUIPMENT_UNAVAILABLE`, `details.field = equipmentId`); an edit re-checks only when the date changes, so the "unavailable now" flag never blocks fixing an old sheet. A deleted or another Company's machine is 400 `EQUIPMENT_NOT_FOUND`.
- **One sheet per equipment, date and shift**: checked in the transaction and backed by `equipment_usage_sheets_live_shift_key` (both 409 `EQUIPMENT_SHEET_EXISTS`, `details.field = shift`). Work Shift is required (default Shift 1 on the form).
- **Time shifts**: `HH:MM` start and end, 0–10 rows; an end before the start crosses midnight; equal start and end is 400 `TIME_SHIFT_EMPTY`. **Overlap is checked on the clock** (a sheet is one day): 22:00–02:00 overlaps 01:00–03:00 the same sheet; touching ends do not overlap (400 `TIME_SHIFTS_OVERLAP`, `details.index`). Hours = Σ minutes ÷ 60, half-up to two decimals. Zero shifts is a valid (idle) day.
- **Meter**: opening and closing are required with the meter shown (Meter Reading or Both), two decimals, closing ≥ opening (400 `METER_CLOSING_BELOW_OPENING`). The gap is opening − the equipment's previous closing — the latest live sheet before this date and shift, excluding itself — shown on the form and in the detail (`previousClosing`, `meterGap`), never refused. With Both a shift/meter mismatch is shown; usage comes from the shifts.
- **Usage columns** (what reports read): `usage_hours` only for Hourly (shifts, the meter's delta, or typed), `distance_km` only for Km (the odometer's delta with the Meter Reading method, else typed), `trips` only for Trip (required, whole 0–10,000). Shifts on Km and Trip machines are recorded in `equipment_time_shifts` but are not usage hours. `idle_hours` and `breakdown_hours` are never null (0). **Cap**: usage hours (Hourly only) + idle + breakdown ≤ 24 (400 `SHEET_HOURS_OVER_24`, `details.field = idleHours`).
- **Fuel** (recorded only): three decimals in the equipment's fuel unit. Owned machines are always borne by the Company (hire party refused: 400 `FUEL_BORNE_BY_RENTED_ONLY`); rented ones need Company or Hire party (400 `FUEL_BORNE_BY_REQUIRED`). `fuel_overrun` = fuel ÷ usage (hours, km or trips) > the machine's Expected Fuel Efficiency read at save, only when fuel, efficiency and usage > 0 all exist; recomputed on every save.
- **Hire cost** (rented only, money in `bigint` paise):
  - unit rate defaults to the hire rate; **monthly** hire bills days: unit rate = round_half_up(monthly rate ÷ days in the sheet's month) and billable quantity = 1 day (so a 30-day month splits evenly; ₹1,50,000 in October is ₹4,838.71 a day);
  - billable quantity defaults: hourly — usage hours (Hourly machines) or time-shift hours (Km / Trip machines) plus idle when Chargeable; trip — trips; daily and monthly — 1;
  - hire cost = round_half_up(unit rate × billable quantity) (quantity has three decimals);
  - `unitRate` (any rented sheet) and `billableQty` (with the setting shown) are overrides that need Financial on Equipment Usage (403 `PERMISSION_DENIED` otherwise); null = the default. A non-Financial author's sheet still stores the defaults. **An edit keeps an earlier override** it cannot see or set (no Financial, or billable quantity hidden): an override is a stored value that differs from the default its own figures give.
  - Responses null `unitRate`, `billableQty`, `hireCost` and the equipment's `hireRate` without Financial.
- **Contractor and Department** are optional; when given they are checked like worksheets (on the Project, the Contractor's Department; 400 `CONTRACTOR_NOT_ON_PROJECT` / `DEPARTMENT_NOT_CONTRACTORS`), and a Department needs its Contractor (400 `CONTRACTOR_REQUIRED`). **Supervisor** is an active Team Member on the Project or the Owner (400 `SUPERVISOR_NOT_FOUND`), checked only when set or changed. Operator ≤ 120 and Work Item ≤ 200 are free text. Location is optional, checked by the `LocationResolver`, and stored as SQL NULL when absent.
- **Approval** is the worksheet's (CM-602): off → `not_required`, on → `pending` (or `approved` with Save & Approve); an edit sends a decided sheet back. 409 `EQUIPMENT_SHEET_NOT_PENDING`; bulk all or none (409 `BULK_DECISION_REFUSED`). Stale edits / decisions / deletes are 409 `EQUIPMENT_SHEET_CHANGED`.
- **Events** (in-process, no listeners yet, `src/site-work/domain/events.ts`): `EquipmentHireAccrued { sheetId, equipmentId, projectId, hirePartyId, date, hireCost }` after every save of a rented sheet that ends `not_required` or `approved`, and on approve — a listener keeps the latest per `sheetId`; `EquipmentFuelOverrun` after a save that sets the flag; `document.approved` as worksheets do.
- **Stock**: material lines post Consumed with source `equipment_usage` through `SiteStock`, labelled "Consumed by EU/…"; `GET …/equipment-sheets/available-stock?excludeSheetId=` adds the sheet's own lines back.
- **List** (`GET …/equipment-sheets?projectId&from&to&equipmentId&ownership&createdBy&approvalStatus`) is newest saved first and carries `totals` (usage hours, km, trips, idle, breakdown) over every sheet the filters match, plus `facets` (Filled By, equipment). **Form options** (`…/form-options`) give the settings, supervisors, Contractors with Departments and units; the equipment comes from `GET /equipment/sheet-options`.
- **Duplicate** is `usage-sheets/new?from=<id>`: everything but the readings, files and approval, dated today; the opening becomes the last closing from the sheet options. **Save & Add New** keeps the date, shift and supervisor and clears the machine (the same machine and shift would clash).
- **Record hindrance** shows on the detail when breakdown hours > 0 and the viewer has Hindrance Register Create; the activity is the Work Item, else the machine.

### CM-608

- **Five report kinds** join the reporting pipeline (`REPORT_KINDS`), each an Excel workbook and a PDF from one `ReportDocument`: `daily_work`, `owned_equipment_usage`, `rented_equipment_usage`, `equipment_maintenance`, `equipment_transfers` (the last two are CM-605's). Daily Work and the two usage reports print on A3.
- **Which flags.** The existing code expresses a report's rights as one menu per kind (`REPORT_MENU`): Report on that menu requests and opens it, Financial on it puts amounts in the files. Daily Work → **Daily Worksheet** Report; both usage reports → **Equipment Usage** Report (hire cost with its Financial); maintenance and transfers → **Equipments** Report. As for the labour reports, the Reports page itself is behind **Reports** (`reporting.project_reports`) Read on the Project; the request does not check it again.
- **Rejected sheets are left out** of every site-work report and of the dashboard (a rejected sheet is one the approver said is wrong); deleted sheets too. The usage reports print each sheet's approval (No approval / Pending / Approved).
- **Daily Work** columns: Date, Number, Department, Contractor, Skilled, Unskilled, Location type, Location ("Wing A · Floor 1 · Unit 101", names of removed structure still print), Approx work done ("12.5 cum"), Shift, Photos (the sheet's live files, its remarks' included), Consumed material ("Cement 10 Bag; Sand 2.5 cum"), Remark; totals for the counts. A second sheet, **Material consumed**, adds each material and unit over the period. Optional Contractor filter.
- **Usage reports** columns: Date, Number, Equipment, Equipment No., Shift, Operator, Usage + Unit (hours, km or trips by the basis copied on the sheet), Idle hrs, Breakdown hrs, Fuel + Fuel unit, Fuel overrun, Contractor, Location, Approval. Rented adds Hire party and Hire basis (from the register), Billable qty, and with Financial Unit rate and Hire cost with a total. Usage and fuel are totalled only when every row is in one unit. A second sheet, **By equipment**, sums each machine. Optional equipment filter.
- **Filters** are optional ids; an id that is not the Company's fails the job with "There is no such Contractor." / "There is no such equipment." (the job's error, not a 400). The cards offer the Project's Contractors (Daily Worksheet read) and the equipment at the Project now (Equipments or Equipment Usage read); without that read the card has no filter.
- **Amounts.** `printsAmounts(kind)` replaces the old "not labour attendance" check: Daily Work, owned usage and transfers never carry amounts, so their jobs never need Financial to download.
- **Dashboard.** `GET /api/construction/site-work/dashboard/daily-work` and `/equipment-usage?projectId&from&to` (≤ 366 days, 400 `DASHBOARD_RANGE_INVALID`) need **Dashboard** (`reporting.project_dashboard`) Read on the Project; the rented hire cost also needs Financial on Equipment Usage there (null otherwise).
  - **Daily Work**: worksheets and labour-days in the duration, **pending approval** = every pending worksheet of the Project whatever its date (an approval queue, like Material Approvals); the labour availability trend gives every day worksheet skilled + unskilled against attendance heads (labour present or half day one each, vendor full-day + half-day heads; the shared reader `attendanceHeadsBetween` in `src/composition/attendance-heads.ts`, which the worksheet attendance panel now also uses); contractor-wise labour per Contractor and Department, the most labour-days first.
  - **Equipment Usage**: sheets, work hours (hourly basis), km, trips, fuel overruns, and rented hire cost with Financial; **top 8 hourly machines by work hours**; **owned vs rented hours** of hourly sheets by the ownership copied on each sheet. Hours and km are numbers with two decimals in the response (chart reads), not decimal strings.

- **Reports.** The Equipment Maintenance and Equipment Transfers reports (xlsx + PDF) are built later from `equipment_movements` and `equipment_maintenance`; the detail page shows the Transfer Report columns (Transfer Date, Location Before, Transfer To Project, Latest Location, Remarks, Entry By).

### CM-606

- **Routes.** The DPR's routes are site-work routes (`/api/construction/site-work/progress-reports`: list, create, `form-options`, `{id}`, `{id}/retry`, `{id}/delete`, `{id}/download`). They call the reporting context's job handlers through `src/composition/progress-reports.ts` (the `ProgressReportJobs` port). The DPR is numbered by site work and guarded by the Progress Report menu (C generates and retries, R lists and downloads, D deletes), while the Reports page's routes check the kind's **Report** flag; Progress Report has no Report flag, so those routes never list, open or request a DPR (`hasOwnModule`).
- **Numbering.** `progress_report_numbers` holds one number per Project per date, taken from the `daily_progress_report` rule (`DPR/26-27/00001`) the first time that date is generated and reused after, also after the report is deleted. Two requests for a new date race on the `(project_id, report_date)` unique index; the loser rolls back (its counter increment too, so no number is skipped) and reads the winner's. Taking a number records `progress_report.number_taken` in the audit log.
- **Request.** The date is a real date not after the Company's today (400 `PROGRESS_REPORT_DATE_IN_FUTURE`, `details.field: date`). Report Filled By is optional and must be a Team Member of the Project or the Owner (400 `FILLED_BY_NOT_FOUND`). There is no back-dated limit on a DPR: it writes no site record.
- **Filled By** keeps worksheets and usage sheets whose `created_by` is that User; attendance, materials, the diary and hindrances are the Project's, and the PDF says so under the labour table.
- **Money.** `includesMoney` is Financial on **Equipment Usage** on the Project at request time; without it the hire cost is never read (the SQL returns null). Downloading a report that shows hire cost needs that Financial too (403); the list shows it without a download link.
- **Jobs.** A kind declares its formats (`reportFormats`): the DPR is a PDF only; asking the reporting download for its Excel is 409 `REPORT_FORMAT_UNAVAILABLE`, and the response's `xlsx` link is null. The inline runner stops a job after 60 seconds (`REPORT_TIME_LIMIT_MS`, injectable): the job is failed with "The report took longer than 60 seconds and was stopped. Retry it, or generate it without images." and the run is aborted, so it writes nothing when it ends (done is only recorded while the job is still running). Retry re-runs a failed job only (409 `REPORT_NOT_FAILED`). Delete removes the job row, stops counting its file as stored and deletes the object, with a `report_job.deleted` audit event; a report being prepared shows no Delete.
- **Read model** (`src/composition/progress-report-source.ts`, the reporting `DprSource` port): live, not rejected worksheets and usage sheets by shift then number with Contractor, Department, Work Type and unit names; usage hours from the sheet, else the sum of its time shifts; attendance as present / half-day Labours (one head each) and vendor full / half-day heads, split by the Labour Category's skill (none is unskilled), the same rule as `attendanceHeadsBetween` but kept apart by status; materials received = live GRN lines with that receipt date at the Project, then Delivery Note lines delivered that day; consumed = Consumed ledger entries at the Project that day netted per source and material, labelled by the entry ("Consumed by WS/…") else by source; locations labelled with the projects context's names, read through `storedLocationRef` (no location prints "—", one the Project no longer offers "Location not available").
- **Photos.** Images on the day's worksheets, usage sheets and diary (including their remarks' files), in that order, at most 60, using the WebP thumbnail when there is one. `sharp` re-encodes each to a ≤ 720 px JPEG (the logo to PNG) so pdf-lib can embed it; an unreadable one prints "Image not available". The PDF says how many were left out.
- **PDF.** A4 portrait with Noto text (Indian scripts), the Project logo when "Use Project logo on reports" is on, a running header on pages after the first and "Page x of y" in the footer. Every section prints, "None recorded." when empty. Rejected worksheets and usage sheets are left out (as the Daily Work report and the dashboard count them); pending ones say "Pending approval" under their number. A rejected sheet's material postings still show under Consumed, because they stay on the ledger until it is edited or deleted (CM-0016 §3).
- **Screen.** Create new is a dialog: Report type (Task Progress Report disabled, "Coming with Tasks (M8)"), Date (≤ today), Report filled by (All Team Members or one), Include images. Submitting shows "The report is being prepared. It appears below when ready."; the list is read again a second later and polls every 3 seconds while a report is preparing.
