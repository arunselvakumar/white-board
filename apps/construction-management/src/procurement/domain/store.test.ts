import { describe, expect, it } from "vitest";

import { assertStoreDeletable, storeDraft } from "./store";

const PROJECT = "0199c4a0-0000-7000-8000-0000000000e1";

describe("Store (CM-508)", () => {
  it("cleans the fields and needs at least one Project", () => {
    expect(
      storeDraft({
        name: "  Ambattur   Store ",
        address: " ",
        stateCode: "33",
        projectIds: [PROJECT, PROJECT.toUpperCase()],
      }),
    ).toEqual({
      name: "Ambattur Store",
      address: null,
      stateCode: "33",
      projectIds: [PROJECT],
      keeperIds: [],
      supplierIds: [],
    });
    expect(() => storeDraft({ name: "A", projectIds: [] })).toThrow(
      "Choose at least one Project.",
    );
    expect(() =>
      storeDraft({ name: "A", stateCode: "99", projectIds: [PROJECT] }),
    ).toThrow("GST state");
  });

  it("refuses delete while anything still ties the store down", () => {
    const clear = {
      materialsInStock: 0,
      openMaterialRequests: 0,
      undeliveredDeliveryNotes: 0,
      undeliveredTransfers: 0,
    };
    expect(() => assertStoreDeletable(clear)).not.toThrow();
    expect(() =>
      assertStoreDeletable({ ...clear, materialsInStock: 2, undeliveredTransfers: 1 }),
    ).toThrow("it holds stock, it has Material Transfers not yet delivered");
  });
});
