# CM-0042 — A Project's Resources page becomes Teams

- Status: accepted (2026-11-14, the owner chose the name Teams)
- Date: 2026-11-14
- Amends: [CM-0020](CM-0020-project-sidebar-menu.md) §2 (the Setup heading), and the screen name in [CM-0013](CM-0013-projects-structure-product-decisions.md) §6 and [CM-0038](CM-0038-project-staffing-and-activity-feeds.md)
- Relates to: [CM-0032](CM-0032-staff-and-salary.md) (a screen renamed while code keeps its word), [CM-0034](CM-0034-hr-main-menu.md) (Human Resources, and why an old address must not stay)
- Numbering: CM-0041 is taken by the Labour and Site Engineer work in progress on another branch.

## Context

A Project's **Resources** page (`/app/projects/<id>/resources`, under Setup) lists who works on the Project: Site Engineers, Labours, Team Members, Contractors, Suppliers and Vendors. The owner pointed out that on a construction site "resources" also means physical goods: bricks, cement, steel, and the cost of them. Site people talk about manpower, material and machinery, and the Project menu already has **Materials** and **Equipment** as modules of their own. A builder who opens Resources looking for material finds people. The word also sits close to the main menu's **Human Resources** (CM-0034), so the Project page reads like a second copy of it.

What competitors call this page:

| Product                             | Name                          |
| ----------------------------------- | ----------------------------- |
| Procore, Sage Construction, Corecon | Directory (Project Directory) |
| Autodesk Construction Cloud         | Members and Companies         |
| Buildertrend                        | Subs/Vendors, internal users  |
| Onsite (India)                      | Party / Party Library         |
| Powerplay (India)                   | Team                          |

## Decision

### 1. The page is called Teams

- The Project menu entry, the page's title and heading, and the Setup heading read **Teams** (Setup: Wings or Locations, Amenities, Teams).
- Every screen and message that sent people to "Resources" now says **Teams**: the purchase order and goods receipt forms ("Add one under Teams"), the party balances, the Contractor and Supplier forms ("on these Projects' Teams"), and the server's errors ("Add them under Teams first", "Someone else changed this Project's Teams after you opened them").
- The sections inside keep their names: Site Engineers, Labours, Team Members, Contractors, Suppliers, Vendors. **Team Members** is still the Office Staff sign-ins on the Project (CM-0032).
- Add Project's second step reads "Step 2 of 2 · Teams".

### 2. The address is `/app/projects/<id>/teams`

- The page moves to `/app/projects/<id>/teams`, and Add Project lands on `…/teams?step=teams`.
- `/app/projects/<id>/resources` (with any query) redirects to `…/teams`, so bookmarks and links already sent keep working. The redirect is **temporary (307)**, not permanent like the others in `next.config.ts`: browsers cache a permanent redirect for good, and `resources` may one day name a material page.
- The module **key stays `resources`**. Keys are stored in `hidden_modules` (Hide / show modules); only the label and the path segment change, so no migration is needed and a Project that hid Resources still hides Teams.

### 3. Code keeps its word

As with Team Member in CM-0032, the code, the API and the stored values keep **Resources**: `/api/construction/projects/projects/<id>/resources/...`, the OpenAPI models (`ProjectResources…`), the `PROJECT_RESOURCES_CHANGED` code, the query keys, `src/composition/project-resources.ts` and the page's component files. Renaming them would touch every context that meets there and the published API, for no change anyone sees. Comments that name the screen may still say Resources; read it as Teams.

## Consequences

- `CONTEXT.md` names the screen **Teams** and lists Resources under _Avoid_ (it means manpower, material and machinery on a site).
- Storybook titles move from `Projects/Resources…` to `Projects/Teams…`; the end-to-end page object opens `/teams`.
- Older ADRs and PRDs keep the word Resources; this ADR is where the rename is recorded.

## Considered options

- **Directory** (Procore, Sage, Corecon). The established industry word for people and companies on a project. Not chosen: the owner preferred Teams.
- **Parties** or **People & Parties** (Onsite, the Tally ledger word). Fits Contractors, Suppliers and Vendors well, Labours and Site Engineers less so. Not chosen.
- **Keep Resources**. Not chosen, for the reason above.
- **Rename the API and code too.** Consistent end to end, but a large change across five contexts and the published API for no visible gain. Not chosen; CM-0032 set the precedent.
- **A permanent redirect from the old address.** Matches the other redirects, but would pin `/resources` to Teams in every browser that visited it. Not chosen.
