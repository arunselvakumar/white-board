import { describe, expect, it } from "vitest";

import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { IMAGE_LIMITS, type ObjectStorage } from "@/src/shared-kernel/files";

import { CHECK_IN_PHOTO_MAX_BYTES } from "../domain/check-in";
import {
  CheckInHandlers,
  readPhoto,
  type CheckInStore,
  type CheckInTransaction,
} from "./check-in-handlers";
import { fakeDirectory } from "./labour-attendance-fakes";
import type { AttendanceLabourer } from "./labour-attendance-handlers";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(size = 64): string {
  const bytes = new Uint8Array(size);
  bytes.set(PNG);
  return Buffer.from(bytes).toString("base64");
}

describe("readPhoto", () => {
  it("is capped at the check-in photo limit", () => {
    expect(IMAGE_LIMITS.check_in_photo).toBe(CHECK_IN_PHOTO_MAX_BYTES);
  });

  it("reads base64 or a data URL and sniffs the type", () => {
    expect(readPhoto(png()).contentType).toBe("image/png");
    expect(readPhoto(`data:image/jpeg;base64,${png()}`).extension).toBe("png");
  });

  it("refuses what is not an image, or too large", () => {
    for (const raw of [
      "",
      "abc",
      "%%%%",
      Buffer.from("GIF89a").toString("base64"),
    ])
      expect(() => readPhoto(raw)).toThrow(
        expect.objectContaining({ code: "PHOTO_INVALID" }) as Error,
      );
    expect(() => readPhoto(png(CHECK_IN_PHOTO_MAX_BYTES + 1))).toThrow(
      expect.objectContaining({ code: "PHOTO_TOO_LARGE" }) as Error,
    );
  });
});

const LABOURER: AttendanceLabourer = {
  id: "l1",
  name: "Dhuresh Nawin",
  labourCode: null,
  isActive: true,
  labourCategoryId: null,
  weeklyHolidays: [],
  card: {
    wageType: "daily",
    wagePerDay: 70_000,
    wagePerMonth: null,
    overtimeWagePerHour: 10_000,
    workingHours: "8",
  },
};

/**
 * Just enough of the store for a Labour's first Check In, with a
 * transaction whose day save meets the sheet's day saved at that instant.
 */
function setup() {
  const deleted: string[] = [];
  const put: string[] = [];
  const storage = {
    put: (key: string) => {
      put.push(key);
      return Promise.resolve();
    },
    delete: (key: string) => {
      deleted.push(key);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage;
  const tx: Partial<CheckInTransaction> = {
    lastLive: () => Promise.resolve(null),
    onProject: () => Promise.resolve(true),
    insert: () => Promise.resolve(),
    liveEntriesOn: () =>
      Promise.resolve([
        {
          id: "e1",
          action: "check_in",
          occurredAt: new Date("2026-11-14T04:30:00Z"),
          attendanceDate: "2026-11-14",
        },
      ]),
    labourer: () => Promise.resolve(LABOURER),
    day: () => Promise.resolve(null),
    saveDay: () =>
      Promise.reject(
        conflict("ATTENDANCE_CHANGED", "Someone changed this Labour's day."),
      ),
  };
  const store: Partial<CheckInStore> = {
    timeZone: () => Promise.resolve("Asia/Kolkata"),
    standing: () => Promise.resolve({ last: null, entriesToday: 0 }),
    labour: () =>
      Promise.resolve({
        person: {
          kind: "labour",
          id: "l1",
          name: LABOURER.name,
          labourCategoryId: null,
          code: null,
          phone: null,
          photoKey: null,
        },
        labourer: LABOURER,
      }),
    labourOnProject: () => Promise.resolve(true),
    inPerson: (_workspaceId, _person, work) => work(tx as CheckInTransaction),
  };
  const handlers = new CheckInHandlers(
    store as CheckInStore,
    fakeDirectory({ p1: "Tower A" }),
    fakeDirectory({}),
    {
      onProject: () => Promise.resolve([]),
      find: () => Promise.resolve(new Map()),
      names: () => Promise.resolve(new Map()),
      idsNamed: () => Promise.resolve([]),
    },
    { ofProject: () => Promise.resolve(null) },
    storage,
    () => new Date("2026-11-14T04:30:00Z"),
  );
  return { handlers, put, deleted };
}

describe("CheckInHandlers.record", () => {
  it("answers 409 when the sheet marked the day at the same instant, and discards the photo", async () => {
    const { handlers, put, deleted } = setup();
    let caught: unknown;
    try {
      await handlers.record({
        workspaceId: "w1",
        userId: "u1",
        projectId: "p1",
        kind: "labour",
        personId: "l1",
        action: "check_in",
        photo: png(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toMatchObject({
      code: "ATTENDANCE_CHANGED",
      kind: "conflict",
      message:
        "This Labour's day was marked on the attendance sheet just now. Try again.",
    });
    expect(put).toHaveLength(1);
    expect(deleted).toEqual(put);
  });
});
