import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertMeasurementAction,
  assertNotBilled,
  computedQuantity,
  jointMeasurement,
  measuredItems,
  measurementActions,
  measurementHeader,
  measurementRow,
  previewQuantity,
  rowsOver,
} from "./measurement";

/** Ten-thousandths from a decimal string. */
const q = (value: string) => {
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const scaled = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  return value.startsWith("-") ? -scaled : scaled;
};

function errorOf(run: () => unknown): {
  code: string;
  details: Record<string, unknown> | undefined;
} {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        details: error.details as Record<string, unknown> | undefined,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

describe("the quantity formula (CM-1105)", () => {
  it("multiplies nos by every filled dimension", () => {
    expect(
      computedQuantity({
        nos: q("2"),
        length: q("3.5"),
        breadth: q("1.2"),
        depth: q("0.45"),
      }),
    ).toBe(q("3.78"));
  });

  it("treats a blank dimension as not there and a blank nos as 1", () => {
    expect(
      computedQuantity({
        nos: null,
        length: q("12.5"),
        breadth: null,
        depth: q("0.15"),
      }),
    ).toBe(q("1.875"));
    // nos alone counts pieces.
    expect(
      computedQuantity({
        nos: q("6"),
        length: null,
        breadth: null,
        depth: null,
      }),
    ).toBe(q("6"));
    expect(
      computedQuantity({ nos: null, length: null, breadth: null, depth: null }),
    ).toBe(q("1"));
  });

  it("rounds once at the row, half up and away from zero for deductions", () => {
    // 0.3333 × 0.5 = 0.16665 → 0.1667
    const row = {
      nos: null,
      length: q("0.3333"),
      breadth: q("0.5"),
      depth: null,
    };
    expect(computedQuantity(row)).toBe(q("0.1667"));
    expect(computedQuantity({ ...row, nos: q("-1") })).toBe(q("-0.1667"));
    // Rounded once over the product, not per factor: 3 × 0.3333 × 0.3333 = 0.33326667.
    expect(
      computedQuantity({
        nos: q("3"),
        length: q("0.3333"),
        breadth: q("0.3333"),
        depth: null,
      }),
    ).toBe(q("0.3333"));
  });

  it("makes a deduction from a negative nos", () => {
    const row = measurementRow(
      {
        boqItemId: "A",
        nos: "-2",
        length: "1.2",
        depth: "2.1",
        description: "Door openings",
      },
      "client",
      0,
    );
    expect(row.quantity).toBe(q("-5.04"));
    expect(row.boqItemId).toBe("a");
    expect(row.breadth).toBeNull();
  });

  it("takes a direct quantity as typed and drops the numbers", () => {
    const row = measurementRow(
      { workOrderLineId: "L", direct: true, quantity: "-3.25", nos: "9" },
      "contractor",
      0,
    );
    expect(row).toMatchObject({
      direct: true,
      quantity: q("-3.25"),
      nos: null,
      workOrderLineId: "l",
      boqItemId: null,
    });
  });

  it("refuses dimensions not above 0, a nos of 0, five decimals and zero rows", () => {
    expect(
      errorOf(() =>
        measurementRow({ boqItemId: "a", length: "-2" }, "client", 3),
      ),
    ).toEqual({
      code: "MEASUREMENT_DIMENSION_INVALID",
      details: { row: 3, field: "rows.3.length" },
    });
    expect(
      errorOf(() => measurementRow({ boqItemId: "a", nos: "0" }, "client", 0))
        .code,
    ).toBe("MEASUREMENT_NOS_INVALID");
    expect(
      errorOf(() =>
        measurementRow({ boqItemId: "a", breadth: "1.23456" }, "client", 0),
      ).code,
    ).toBe("MEASUREMENT_DIMENSION_INVALID");
    expect(
      errorOf(() =>
        measurementRow(
          { boqItemId: "a", length: "0.0001", breadth: "0.0001" },
          "client",
          0,
        ),
      ).code,
    ).toBe("MEASUREMENT_QUANTITY_ZERO");
    expect(
      errorOf(() =>
        measurementRow({ boqItemId: "a", direct: true }, "client", 0),
      ).code,
    ).toBe("MEASUREMENT_QUANTITY_INVALID");
  });

  it("keeps each side to its own items", () => {
    expect(
      errorOf(() =>
        measurementRow({ boqItemId: "a", nos: "1" }, "contractor", 1),
      ),
    ).toMatchObject({
      code: "MEASUREMENT_ITEM_INVALID",
      details: { row: 1, field: "rows.1.workOrderLineId" },
    });
    expect(
      errorOf(() =>
        measurementRow({ workOrderLineId: "l", nos: "1" }, "client", 0),
      ).code,
    ).toBe("MEASUREMENT_ITEM_INVALID");
    expect(errorOf(() => measurementRow({ nos: "1" }, "client", 0)).code).toBe(
      "MEASUREMENT_ITEM_REQUIRED",
    );
  });

  it("previews while you type, and waits for readable numbers", () => {
    expect(
      previewQuantity({ direct: false, nos: "2", length: "3", breadth: "" }),
    ).toBe(q("6"));
    expect(previewQuantity({ direct: false, nos: "2", length: "3." })).toBe(
      q("6"),
    );
    expect(previewQuantity({ direct: false, nos: "2", length: "x" })).toBe(
      null,
    );
    expect(previewQuantity({ direct: false, nos: "0" })).toBe(null);
    expect(previewQuantity({ direct: true, quantity: "4.5" })).toBe(q("4.5"));
  });
});

describe("the sheet header and joint measurement", () => {
  it("refuses a measurement date in the future", () => {
    expect(
      measurementHeader(
        { measuredOn: "2026-10-22", title: "  Footings  F1 " },
        "2026-10-22",
      ),
    ).toEqual({
      measuredOn: "2026-10-22",
      title: "Footings F1",
      remarks: null,
    });
    expect(
      errorOf(() =>
        measurementHeader({ measuredOn: "2026-10-23" }, "2026-10-22"),
      ).code,
    ).toBe("MEASURED_ON_IN_FUTURE");
  });

  it("needs the party's name, role and a joint date not in the future", () => {
    const valid = {
      partyName: "R. Kumar",
      partyRole: "Client's engineer",
      jointOn: "2026-10-21",
    };
    expect(jointMeasurement(valid, "2026-10-20", "2026-10-22")).toEqual(valid);
    expect(
      errorOf(() =>
        jointMeasurement(
          { ...valid, partyName: " " },
          "2026-10-20",
          "2026-10-22",
        ),
      ).code,
    ).toBe("PARTY_NAME_REQUIRED");
    expect(
      errorOf(() =>
        jointMeasurement(
          { ...valid, partyRole: "" },
          "2026-10-20",
          "2026-10-22",
        ),
      ).code,
    ).toBe("PARTY_ROLE_REQUIRED");
    expect(
      errorOf(() =>
        jointMeasurement(
          { ...valid, jointOn: "2026-10-23" },
          "2026-10-20",
          "2026-10-22",
        ),
      ).code,
    ).toBe("JOINT_ON_IN_FUTURE");
    expect(
      errorOf(() =>
        jointMeasurement(
          { ...valid, jointOn: "2026-10-19" },
          "2026-10-20",
          "2026-10-22",
        ),
      ).code,
    ).toBe("JOINT_ON_BEFORE_MEASURED_ON");
  });
});

describe("transitions", () => {
  it("edits and submits a draft, checks or returns a submitted sheet, reopens a checked one", () => {
    expect(() => {
      assertMeasurementAction("draft", "edit");
    }).not.toThrow();
    expect(() => {
      assertMeasurementAction("draft", "submit");
    }).not.toThrow();
    expect(() => {
      assertMeasurementAction("submitted", "check");
    }).not.toThrow();
    expect(() => {
      assertMeasurementAction("submitted", "return");
    }).not.toThrow();
    expect(() => {
      assertMeasurementAction("checked", "reopen");
    }).not.toThrow();
    expect(
      errorOf(() => {
        assertMeasurementAction("checked", "edit");
      }),
    ).toEqual({
      code: "MEASUREMENT_STATUS_INVALID",
      details: { status: "checked", action: "edit" },
    });
    expect(
      errorOf(() => {
        assertMeasurementAction("draft", "check");
      }).code,
    ).toBe("MEASUREMENT_STATUS_INVALID");
    expect(
      errorOf(() => {
        assertMeasurementAction("submitted", "reopen");
      }).code,
    ).toBe("MEASUREMENT_STATUS_INVALID");
  });

  it("makes a billed sheet read-only", () => {
    expect(
      errorOf(() => {
        assertNotBilled(2);
      }),
    ).toEqual({
      code: "MEASUREMENT_BILLED",
      details: { count: 2 },
    });
    expect(() => {
      assertNotBilled(0);
    }).not.toThrow();
    expect(measurementActions("checked", true)).toEqual({
      edit: false,
      submit: false,
      check: false,
      return: false,
      reopen: false,
      delete: false,
    });
    expect(measurementActions("checked", false).reopen).toBe(true);
  });
});

describe("cumulative quantities and deviation", () => {
  const planned = new Map([
    ["a", q("100")],
    ["b", q("10")],
  ]);
  const checked = new Map([["a", q("90")]]);

  it("adds this sheet to what other checked sheets measured", () => {
    const rows = [
      { itemId: "a", quantity: q("8") },
      { itemId: "b", quantity: q("4") },
      { itemId: "a", quantity: q("30") },
      { itemId: "a", quantity: q("-2") },
    ];
    const items = measuredItems(rows, planned, checked, 2500n);
    expect(items).toEqual([
      {
        itemId: "a",
        planned: q("100"),
        checked: q("90"),
        thisSheet: q("36"),
        total: q("126"),
        over: true,
        // 126 > 100 × 1.25
        overLimit: true,
        percentOver: 2600n,
      },
      {
        itemId: "b",
        planned: q("10"),
        checked: 0n,
        thisSheet: q("4"),
        total: q("4"),
        over: false,
        overLimit: false,
        percentOver: null,
      },
    ]);
    // The contractor side has no limit.
    expect(measuredItems(rows, planned, checked, null)[0]?.overLimit).toBe(
      false,
    );
  });

  it("marks the rows that push an item over, never a deduction", () => {
    const rows = [
      { itemId: "a", quantity: q("8") },
      { itemId: "a", quantity: q("5") },
      { itemId: "a", quantity: q("-20") },
      { itemId: "a", quantity: q("1") },
      { itemId: "b", quantity: q("10") },
    ];
    // 98, 103 (over), 83 (deduction), 84, b at its quantity.
    expect([...rowsOver(rows, planned, checked)]).toEqual([1]);
  });
});
