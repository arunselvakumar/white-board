import { describe, expect, it } from "vitest";

import { Demo, demoFee, timesOverlap } from "./demo";

const now = new Date("2026-11-02T04:30:00.000Z");
// 10:00 on 2 November in the demo's timezone.
const localNow = { date: "2026-11-02", minutes: 10 * 60 };
const booking = {
  workspaceId: "org_1",
  enquiryId: "enquiry-1",
  fee: demoFee("free", null),
  userId: "user_owner",
  now,
  localNow,
};

function batchDemo(
  slot = { date: "2026-11-03", startTime: "09:00", endTime: "11:00" },
  fee = demoFee("free", null),
): Demo {
  return Demo.bookBatch({
    ...booking,
    id: "demo-batch",
    fee,
    batchId: "batch-1",
    timezone: "Asia/Kolkata",
    slot,
  });
}

function oneToOne(
  input: Partial<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    teacherDemos: Demo[];
    holidays: {
      id: string;
      startDate: string;
      endDate: string;
      reason: null;
    }[];
  }> = {},
): Demo {
  return Demo.bookOneToOne({
    ...booking,
    id: input.id ?? "demo-1",
    teacherId: "teacher-1",
    timezone: "Asia/Kolkata",
    date: input.date ?? "2026-11-03",
    startTime: input.startTime ?? "16:00",
    endTime: input.endTime ?? "17:00",
    holidays: input.holidays ?? [],
    teacherDemos: input.teacherDemos ?? [],
  });
}

function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("demoFee", () => {
  it("allows ₹1 to ₹1,00,000 for a paid demo and nothing for a free one", () => {
    expect(demoFee("paid", 100)).toEqual({ kind: "paid", amountPaise: 100 });
    expect(demoFee("paid", 10_000_000).amountPaise).toBe(10_000_000);
    expect(demoFee("free", undefined)).toEqual({
      kind: "free",
      amountPaise: null,
    });
    expect(code(() => demoFee("paid", 99))).toBe("DEMO_FEE_INVALID");
    expect(code(() => demoFee("paid", 10_000_001))).toBe("DEMO_FEE_INVALID");
    expect(code(() => demoFee("paid", null))).toBe("DEMO_FEE_INVALID");
    expect(code(() => demoFee("paid", 150.5))).toBe("DEMO_FEE_INVALID");
    expect(code(() => demoFee("free", 200))).toBe("DEMO_FEE_INVALID");
  });
});

describe("timesOverlap", () => {
  it("treats touching ranges as free", () => {
    const a = { startTime: "16:00", endTime: "17:00" };
    expect(timesOverlap(a, { startTime: "16:30", endTime: "17:30" })).toBe(
      true,
    );
    expect(timesOverlap(a, { startTime: "15:00", endTime: "18:00" })).toBe(
      true,
    );
    expect(timesOverlap(a, { startTime: "17:00", endTime: "18:00" })).toBe(
      false,
    );
    expect(timesOverlap(a, { startTime: "15:00", endTime: "16:00" })).toBe(
      false,
    );
  });
});

describe("Demo", () => {
  it("books a Batch demo at the Class's slot", () => {
    expect(batchDemo().toProps()).toMatchObject({
      kind: "batch",
      batchId: "batch-1",
      teacherId: null,
      date: "2026-11-03",
      endTime: "11:00",
      attendance: "unmarked",
    });
  });

  it("refuses a past date, or today after the start time", () => {
    expect(
      code(() =>
        batchDemo({ date: "2026-11-01", startTime: "18:00", endTime: "19:00" }),
      ),
    ).toBe("DEMO_IN_PAST");
    expect(
      code(() =>
        batchDemo({ date: "2026-11-02", startTime: "10:00", endTime: "11:00" }),
      ),
    ).toBe("DEMO_IN_PAST");
    expect(
      batchDemo({ date: "2026-11-02", startTime: "10:01", endTime: "11:00" })
        .cancelled,
    ).toBe(false);
    expect(
      code(() => oneToOne({ date: "2026-11-02", startTime: "09:00" })),
    ).toBe("DEMO_IN_PAST");
  });

  it("needs a one-to-one end time after its start time", () => {
    expect(code(() => oneToOne({ startTime: "17:00", endTime: "17:00" }))).toBe(
      "DEMO_TIME_INVALID",
    );
    expect(code(() => oneToOne({ startTime: "17:00", endTime: "16:00" }))).toBe(
      "DEMO_TIME_INVALID",
    );
  });

  it("refuses a one-to-one demo on a Holiday", () => {
    expect(
      code(() =>
        oneToOne({
          holidays: [
            {
              id: "h-1",
              startDate: "2026-11-03",
              endDate: "2026-11-04",
              reason: null,
            },
          ],
        }),
      ),
    ).toBe("DEMO_ON_HOLIDAY");
  });

  it("refuses an overlapping one-to-one demo with the same Teacher", () => {
    const existing = oneToOne({ id: "demo-0" });
    expect(
      code(() =>
        oneToOne({
          startTime: "16:30",
          endTime: "17:30",
          teacherDemos: [existing],
        }),
      ),
    ).toBe("DEMO_TEACHER_CLASH");
    expect(
      oneToOne({
        startTime: "17:00",
        endTime: "18:00",
        teacherDemos: [existing],
      }).toProps().startTime,
    ).toBe("17:00");
    existing.cancel({ userId: "u", now });
    expect(
      oneToOne({
        startTime: "16:30",
        endTime: "17:30",
        teacherDemos: [existing],
      }).cancelled,
    ).toBe(false);
  });

  it("marks attendance from the start time, and allows corrections", () => {
    const demo = batchDemo({
      date: "2026-11-02",
      startTime: "11:00",
      endTime: "12:00",
    });
    expect(
      code(() => {
        demo.markAttendance(true, {
          userId: "u",
          now,
          localNow: { date: "2026-11-02", minutes: 10 * 60 + 59 },
        });
      }),
    ).toBe("DEMO_NOT_STARTED");
    const started = { date: "2026-11-02", minutes: 11 * 60 };
    demo.markAttendance(true, { userId: "u", now, localNow: started });
    expect(demo.attendance).toBe("attended");
    demo.markAttendance(false, { userId: "u", now, localNow: started });
    expect(demo.attendance).toBe("missed");
    expect(demo.toStageFact()).toEqual({
      attendance: "missed",
      cancelled: false,
    });
  });

  it("can't mark a cancelled demo or cancel a marked one", () => {
    const later = { date: "2026-11-04", minutes: 0 };
    const cancelled = batchDemo();
    cancelled.cancel({ userId: "u", now });
    expect(cancelled.pending).toBe(false);
    expect(
      code(() => {
        cancelled.markAttendance(true, { userId: "u", now, localNow: later });
      }),
    ).toBe("DEMO_CANCELLED");
    expect(
      code(() => {
        cancelled.cancel({ userId: "u", now });
      }),
    ).toBe("DEMO_ALREADY_CANCELLED");

    const marked = batchDemo();
    marked.markAttendance(false, { userId: "u", now, localNow: later });
    expect(
      code(() => {
        marked.cancel({ userId: "u", now });
      }),
    ).toBe("DEMO_ATTENDANCE_MARKED");
  });

  it("marks a paid demo's fee once; never on a free or cancelled demo", () => {
    const paid = batchDemo(undefined, demoFee("paid", 20_000));
    paid.markFeePaid({ userId: "u", now });
    expect(paid.toProps().feePaidAt).toEqual(now);
    expect(
      code(() => {
        paid.markFeePaid({ userId: "u", now });
      }),
    ).toBe("DEMO_FEE_ALREADY_PAID");
    expect(
      code(() => {
        batchDemo().markFeePaid({ userId: "u", now });
      }),
    ).toBe("DEMO_FREE");
    const cancelled = batchDemo(undefined, demoFee("paid", 20_000));
    cancelled.cancel({ userId: "u", now });
    expect(
      code(() => {
        cancelled.markFeePaid({ userId: "u", now });
      }),
    ).toBe("DEMO_CANCELLED");
  });
});
