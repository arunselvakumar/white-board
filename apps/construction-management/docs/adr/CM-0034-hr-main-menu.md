# CM-0034 — Human Resources is one main-menu item: Staff, Roles, HRMS, Labours, Vendors and Supervisors

- Status: accepted (2026-11-02; the owner chose the label Human Resources over HR)
- Amended by: [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) (one Staff group, every Staff page under `/app/staff`, Supervisors shown as Site Engineers)
- Date: 2026-11-02
- Supersedes (if accepted): the main-menu placement in [CM-0030](CM-0030-users-and-roles.md) §2 and [CM-0032](CM-0032-staff-and-salary.md) §1 (Staff & Roles as its own item), and PR #138 (Labour & Vendors as its own item)
- Relates to: [CM-0028](CM-0028-settings-main-menu.md) (Settings left Masters the same way), [CM-0020](CM-0020-project-sidebar-menu.md) (submenus, not tab rows), [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §3 (a staff salary separate from HRMS), [CM-0012](CM-0012-hrms-product-decisions.md) (Labour and Employee never mix), `modules/08`, `modules/10`

A customer asked why Labours, Supervisors and the rest of the people on the roll sit under Master, and not under an **HR** section in the main menu. The owner agrees, and chose to write it out as **Human Resources**.

Today the people a Company employs are reached from four places:

| Where                                    | What                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| Staff & Roles (main menu)                | Staff, Role Management                                         |
| Labour & Vendors (main menu, since #138) | Labours, Vendors, Labour Categories, Supervisors               |
| Workspace → HRMS                         | Dashboard, Attendance, Leave, Salary, Configuration (19 pages) |
| Masters → Parties                        | Contractors, Suppliers, Other Parties (parties, not people)    |

Two main-menu items and a Workspace submenu answer the one question "who works for me?". Staff & Roles and Labour & Vendors were each added at a client's request a week apart, which is how the menu grew to seven items without anyone choosing the shape.

## Decision

### 1. Human Resources is a main-menu item

- The main menu becomes **Dashboard, Projects, Human Resources, Workspace, Masters, Settings**. Human Resources sits after Projects because people are a daily screen (check-in, attendance, wages) and Masters is set-up.
- **Staff & Roles** and **Labour & Vendors** are gone from the main menu. Their pages keep their addresses (`/app/staff`, `/app/roles`, `/app/labours`, `/app/vendors`, `/app/labour-categories`, `/app/supervisors`): only where they sit in the sidebar changes, as CM-0020 did for Project modules.
- Human Resources opens on **Staff**, the way Staff & Roles did (on HRMS when the Staff group is left out, so an HRMS Team Member lands on their own screens). Human Resources shows for everyone, like Masters; each page keeps its own permission check. The Staff group is left out when the member may read neither Staff nor Role Management (the `canOpenStaffRoles` rule), so an HRMS Team Member still sees only their own screens.

### 2. The Human Resources submenu has three groups, nothing renamed

| Group  | Entries                                             |
| ------ | --------------------------------------------------- |
| Staff  | Staff, Role Management                              |
| HRMS   | Dashboard, Attendance, Leave, Salary, Configuration |
| Labour | Labours, Vendors, Labour Categories, Supervisors    |

- Eleven entries, grouped by register: the Staff who sign in and are paid a salary through HRMS, and the Labour who are records with a wage and a ledger. The two registers stay separate (CM-0012 §18, `CONTEXT.md` "HRMS"); the menu only puts them side by side.
- The HRMS entries are its five sections, as the Workspace submenu shows them today, not its nineteen pages. Their in-page tabs are unchanged.
- **Vendors stay with Labour**, not with the parties under Masters: a supervisor marks Vendor headcount on the same attendance screen as Labour, and the rate card is priced per Labour Category. Contractors and Suppliers stay under Masters → Parties.
- **Role Management stays beside Staff.** It is where the Owner decides what staff may do; the client asked for the two together in CM-0032.
- Labour attendance stays inside each Project (Site work → Attendance). It is marked per site and per day, and nothing about it moves.

### 3. HRMS moves to `/app/hrms`, with redirects

- The HRMS pages move from `/app/workspace/hrms/…` to `/app/hrms/…`. `HRMS_PATH` changes; every page keeps its relative path.
- `/app/workspace/hrms/:path*` redirects permanently to `/app/hrms/:path*`. HRMS Team Members land there on sign-in (`homePathFor`) and check in from a phone bookmark, so unlike `/app/users` (CM-0032) the old address must keep working.
- The paths stay inconsistent on purpose (`/app/staff`, `/app/labours`, `/app/hrms`, not `/app/hr/…`). Moving the other six families again, a week after #138 and CM-0032 moved them, would touch about fifty files and every e2e page object for a change nobody sees in the menu. If a later ADR wants one prefix, the redirects are the same work then.

### 4. Workspace and Masters shrink

- **Workspace** keeps Central Store, Central Inventory, Central Payment, Party Balance and Central Reports: work across Projects with material, money and reports. Its tile page loses the HRMS tile; its description and the `CONTEXT.md` entry drop HRMS.
- **Masters** is lists and parties only. Its description and the `CONTEXT.md` entry drop Vendors and Labours (they already left in #138, the words did not).

### 5. The Permission Matrix groups the same way

- Role Management shows menus under categories (`MENU_CATEGORIES`). Staff, Role Management, Labours, Labour Categories and Vendors move from **Master records** to a new **Human Resources** category, placed before HRMS, so the matrix reads like the sidebar. The category is not stored in grants, so there is no migration.

### 6. Words

- **Human Resources** is the name of the area, written out in the menu, never shortened to HR on screen. `CONTEXT.md` "HRMS" lists HR under _Avoid_ for the HRMS module; that line changes to: Human Resources is the main-menu area, HRMS is the staff attendance, leave and salary module inside it. The capitals stay.
- "Supervisor", "Labour", "Staff", "Employee" keep their definitions. Pages that said "Back to Masters" for these lists already say nothing (#138).

## Consequences

- One PR (ADR, menu, HRMS route move and redirect, matrix category, Workspace tile, docs, stories, e2e page objects). About 40 files, nearly all path strings and labels. No API, schema or permission change.
- Putting the Staff **Salary** card and HRMS → Configuration → **Employees** next to each other in one submenu makes the two salary set-ups (CM-0032 §2, CM-0033 §3, "joining the two is a later decision") visible to every Owner. That decision should follow in its own ADR and PR: one salary on the staff record, read by the salary run, and the Employees page retired or reduced to a status view. This ADR does not decide it.
- `docs/00-overview.md` "The shape of the product" and `modules/10` "Workspace placement" describe the legacy tabs; both get a note that HRMS is under Human Resources here.
- Bookmarks to `/app/workspace/hrms/…` keep working. Nothing else moves.
- Push notifications are muted per matrix category (`NOTIFICATION_GROUPS`). The five menus leave the Master records group for a new Human Resources group. A migration copies a Master records mute to Human Resources once, so a member who had muted Master records to silence Staff or Labour pushes stays silent; from then on the two groups are muted apart. The notification settings screen saves one group's switch at a time (`POST preferences/update` takes `{ group, muted }`), so a tab opened before the deploy cannot drop the copied mute.

## Considered options

- **Name the area HR, People or Team.** HR is the customer's word; People reads as a software term. The owner chose **Human Resources**, written out, on 2026-11-02.
- **One flat Human Resources submenu of nineteen HRMS pages plus the rest.** Too long to scan; the five HRMS sections with their tabs are already how Workspace shows them.
- **Group by activity (People / Attendance & Leave / Salary / Set-up) instead of by register.** Shorter labels, but "Attendance" under Human Resources would mean staff check-in while Labour attendance stays in the Project, and a Site Supervisor would look in the wrong place. Grouping by register keeps the labels honest.
- **Move Vendors to Masters → Parties.** They are parties on paper, but the people who use the Vendor screens daily are the ones marking attendance, not the purchase manager.
- **Move Role Management to Settings → Advanced Settings.** Roles are configuration, and it would make Human Resources people-only. Not proposed now: CM-0032 put Staff and Roles together at the client's request a week ago, and nothing has changed since.
- **Move every people page under `/app/hr/…`.** See §3.
- **Keep HRMS at `/app/workspace/hrms` and only change the menu.** Cheapest, but the Workspace item would highlight on every HRMS page (`isAppNavActive` matches by prefix) and the address would say Workspace while the menu says Human Resources.
- **Fold Labour Categories and Supervisors into the Labours page.** It would cut the Labour group to two entries, but CM-0020 moved the product from tab rows to submenus, and a Supervisor is not a Labour. Left for later if the group still feels long.
