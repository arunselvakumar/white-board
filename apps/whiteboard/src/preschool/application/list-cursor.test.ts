import { describe, expect, it } from "vitest";

import { PreschoolError } from "../domain/errors";
import { decodeCursor, encodeCursor, pageFrom } from "./list-cursor";

const ID = "6f1c2a0e-8a43-4f5e-9d3b-2b6f0c1d9e11";

describe("list cursors", () => {
  it("round-trips the sort key and id", () => {
    const cursor = { key: "Aarav", id: ID };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("refuses anything else as INVALID_CURSOR", () => {
    for (const raw of [
      "",
      "not-base64!",
      encodeCursor({ key: "a", id: "x" }),
    ]) {
      let error: unknown = null;
      try {
        decodeCursor(raw);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(PreschoolError);
      expect((error as PreschoolError).code).toBe("INVALID_CURSOR");
    }
  });

  it("gives a next cursor only when there is another page", () => {
    const rows = [1, 2, 3].map((n) => ({ name: `c${String(n)}`, id: ID }));
    const page = pageFrom(rows, 2, 3, (row) => ({ key: row.name, id: row.id }));
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual({ key: "c2", id: ID });
    expect(pageFrom(rows, 3, 3, () => ({ key: "", id: ID })).nextCursor).toBe(
      null,
    );
  });
});
