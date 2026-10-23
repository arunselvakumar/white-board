import type {
  EscalationBill,
  EscalationClauseView,
  EscalationComponentWorking,
  EscalationFormOptions,
  EscalationPreview,
  EscalationWorking,
  PriceIndexList,
} from "@/src/queries/contracts-escalation";

/** Stories' ids and the ticket's worked example (CM-1109). */
export const PROJECT = "0199a000-0000-7000-8000-000000000001";
export const WORK_ORDER = "0199a000-0000-7000-8000-000000000002";
export const BILL_DRAFT = "0199a000-0000-7000-8000-000000000003";
export const BILL_NEGATIVE = "0199a000-0000-7000-8000-000000000004";
export const CLAUSE = "0199a000-0000-7000-8000-000000000005";
export const RA_APRIL = "0199a000-0000-7000-8000-000000000006";
export const RA_JUNE = "0199a000-0000-7000-8000-000000000007";

const MONTHS = ["2026-04-01", "2026-05-01", "2026-06-01"];
const indices = (values: string[]) =>
  MONTHS.map((month, index) => ({ month, value: values[index] ?? "0" }));

const POL_WORKING: EscalationComponentWorking = {
  component: "pol",
  basis: "weighted",
  weightPercent: "20.00",
  series: "WPI – HSD (POL)",
  baseIndex: "120.0000",
  indices: indices(["113.0000", "114.0000", "115.0000"]),
  averageIndex: "114.0000",
  factor: "-0.050000",
  quantity: null,
  basePrice: null,
  amount: -8_500_00,
};

/** R ₹10,00,000; NE 15 %; labour, material and POL → gross ₹21,250. */
export const WORKING: EscalationWorking = {
  valueOfWork: 1_000_000_00,
  bills: [
    {
      id: RA_APRIL,
      number: "CB/26-27/00002",
      billDate: "2026-04-30",
      gross: 400_000_00,
    },
    {
      id: RA_JUNE,
      number: "CB/26-27/00004",
      billDate: "2026-06-15",
      gross: 600_000_00,
    },
  ],
  quantityValue: 0,
  escalableValue: 1_000_000_00,
  nonEscalablePercent: "15.00",
  baseMonth: "2026-01-01",
  months: MONTHS,
  components: [
    {
      component: "labour",
      basis: "weighted",
      weightPercent: "30.00",
      series: "CPI-IW",
      baseIndex: "140.0000",
      indices: indices(["147.0000", "147.0000", "147.0000"]),
      averageIndex: "147.0000",
      factor: "0.050000",
      quantity: null,
      basePrice: null,
      amount: 12_750_00,
    },
    {
      component: "material",
      basis: "weighted",
      weightPercent: "50.00",
      series: "WPI – All commodities",
      baseIndex: "150.0000",
      indices: indices(["153.0000", "156.0000", "159.0000"]),
      averageIndex: "156.0000",
      factor: "0.040000",
      quantity: null,
      basePrice: null,
      amount: 17_000_00,
    },
    POL_WORKING,
  ],
  gross: 21_250_00,
};

const ALLOWED_DRAFT = {
  edit: true,
  refresh: true,
  delete: true,
  submit: true,
  approve: false,
  reject: false,
  reverse: false,
  print: true,
};

export const DRAFT: EscalationBill = {
  id: BILL_DRAFT,
  projectId: PROJECT,
  projectName: "Metro Depot",
  side: "contractor",
  type: "escalation",
  workOrder: {
    id: WORK_ORDER,
    number: "WO/26-27/00003",
    orderDate: "2026-01-10",
  },
  partyId: "0199a000-0000-7000-8000-000000000009",
  partyName: "Velan Constructions",
  number: null,
  ordinal: null,
  billDate: "2026-07-05",
  periodFrom: "2026-04-01",
  periodTo: "2026-06-30",
  status: "draft",
  working: WORKING,
  gross: 21_250_00,
  sacCode: "9954",
  gstRate: "18.00",
  supplyType: "intra_state",
  placeOfSupplyStateCode: "33",
  supplierGstin: "33ABCDE1234F1Z5",
  recipientGstin: null,
  reverseCharge: false,
  cgst: 1_912_50,
  sgst: 1_912_50,
  igst: 0,
  gst: 3_825_00,
  payableGst: 3_825_00,
  deductionLines: [
    {
      id: "0199a000-0000-7000-8000-00000000000a",
      kind: "retention",
      description: null,
      amount: 1_062_50,
    },
  ],
  deductions: 1_062_50,
  net: 24_012_50,
  retention: {
    percent: "5.00",
    capPercent: null,
    byPercent: 1_062_50,
    cap: null,
    heldBefore: 0,
    suggested: 1_062_50,
  },
  recovery: null,
  invoiceId: null,
  warnings: [],
  remarks: null,
  rejectReason: null,
  reverseReason: null,
  submittedAt: null,
  submittedByName: null,
  decidedAt: null,
  decidedByName: null,
  reversedAt: null,
  reversedByName: null,
  createdBy: "user-1",
  createdByName: "Arun Selva Kumar",
  createdAt: "2026-07-05T05:30:00.000Z",
  updatedAt: "2026-07-05T05:30:00.000Z",
  allowed: ALLOWED_DRAFT,
  financial: true,
  viewerFlags: [
    "read",
    "create",
    "update",
    "delete",
    "approve",
    "reject",
    "print",
    "financial",
  ],
};

/** Indices fell: −₹42,500, approved without an invoice, ₹10,000 recovered. */
export const NEGATIVE: EscalationBill = {
  ...DRAFT,
  id: BILL_NEGATIVE,
  number: "CB/26-27/00005",
  ordinal: 1,
  status: "approved",
  working: {
    ...WORKING,
    components: [
      {
        ...POL_WORKING,
        weightPercent: "100.00",
        amount: -42_500_00,
      },
    ],
    gross: -42_500_00,
  },
  gross: -42_500_00,
  cgst: 0,
  sgst: 0,
  gst: 0,
  payableGst: 0,
  deductionLines: [],
  deductions: 0,
  net: -42_500_00,
  recovery: { amount: 42_500_00, recovered: 10_000_00, outstanding: 32_500_00 },
  allowed: {
    ...ALLOWED_DRAFT,
    edit: false,
    refresh: false,
    delete: false,
    submit: false,
    reverse: true,
  },
};

export const PRICE_INDICES: PriceIndexList = {
  series: [
    {
      name: "CPI-IW",
      indices: [
        {
          id: "0199a000-0000-7000-8000-0000000000b1",
          series: "CPI-IW",
          month: "2026-01-01",
          value: "140.0000",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "0199a000-0000-7000-8000-0000000000b2",
          series: "CPI-IW",
          month: "2026-04-01",
          value: "147.0000",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    },
    {
      name: "WPI – Cement",
      indices: [
        {
          id: "0199a000-0000-7000-8000-0000000000b3",
          series: "WPI – Cement",
          month: "2026-01-01",
          value: "100.2500",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    },
  ],
  suggestions: [
    "WPI – All commodities",
    "WPI – Steel",
    "WPI – Bitumen",
    "WPI – HSD (POL)",
  ],
  viewerFlags: ["read", "create", "update", "delete", "import", "export"],
};

/** CM-1110: the Work Order's cement, filling the 10CA quantity. */
export const CEMENT_MATERIAL = "0199c4a0-0000-7000-8000-00000000c3e1";

export const NO_CLAUSE: EscalationClauseView = {
  side: "contractor",
  projectId: PROJECT,
  workOrderId: WORK_ORDER,
  workOrderNumber: "WO/26-27/00003",
  clause: null,
  approvedBills: 0,
  financial: true,
  canEdit: true,
  materialOptions: [
    { id: CEMENT_MATERIAL, name: "Cement OPC 53 Grade", uomName: "Bag" },
  ],
};

export const CLAUSE_VIEW: EscalationClauseView = {
  ...NO_CLAUSE,
  clause: {
    id: CLAUSE,
    baseMonth: "2026-01-01",
    nonEscalablePercent: "15.00",
    components: [
      {
        component: "labour",
        basis: "weighted",
        weightPercent: "30.00",
        series: "CPI-IW",
        basePrice: null,
        materialId: null,
      },
      {
        component: "material",
        basis: "weighted",
        weightPercent: "70.00",
        series: "WPI – All commodities",
        basePrice: null,
        materialId: null,
      },
      {
        component: "cement",
        basis: "quantity",
        weightPercent: null,
        series: "WPI – Cement",
        basePrice: 7_000_00,
        materialId: CEMENT_MATERIAL,
      },
    ],
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
};

export const LOCKED_CLAUSE: EscalationClauseView = {
  ...CLAUSE_VIEW,
  approvedBills: 1,
  canEdit: false,
};

export const FORM_OPTIONS: EscalationFormOptions = {
  side: "contractor",
  workOrders: [
    {
      id: WORK_ORDER,
      number: "WO/26-27/00003",
      contractorName: "Velan Constructions",
      baseMonth: "2026-01-01",
      quantityComponents: [],
    },
  ],
  clientClause: null,
  today: "2026-07-05",
};

export const PREVIEW: EscalationPreview = {
  periodFrom: "2026-04-01",
  periodTo: "2026-06-30",
  working: WORKING,
};
