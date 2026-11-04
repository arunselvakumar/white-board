import {
  labelMatches,
  menuQuery,
  noMatchMessage,
} from "@repo/ui/lib/sidebar-menu-filter";

/**
 * The sidebar search (ADR-0049): it filters the menu rows by label, in the
 * main menu and inside a Project. It is not a global search. The matching
 * rule itself (trim, ignore case, `includes`) is `@repo/ui`'s
 * `sidebar-menu-filter`, shared with Whiteboard; this file applies it to
 * an area's grouped submenu:
 *
 * 1. An empty query filters nothing and forces nothing open.
 * 2. A row matches when its label contains the query ("pay" finds
 *    Payments and Central Payment).
 * 3. An area (a row with a submenu) whose own label matches shows its
 *    whole submenu.
 * 4. Otherwise a group whose heading matches shows all its entries, and
 *    any other group keeps only its matching entries; a group left with
 *    none is dropped, heading and all.
 * 5. An area with no matching label, heading or entry is not shown.
 * 6. While a query is set, every area still shown is open.
 */

export { labelMatches, menuQuery, noMatchMessage };

type Entry = { label: string };
type Group<E extends Entry> = {
  label?: string;
  sections: readonly E[];
};

export type AreaMatch<G> = {
  /** The groups to show, each with the entries to show. */
  groups: G[];
  /** The area's own label matched: everything under it shows. */
  all: boolean;
  /** The submenu is held open (a query is set). */
  forceOpen: boolean;
};

/**
 * What an area shows under the (normalised) query, or `null` when the area
 * leaves the menu. See the rule above.
 */
export function filterMenuArea<E extends Entry, G extends Group<E>>(
  label: string,
  groups: readonly G[],
  query: string,
): AreaMatch<G> | null {
  if (query === "") return { groups: [...groups], all: true, forceOpen: false };
  if (labelMatches(label, query))
    return { groups: [...groups], all: true, forceOpen: true };
  const shown: G[] = [];
  for (const group of groups) {
    if (group.label != null && labelMatches(group.label, query)) {
      shown.push(group);
      continue;
    }
    const sections = group.sections.filter((section) =>
      labelMatches(section.label, query),
    );
    if (sections.length > 0) shown.push({ ...group, sections });
  }
  if (shown.length === 0) return null;
  return { groups: shown, all: false, forceOpen: true };
}
