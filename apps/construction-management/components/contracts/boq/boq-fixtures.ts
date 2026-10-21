import type {
  Boq,
  BoqDeviations,
  BoqFormOptions,
  BoqItem,
  BoqLibraryItem,
  BoqSettings,
  Variation,
  VariationPage,
} from "@/src/queries/contracts-boq";
import type { Flag } from "@/src/shared-kernel/access";

/** BOQ fixtures for stories (CM-1103). */

export const PROJECT = "0199f0b0-0000-7000-8000-000000000001";
export const UOM_CUM = "0199f0b0-0000-7000-8000-000000000011";
export const UOM_SQM = "0199f0b0-0000-7000-8000-000000000012";
export const WING_A = "0199f0b0-0000-7000-8000-000000000021";
export const EARTHWORK = "0199f0b0-0000-7000-8000-000000000031";
export const CONCRETE = "0199f0b0-0000-7000-8000-000000000032";
export const LIBRARY_PCC = "0199f0b0-0000-7000-8000-000000000041";

export const ALL_FLAGS: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "report",
  "financial",
  "export",
  "import",
];

const AT = "2026-10-21T09:00:00.000Z";

function item(
  fields: Partial<BoqItem> & Pick<BoqItem, "id" | "itemNo">,
): BoqItem {
  return {
    projectId: PROJECT,
    sectionId: EARTHWORK,
    libraryItemId: null,
    libraryCode: null,
    description: "",
    uomId: UOM_CUM,
    uomName: "cum",
    sacHsn: "995411",
    originalQuantity: "100.0000",
    quantity: "100.0000",
    originalRate: 100_00,
    rate: 100_00,
    amount: 10_000_00,
    wingId: null,
    locationId: null,
    placeName: null,
    position: 0,
    variationId: null,
    measured: false,
    measuredQuantity: null,
    pendingVariation: null,
    createdAt: AT,
    updatedAt: AT,
    ...fields,
  };
}

export const EXCAVATION = item({
  id: "0199f0b0-0000-7000-8000-000000000101",
  itemNo: "1.1",
  description:
    "Earthwork in excavation by mechanical means over areas, including disposal of excavated earth up to 50 m.",
  originalQuantity: "450.0000",
  quantity: "520.0000",
  originalRate: 285_50,
  rate: 285_50,
  // 520 × ₹285.50.
  amount: 1_48_460_00,
  wingId: WING_A,
  placeName: "A Wing",
  measured: true,
  measuredQuantity: "540.0000",
});

export const FILLING = item({
  id: "0199f0b0-0000-7000-8000-000000000102",
  itemNo: "1.2",
  description: "Filling available excavated earth in trenches and plinth.",
  originalQuantity: "180.0000",
  quantity: "180.0000",
  originalRate: 165_00,
  rate: 165_00,
  amount: 29_700_00,
  position: 1,
  measured: true,
  measuredQuantity: "240.0000",
  pendingVariation: {
    id: "0199f0b0-0000-7000-8000-000000000202",
    number: "VAR/26-27/00002",
    kind: "quantity",
  },
});

export const PCC = item({
  id: "0199f0b0-0000-7000-8000-000000000103",
  sectionId: CONCRETE,
  itemNo: "2.1",
  libraryItemId: LIBRARY_PCC,
  libraryCode: "5.1.1",
  description: "PCC 1:4:8 in foundations",
  originalQuantity: "32.5000",
  quantity: "32.5000",
  originalRate: 6_123_45,
  rate: 6_123_45,
  // 32.5 × ₹6,123.45 = ₹1,99,012.125 → ₹1,99,012.13.
  amount: 1_99_012_13,
});

export function boqOf(
  options: { flags?: Flag[]; empty?: boolean; financial?: boolean } = {},
): Boq {
  const financial = options.financial ?? true;
  const flags = (options.flags ?? ALL_FLAGS).filter(
    (flag) => financial || flag !== "financial",
  );
  const hide = (value: number | null) => (financial ? value : null);
  const strip = (row: BoqItem): BoqItem => ({
    ...row,
    originalRate: hide(row.originalRate),
    rate: hide(row.rate),
    amount: hide(row.amount),
  });
  const sections =
    options.empty === true
      ? []
      : [
          {
            id: EARTHWORK,
            projectId: PROJECT,
            title: "Earthwork",
            position: 0,
            subtotal: hide(1_78_160_00),
            items: [EXCAVATION, FILLING].map(strip),
            updatedAt: AT,
          },
          {
            id: CONCRETE,
            projectId: PROJECT,
            title: "Concrete work",
            position: 1,
            subtotal: hide(1_99_012_13),
            items: [PCC].map(strip),
            updatedAt: AT,
          },
        ];
  const total = options.empty === true ? 0 : 3_77_172_13;
  return {
    projectId: PROJECT,
    role: "contract",
    structure: "wings",
    financial,
    viewerFlags: flags,
    deviationLimitPercent: "25.00",
    itemCount: sections.reduce((sum, section) => sum + section.items.length, 0),
    total: hide(total),
    orderValue: hide(4_00_000_00),
    difference: hide(total - 4_00_000_00),
    sections,
  };
}

export const FORM_OPTIONS: BoqFormOptions = {
  structure: "wings",
  uoms: [
    { id: UOM_CUM, name: "cum" },
    { id: UOM_SQM, name: "sqm" },
  ],
  wings: [{ id: WING_A, name: "A Wing", phaseName: "Phase 1" }],
  locations: [],
  sections: [
    { id: EARTHWORK, title: "Earthwork" },
    { id: CONCRETE, title: "Concrete work" },
  ],
};

export const LIBRARY: BoqLibraryItem[] = [
  {
    id: LIBRARY_PCC,
    code: "5.1.1",
    shortDescription: "PCC 1:4:8",
    description: "PCC 1:4:8 in foundations, excluding shuttering.",
    uomId: UOM_CUM,
    uomName: "cum",
    sacHsn: "995411",
    adoptedRate: 6_123_45,
  },
  {
    id: "0199f0b0-0000-7000-8000-000000000042",
    code: "13.4.1",
    shortDescription: "12 mm cement plaster 1:6",
    description: null,
    uomId: UOM_SQM,
    uomName: "sqm",
    sacHsn: "995454",
    adoptedRate: 285_00,
  },
];

function variation(
  fields: Partial<Variation> & Pick<Variation, "id" | "number" | "kind">,
): Variation {
  return {
    projectId: PROJECT,
    status: "pending_approval",
    boqItemId: EXCAVATION.id,
    boqItemNo: "1.1",
    boqItemDescription: EXCAVATION.description,
    sectionId: null,
    sectionTitle: "Earthwork",
    itemNo: null,
    description: null,
    uomId: null,
    uomName: "cum",
    sacHsn: null,
    previousQuantity: null,
    newQuantity: null,
    previousRate: null,
    newRate: null,
    reason: "Deeper foundations as per the client's letter of 12 Oct.",
    rejectReason: null,
    decidedAt: null,
    decidedBy: null,
    decidedByName: null,
    createdBy: "user-1",
    createdByName: "Prabhu Saravanan",
    createdAt: AT,
    updatedAt: AT,
    ...fields,
  };
}

export const RATE_CHANGE = variation({
  id: "0199f0b0-0000-7000-8000-000000000201",
  number: "VAR/26-27/00003",
  kind: "rate",
  previousRate: 285_50,
  newRate: 310_00,
  reason: "Hard rock met below 1.5 m.",
});

export const QUANTITY_CHANGE = variation({
  id: "0199f0b0-0000-7000-8000-000000000202",
  number: "VAR/26-27/00002",
  kind: "quantity",
  boqItemId: FILLING.id,
  boqItemNo: "1.2",
  boqItemDescription: FILLING.description,
  previousQuantity: "180.0000",
  newQuantity: "240.0000",
});

export const APPROVED_EXTRA = variation({
  id: "0199f0b0-0000-7000-8000-000000000203",
  number: "VAR/26-27/00001",
  kind: "extra_item",
  status: "approved",
  boqItemId: "0199f0b0-0000-7000-8000-000000000104",
  boqItemNo: "1.9",
  boqItemDescription: "Sump excavation",
  sectionId: EARTHWORK,
  itemNo: "1.9",
  description: "Sump excavation",
  uomId: UOM_CUM,
  newQuantity: "40.0000",
  newRate: 1000_00,
  reason: "Client asked for a sump.",
  decidedAt: "2026-10-20T09:00:00.000Z",
  decidedBy: "owner",
  decidedByName: "Arun Selva Kumar",
});

export function variationPage(
  items: Variation[] = [RATE_CHANGE, QUANTITY_CHANGE, APPROVED_EXTRA],
): VariationPage {
  return {
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    financial: true,
  };
}

export const DEVIATIONS: BoqDeviations = {
  deviationLimitPercent: "25.00",
  items: [
    {
      boqItemId: FILLING.id,
      sectionTitle: "Earthwork",
      itemNo: "1.2",
      description: FILLING.description,
      uomName: "cum",
      quantity: "180.0000",
      measuredQuantity: "240.0000",
      percentOver: "33.33",
      rate: 165_00,
      pendingVariation: FILLING.pendingVariation,
    },
    {
      boqItemId: PCC.id,
      sectionTitle: "Concrete work",
      itemNo: "2.1",
      description: PCC.description,
      uomName: "cum",
      quantity: "32.5000",
      measuredQuantity: "45.0000",
      percentOver: "38.46",
      rate: 6_123_45,
      pendingVariation: null,
    },
  ],
};

export const SETTINGS: BoqSettings = {
  deviationLimitPercent: "25.00",
  updatedAt: null,
  canUpdate: true,
};
