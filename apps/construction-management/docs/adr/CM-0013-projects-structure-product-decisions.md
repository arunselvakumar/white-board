# CM-0013 — Projects & structure product decisions for M4

- Status: accepted
- Date: 2026-10-10
- Tickets: CM-401 … CM-412 (M4)
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix), [CM-0010](CM-0010-project-contract-details-and-documents.md) (Contract Details and Documents), [CM-0014](CM-0014-attachments-and-gallery-index.md) (attachments and the Gallery index)

`modules/03` ends with fifteen open questions, and the legacy notes are silent on several rules M4 has to settle before code (floor generation for seven of the eight Wing Types, what a Location is, where Contractors and Suppliers come from). The owner was not available when M4 started, so each question below is answered with the default we recommend. Each is written so it can change later without a data migration that loses anything; the M4 handoff lists them again for the owner.

## Decisions

### 1. Project Type is a fixed list, and it decides Wings or Locations

The legacy values behind `Project/Combo` were never captured (open question 1). We ship a fixed list, not a master, because the type also decides which structure screen a Project uses:

| Project Type           | Structure |
| ---------------------- | --------- |
| Residential            | Wings     |
| Commercial             | Wings     |
| Mixed use              | Wings     |
| Villas / Bungalows     | Wings     |
| Plotting / Layout      | Wings     |
| Industrial             | Wings     |
| Institutional          | Wings     |
| Infrastructure         | Locations |
| Interiors / Renovation | Locations |
| Other                  | Locations |

Project Type is required on Add Project. Projects created before M4 have none ("Not set" on screen); an edit that leaves it out keeps what is stored, like the contract fields. A Project can hold both Wings and Locations (open question 7): the home shows the tile its type suggests, and also the other tile once that structure has rows, so changing the type never hides data.

### 2. Budget and logo

- **Budget** is paise in a `BIGINT` (a budget passes ₹21.47 crore easily), optional, informational in M4 (open question 14): the Project card hides it, the Project Dashboard shows it. It follows the Project menu's Financial flag exactly like Order Value (CM-0010): `null` in responses without the flag, and ignored in an edit from someone without it.
- **Logo** is an image (PNG, JPEG or WebP, at most 2 MB) uploaded through our route like the Company logo, shown on the Project card and the project shell. `useLogoInReports` is stored for report headers (M9); nothing reads it in M4.
- **Progress %** (open question 2) comes from Tasks (M8). Until then the card shows no progress bar rather than a made-up number.

### 3. Phases, Wings, Floors and Units

Every Project with Wings has at least one **Phase** ("Phase 1", created with its first Wing). Phases are named and ordered; a Phase with Wings cannot be deleted.

A **Wing** has a Wing Type, a name unique in the Project ignoring case, and the configuration it was generated from. **Continue to Units** generates the floors and units from that configuration; the editor then renames floors, renames, adds and removes units, and **Save** stores the result in one request. The generator is a pure function in `src/projects/domain`, so the browser previews exactly what the server will store.

| Wing Type                                                           | Configuration                                                                                            | Generated                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commercial, Residential, Institutional, Industrial, Individual Unit | typed floors (0–150), start number (0–999), units per floor (1–50), basement floors (0–10), terrace (on) | Terrace (no units) → typed floors from the highest number down to the start number → Ground (units) → Basement N … 1 (no units). Individual Unit defaults to one unit per floor. |
| Residential & Commercial                                            | commercial floors and units per floor, residential floors and units per floor, start number, basements   | As above with the commercial floors directly above Ground and the residential floors above them, numbered on from the commercial ones.                                           |
| Bungalow scheme, Plotting scheme                                    | number of units (1–2,000), start number                                                                  | One floor of kind `site` ("Bungalows" / "Plots") holding "Bungalow 1" … or "Plot 1" …; the editor hides the floor row.                                                           |

Unit names default to the floor number and a two-digit position (`101`, `102`; Ground `G01`; a typed floor 12 gives `1201`). Unit names are unique in the Wing ignoring case (open question on uniqueness: Booking identifies a unit by Wing + Unit No). A Wing holds at most 5,000 units. The terrace and basements carry no units by default but can be given some in the editor (open question 6). Stilt, podium or mezzanine floors are added in the editor as named floors at a chosen position (kind `other`). Removing a floor or unit that later modules point at is refused through a `StructureUsage` port that answers "not used" until those modules exist. Edits are guarded by the Wing's `updatedAt` (409 `WING_CHANGED`); unit and floor ids survive an edit so references stay valid.

### 4. Locations for non-building Projects

A **Location** is a name (≤ 80, unique in the Project ignoring case) and an optional description (≤ 300), ordered by the Team Member (open question 7). Infrastructure work names stretches and structures ("Chainage 0+000 – 2+500", "Culvert C3"); that is all the record needs now.

### 5. Amenities and Common Developments

They are one master in the masters context with a kind (`amenity` or `common_development`), a name unique per kind, and seed rows copied to every Company. The legacy seeds were one each; we seed a usable set:

- Amenities: Swimming Pool, Club House, Gymnasium, Children's Play Area, Landscaped Garden, Jogging Track, Indoor Games Room, Multipurpose Hall.
- Common Developments: Compound Wall, Internal Roads, Main Gate & Security Cabin, Overhead Water Tank, Underground Sump, Sewage Treatment Plant, Storm Water Drain, Rain Water Harvesting, Street Lights, Electrical Substation.

A Project uses only the ones assigned to it (`DevelopmentType/AssignItem`). The assignment is stored by the masters context (`development_projects`), the same way Vendors keep their Projects in the labour context.

### 6. Project Resources and minimal Contractor and Supplier masters

Resource assignment needs parties, and Contractors and Suppliers were planned for M5 (CM-501). M4 ships them as **minimal masters** — name, contact person, mobile, email, address, GSTIN and PAN, and for Contractors the Departments they work in — with active / inactive and Project assignment. CM-501 adds quotations, opening balances and the procurement fields.

Each party keeps its Projects in its own context: Team Members in organization (exists), Vendors in labour (exists), Contractors and Suppliers in masters. The Project's **Resources** tab edits all four through one route per party kind; the route is where the contexts meet. **Contacts** (open question 4) are not built: there is no Contact master and nothing in M4 needs one.

### 7. Location Type and LocationRef

A site entry stores one `LocationRef` (kernel value object):

- `wing`: a Wing, any number of its Floors (multi-select), and any number of Units on those Floors (open question 8: several units are allowed).
- `amenity` or `common_development`: one assigned Amenity or Common Development.
- `location`: one Location.

The kernel holds the value object, its validation of shape, and a `LocationResolver` port; the composition root implements the resolver from the projects and masters contexts, so a site-entry context checks that every id belongs to the entry's Project without importing either. The picker component offers only the Location Types the Project has rows for. The single location tree of rebuild recommendation 2 stays a possible later step; this shape maps onto it.

### 8. Drawings

- Each Project starts with the albums Architect, Electrical, Plumbing and Structural Drawing (existing Projects get them in the migration). Album names are unique in the Project ignoring case.
- An album with drawings cannot be deleted (409 `ALBUM_NOT_EMPTY`; open question 11): delete or move its drawings first. Inspections that link drawings come in M8 and will refuse deleting a linked drawing the same way.
- A **drawing** has a name and **revisions** (open question 9, rebuild recommendation 8): "Upload new revision" adds R1, R2 …; the latest is shown and the older ones stay in the history, downloadable. PDFs and images open in the viewer; DWG and DXF are stored and download only. Up to 100 MB a file.
- The Notification flag on Project Drawings is honoured by M9's notifications; nothing is sent in M4.

### 9. Testing Reports

Each Project starts with the testing items Rcc cube, Steel, Cement and Bricks. A report is a name, a report date, an optional remark and one file (PDF or image, ≤ 25 MB). The report date follows the back-dated entry policy for `material_testing_report`. An item with reports cannot be deleted. The IS 456 cube register (rebuild recommendation 7) is later work.

### 10. Gallery

The Gallery is an **index over attachments**, not a copy and not an upload screen (open question 10): it lists the images and PDFs of the Project's drawings, testing reports and documents in M4, and later modules add their photos through the same index (CM-0014). Filters: type (image / PDF), source, uploaded by, date range, and search by file name. The Gallery menu has only the Read flag, so it never deletes; media is removed from its source.

### 11. Project home, hidden modules, tile order and pins

- The home shows a tile for each module that **exists** and that the member may read; modules still to be built get no "coming soon" tile.
- **Hide / Show Modules** is per Project, for everyone on it (open question 3), and needs the Project menu's Update flag. Hiding removes the tile; it neither grants nor removes access.
- **Tile order** is per member and applies to every Project (rebuild recommendation 1; legacy kept one order in the browser).
- **Pin** is per member per Project; pinned Projects come first on the Projects home.

### 12. Project Dashboard

The dashboard shell has a duration filter (default the last 12 months), the four KPI tiles and the sections of `modules/03`. Sections whose data comes from later milestones (Task, Payments, Materials, Issue & Snag, Inspection Request, Booking, Inquiry, Daily Work, Equipment Usage) render a stub that names the module that fills it. Sections with data today: Project summary (dates, budget with the Financial flag, structure counts, drawings, testing reports, documents) and Attendance (from M2). **Manage Dashboard** shows, hides and reorders sections per member for every Project (open question 13).

### 13. Deleting a Project

Unchanged from CM-204: a Project is tombstoned and cannot be deleted while records point at it (open question 15). M4 adds Wings, Locations, drawings and testing reports to that check. Completed Projects are the archive.

## Not in M4

Backups (M9), project chat (M9), RERA fields, unit handover and DLP, a tax profile, BOQ budgets, status history, and an offline structure cache. They are in `modules/03` → Rebuild recommendations.

## Consequences

- `construction_projects` gains phases, wings, floors, units, locations, drawing albums, drawings and revisions, testing items and reports, media items, hidden modules, pins and member preferences; `construction_masters` gains contractors, suppliers, development types and their Project links. One migration per schema (ADR-0030).
- Seeds (albums, testing items) are created with each Project; development types are copied to each Company at creation and backfilled for existing Companies in the migration.
- Every answer above is in `modules/03` → "Decisions for the build", where the next milestone looks first.

## Considered options

- **Project Type as a Company master**: flexible, but the type has to decide the structure screen, which a free list cannot do. A master can come later with a structure column.
- **Server-side floor generation only**: simpler, but the editor would need a round trip before anyone sees the floors. A shared pure generator gives the same result in both places.
- **Contractors and Suppliers in full in M4**: would pull M5's quotation and procurement fields forward. Minimal masters unblock Resources now.
- **Gallery uploads**: a Gallery that takes uploads becomes a second place for site photos; M6 worksheets and M8 issues own those photos.
