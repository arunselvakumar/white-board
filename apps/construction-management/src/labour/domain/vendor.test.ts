import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { buildRateCard, Vendor, type VendorShiftInput } from "./vendor";

const NOW = new Date("2026-10-08T06:00:00Z");
const MASON = "0199a1b2-0000-7000-8000-00000000c001";
const HELPER = "0199a1b2-0000-7000-8000-00000000c002";

function ids() {
  let next = 0;
  return () => `shift-${String((next += 1))}`;
}

function shift(
  name: string,
  rates: VendorShiftInput["rates"],
  extra: Partial<VendorShiftInput> = {},
): VendorShiftInput {
  return { name, rates, ...extra };
}

function rate(
  labourCategoryId: string,
  ratePerDay: number | null = 80_000,
  overtimePerHour: number | null = 10_000,
) {
  return { labourCategoryId, ratePerDay, overtimePerHour };
}

function create(shifts: VendorShiftInput[] = [], details = {}) {
  return Vendor.create({
    id: "vendor-1",
    workspaceId: "ws",
    details: {
      name: "  Ramesh   Gang ",
      joiningDate: "2026-04-01",
      ...details,
    },
    projectIds: ["p1", "p1", "p2"],
    shifts,
    newShiftId: ids(),
    by: "user",
    now: NOW,
  });
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("Vendor (CM-208)", () => {
  it("creates with cleaned details, unique projects and no rate card", () => {
    const vendor = create([], {
      contactNumber: "98765 43210",
      address: "  Pune ",
    });
    expect(vendor.name).toBe("Ramesh Gang");
    expect(vendor.contactNumber).toBe("+919876543210");
    expect(vendor.address).toBe("Pune");
    expect(vendor.projectIds).toEqual(["p1", "p2"]);
    expect(vendor.isActive).toBe(true);
    expect(vendor.hasRateCard).toBe(false);
  });

  it("validates name, joining date and contact number", () => {
    expect(codeOf(() => create([], { name: "  " }))).toBe(
      "VENDOR_NAME_REQUIRED",
    );
    expect(codeOf(() => create([], { name: "x".repeat(121) }))).toBe(
      "VENDOR_NAME_TOO_LONG",
    );
    expect(codeOf(() => create([], { joiningDate: "2026-02-30" }))).toBe(
      "VENDOR_JOINING_DATE_INVALID",
    );
    expect(codeOf(() => create([], { contactNumber: "12345" }))).toBe(
      "VENDOR_CONTACT_NUMBER_INVALID",
    );
  });

  it("builds a rate card in order with new shift ids", () => {
    const vendor = create([
      shift("Shift 1", [rate(MASON), rate(HELPER, 50_000, 6_000)], {
        startTime: "08:00",
        endTime: "17:00",
      }),
      shift("Night", [rate(MASON, 90_000, 12_000)]),
    ]);
    expect(vendor.hasRateCard).toBe(true);
    expect(
      vendor.shifts.map((item) => [item.id, item.name, item.sortOrder]),
    ).toEqual([
      ["shift-1", "Shift 1", 0],
      ["shift-2", "Night", 1],
    ]);
    expect(vendor.shifts[0]?.startTime).toBe("08:00");
    expect(vendor.categoryIds).toEqual(new Set([MASON, HELPER]));
  });

  it("refuses a category twice on one shift, but allows it on two shifts", () => {
    expect(
      codeOf(() => create([shift("Shift 1", [rate(MASON), rate(MASON)])])),
    ).toBe("DUPLICATE_SHIFT_CATEGORY");
    expect(
      create([shift("Shift 1", [rate(MASON)]), shift("Shift 2", [rate(MASON)])])
        .shifts,
    ).toHaveLength(2);
  });

  it("refuses duplicate shift names, empty shifts, bad times and negative rates", () => {
    expect(
      codeOf(() =>
        create([
          shift("Shift 1", [rate(MASON)]),
          shift("shift 1", [rate(MASON)]),
        ]),
      ),
    ).toBe("DUPLICATE_SHIFT_NAME");
    expect(codeOf(() => create([shift(" ", [rate(MASON)])]))).toBe(
      "SHIFT_NAME_REQUIRED",
    );
    expect(codeOf(() => create([shift("Shift 1", [])]))).toBe(
      "SHIFT_RATES_REQUIRED",
    );
    expect(
      codeOf(() =>
        create([shift("Shift 1", [rate(MASON)], { startTime: "25:00" })]),
      ),
    ).toBe("SHIFT_TIME_INVALID");
    expect(codeOf(() => create([shift("Shift 1", [rate(MASON, -1)])]))).toBe(
      "VENDOR_RATE_INVALID",
    );
    expect(codeOf(() => create([shift("Shift 1", [rate(MASON, 1.5)])]))).toBe(
      "VENDOR_RATE_INVALID",
    );
    expect(codeOf(() => create([shift("Shift 1", [rate(MASON, null)])]))).toBe(
      "VENDOR_RATE_REQUIRED",
    );
  });

  it("carries details on errors so a form can mark the field", () => {
    try {
      create([
        shift("Shift 1", [rate(MASON)]),
        shift("Shift 2", [rate(HELPER), rate(HELPER)]),
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).details).toEqual({
        shiftIndex: 1,
        rateIndex: 1,
      });
    }
  });

  it("updates in place: kept shifts keep their id, null rates keep the current amount", () => {
    const vendor = create([
      shift("Shift 1", [rate(MASON, 80_000, 10_000)]),
      shift("Shift 2", [rate(HELPER)]),
    ]);
    vendor.update({
      details: { name: "Ramesh Gang", joiningDate: "2026-04-01" },
      projectIds: ["p2"],
      shifts: [
        shift("Day", [rate(MASON, null, null), rate(HELPER, 40_000, 5_000)], {
          id: "shift-1",
        }),
        shift("Night", [rate(MASON, 90_000, 12_000)]),
      ],
      newShiftId: () => "shift-new",
      by: "user-2",
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(vendor.projectIds).toEqual(["p2"]);
    expect(vendor.shifts.map((item) => item.id)).toEqual([
      "shift-1",
      "shift-new",
    ]);
    expect(vendor.shifts[0]?.name).toBe("Day");
    expect(vendor.shifts[0]?.rates).toEqual([
      { labourCategoryId: MASON, ratePerDay: 80_000, overtimePerHour: 10_000 },
      { labourCategoryId: HELPER, ratePerDay: 40_000, overtimePerHour: 5_000 },
    ]);
    expect(vendor.updatedBy).toBe("user-2");
  });

  it("refuses a null rate for a category new to the shift, and an unknown shift id", () => {
    const vendor = create([shift("Shift 1", [rate(MASON)])]);
    const update = (shifts: VendorShiftInput[]) => () => {
      vendor.update({
        details: { name: "Ramesh Gang", joiningDate: "2026-04-01" },
        projectIds: [],
        shifts,
        newShiftId: () => "x",
        by: "user",
        now: NOW,
      });
    };
    expect(
      codeOf(
        update([shift("Shift 1", [rate(HELPER, null)], { id: "shift-1" })]),
      ),
    ).toBe("VENDOR_RATE_REQUIRED");
    expect(
      codeOf(update([shift("Shift 1", [rate(MASON)], { id: "nope" })])),
    ).toBe("VENDOR_SHIFT_NOT_FOUND");
  });

  it("prices attendance only from a live rate card of an active vendor", () => {
    const empty = create();
    expect(codeOf(() => empty.rateFor("shift-1", MASON))).toBe(
      "VENDOR_NO_RATE_CARD",
    );
    const vendor = create([shift("Shift 1", [rate(MASON, 80_000, 10_000)])]);
    expect(vendor.rateFor("shift-1", MASON)).toEqual({
      labourCategoryId: MASON,
      ratePerDay: 80_000,
      overtimePerHour: 10_000,
      shiftName: "Shift 1",
    });
    expect(codeOf(() => vendor.rateFor("shift-1", HELPER))).toBe(
      "CATEGORY_NOT_ON_SHIFT",
    );
    expect(codeOf(() => vendor.rateFor("shift-9", MASON))).toBe(
      "VENDOR_SHIFT_NOT_FOUND",
    );
    vendor.setActive(false, "user", NOW);
    expect(codeOf(() => vendor.rateFor("shift-1", MASON))).toBe(
      "VENDOR_INACTIVE",
    );
  });

  it("is gone once deleted", () => {
    const vendor = create();
    vendor.delete("user", NOW);
    expect(vendor.deletedAt).toEqual(NOW);
    expect(
      codeOf(() => {
        vendor.setActive(true, "user", NOW);
      }),
    ).toBe("VENDOR_NOT_FOUND");
  });

  it("buildRateCard refuses the same shift id twice", () => {
    const current = buildRateCard([shift("A", [rate(MASON)])], [], () => "a");
    expect(() =>
      buildRateCard(
        [
          shift("A", [rate(MASON)], { id: "a" }),
          shift("B", [rate(MASON)], { id: "a" }),
        ],
        current,
        () => "b",
      ),
    ).toThrow(DomainError);
  });
});
