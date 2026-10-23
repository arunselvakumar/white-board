import type {
  ClientBill,
  ClientBillFormOptions,
  ClientBillPage,
  ClientBillSetup,
  ClientBillSummary,
  ClientContract,
} from "@/src/queries/contracts-client-bills";

/* Client Bill story data (CM-1107): RA bills to a housing board for a block of flats. */

export const PROJECT = "0199c0de-1107-7000-8000-000000000001";
export const CLIENT = "0199a000-0000-7000-8000-0000000000d4";
const CUM = "0199c0de-1107-7000-8000-0000000000a1";
const ITEM_1 = "0199c0de-1107-7000-8000-000000000201";
const ITEM_2 = "0199c0de-1107-7000-8000-000000000202";
const INVOICE = "0199c000-0000-7000-8000-000000000030";

export const BILL_DRAFT = "0199c0de-1107-7000-8000-000000000101";
export const BILL_PENDING = "0199c0de-1107-7000-8000-000000000102";
export const BILL_APPROVED = "0199c0de-1107-7000-8000-000000000103";
export const BILL_REVERSED = "0199c0de-1107-7000-8000-000000000104";
export const BILL_OUT_OF_STATE = "0199c0de-1107-7000-8000-000000000105";

const ALL_FLAGS: ClientBill["viewerFlags"] = [
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

const lines: ClientBill["lines"] = [
  {
    id: "0199c0de-1107-7000-8000-000000000301",
    boqItemId: ITEM_1,
    itemNo: "2.1",
    description: "RCC M25 in columns up to floor two",
    uomId: CUM,
    uomName: "cum",
    rate: 7_850_00,
    previousQuantity: "40.0000",
    quantity: "38.5000",
    cumulativeQuantity: "78.5000",
    boqQuantity: "120.0000",
    deviation: {
      over: false,
      overBy: null,
      percentOver: null,
      overLimit: false,
    },
    amount: 3_02_225_00,
    rows: [
      {
        id: "0199c0de-1107-7000-8000-000000000401",
        sheetId: "0199c0de-1107-7000-8000-000000000501",
        measuredOn: "2026-10-12",
        sheetTitle: "Block C columns",
        description: "Columns C1–C14",
        location: null,
        locationLabel: "Block C · First Floor",
        nos: "14.0000",
        length: "0.4500",
        breadth: "0.4500",
        depth: "3.2000",
        direct: false,
        quantity: "9.0720",
      },
      {
        id: "0199c0de-1107-7000-8000-000000000402",
        sheetId: "0199c0de-1107-7000-8000-000000000502",
        measuredOn: "2026-10-16",
        sheetTitle: null,
        description: "Columns, second floor",
        location: null,
        locationLabel: "Block C · Second Floor",
        nos: null,
        length: null,
        breadth: null,
        depth: null,
        direct: true,
        quantity: "29.4280",
      },
    ],
  },
  {
    id: "0199c0de-1107-7000-8000-000000000302",
    boqItemId: ITEM_2,
    itemNo: "2.4",
    description: "Brick masonry in CM 1:6",
    uomId: CUM,
    uomName: "cum",
    rate: 6_200_00,
    previousQuantity: "70.0000",
    quantity: "49.7676",
    cumulativeQuantity: "119.7676",
    boqQuantity: "100.0000",
    deviation: {
      over: true,
      overBy: "19.7676",
      percentOver: "19.77",
      overLimit: false,
    },
    amount: 3_08_559_12,
    rows: [
      {
        id: "0199c0de-1107-7000-8000-000000000403",
        sheetId: "0199c0de-1107-7000-8000-000000000502",
        measuredOn: "2026-10-16",
        sheetTitle: null,
        description: "Walls, first floor",
        location: null,
        locationLabel: "Block C · First Floor",
        nos: null,
        length: null,
        breadth: null,
        depth: null,
        direct: true,
        quantity: "49.7676",
      },
    ],
  },
];

export const TERMS: ClientBill["terms"] = {
  retentionPercent: "10.00",
  retentionCapPercent: "5.00",
  retentionCompletionPercent: "50.00",
  dlpMonths: 12,
  handoverOn: null,
  sacCode: "9954",
  gstRate: "18.00",
};

/** A bill to the Client; `overrides` change any field, `financial: false` nulls money. */
export function billOf(
  overrides: Partial<ClientBill> = {},
  financial = true,
): ClientBill {
  const base: ClientBill = {
    id: BILL_APPROVED,
    projectId: PROJECT,
    clientId: CLIENT,
    clientName: "Tamil Nadu Housing Board",
    number: "RA/26-27/00002",
    ordinal: 2,
    type: "running",
    periodFrom: null,
    periodTo: null,
    billDate: "2026-10-20",
    measuredUpTo: "2026-10-18",
    isFinal: false,
    status: "approved",
    gross: 6_10_784_12,
    gst: 1_09_941_14,
    deductions: 61_078_41,
    net: 6_59_646_85,
    invoiceId: INVOICE,
    createdAt: "2026-10-20T06:00:00.000Z",
    updatedAt: "2026-10-21T06:00:00.000Z",
    projectName: "Housing Board Block C",
    supplier: {
      name: "Head office",
      address: "12, Anna Salai, Chennai 600002",
      gstin: "33AAACA1234A1Z5",
      stateCode: "33",
      stateName: "Tamil Nadu",
    },
    recipient: {
      name: "Tamil Nadu Housing Board",
      address: "Nandanam, Chennai",
      gstin: "33AABCT1332L1ZU",
      stateCode: "33",
      stateName: "Tamil Nadu",
      pinCode: "600035",
    },
    placeOfSupply: { stateCode: "33", stateName: "Tamil Nadu" },
    supplierGstin: "33AAACA1234A1Z5",
    recipientGstin: "33AABCT1332L1ZU",
    warnings: [],
    cumulativeValue: 13_58_784_12,
    previousValue: 7_48_000_00,
    sacCode: "9954",
    gstRate: "18.00",
    supplyType: "intra_state",
    cgst: 54_970_57,
    sgst: 54_970_57,
    igst: 0,
    lines,
    deductionLines: [
      {
        id: "0199c0de-1107-7000-8000-000000000601",
        kind: "retention",
        description: null,
        amount: 61_078_41,
        advanceId: null,
        escalationBillId: null,
      },
    ],
    escalationRecoveries: [],
    advances: [],
    retention: {
      percent: "10.00",
      capPercent: "5.00",
      byPercent: 61_078_41,
      cap: 1_70_000_00,
      heldBefore: 74_800_00,
      suggested: 61_078_41,
    },
    retentionReceivable: 1_35_878_41,
    terms: TERMS,
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
    retentionReceivable: null,
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

const NONE: ClientBill["allowed"] = {
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
  retentionReceivable: 74_800_00,
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
  number: "RA/26-27/00003",
  ordinal: 3,
  status: "pending_approval",
  invoiceId: null,
  decidedAt: null,
  decidedByName: null,
  retentionReceivable: 74_800_00,
  allowed: { ...NONE, approve: true, reject: true },
});

export const APPROVED = billOf();

export const REVERSED = billOf({
  id: BILL_REVERSED,
  number: "RA/26-27/00001",
  ordinal: 1,
  status: "reversed",
  reverseReason: "Masonry on the first floor was measured twice.",
  reversedAt: "2026-10-22T06:00:00.000Z",
  reversedByName: "Meena Raghavan",
  allowed: NONE,
});

/** A Kerala site billed from the Tamil Nadu GSTIN: IGST and the warning. */
export const OUT_OF_STATE = billOf({
  id: BILL_OUT_OF_STATE,
  number: "RA/26-27/00009",
  ordinal: 1,
  placeOfSupply: { stateCode: "32", stateName: "Kerala" },
  supplyType: "inter_state",
  cgst: 0,
  sgst: 0,
  igst: 1_09_941_14,
  warnings: [
    {
      code: "GSTIN_NOT_IN_STATE",
      message:
        "The Company has no GSTIN in Kerala (32), where this work is supplied. Check whether the Company must register there; this invoice shows the default GSTIN.",
    },
  ],
  allowed: NONE,
});

function summaryOf(bill: ClientBill): ClientBillSummary {
  return {
    id: bill.id,
    projectId: bill.projectId,
    clientId: bill.clientId,
    clientName: bill.clientName,
    number: bill.number,
    ordinal: bill.ordinal,
    type: bill.type,
    periodFrom: bill.periodFrom,
    periodTo: bill.periodTo,
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    status: bill.status,
    gross: bill.gross,
    gst: bill.gst,
    deductions: bill.deductions,
    net: bill.net,
    invoiceId: bill.invoiceId,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

export const READY: ClientBillSetup = {
  role: "contract",
  clientId: CLIENT,
  clientName: "Tamil Nadu Housing Board",
  stateCode: "33",
  stateName: "Tamil Nadu",
  blockers: [],
};

export function pageOf(
  financial = true,
  setup: ClientBillSetup = READY,
): ClientBillPage {
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
      gross: financial ? 18_32_352_36 : null,
      gst: financial ? 3_29_823_42 : null,
      deductions: financial ? 1_83_235_23 : null,
      net: financial ? 19_78_940_55 : null,
    },
    retentionReceivable: financial ? 1_35_878_41 : null,
    setup,
    financial,
    viewerFlags: financial
      ? ALL_FLAGS
      : ALL_FLAGS.filter((flag) => flag !== "financial"),
  };
}

export function emptyPage(setup: ClientBillSetup = READY): ClientBillPage {
  return {
    items: [],
    nextCursor: null,
    prevCursor: null,
    total: 0,
    totals: { count: 0, gross: 0, gst: 0, deductions: 0, net: 0 },
    retentionReceivable: 0,
    setup,
    financial: true,
    viewerFlags: ALL_FLAGS,
  };
}

export const OWN_DEVELOPMENT: ClientBillSetup = {
  role: "own",
  clientId: null,
  clientName: null,
  stateCode: "33",
  stateName: "Tamil Nadu",
  blockers: ["PROJECT_NOT_CONTRACT_WORK", "PROJECT_CLIENT_REQUIRED"],
};

export const NO_CLIENT: ClientBillSetup = {
  ...READY,
  clientId: null,
  clientName: null,
  blockers: ["PROJECT_CLIENT_REQUIRED"],
};

export const NO_STATE: ClientBillSetup = {
  ...READY,
  stateCode: null,
  stateName: null,
  blockers: ["PROJECT_STATE_REQUIRED"],
};

export const FORM_OPTIONS: ClientBillFormOptions = {
  setup: READY,
  unbilled: [
    { measuredOn: "2026-10-12", rows: 4 },
    { measuredOn: "2026-10-19", rows: 3 },
  ],
  openBillId: null,
  today: "2026-10-22",
};

export const CONTRACT: ClientContract = {
  projectId: PROJECT,
  terms: TERMS,
  updatedAt: "2026-10-01T06:00:00.000Z",
  boqValue: 34_00_000_00,
  retentionReceivable: 1_35_878_41,
  canEdit: true,
  financial: true,
};
