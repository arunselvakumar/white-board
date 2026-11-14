import { describe, expect, it } from "vitest";

import {
  activityPartId,
  compareActivityKeys,
  decodeActivityCursor,
  encodeActivityCursor,
  isAfterCursor,
  mergeActivity,
  pageAfter,
  type ActivityKey,
} from "./activity-key";
import { DomainError } from "./domain-error";
import { isUuid } from "./ids";

const ID = (n: number) =>
  `0199c4a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

function key(
  date: string,
  time: number,
  rank = 0,
  id = ID(1),
): { key: ActivityKey } {
  return { key: { date, recordedAt: new Date(time), rank, id } };
}

describe("compareActivityKeys", () => {
  it("orders by effective date, then recorded time, then rank, then id, newest first", () => {
    const entries = [
      key("2026-11-01", 5),
      key("2026-11-02", 1),
      key("2026-11-01", 5, 2),
      key("2026-11-01", 9),
      key("2026-11-01", 5, 2, ID(2)),
    ];
    const sorted = [...entries].sort((a, b) =>
      compareActivityKeys(a.key, b.key),
    );
    expect(sorted).toEqual([
      entries[1],
      entries[3],
      entries[4],
      entries[2],
      entries[0],
    ]);
    const [one] = entries;
    if (one != null) expect(compareActivityKeys(one.key, one.key)).toBe(0);
  });

  it("keeps what comes after a cursor, and everything without one", () => {
    const cursor = key("2026-11-01", 5, 2).key;
    expect(isAfterCursor(key("2026-11-01", 5, 1).key, cursor)).toBe(true);
    expect(isAfterCursor(key("2026-11-01", 6, 0).key, cursor)).toBe(false);
    expect(isAfterCursor(cursor, cursor)).toBe(false);
    expect(isAfterCursor(cursor, null)).toBe(true);
  });
});

describe("activity cursor", () => {
  it("round-trips and refuses anything else", () => {
    const original = key("2026-11-01", 1_762_000_000_123, 3, ID(7)).key;
    expect(decodeActivityCursor(encodeActivityCursor(original))).toEqual(
      original,
    );
    for (const raw of [
      "nope",
      Buffer.from("[1,2,3]").toString("base64url"),
      Buffer.from('["2026-02-30",1,1,"x"]').toString("base64url"),
    ])
      expect(() => decodeActivityCursor(raw)).toThrow(DomainError);
  });

  it("takes a part id, which is a uuid, the same on every read, and differs by part", () => {
    const first = activityPartId(ID(1), ID(2));
    expect(isUuid(first)).toBe(true);
    expect(activityPartId(ID(1), ID(2))).toBe(first);
    expect(activityPartId(ID(1), ID(3))).not.toBe(first);
    const cursor = key("2026-11-01", 5, 2, first).key;
    expect(decodeActivityCursor(encodeActivityCursor(cursor))).toEqual(cursor);
  });
});

describe("mergeActivity", () => {
  it("merges sources into one page and continues after its last entry", () => {
    const a = [key("2026-11-03", 1), key("2026-11-01", 1)];
    const b = [key("2026-11-02", 1, 0, ID(2)), key("2026-10-30", 1, 0, ID(3))];
    const page = mergeActivity([a, b], 3);
    expect(page.items).toEqual([a[0], b[0], a[1]]);
    expect(page.next).toEqual(a[1]?.key);
    expect(mergeActivity([a, b], 4).next).toBeNull();
    expect(pageAfter([...a, ...b], page.next, 5)).toEqual([b[1]]);
  });
});
