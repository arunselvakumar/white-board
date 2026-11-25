import { invalid } from "../domain/errors";

// Forward keyset paging: a cursor is the sort key and id of the last row
// sent, opaque to the client.

export type ListPage<T> = {
  items: T[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Rows matching the filters, across every page. */
  total: number;
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type ListCursor = { key: string; id: string };

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id]), "utf8").toString(
    "base64url",
  );
}

/** 400 `INVALID_CURSOR` for anything `encodeCursor` did not make. */
export function decodeCursor(raw: string): ListCursor {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string" &&
      UUID.test(value[1])
    )
      return { key: value[0], id: value[1] };
  } catch {
    // Falls through to the error below.
  }
  throw invalid("INVALID_CURSOR", "The page cursor is not valid.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A page from `limit + 1` rows read after the cursor: the extra row only says
 * there is another page.
 */
export function pageFrom<T>(
  rows: T[],
  limit: number,
  total: number,
  cursorOf: (row: T) => ListCursor,
): ListPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last != null ? encodeCursor(cursorOf(last)) : null,
    total,
  };
}
