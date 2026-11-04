/**
 * The sidebar menu search's matching rule (ADR-0049), shared by both apps
 * so they never search differently: the query is trimmed and compared
 * case-insensitively, and a row matches when its label contains it. An
 * empty query filters nothing.
 */

/** The query as the rule compares it: trimmed and lower-case ("" = no filter). */
export function menuQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Whether `label` contains the (already normalised) query. */
export function labelMatches(label: string, query: string): boolean {
  return query === "" || label.toLowerCase().includes(query);
}

/** The line shown when nothing in the menu matches. */
export function noMatchMessage(raw: string): string {
  return `No menu item matches “${raw.trim()}”.`;
}
