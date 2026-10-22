# CM-0024 — New menus reach existing Companies' Designations through a migration in the same PR

- Status: accepted
- Date: 2026-10-21
- Relates to: [CM-0003](CM-0003-permission-matrix.md) (Permission Matrix, "granting it to existing templates in a migration")

Each Company copies the seed Designations (`src/organization/infrastructure/seeds/designations.json`) when it is created and keeps its own Permission Templates. M5–M8 added matrix cells (Terms & Conditions; Site Diary, Hindrance Register, Reject on Daily Worksheet and Equipment Usage; Other Expenses; Tags) to the menu catalogue and the seeds, but no migration granted them to Companies that already existed. A Company created on 10 October, migrated to `main`, had an Admin with none of those cells, while a Company created on 17 October had all of them. M11 is the first milestone with its own grant migration (`…_construction_organization_m11_menus`).

## Decision

**One backfill for M5–M8, then a grant migration in every PR that adds cells.**

- `20261021120000_construction_organization_menu_backfill` ORs in, for each seeded Designation that still has its seeded name and a template, the cells the seeds give it today for cells that did not exist when the Designation was created (its `created_at` is before the milestone's merge to `main`). It never removes a cell and never touches `member_menu_permissions`. Cells that already existed but that a later seed gave to more Designations are left alone, because the Owner could have granted them and chose not to.
- From M11 on, a PR that adds a menu, or a flag to a menu, also adds a migration that grants the new cells to seeded Designations, as M11 does, with a unit test that compares the migration's cells to `designations.json`. It runs at the deploy that ships the cells, so every existing Company was created before them and no date check is needed.

**A single generic backfill does not replace the per-milestone migrations.** A generic one would have to answer "which cells did this Company's copy not have yet?". The database cannot answer that on its own:

- Without the date of each cell, "OR in today's seeds" gives back cells an Owner deliberately removed.
- With dates, the list of (cell, date) pairs is the same list a per-milestone migration writes, only kept in one place and run again and again. Running it after the fact also means guessing the date from the merge commit, and a Company created during a deploy can fall on the wrong side.
- The menu catalogue and the seeds are TypeScript (ADR CM-0003: menus and flags are code). A generic SQL migration cannot read them, so it would need a deploy-time script in the app, which we do not have and do not otherwise need.

## Consequences

- Adding a menu or a flag means adding the catalogue entry, the seed cells and the grant migration in one PR. Reviewers check for the migration.
- The backfill dates each milestone by its merge to `main`. A Company created in the few minutes between a merge and its production deploy got the old seeds but is dated after the merge, so it misses that milestone's cells; the Owner can grant them in Designations. We chose this side so an Owner's removal is never undone.
- Quality Control and Structural Engineer had no template before M8, and the M7–M8 seeds also widened existing cells (for example Petty Cash for Site Engineer, Tasks for Site Supervisor). Companies created before then keep what they had. Owners add those in Designations if they want them.
- A unit test that fails when the catalogue gains a cell without a grant migration would make the rule enforceable. We have not added it yet.

## Considered options

- **Generic backfill on every deploy:** rejected for the reasons above.
- **Link Team Members to the seed instead of copying:** rejected in CM-0003 (templates are copied, not linked).
- **Store a seed version on each Designation and grant the difference:** it would make a generic job possible later, but it needs a changelog of cells per version, which is the per-milestone list under another name. Not worth it yet.
