# CM-0054 — A faint skyline sketch at the top right of every page header

- Status: accepted (2026-11-26, the owner's request)
- Date: 2026-11-26
- Relates to: [ADR-0053](../../../../docs/adr/0053-page-watermark.md) (the page watermark behind a heading)

The owner asked (2026-11-26) for a very simple line drawing at the top right of the signed-in screens, on every page with a header: a building under construction, subtle, so it gives the app a sense of place without competing with the page. The reference they chose was a hand-drawn strip of concrete frames going up; a first try (a single frame beside a tower crane) was dropped for it. They also asked that no button covers it.

## Decision

- **What:** a hand-drawn skyline of concrete frames under construction, with bars standing out of the top floors and one finished tower. It is drawn for this app, in the style of the reference, not traced from it. The strokes are doubled and overshoot their corners so it reads as a pencil sketch; the paths were generated once from a list of buildings and are static in `PageHeaderArt`.
- **Where:** `PageHeader` draws it, so the ~98 pages that use it get it and the menu pages do not. It sits in the header's top-right corner: a 2rem gap to the left of the header's actions, or at the right edge when there are none, so a button never covers it.
- **How subtle:** the text colour at 20% (15% in dark mode), the left end faded out with a mask, a one-second fade-in (none with reduced motion), behind the page's content (`-z-10`, like the watermark), not printed, hidden from assistive technology and from pointer events.
- **When it shows:** only when the header is at least 56rem wide (a container query on the header). Narrower, the header's row wraps the actions under the title and there is no free corner, so phones and small laptops do not show it. It grows from 18rem to 20rem once the header is 72rem wide.
- It is absolute, so it never changes the header's layout or height.

## Not done

- It does not change per area (a different drawing for Finance or Labour). One drawing keeps it quiet; a set can come later if the owner wants it.
