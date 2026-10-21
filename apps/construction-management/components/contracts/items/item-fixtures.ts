import type { Flag } from "@/src/shared-kernel/access";
import type {
  Item,
  ItemFormOptions,
  ItemMaterialOption,
  ItemPage,
  ItemSummary,
} from "@/src/queries/contracts-items";

/** Item Library fixtures for stories (CM-1102). */

export const UOM_CUM = "0199f0a0-0000-7000-8000-000000000001";
export const UOM_SQM = "0199f0a0-0000-7000-8000-000000000002";
export const UOM_BAG = "0199f0a0-0000-7000-8000-000000000003";
export const UOM_HOUR = "0199f0a0-0000-7000-8000-000000000004";
export const UOM_DAY = "0199f0a0-0000-7000-8000-000000000005";
export const CEMENT = "0199f0a0-0000-7000-8000-0000000000a1";
export const SAND = "0199f0a0-0000-7000-8000-0000000000a2";
export const MASON = "0199f0a0-0000-7000-8000-0000000000b1";
export const HELPER = "0199f0a0-0000-7000-8000-0000000000b2";
export const MIXER = "0199f0a0-0000-7000-8000-0000000000c1";

export const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "export",
  "import",
];

/** PCC 1:4:8 with a full rate analysis; the adopted rate is above it. */
export const PCC: Item = {
  id: "0199f0a0-0000-7000-8000-000000000101",
  code: "5.1.1",
  shortDescription: "PCC 1:4:8 in foundations",
  description:
    "Providing and laying in position cement concrete of specified grade excluding the cost of centering and shuttering: 1:4:8.",
  uomId: UOM_CUM,
  uomName: "cum",
  sacHsn: "995411",
  schedule: "CPWD DSR 2023",
  adoptedRate: 650_00,
  overheadPercent: "15.00",
  // (18,698 + 9,500 + 25,000 + 1,000) × 1.15 = 62,327.7 → 62,328.
  analysedRate: 62_328,
  lineCount: 4,
  createdAt: "2026-10-21T09:00:00.000Z",
  updatedAt: "2026-10-21T09:00:00.000Z",
  lines: [
    {
      id: "0199f0a0-0000-7000-8000-000000000201",
      position: 0,
      kind: "material",
      materialId: CEMENT,
      materialName: "Cement OPC 53",
      labourCategoryId: null,
      labourCategoryName: null,
      equipmentId: null,
      equipmentName: null,
      description: null,
      coefficient: "0.4500",
      resourceUomId: UOM_BAG,
      resourceUomName: "Bag",
      rate: 415_50,
      amount: 186_98,
    },
    {
      id: "0199f0a0-0000-7000-8000-000000000202",
      position: 1,
      kind: "labour",
      materialId: null,
      materialName: null,
      labourCategoryId: MASON,
      labourCategoryName: "Mason",
      equipmentId: null,
      equipmentName: null,
      description: null,
      coefficient: "0.1000",
      resourceUomId: UOM_DAY,
      resourceUomName: "Day",
      rate: 950_00,
      amount: 95_00,
    },
    {
      id: "0199f0a0-0000-7000-8000-000000000203",
      position: 2,
      kind: "equipment",
      materialId: null,
      materialName: null,
      labourCategoryId: null,
      labourCategoryName: null,
      equipmentId: MIXER,
      equipmentName: "Concrete mixer (TN-07-1234)",
      description: null,
      coefficient: "0.5000",
      resourceUomId: UOM_HOUR,
      resourceUomName: "Hour",
      rate: 500_00,
      amount: 250_00,
    },
    {
      id: "0199f0a0-0000-7000-8000-000000000204",
      position: 3,
      kind: "lump_sum",
      materialId: null,
      materialName: null,
      labourCategoryId: null,
      labourCategoryName: null,
      equipmentId: null,
      equipmentName: null,
      description: "Water",
      coefficient: "1.0000",
      resourceUomId: null,
      resourceUomName: null,
      rate: 10_00,
      amount: 10_00,
    },
  ],
};

/** An Item without a rate analysis. */
export const PLASTER: Item = {
  id: "0199f0a0-0000-7000-8000-000000000102",
  code: "13.4.1",
  shortDescription: "12 mm cement plaster 1:6",
  description: null,
  uomId: UOM_SQM,
  uomName: "sqm",
  sacHsn: null,
  schedule: "TN PWD SoR 2025-26",
  adoptedRate: 285_00,
  overheadPercent: null,
  analysedRate: null,
  lineCount: 0,
  createdAt: "2026-10-21T09:05:00.000Z",
  updatedAt: "2026-10-21T09:05:00.000Z",
  lines: [],
};

export function summaryOf(item: Item): ItemSummary {
  const { lines: _lines, ...summary } = item;
  return summary;
}

export function itemPage(
  items: readonly Item[],
  flags: Flag[] = ALL_FLAGS,
): ItemPage {
  return {
    items: items.map(summaryOf),
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    viewerFlags: flags,
  };
}

export const FORM_OPTIONS: ItemFormOptions = {
  uoms: [
    { id: UOM_BAG, name: "Bag" },
    { id: UOM_CUM, name: "cum" },
    { id: UOM_DAY, name: "Day" },
    { id: UOM_HOUR, name: "Hour" },
    { id: UOM_SQM, name: "sqm" },
  ],
  labourCategories: [
    { id: HELPER, name: "Helper", skill: "unskilled" },
    { id: MASON, name: "Mason", skill: "skilled" },
  ],
  equipment: [
    { id: MIXER, name: "Concrete mixer", equipmentNumber: "TN-07-1234" },
  ],
};

export const MATERIAL_OPTIONS: ItemMaterialOption[] = [
  {
    id: CEMENT,
    name: "Cement OPC 53",
    specification: "50 kg bag",
    uomId: UOM_BAG,
    uomName: "Bag",
    unitRate: 415_50,
  },
  {
    id: SAND,
    name: "River sand",
    specification: null,
    uomId: UOM_CUM,
    uomName: "cum",
    unitRate: null,
  },
];
