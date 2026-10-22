import type {
  WorkOrder,
  WorkOrderBoqItems,
  WorkOrderFormOptions,
  WorkOrderPage,
  WorkOrderSummary,
} from "@/src/queries/contracts-work-orders";

/* Work Order story data (CM-1104): a metro depot's earthwork and concrete. */

export const PROJECT = "0199c0de-1104-7000-8000-000000000001";
export const CONTRACTOR = "0199c0de-1104-7000-8000-0000000000c1";
export const OTHER_CONTRACTOR = "0199c0de-1104-7000-8000-0000000000c2";
export const DEPARTMENT = "0199c0de-1104-7000-8000-0000000000d1";
export const CUM = "0199c0de-1104-7000-8000-0000000000a1";
export const SQM = "0199c0de-1104-7000-8000-0000000000a2";
export const CEMENT = "0199c0de-1104-7000-8000-0000000000e1";
export const EXCAVATION = "0199c0de-1104-7000-8000-0000000000b1";
export const PCC = "0199c0de-1104-7000-8000-0000000000b2";
export const PLASTER = "0199c0de-1104-7000-8000-0000000000b3";
const LIBRARY_PCC = "0199c0de-1104-7000-8000-0000000000f1";
const SECTION = "0199c0de-1104-7000-8000-0000000000aa";

export const WO_DRAFT = "0199c0de-1104-7000-8000-000000000101";
export const WO_PENDING = "0199c0de-1104-7000-8000-000000000102";
export const WO_ISSUED = "0199c0de-1104-7000-8000-000000000103";
export const WO_CLOSED = "0199c0de-1104-7000-8000-000000000104";
export const WO_CANCELLED = "0199c0de-1104-7000-8000-000000000105";

const LINE_1 = "0199c0de-1104-7000-8000-000000000201";
const LINE_2 = "0199c0de-1104-7000-8000-000000000202";
const LINE_3 = "0199c0de-1104-7000-8000-000000000203";

export const FORM_OPTIONS: WorkOrderFormOptions = {
  contractors: [
    {
      id: CONTRACTOR,
      name: "Velan Constructions",
      gstin: "33AABCV1234F1Z5",
      tdsApplicable: true,
      defaultTdsNature: "contractor",
      departments: [{ id: DEPARTMENT, name: "Masonry" }],
    },
    {
      id: OTHER_CONTRACTOR,
      name: "Sri Murugan Labour Supply",
      gstin: null,
      tdsApplicable: false,
      defaultTdsNature: null,
      departments: [],
    },
  ],
  uoms: [
    { id: CUM, name: "cum" },
    { id: SQM, name: "sqm" },
  ],
  tdsNatures: [
    { key: "contractor", label: "Contractor / labour supply" },
    { key: "professional", label: "Professional fee" },
    { key: "technical", label: "Technical fee" },
    { key: "rent_plant", label: "Rent of plant and machinery" },
    { key: "rent_land", label: "Rent of land or building" },
    { key: "goods_purchase", label: "Purchase of goods" },
  ],
  sacPresets: [
    { code: "9954", label: "9954 · Works contract" },
    { code: "9985", label: "9985 · Labour supply (support services)" },
    { code: "9987", label: "9987 · Repair and maintenance services" },
  ],
  gstRates: ["0", "5", "12", "18", "28"],
  financial: true,
};

export function boqItemsOf(financial = true): WorkOrderBoqItems {
  const rate = (paise: number) => (financial ? paise : null);
  return {
    financial,
    items: [
      {
        id: EXCAVATION,
        sectionId: SECTION,
        sectionTitle: "Earthwork",
        libraryItemId: null,
        itemNo: "1.1",
        description: "Excavation in ordinary soil up to 1.5 m depth",
        uomId: CUM,
        uomName: "cum",
        sacHsn: "9954",
        quantity: "1250.0000",
        rate: rate(450_00),
        remaining: "250.0000",
        analysis: [],
      },
      {
        id: PCC,
        sectionId: SECTION,
        sectionTitle: "Concrete",
        libraryItemId: LIBRARY_PCC,
        itemNo: "2.1",
        description: "PCC 1:4:8 below foundations",
        uomId: CUM,
        uomName: "cum",
        sacHsn: "9954",
        quantity: "80.0000",
        rate: rate(5200_00),
        remaining: "0.0000",
        analysis: [{ materialId: CEMENT, coefficient: "3.4000" }],
      },
      {
        id: PLASTER,
        sectionId: SECTION,
        sectionTitle: "Finishes",
        libraryItemId: null,
        itemNo: "3.1",
        description: "12 mm cement plaster 1:6",
        uomId: SQM,
        uomName: "sqm",
        sacHsn: null,
        quantity: "900.0000",
        rate: rate(310_00),
        remaining: "900.0000",
        analysis: [],
      },
    ],
  };
}

const TERMS: WorkOrder["terms"] = {
  retentionPercent: "5.00",
  retentionCapPercent: "5.00",
  retentionCompletionPercent: "50.00",
  dlpMonths: 12,
  tdsNature: "contractor",
  sacCode: "9954",
  gstRate: "18.00",
  reverseCharge: false,
  mobilisationAdvance: 5_00_000_00,
  mobilisationRecoveryPercent: "10.00",
};

const LINES: WorkOrder["lines"] = [
  {
    id: LINE_1,
    kind: "boq",
    boqItemId: EXCAVATION,
    itemNo: "1.1",
    description: "Excavation in ordinary soil up to 1.5 m depth",
    uomId: CUM,
    uomName: "cum",
    sacHsn: "9954",
    quantity: "1000.0000",
    rate: 400_00,
    amount: 4_00_000_00,
    billed: "0.0000",
    remaining: "250.0000",
  },
  {
    id: LINE_2,
    kind: "boq",
    boqItemId: PCC,
    itemNo: "2.1",
    description: "PCC 1:4:8 below foundations",
    uomId: CUM,
    uomName: "cum",
    sacHsn: "9954",
    quantity: "90.0000",
    rate: 4800_00,
    amount: 4_32_000_00,
    billed: "0.0000",
    remaining: "0.0000",
  },
  {
    id: LINE_3,
    kind: "non_boq",
    boqItemId: null,
    itemNo: "NB-1",
    description: "Dewatering with diesel pumps",
    uomId: CUM,
    uomName: "cum",
    sacHsn: null,
    quantity: "10.0000",
    rate: 125_50,
    amount: 1255_00,
    billed: "0.0000",
    remaining: null,
  },
];

const VALUE = 4_00_000_00 + 4_32_000_00 + 1255_00;

export function workOrderOf(
  overrides: Partial<WorkOrder> = {},
  financial = true,
): WorkOrder {
  const base: WorkOrder = {
    id: WO_ISSUED,
    projectId: PROJECT,
    projectName: "Metro Depot",
    number: "WO/26-27/00003",
    status: "issued",
    revision: 0,
    contractorId: CONTRACTOR,
    contractorName: "Velan Constructions",
    departmentId: DEPARTMENT,
    departmentName: "Masonry",
    orderDate: "2026-10-20",
    validUntil: "2027-03-31",
    scope: "Earthwork and PCC for the stabling yard, Block A.",
    value: VALUE,
    lineCount: LINES.length,
    terms: TERMS,
    lines: LINES,
    materials: [
      {
        id: "0199c0de-1104-7000-8000-000000000301",
        materialId: CEMENT,
        materialName: "Cement OPC 53",
        uomName: "Bag",
        issueBasis: "at_cost",
        issueRate: 380_00,
        wastagePercent: "2.00",
        penalRate: 450_00,
        coefficients: [{ lineId: LINE_2, coefficient: "3.4000" }],
      },
    ],
    revisions: [],
    warnings: [
      {
        code: "WORK_ORDER_QUANTITY_OVER_REMAINING",
        boqItemId: PCC,
        itemNo: "2.1",
        ordered: "90.0000",
        remaining: "0.0000",
        message:
          "BOQ item 2.1: ordering 90, the BOQ has nothing left after other Work Orders.",
      },
    ],
    rejectReason: null,
    decidedAt: "2026-10-21T06:30:00.000Z",
    decidedBy: "user-2",
    decidedByName: "Meena Raghavan",
    completedOn: null,
    closedOn: null,
    closeReason: null,
    cancelledOn: null,
    cancelReason: null,
    createdBy: "user-1",
    createdByName: "Arun Selva Kumar",
    createdAt: "2026-10-20T05:00:00.000Z",
    updatedAt: "2026-10-21T06:30:00.000Z",
    financial: true,
    viewerFlags: [
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "reject",
      "print",
      "notification",
      "financial",
    ],
    ...overrides,
  };
  if (financial) return base;
  return {
    ...base,
    value: null,
    financial: false,
    viewerFlags: base.viewerFlags.filter((flag) => flag !== "financial"),
    terms: { ...base.terms, mobilisationAdvance: null },
    lines: base.lines.map((line) => ({ ...line, rate: null, amount: null })),
    materials: base.materials.map((material) => ({
      ...material,
      issueRate: null,
      penalRate: null,
    })),
  };
}

export const DRAFT = workOrderOf({
  id: WO_DRAFT,
  number: null,
  status: "draft",
  decidedAt: null,
  decidedBy: null,
  decidedByName: null,
});

export const REJECTED = workOrderOf({
  id: WO_DRAFT,
  number: "WO/26-27/00004",
  status: "draft",
  rejectReason: "The PCC rate is above the BOQ rate; check with the QS.",
  decidedByName: "Meena Raghavan",
});

export const PENDING = workOrderOf({
  id: WO_PENDING,
  number: "WO/26-27/00005",
  status: "pending_approval",
  decidedAt: null,
  decidedBy: null,
  decidedByName: null,
});

export const AMENDED = workOrderOf({
  revision: 1,
  revisions: [
    {
      id: "0199c0de-1104-7000-8000-000000000401",
      revision: 0,
      reason: "Deeper excavation at the pump house",
      createdAt: "2026-11-02T09:15:00.000Z",
      createdBy: "user-2",
      createdByName: "Meena Raghavan",
      snapshot: {
        revision: 0,
        number: "WO/26-27/00003",
        contractorId: CONTRACTOR,
        contractorName: "Velan Constructions",
        departmentId: DEPARTMENT,
        departmentName: "Masonry",
        orderDate: "2026-10-20",
        validUntil: "2027-03-31",
        scope: "Earthwork for the stabling yard, Block A.",
        terms: { ...TERMS, retentionPercent: "2.50" },
        lines: LINES.slice(0, 1).map(
          ({ billed: _billed, remaining: _remaining, ...line }) => ({
            ...line,
            quantity: "800.0000",
            amount: 3_20_000_00,
          }),
        ),
        value: 3_20_000_00,
        materials: [],
      },
    },
  ],
});

export const CLOSED = workOrderOf({
  id: WO_CLOSED,
  number: "WO/26-27/00001",
  status: "closed",
  closedOn: "2027-02-28",
  completedOn: "2027-02-28",
  closeReason: "Work complete; final bill passed.",
  warnings: [],
});

export const CANCELLED = workOrderOf({
  id: WO_CANCELLED,
  number: "WO/26-27/00002",
  status: "cancelled",
  cancelledOn: "2026-10-25",
  cancelReason: "Raised against the wrong Contractor.",
  warnings: [],
});

function summary(workOrder: WorkOrder): WorkOrderSummary {
  return {
    id: workOrder.id,
    projectId: workOrder.projectId,
    number: workOrder.number,
    status: workOrder.status,
    revision: workOrder.revision,
    contractorId: workOrder.contractorId,
    contractorName: workOrder.contractorName,
    departmentId: workOrder.departmentId,
    departmentName: workOrder.departmentName,
    orderDate: workOrder.orderDate,
    validUntil: workOrder.validUntil,
    scope: workOrder.scope,
    value: workOrder.value,
    lineCount: workOrder.lineCount,
    createdAt: workOrder.createdAt,
    updatedAt: workOrder.updatedAt,
  };
}

export function pageOf(
  items: readonly WorkOrder[] = [DRAFT, PENDING, AMENDED, CLOSED, CANCELLED],
): WorkOrderPage {
  return {
    items: items.map(summary),
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    financial: items.every((item) => item.financial),
    viewerFlags: items[0]?.viewerFlags ?? ["read"],
  };
}
