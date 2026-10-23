# CM-0026 — Projects home shows coloured folder cards; every Project has a colour

- Status: accepted
- Date: 2026-10-23
- Issue: [arunselvakumar/white-board#117](https://github.com/arunselvakumar/white-board/issues/117)
- Relates to: [CM-0013](CM-0013-projects-structure-product-decisions.md) §1 (Project Type), CM-204 and CM-411 (Projects home, pins)

The Projects home listed every Project as a table row: name, Project Type and address, then Status, then dates and progress. It read like a spreadsheet, and Projects were hard to tell apart at a glance. The owner asked for each Project to look like a folder in a document app (a tab on the top edge, a sheet behind it, a pastel body) in a colour of the owner's choosing.

## Decision

### 1. A Project has a colour from a fixed palette

`construction_projects.projects.color` is a `project_color` enum, **not null, default `lavender`**. The migration adds it with the default, so every existing Project becomes Lavender. The palette has eight colours, in picker order:

| Key        | Label    |
| ---------- | -------- |
| `lavender` | Lavender |
| `peach`    | Peach    |
| `sky`      | Sky      |
| `mint`     | Mint     |
| `lemon`    | Lemon    |
| `rose`     | Rose     |
| `sand`     | Sand     |
| `slate`    | Slate    |

The keys and labels live in the domain (`src/projects/domain/project-color.ts`), like the Project Types. The tints live in the UI (`components/projects/project-folder-colors.ts`), because they are presentation. In light mode the folder is the hue's 100 shade (50 for Lemon, which is brighter) with a 200 back panel. In dark mode the hue is mixed into the card colour (14% for the front, 28% for the back), so the folders stay dark and low in saturation, with the usual light text.

- Add Project: `color` is optional. Left out, null or blank, it is Lavender. Every new Project starts as Lavender: the default does **not** rotate to the next unused colour.
- Edit Project: `color` left out keeps the stored colour. Null or blank sets it back to Lavender, since a Project always has one.
- Any other value is `400 PROJECT_COLOR_INVALID`.
- Changing the colour needs the same Update flag as any other Project detail. It is not logged separately: it changes nothing anyone else relies on.

### 2. The owner picks it on New Project and Edit Project

The Project card of the form has a **Colour** row of eight round swatches (a radio group), full width under the Project name. Lavender is preselected on New Project, and the saved colour on Edit Project. The field is not marked required, because one swatch is always selected.

### 3. The Projects home shows folders, not rows

The table and its column header are gone, with no switch back to them. Projects show as folder cards in a grid that follows the width of the "Your Projects" section (a container query, so the sidebar counts): one column on a phone, then two, three and four as the section widens. Each card keeps what the row showed:

- Name (with the pin icon when pinned), Project Type ("Project Type not set" when null), the logo or initials (small, inside the folder body), status badge, address, dates and the progress bar.
- The kebab (Pin / Unpin, Edit, Hide modules) sits in a tinted square at the top right, outside the card link.
- **No count** beside the name. The reference design shows one ("↓7"), but there is no Project figure the owner asked for there, and status, dates and progress already fill the card.

Order, the status totals and chips, and both empty states stay as they were.

### 4. The colour shows only on the Projects home

The project shell header, the Project switcher and reports do not use the colour for now.

## Consequences

- Every Project from before this change is Lavender until someone edits it. The home starts out all one colour for a Company with many Projects. Owners can recolour them, and the default does not rotate.
- An eight-colour palette can't give a Company with more than eight Projects a unique colour for each. The colour is there to group and spot Projects, not to identify them. The name does that.
- A fixed palette keeps every folder readable in light and dark mode. A colour the owner types in would need contrast checks we don't have.

## Considered options

- **Free colour picker (any hex).** Owners could match a client's brand colour, but text contrast on the folder body and a dark-mode variant would have to be computed, and many picks would clash with the rest of the app.
- **Rotate the default (next unused colour).** New Projects would differ without anyone choosing, but the colour would depend on what other Projects exist. The owner chose a predictable default.
- **Keep a grid / list toggle.** The owner chose folders only. One layout to build, test and keep working at phone width.
