# CM-0025 — Project Dashboard sections collapse, remembered in the browser only

- Status: accepted
- Date: 2026-10-21
- Issue: [arunselvakumar/white-board#100](https://github.com/arunselvakumar/white-board/issues/100)
- Relates to: [CM-0013](CM-0013-projects-structure-product-decisions.md) §12 (Project Dashboard, Manage Dashboard), [CM-0021](CM-0021-reporting-notifications-backups-product-decisions.md) §4 (sections of hidden modules)

The Project Dashboard is a long column of full-width section cards: Project summary, Attendance, Task, Payments, Daily Work, Equipment Usage, Materials, Issue & Snag, Inspection Request, Booking and Inquiry. Their titles were plain text, so they were hard to tell apart while scrolling, and the only way to get a section out of the way was to hide it in Manage dashboard.

## Decision

### 1. Each section has a coloured icon

Every section card shows a Lucide icon left of its title in a small rounded chip, one hue per section (Project summary `Building2` indigo, Attendance `UserCheck` emerald, Task `ListChecks` sky, Payments `IndianRupee` green, Daily Work `HardHat` amber, Equipment Usage `Truck` orange, Materials `Package` yellow, Issue & Snag `TriangleAlert` rose, Inspection Request `ClipboardCheck` teal, Booking `KeyRound` violet, Inquiry `PhoneCall` fuchsia). Manage dashboard shows the same icon beside each name. The icons and tints live in the UI (`components/projects/dashboard/section-appearance.ts`), not in `src/projects/domain/dashboard-sections.ts`: they are presentation, and the domain list stays what the API stores. The icon is decorative (`aria-hidden`); the heading text is the section's name. The grey icons on the figure tiles inside a section stay grey.

### 2. Each section collapses to its header

A − button on the right of every section card collapses it to its header row; a + button opens it again. The button names the section ("Collapse Materials" / "Expand Materials") and carries `aria-expanded` and `aria-controls`. While collapsed, the section's aside (a "View all" link or a filter) is hidden too. **Collapse all** (or **Expand all** once every shown section is collapsed) sits next to Manage dashboard.

A collapsed section fetches nothing: the dashboard renders only its header in place of the section's own component, and mounts that component, with its loading skeleton, when the member opens it. So a member who folds Booking away never waits for the Booking read. The open and collapsed headers are the same row, so the page does not jump, and focus moves to the new toggle.

### 3. What is collapsed is stored in the browser only

The collapsed section keys are kept in `localStorage` under one key per signed-in member, `cm:dashboard-collapsed:<userId>`, as a JSON list (`["materials","booking"]`). Like show / hide and order, it applies on every Project. There is **no API or database change**: `member_preferences.dashboard_sections`, `DashboardSectionSetting` and `POST /dashboard-layout/update` stay as they were.

- No item, junk, or keys that are not in `DASHBOARD_SECTIONS` read as every section open (unknown keys are dropped).
- Every read and write is wrapped in `try/catch`. Storage that throws (private mode, blocked site data, full quota) opens every section; a collapse the storage refuses still holds for the visit, in memory. The dashboard never fails over it.
- The value is read with `useSyncExternalStore` and an all-open server snapshot, so the server render and hydration agree and the stored choice applies right after. A change in another tab shows on the next `storage` event.

## Consequences

- Accepted trade-off: the choice is per device and browser. It does not follow the member to another device or browser, and clearing site data opens every section again.
- Nothing on the server knows what a member collapsed, so support cannot see it and a report of "my section is empty" may be a collapsed one; the + button and the section's name make that visible on the screen.
- A new section is open by default. A section removed from `DASHBOARD_SECTIONS` is ignored in stored lists, so no clean-up is needed.

## Considered options

- **Store it in `member_preferences.dashboard_sections` beside `visible`.** It would follow the member everywhere, but every click would be a write, the update route and its request model would change, and an older client saving the layout would drop the field. Collapsing is a reading convenience, not a layout decision; the issue chose the browser.
- **Collapse with CSS and keep the section mounted.** Simpler, and it keeps the button in place, but every collapsed section would still fetch its data and suspend with the others; avoiding that is the point for a member who folded a slow section away.
