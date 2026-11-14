import { createLoader, createParser, parseAsStringLiteral } from "nuqs/server";

import {
  PROJECT_ACTIVITY_TYPES,
  PROJECT_ACTIVITY_WHO,
  type ProjectActivityFilter,
} from "@/src/queries/activity";

/**
 * The feeds' filters in the address, read the same way by the page on the
 * server (its prefetch) and by the screen in the browser.
 */

/** A `YYYY-MM-DD`; anything else reads as no date. */
export const parseAsCalendarDate = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
});

/** An id; anything that is not a uuid reads as none. */
export const parseAsUuid = createParser({
  parse: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value.toLowerCase()
      : null,
  serialize: (value: string) => value,
});

/** A range typed back to front is read front to back. */
export function orderedRange(
  from: string | null,
  to: string | null,
): { from: string | null; to: string | null } {
  return from != null && to != null && from > to
    ? { from: to, to: from }
    : { from, to };
}

/** Project Activity: Type, Who, From and To. */
export const PROJECT_ACTIVITY_SEARCH = {
  type: parseAsStringLiteral(PROJECT_ACTIVITY_TYPES).withDefault("all"),
  who: parseAsStringLiteral(PROJECT_ACTIVITY_WHO).withDefault("all"),
  from: parseAsCalendarDate,
  to: parseAsCalendarDate,
};

export const loadProjectActivitySearch = createLoader(PROJECT_ACTIVITY_SEARCH);

/** The Project feed's filter from what the address holds. */
export function projectActivityFilter(search: {
  type: ProjectActivityFilter["type"];
  who: ProjectActivityFilter["who"];
  from: string | null;
  to: string | null;
}): ProjectActivityFilter {
  return {
    type: search.type,
    who: search.who,
    ...orderedRange(search.from, search.to),
  };
}
