import type {
  ContractorBill,
  ContractorBillFormOptions,
  ContractorBillPage,
  ContractorBillSummary,
} from "@/src/queries/contracts-contractor-bills";

/* Contractor Bill story data (CM-1106): RA bills on a metro depot's earthwork. */

export const PROJECT = "0199c0de-1106-7000-8000-000000000001";
export const CONTRACTOR = "0199c0de-1106-7000-8000-0000000000c1";
export const WORK_ORDER = "0199c0de-1106-7000-8000-0000000000e1";
export const OTHER_WORK_ORDER = "0199c0de-1106-7000-8000-0000000000e2";
const CUM = "0199c0de-1106-7000-8000-0000000000a1";
const LINE_1 = "0199c0de-1106-7000-8000-000000000201";
const LINE_2 = "0199c0de-1106-7000-8000-000000000202";
const INVOICE = "0199c0de-1106-7000-8000-0000000000f1";

export const BILL_DRAFT = "0199c0de-1106-7000-8000-000000000101";
export const BILL_PENDING = "0199c0de-1106-7000-8000-000000000102";
export const BILL_APPROVED = "0199c0de-1106-7000-8000-000000000103";
export const BILL_REVERSED = "0199c0de-1106-7000-8000-000000000104";
export const BILL_RCM = "0199c0de-1106-7000-8000-000000000105";

const ALL_FLAGS: ContractorBill["viewerFlags"] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "notification",
  "financial",
];

const lines: ContractorBill["lines"] = [
  {
    id: "0199c0de-1106-7000-8000-000000000301",
    workOrderLineId: LINE_1,
    itemNo: "2.1",
    description: "Excavation in hard soil up to 1.5 m depth",
    uomId: CUM,
    uomName: "cum",
    rate: 400_00,
    previousQuantity: "120.0000",
    quantity: "80.5000",
    cumulativeQuantity: "200.5000",
    workOrderQuantity: "800.0000",
    amount: 32_200_00,
    rows: [
      {
        id: "0199c0de-1106-7000-8000-000000000401",
        sheetId: "0199c0de-1106-7000-8000-000000000501",
        measuredOn: "2026-10-12",
        sheetTitle: "Pump house footings",
        description: "Footings F1–F6",
        location: null,
        locationLabel: "Wing A · Ground Floor",
        nos: "6.0000",
        length: "3.5000",
        breadth: "2.5000",
        depth: "1.5000",
        direct: false,
        quantity: "78.7500",
      },
      {
        id: "0199c0de-1106-7000-8000-000000000402",
        sheetId: "0199c0de-1106-7000-8000-000000000501",
        measuredOn: "2026-10-12",
        sheetTitle: "Pump house footings",
        description: "Sump pit",
        location: null,
        locationLabel: null,
        nos: null,
        length: null,
        breadth: null,
        depth: null,
        direct: true,
        quantity: "1.7500",
      },
    ],
  },
  {
    id: "0199c0de-1106-7000-8000-000000000302",
    workOrderLineId: LINE_2,
    itemNo: "2.2",
    description: "PCC 1:4:8 below footings",
    uomId: CUM,
    uomName: "cum",
    rate: 5_200_00,
    previousQuantity: "0.0000",
    quantity: "12.0000",
    cumulativeQuantity: "12.0000",
    workOrderQuantity: "40.0000",
    amount: 62_400_00,
    rows: [
      {
        id: "0199c0de-1106-7000-8000-000000000403",
        sheetId: "0199c0de-1106-7000-8000-000000000502",
        measuredOn: "2026-10-15",
        sheetTitle: null,
        description: "Footings F1–F6",
        location: null,
        locationLabel: "Wing A",
        nos: "6.0000",
        length: "2.0000",
        breadth: "1.0000",
        depth: null,
        direct: false,
        quantity: "12.0000",
      },
    ],
  },
];

/** A bill on the Work Order; `overrides` change any field, `financial: false` nulls money. */
export function billOf(
  overrides: Partial<ContractorBill> = {},
  financial = true,
): ContractorBill {
  const base: ContractorBill = {
    id: BILL_APPROVED,
    projectId: PROJECT,
    workOrderId: WORK_ORDER,
    workOrderNumber: "WO/26-27/00003",
    contractorId: CONTRACTOR,
    contractorName: "Velan Constructions",
    departmentName: "Earthwork",
    number: "CB/26-27/00002",
    ordinal: 2,
    billDate: "2026-10-20",
    measuredUpTo: "2026-10-18",
    isFinal: false,
    status: "approved",
    gross: 94_600_00,
    gst: 17_028_00,
    reverseCharge: false,
    deductions: 9_730_00,
    net: 1_01_898_00,
    invoiceId: INVOICE,
    createdAt: "2026-10-20T06:00:00.000Z",
    updatedAt: "2026-10-21T06:00:00.000Z",
    projectName: "Metro Depot",
    workOrder: {
      id: WORK_ORDER,
      number: "WO/26-27/00003",
      status: "issued",
      orderDate: "2026-08-01",
      tdsNature: "contractor",
      mobilisationRecoveryPercent: "10.00",
    },
    cumulativeValue: 1_42_600_00,
    previousValue: 48_000_00,
    sacCode: "9954",
    gstRate: "18.00",
    supplyType: "intra_state",
    placeOfSupplyStateCode: "33",
    supplierGstin: "33AABCV1234F1Z5",
    cgst: 8_514_00,
    sgst: 8_514_00,
    igst: 0,
    payableGst: 17_028_00,
    lines,
    deductionLines: [
      {
        id: "0199c0de-1106-7000-8000-000000000601",
        kind: "retention",
        description: null,
        amount: 4_730_00,
      },
      {
        id: "0199c0de-1106-7000-8000-000000000602",
        kind: "mobilisation_recovery",
        description: "10 % of the gross",
        amount: 5_000_00,
      },
    ],
    retention: {
      percent: "5.00",
      capPercent: "5.00",
      byPercent: 4_730_00,
      cap: 21_000_00,
      heldBefore: 2_400_00,
      suggested: 4_730_00,
    },
    retentionHeldOnWorkOrder: 7_130_00,
    tdsEstimate: {
      label: "393 (194C)",
      rate: "1.00",
      applicable: true,
      base: 94_600_00,
      amount: 946_00,
      note: "Estimate only: TDS is deducted when the bill is paid, on that payment's figures.",
    },
    remarks: null,
    rejectReason: null,
    reverseReason: null,
    submittedAt: "2026-10-20T07:00:00.000Z",
    submittedByName: "Arul Raj",
    decidedAt: "2026-10-21T06:00:00.000Z",
    decidedByName: "Meena Raghavan",
    reversedAt: null,
    reversedByName: null,
    createdBy: "user-1",
    createdByName: "Arul Raj",
    allowed: {
      edit: false,
      refresh: false,
      delete: false,
      submit: false,
      approve: false,
      reject: false,
      reverse: true,
      print: true,
    },
    financial: true,
    viewerFlags: ALL_FLAGS,
  };
  const bill = { ...base, ...overrides };
  if (financial) return bill;
  return {
    ...bill,
    financial: false,
    gross: null,
    gst: null,
    deductions: null,
    net: null,
    cumulativeValue: null,
    previousValue: null,
    cgst: null,
    sgst: null,
    igst: null,
    payableGst: null,
    retentionHeldOnWorkOrder: null,
    tdsEstimate: null,
    lines: bill.lines.map((line) => ({ ...line, rate: null, amount: null })),
    deductionLines: bill.deductionLines.map((deduction) => ({
      ...deduction,
      amount: null,
    })),
    retention: {
      ...bill.retention,
      byPercent: null,
      cap: null,
      heldBefore: null,
      suggested: null,
    },
    viewerFlags: bill.viewerFlags.filter((flag) => flag !== "financial"),
  };
}

const NONE: ContractorBill["allowed"] = {
  edit: false,
  refresh: false,
  delete: false,
  submit: false,
  approve: false,
  reject: false,
  reverse: false,
  print: true,
};

export const DRAFT = billOf({
  id: BILL_DRAFT,
  number: null,
  ordinal: null,
  status: "draft",
  invoiceId: null,
  submittedAt: null,
  submittedByName: null,
  decidedAt: null,
  decidedByName: null,
  deductionLines: [
    {
      id: "0199c0de-1106-7000-8000-000000000603",
      kind: "retention",
      description: null,
      amount: 4_730_00,
    },
  ],
  deductions: 4_730_00,
  net: 1_06_898_00,
  allowed: {
    ...NONE,
    edit: true,
    refresh: true,
    submit: true,
    delete: true,
  },
});

export const PENDING = billOf({
  id: BILL_PENDING,
  number: "CB/26-27/00003",
  ordinal: 3,
  status: "pending_approval",
  invoiceId: null,
  decidedAt: null,
  decidedByName: null,
  allowed: { ...NONE, approve: true, reject: true },
});

export const APPROVED = billOf();

export const REVERSED = billOf({
  id: BILL_REVERSED,
  number: "CB/26-27/00001",
  ordinal: 1,
  status: "reversed",
  reverseReason: "Footings F5 and F6 were measured twice.",
  reversedAt: "2026-10-22T06:00:00.000Z",
  reversedByName: "Meena Raghavan",
  allowed: NONE,
});

export const RCM = billOf({
  id: BILL_RCM,
  number: "CB/26-27/00007",
  ordinal: 1,
  reverseCharge: true,
  payableGst: 0,
  previousValue: 0,
  cumulativeValue: 94_600_00,
  deductionLines: [
    {
      id: "0199c0de-1106-7000-8000-000000000604",
      kind: "retention",
      description: null,
      amount: 4_730_00,
    },
  ],
  deductions: 4_730_00,
  net: 89_870_00,
  allowed: NONE,
});

function summaryOf(bill: ContractorBill): ContractorBillSummary {
  return {
    id: bill.id,
    projectId: bill.projectId,
    workOrderId: bill.workOrderId,
    workOrderNumber: bill.workOrderNumber,
    contractorId: bill.contractorId,
    contractorName: bill.contractorName,
    departmentName: bill.departmentName,
    number: bill.number,
    ordinal: bill.ordinal,
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    status: bill.status,
    gross: bill.gross,
    gst: bill.gst,
    reverseCharge: bill.reverseCharge,
    deductions: bill.deductions,
    net: bill.net,
    invoiceId: bill.invoiceId,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

export function pageOf(financial = true): ContractorBillPage {
  const bills = [DRAFT, PENDING, APPROVED, REVERSED].map((bill) =>
    financial ? bill : billOf(bill, false),
  );
  return {
    items: bills.map(summaryOf),
    nextCursor: null,
    prevCursor: null,
    total: bills.length,
    totals: {
      count: 3,
      gross: financial ? 2_83_800_00 : null,
      gst: financial ? 51_084_00 : null,
      deductions: financial ? 19_190_00 : null,
      net: financial ? 3_15_694_00 : null,
    },
    retentionHeld: financial
      ? [
          {
            contractorId: CONTRACTOR,
            contractorName: "Velan Constructions",
            amount: 7_130_00,
          },
        ]
      : [],
    financial,
    viewerFlags: financial
      ? ALL_FLAGS
      : ALL_FLAGS.filter((flag) => flag !== "financial"),
  };
}

export const EMPTY_PAGE: ContractorBillPage = {
  items: [],
  nextCursor: null,
  prevCursor: null,
  total: 0,
  totals: { count: 0, gross: 0, gst: 0, deductions: 0, net: 0 },
  retentionHeld: [],
  financial: true,
  viewerFlags: ALL_FLAGS,
};

export const FORM_OPTIONS: ContractorBillFormOptions = {
  workOrders: [
    {
      id: WORK_ORDER,
      number: "WO/26-27/00003",
      orderDate: "2026-08-01",
      contractorId: CONTRACTOR,
      contractorName: "Velan Constructions",
      unbilled: [
        { measuredOn: "2026-10-12", rows: 4 },
        { measuredOn: "2026-10-19", rows: 3 },
      ],
      openBillId: null,
    },
    {
      id: OTHER_WORK_ORDER,
      number: "WO/26-27/00004",
      orderDate: "2026-09-01",
      contractorId: "0199c0de-1106-7000-8000-0000000000c2",
      contractorName: "Sri Murugan Builders",
      unbilled: [],
      openBillId: BILL_DRAFT,
    },
  ],
  today: "2026-10-22",
};
