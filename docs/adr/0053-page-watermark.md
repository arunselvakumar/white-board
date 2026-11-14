# Page watermark: a page's name, large and faint, behind its heading

## Context

Pages in Whiteboard and Construction Management open with a heading on a plain background. The owner asked for the treatment another of their apps has: the page's name drawn very large and very faint behind the heading, drifting in as the page opens. It gives each page a sense of place without adding anything to read.

That app draws the name as a second text node and moves it with GSAP. Here that has costs:

- Stories and tests find headings by their text (about 1,400 `getByText` calls). A second node with the same text makes those queries match twice. Find in page and copy would see the name twice too.
- Whiteboard does not load GSAP.
- A name 6rem tall is wider than most headings, and often wider than a phone. It must not add a scrollbar or push the page sideways.
- A page that shows a skeleton first mounts its header twice, so an entrance animation would play twice.

## Decision

**One component, `PageWatermark` in `@repo/ui`.** Both apps' `PageHeader` render it, and so do the screens that write their own `<h1>` (the catalogs, the Owner Dashboard, the Parent and Student pages, the Construction Management main menu, the placeholder pages).

**Which name.** The page's own title. A record page, whose title is a person's name or a document number, shows the name of the list it belongs to: "Students" behind a Student, "Vendors" behind Edit Vendor. `PageHeader` takes this as `watermark`. Construction Management's header skeleton shows none, because it has no title yet.

**How it is drawn.** The name is CSS generated content read from a `data-text` attribute, on an `aria-hidden` span. No text node exists, so queries by text, find in page, copy and screen readers get the heading only. It is the foreground colour at 4.5% opacity, 4.5rem tall on a phone and 6rem from `md` up, so it follows the theme.

**Where it paints.** Behind the page's content and in front of the page's background:

- The span is `-z-10` inside the heading's box, which is `relative`.
- `<main>` in both shells is a stacking context (`isolate`), so "behind" stops at the page and the name does not fall under the shell's background.
- The span has `contain: layout`, so its overflow is paint only: it never adds a scrollbar or widens a parent.
- `<main>` clips horizontally (`overflow-x: clip`), which cuts a long name at the page's edge. `clip` does not make `<main>` a scroll container, so sticky elements inside keep working.

**Motion.** A CSS keyframe: 24px from the left and from transparent, over 1.6 seconds. Only `transform` and `opacity` change. There is no motion under reduced motion, and the name is hidden in print. When a skeleton header is replaced by the loaded one on the same path, the second watermark joins the drift where the first one was.

**Where it is left out.** Whiteboard's Calendar (its heading sits on a coloured banner), Online Classes and the class pre-join screen; the headings inside a Construction Management Project's own shell.

## Consequences

- A new record page passes `watermark` with its list's name. A screen that writes its own `<h1>` gives the heading's box `relative` and renders `PageWatermark` in it.
- Anything inside `<main>` that should paint past its left or right edge is cut. Menus, dialogs and sheets render in a portal outside `<main>`, so they are not affected.
- The Storybook preview wrappers in both apps mirror `<main>` (`isolate`, `overflow-x-clip`), so stories show the page as the shell does.
- A test that needs the watermark finds `[data-slot="page-watermark"]` and reads `data-text`.
