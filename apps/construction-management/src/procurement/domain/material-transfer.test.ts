import { describe, expect, it } from "vitest";

import {
  assertDeliverable,
  assertTransferPending,
  assertTransferRoute,
  transferLines,
  transferStatus,
  transferType,
} from "./material-transfer";

const A = { kind: "project", id: "0199c4a0-0000-7000-8000-000000000001" } as const;
const B = { kind: "store", id: "0199c4a0-0000-7000-8000-000000000002" } as const;
const M1 = "0199c4a0-0000-7000-8000-00000000a001";
const M2 = "0199c4a0-0000-7000-8000-00000000a002";

describe("Material Transfer (CM-507, ADR CM-0015 §4)", () => {
  it("derives its status from approval and delivery", () => {
    expect(transferStatus({ approvalStatus: "pending", deliveredOn: null })).toBe("pending");
    expect(transferStatus({ approvalStatus: "rejected", deliveredOn: null })).toBe("rejected");
    expect(transferStatus({ approvalStatus: "approved", deliveredOn: null })).toBe("in_transit");
    expect(
      transferStatus({ approvalStatus: "approved", deliveredOn: "2026-10-02" }),
    ).toBe("delivered");
  });

  it("names its type and refuses a transfer to its own source", () => {
    expect(transferType(A, B)).toBe("project_to_store");
    expect(transferType(B, A)).toBe("store_to_project");
    expect(() => {
      assertTransferRoute(A, { ...A });
    }).toThrow(expect.objectContaining({ code: "TRANSFER_SAME_LOCATION" }));
  });

  it("takes each material once with a quantity above zero", () => {
    expect(
      transferLines([
        { materialId: M1, quantity: "2", remark: "  " },
        { materialId: M2, quantity: "0.5", remark: "Urgent" },
      ]),
    ).toEqual([
      { materialId: M1, quantity: "2.000", remark: null },
      { materialId: M2, quantity: "0.500", remark: "Urgent" },
    ]);
    expect(() => transferLines([])).toThrow(
      expect.objectContaining({ code: "TRANSFER_LINES_REQUIRED" }),
    );
    expect(() =>
      transferLines([
        { materialId: M1, quantity: "1" },
        { materialId: M1, quantity: "2" },
      ]),
    ).toThrow(expect.objectContaining({ code: "TRANSFER_MATERIAL_REPEATED" }));
    expect(() => transferLines([{ materialId: M1, quantity: "0" }])).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
  });

  it("edits only while pending", () => {
    expect(() => {
      assertTransferPending({ approvalStatus: "pending", deliveredOn: null });
    }).not.toThrow();
    expect(() => {
      assertTransferPending({ approvalStatus: "approved", deliveredOn: null });
    }).toThrow(expect.objectContaining({ code: "MATERIAL_TRANSFER_NOT_PENDING" }));
  });

  it("is delivered only in transit, on or after the transfer date, not after today", () => {
    const inTransit = { approvalStatus: "approved", deliveredOn: null } as const;
    expect(() => {
      assertDeliverable(inTransit, "2026-10-05", "2026-10-05", "2026-10-10");
    }).not.toThrow();
    expect(() => {
      assertDeliverable(inTransit, "2026-10-05", "2026-10-04", "2026-10-10");
    }).toThrow(expect.objectContaining({ code: "DELIVERY_DATE_BEFORE_TRANSFER" }));
    expect(() => {
      assertDeliverable(inTransit, "2026-10-05", "2026-10-11", "2026-10-10");
    }).toThrow(expect.objectContaining({ code: "DELIVERY_DATE_IN_FUTURE" }));
    expect(() => {
      assertDeliverable(
        { approvalStatus: "pending", deliveredOn: null },
        "2026-10-05",
        "2026-10-06",
        "2026-10-10",
      );
    }).toThrow(expect.objectContaining({ code: "MATERIAL_TRANSFER_NOT_IN_TRANSIT" }));
    expect(() => {
      assertDeliverable(
        { approvalStatus: "approved", deliveredOn: "2026-10-06" },
        "2026-10-05",
        "2026-10-06",
        "2026-10-10",
      );
    }).toThrow(expect.objectContaining({ code: "MATERIAL_TRANSFER_NOT_IN_TRANSIT" }));
  });
});
