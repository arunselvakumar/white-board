# CM-0027 — Projects home groups folders by client; hovering a folder lifts its paper

- Status: accepted
- Date: 2026-10-23
- Follows: [CM-0026](CM-0026-project-colour-folder-cards.md) (coloured folder cards), PR [arunselvakumar/white-board#118](https://github.com/arunselvakumar/white-board/pull/118)
- Relates to: CM-413 (client name in the contract details), CM-411 (pins)

Once the Projects home showed folders (CM-0026), the owner asked for two follow-ups. A builder usually has several Projects for the same client, so the folders should sit under their client. And hovering a folder lifted its whole front, which looked wrong: in a real folder, the papers inside move, not the folder.

## Decision

### 1. Folders are grouped by client name

The "Your Projects" section shows one group per client: the client's name, how many Projects it has ("1 Project", "5 Projects"), then that client's folders in the usual grid. Projects with no client name sit in a last group called **Uncategorised**. The client name is optional (CM-413), so there is always somewhere for them.

- **Which client:** the Project's `clientName` from its contract details. It is free text, so names that differ only in case or spacing are one client ("Sri Balaji Developers" and "sri balaji developers"). A blank name counts as no client. The group shows the name as the first Project in the list spells it.
- **Order:** groups are sorted by client name (case-insensitive, numbers in order), with Uncategorised last. Within a group the Projects keep the home's order: the member's pinned Projects first, then by status and name. A pin does not move a whole group to the top.
- **Filters:** the status chips and totals filter the Projects first, then they are grouped. A group with nothing left is not shown, and "No Projects are on hold." still shows when nothing matches.
- **Uncategorised** shows even when no Project has a client, so the layout does not change as clients are added.
- Grouping happens in the browser (`src/projects/domain/client-groups.ts`). There is no API or database change: the Projects list already returns `clientName`.

### 2. Hovering a folder lifts the paper, not the folder

On hover or keyboard focus, the sheet of paper behind the front slides up out of the folder (12 px, 300 ms, ease-out). The front panel, its shadow and the kebab stay still. Under `prefers-reduced-motion` nothing moves. The keyboard focus ring on the front is unchanged.

## Consequences

- Two spellings of a client that differ by more than case or spacing ("Sri Balaji Developers" and "Sri Balaji Devs") are two groups until someone edits one. Clients are not a master record yet. If they become one, the group should key on its id.
- A Company with one client sees a single group header. That costs little and keeps the layout the same for every Company.

## Considered options

- **Group by a Client master record.** That would be exact, but there is no Client master yet, and making one is a much larger change than the owner asked for.
- **Collapsible groups.** Not asked for. Groups can become collapsible later, the way dashboard sections did in CM-0025.
- **Pinned Projects as their own group at the top.** That would take a Project out of its client's group. Pins stay first inside each group instead.
