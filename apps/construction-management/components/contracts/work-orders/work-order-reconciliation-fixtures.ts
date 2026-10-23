import type { Reconciliation } from "@/src/queries/contracts-reconciliation";

/** Material reconciliation fixtures (CM-1110): the ticket's worked example. */

export const RECONCILIATION_WORK_ORDER = "0199c0de-1110-7000-8000-0000000000a1";
export const PROJECT = "0199c0de-1110-7000-8000-0000000000b1";
export const BILL_1 = "0199c0de-1110-7000-8000-0000000000c1";
export const BILL_2 = "0199c0de-1110-7000-8000-0000000000c2";
export const CEMENT = "0199c0de-1110-7000-8000-0000000000d1";
export const STEEL = "0199c0de-1110-7000-8000-0000000000d2";
export const REQUEST = "0199c0de-1110-7000-8000-0000000000e1";

const bills: Reconciliation["bills"] = [
  {
    id: BILL_2,
    number: null,
    ordinal: null,
    status: "draft",
    billDate: "2026-10-08",
    measuredUpTo: "2026-10-05",
  },
  {
    id: BILL_1,
    number: "WO3/RA/01",
    ordinal: 1,
    status: "approved",
    billDate: "2026-09-28",
    measuredUpTo: "2026-09-23",
  },
];

const steel: Reconciliation["materials"][number] = {
  materialId: STEEL,
  materialName: "TMT Steel Fe 500",
  uomName: "kg",
  issueBasis: "at_cost",
  wastagePercent: "0.00",
  issueRate: 60_00,
  penalRate: null,
  theoretical: "0.000",
  allowed: "0.000",
  underUseLimit: "0.000",
  issued: "100.000",
  returned: "0.000",
  netIssued: "100.000",
  excess: "100.000",
  underUse: false,
  excessValue: null,
  recoveredBefore: 0,
  recoverySuggested: 0,
  onThisBill: null,
  reason: null,
  atCostValue: 6_000_00,
  atCostDeductedBefore: 0,
  atCostSuggested: 6_000_00,
  atCostOnThisBill: 6_000_00,
};

/** At bill 1 (approved): 100 cum, 700 bags, ₹26,660 recovered. */
export const AT_BILL_1: Reconciliation = {
  workOrder: {
    id: RECONCILIATION_WORK_ORDER,
    number: "WO/26-27/00003",
    projectId: PROJECT,
    contractorId: "0199c0de-1110-7000-8000-0000000000f1",
    contractorName: "Velan Constructions",
    status: "issued",
  },
  bill: bills[1] ?? null,
  bills,
  materials: [
    {
      materialId: CEMENT,
      materialName: "Cement OPC 53",
      uomName: "Bag",
      issueBasis: "free",
      wastagePercent: "2.00",
      issueRate: null,
      penalRate: 500_00,
      theoretical: "634.000",
      allowed: "646.680",
      underUseLimit: "621.320",
      issued: "700.000",
      returned: "0.000",
      netIssued: "700.000",
      excess: "53.320",
      underUse: false,
      excessValue: 26_660_00,
      recoveredBefore: 0,
      recoverySuggested: 26_660_00,
      onThisBill: 26_660_00,
      reason: null,
      atCostValue: null,
      atCostDeductedBefore: 0,
      atCostSuggested: 0,
      atCostOnThisBill: null,
    },
    steel,
  ],
  issues: [
    {
      id: "0199c0de-1110-7000-8000-000000000101",
      deliveryNoteId: "0199c0de-1110-7000-8000-000000000111",
      deliveryNoteNumber: "DN/26-27/00012",
      materialRequestId: REQUEST,
      materialRequestNumber: "MR/26-27/00031",
      date: "2026-09-12",
      materialId: CEMENT,
      quantity: "700.000",
      how: "auto",
    },
  ],
  unattributed: [],
  returnsRecorded: false,
  financial: true,
  canAssign: true,
};

/** At bill 2 (draft): 120 cum, 790 bags: 13.984 excess, nothing more to recover. */
export const AT_BILL_2: Reconciliation = {
  ...AT_BILL_1,
  bill: bills[0] ?? null,
  materials: [
    {
      ...(AT_BILL_1.materials[0] as Reconciliation["materials"][number]),
      theoretical: "760.800",
      allowed: "776.016",
      underUseLimit: "745.584",
      issued: "790.000",
      netIssued: "790.000",
      excess: "13.984",
      excessValue: 6_992_00,
      recoveredBefore: 26_660_00,
      recoverySuggested: 0,
      onThisBill: null,
    },
    steel,
  ],
};

/** Under-use: 600 bags for 634 theoretical, and an issue no rule attributes. */
export const UNDER_USE: Reconciliation = {
  ...AT_BILL_1,
  materials: [
    {
      ...(AT_BILL_1.materials[0] as Reconciliation["materials"][number]),
      issued: "600.000",
      netIssued: "600.000",
      excess: "0.000",
      underUse: true,
      excessValue: 0,
      recoverySuggested: 0,
      onThisBill: null,
    },
  ],
  unattributed: [
    {
      id: "0199c0de-1110-7000-8000-000000000102",
      deliveryNoteId: "0199c0de-1110-7000-8000-000000000112",
      deliveryNoteNumber: "DN/26-27/00019",
      materialRequestId: REQUEST,
      materialRequestNumber: "MR/26-27/00040",
      date: "2026-10-18",
      materialId: CEMENT,
      quantity: "30.000",
      how: "unattributed",
      candidates: 2,
    },
  ],
};

/** The same without Work Order Financial: quantities only. */
export const WITHOUT_FINANCIAL: Reconciliation = {
  ...AT_BILL_1,
  financial: false,
  canAssign: false,
  materials: AT_BILL_1.materials.map((row) => ({
    ...row,
    issueRate: null,
    penalRate: null,
    excessValue: null,
    recoveredBefore: null,
    recoverySuggested: null,
    onThisBill: null,
    atCostValue: null,
    atCostDeductedBefore: null,
    atCostSuggested: null,
    atCostOnThisBill: null,
  })),
};
