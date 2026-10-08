# CM-0003 — A per-member Permission Matrix decides what a Team Member may do

- Status: accepted
- Date: 2026-10-08
- Ticket: CM-107

Owners of building firms want to say exactly who may approve a Purchase Order, who may see amounts, and who sees only their own entries. A handful of roles cannot express that; a matrix of menus × rights can, and it is a selling point.

## Decision

**Menus and flags are code, not data.** `src/shared-kernel/access` lists every menu as `<context>.<menu>` (`procurement.purchase_orders`, `hrms.leaves`, …), its category, which flags it supports, and whether it is project-level. Flags are `create read update delete approve reject print report view_all notification transfer financial export import`, stored as a bitmask whose bit positions never change. A cell a menu does not support can never be stored: `PermissionSet` drops it on every write, and the UI draws only supported cells.

**One function decides.** `can(member, menu, flag, { projectId? })`:

1. The Owner (role `owner`, ADR CM-0002) can do everything.
2. Otherwise the Team Member's matrix must hold the flag for the menu.
3. For a project-level menu with a `projectId`, the Team Member must also be assigned to that Project.

Every route calls it once, through `requireAccess(request, menu, flag)`, before running a command or query; commands that touch a project pass its id. The UI reads the same matrix to hide actions, but hiding is never the check.

**View All and Financial are applied on the server.** Without `view_all`, list queries add a "created by me" filter (`ownEntriesOnly`). Without `financial`, Response models carry `null` for amounts and rates (`financialValue`). Neither is a separate endpoint.

**Grants are rows per Team Member.** `construction_organization.member_menu_permissions (workspace_id, member_id, menu, flags)`. They are keyed by the Team Member, not the User, so the matrix of a Joining Pending member is set before they have a User; rows make "who has `notification` on this menu" a single query for M9.

**Designation templates are copied, not linked.** Choosing a Designation copies its Permission Template into the new Team Member's matrix; later edits to either do not affect the other. HRMS Team Members start from the HRMS default set instead. "Template plus overrides" can come later if Owners ask for it.

**Changes are audited.** Every matrix change writes an audit event with the before and after grants.

## Consequences

- Adding a menu means adding a catalogue entry in code and, if needed, granting it to existing templates in a migration.
- The Owner's rights are not stored; demoting an Owner is not possible (there is one Owner).

## Considered options

- **Role-based access (owner/admin/engineer…):** too coarse for the people this product is for. Rejected.
- **Menus and flags as database rows:** lets an Owner invent cells the API ignores. Rejected.
- **A JSON matrix on the Team Member row:** simpler reads, but no cheap "who gets notified" query. Rejected.
