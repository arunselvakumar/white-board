import type { ApiCall } from "../../../.storybook/mocks/api";
import { financeLookupsHandler } from "@/components/finance/account-fixtures";
import { mockFinanceDocumentApi } from "@/components/finance/documents/finance-document-fixtures";
import type { FinanceAccess } from "@/src/queries/finance-access";
import type {
  AwaitingGoodsReceipt,
  Invoice,
  PartyBalances,
  PartyOpening,
  PartyPayment,
  PartyStatement,
  Settlement,
  TdsLedger,
  TdsSuggestion,
  WorkspacePartyBalances,
} from "@/src/queries/finance-parties";

/** Story data for the party money screens (CM-705, CM-706). */

export const PROJECT_ID = "0199b000-0000-7000-8000-000000000001";
export const CONTRACTOR_ID = "0199a000-0000-7000-8000-0000000000d1";
export const SUPPLIER_ID = "0199a000-0000-7000-8000-0000000000d2";
export const OTHER_PARTY_ID = "0199a000-0000-7000-8000-0000000000d3";
export const CLIENT_ID = "0199a000-0000-7000-8000-0000000000d4";
export const CLIENT_BILL_ID = "0199c0de-1107-7000-8000-000000000103";
export const OTHER_PROJECT_ID = "0199b000-0000-7000-8000-000000000002";
const AT = "2026-10-08T06:30:00.000Z";
export const TODAY = "2026-10-11";

const PLACE = { kind: "project" as const, id: PROJECT_ID, name: "Tower A" };

export const FULL_ACCESS: FinanceAccess = {
  projectId: PROJECT_ID,
  menus: {
    "finance.central_payment": [],
    "finance.payments": ["read"],
    "finance.transactions": [],
    "finance.parties": [
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "reject",
      "print",
    ],
    "finance.petty_cash": [],
    "finance.other_expenses": [],
    "masters.bank_accounts": [],
    "masters.payment_categories": [],
    "masters.other_parties": [],
    "masters.contractors": [],
    "masters.suppliers": [],
    "labour.labour": [],
    "labour.vendor": [],
  },
};

export const READ_ONLY_ACCESS: FinanceAccess = {
  ...FULL_ACCESS,
  menus: { ...FULL_ACCESS.menus, "finance.parties": ["read"] },
};

const ACTIONS = { edit: true, delete: true, settle: true, pay: true };

function invoice(patch: Partial<Invoice> & Pick<Invoice, "id">): Invoice {
  return {
    party: { type: "supplier", id: SUPPLIER_ID, name: "Chennai Cements" },
    place: PLACE,
    direction: "payable",
    origin: "manual",
    sourceId: null,
    invoiceNumber: "CC/2026/118",
    invoiceDate: "2026-09-01",
    dueDate: "2026-10-01",
    department: null,
    taxableAmount: null,
    gstAmount: null,
    amount: 47_200_00,
    remarks: null,
    allocated: 0,
    writtenOff: 0,
    balance: 47_200_00,
    status: "open",
    overdue: true,
    daysOverdue: 10,
    goodsReceipts: [],
    grnValue: null,
    variance: false,
    pendingSettlement: null,
    settlements: [],
    payments: [],
    createdAt: AT,
    updatedAt: AT,
    actions: ACTIONS,
    ...patch,
  };
}

export const OVERDUE_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000001",
  goodsReceipts: [
    {
      id: "0199e000-0000-7000-8000-000000000001",
      number: "GRN/26-27/00012",
      grnValue: 47_200_00,
    },
  ],
  grnValue: 47_200_00,
  origin: "goods_receipt",
  sourceId: null,
});

export const PARTLY_PAID_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000002",
  invoiceNumber: "CC/2026/131",
  invoiceDate: "2026-09-20",
  dueDate: "2026-10-20",
  amount: 70_800_00,
  allocated: 20_000_00,
  balance: 50_800_00,
  status: "partly_paid",
  overdue: false,
  daysOverdue: 0,
  goodsReceipts: [
    {
      id: "0199e000-0000-7000-8000-000000000002",
      number: "GRN/26-27/00015",
      grnValue: 70_000_00,
    },
  ],
  grnValue: 70_000_00,
  variance: true,
  payments: [
    {
      paymentId: "0199d000-0000-7000-8000-000000000001",
      number: "PAY/26-27/00004",
      paymentDate: "2026-10-02",
      amount: 20_000_00,
    },
  ],
  actions: { ...ACTIONS, delete: false },
});

export const SETTLED_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000003",
  invoiceNumber: "CC/2026/090",
  invoiceDate: "2026-08-01",
  dueDate: null,
  amount: 10_000_00,
  allocated: 9_950_00,
  writtenOff: 50_00,
  balance: 0,
  status: "settled",
  overdue: false,
  daysOverdue: 0,
  settlements: [
    {
      id: "0199f000-0000-7000-8000-000000000001",
      amount: 50_00,
      reason: "Rounding off",
      status: "approved",
      rejectReason: null,
      createdAt: AT,
      decidedAt: AT,
    },
  ],
  actions: { edit: false, delete: false, settle: false, pay: false },
});

export const SUPPLIER_INVOICES = [
  OVERDUE_INVOICE,
  PARTLY_PAID_INVOICE,
  SETTLED_INVOICE,
];

export const CONTRACTOR_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000010",
  party: {
    type: "contractor",
    id: CONTRACTOR_ID,
    name: "Sri Murugan Builders",
  },
  invoiceNumber: "RA-3",
  dueDate: null,
  overdue: false,
  daysOverdue: 0,
  department: { id: "0199a000-0000-7000-8000-0000000000e1", name: "RCC" },
  taxableAmount: 1_00_000_00,
  gstAmount: 18_000_00,
  amount: 1_18_000_00,
  balance: 1_18_000_00,
});

export function balances(partyType: "contractor" | "supplier"): PartyBalances {
  const contractor = partyType === "contractor";
  const row = {
    party: contractor
      ? {
          type: "contractor" as const,
          id: CONTRACTOR_ID,
          name: "Sri Murugan Builders",
        }
      : { type: "supplier" as const, id: SUPPLIER_ID, name: "Chennai Cements" },
    assigned: true,
    opening: 5_000_00,
    invoiced: contractor ? 1_18_000_00 : 1_28_000_00,
    billed: 0,
    paid: contractor ? 49_500_00 : 29_950_00,
    received: 0,
    tds: contractor ? 500_00 : 0,
    clientTds: 0,
    gstTds: 0,
    retentionReceivable: 0,
    writtenOff: contractor ? 0 : -50_00,
    balance: contractor ? 73_000_00 : 1_03_000_00,
    overdue: contractor ? 0 : 47_200_00,
    advance: 0,
  };
  const other = {
    ...row,
    party: contractor
      ? {
          type: "contractor" as const,
          id: "0199a000-0000-7000-8000-0000000000d9",
          name: "Velan Constructions",
        }
      : {
          type: "supplier" as const,
          id: "0199a000-0000-7000-8000-0000000000d8",
          name: "Kaveri Steels",
        },
    assigned: false,
    opening: 0,
    invoiced: 0,
    paid: 10_000_00,
    tds: 0,
    writtenOff: 0,
    balance: -10_000_00,
    overdue: 0,
    advance: 10_000_00,
  };
  const items = [row, other];
  const sum = (key: keyof typeof row) =>
    items.reduce((total, item) => total + (item[key] as number), 0);
  return {
    partyType,
    items,
    totals: {
      opening: sum("opening"),
      invoiced: sum("invoiced"),
      billed: sum("billed"),
      paid: sum("paid"),
      received: sum("received"),
      tds: sum("tds"),
      clientTds: sum("clientTds"),
      gstTds: sum("gstTds"),
      retentionReceivable: sum("retentionReceivable"),
      writtenOff: sum("writtenOff"),
      balance: sum("balance"),
      overdue: sum("overdue"),
      advance: sum("advance"),
    },
  };
}

export const AWAITING_GRNS: AwaitingGoodsReceipt[] = [
  {
    id: "0199e000-0000-7000-8000-000000000021",
    number: "GRN/26-27/00021",
    supplier: { id: SUPPLIER_ID, name: "Chennai Cements" },
    receiptDate: "2026-10-05",
    invoiceNo: null,
    invoiceDate: null,
    invoiceAmount: null,
    totalValue: 23_600_00,
    paymentTermsDays: 30,
  },
  {
    id: "0199e000-0000-7000-8000-000000000022",
    number: "GRN/26-27/00022",
    supplier: { id: SUPPLIER_ID, name: "Chennai Cements" },
    receiptDate: "2026-10-07",
    invoiceNo: null,
    invoiceDate: null,
    invoiceAmount: null,
    totalValue: 11_800_00,
    paymentTermsDays: null,
  },
  {
    id: "0199e000-0000-7000-8000-000000000023",
    number: "GRN/26-27/00023",
    supplier: {
      id: "0199a000-0000-7000-8000-0000000000d8",
      name: "Kaveri Steels",
    },
    receiptDate: "2026-10-08",
    invoiceNo: "KS-77",
    invoiceDate: "2026-10-08",
    invoiceAmount: null,
    totalValue: 59_000_00,
    paymentTermsDays: null,
  },
];

export const CONTRACTOR_PAYMENT: PartyPayment = {
  id: "0199d000-0000-7000-8000-000000000010",
  number: "PAY/26-27/00010",
  party: {
    type: "contractor",
    id: CONTRACTOR_ID,
    name: "Sri Murugan Builders",
  },
  place: PLACE,
  direction: "out",
  paymentDate: "2026-10-10",
  account: {
    id: "0199a000-0000-7000-8000-000000000002",
    name: "HDFC Current A/c",
    kind: "bank",
  },
  mode: "online",
  chequeNumber: null,
  reference: "UTR-889912",
  modeDate: "2026-10-10",
  amount: 49_500_00,
  tds: {
    section: "194C",
    base: 50_000_00,
    rate: "1.00",
    amount: 500_00,
    suggested: 500_00,
    overridden: false,
    overrideReason: null,
  },
  clientDeductions: null,
  settled: 50_000_00,
  allocated: 40_000_00,
  unallocated: 10_000_00,
  paymentCategory: null,
  paidBy: { id: "0199a000-0000-7000-8000-0000000000a1", name: "Ravi Kumar" },
  remarks: "RA-3 part payment",
  allocations: [
    {
      id: "0199d100-0000-7000-8000-000000000001",
      invoiceId: CONTRACTOR_INVOICE.id,
      invoiceNumber: "RA-3",
      invoiceDate: "2026-09-01",
      amount: 40_000_00,
    },
  ],
  createdAt: AT,
  updatedAt: AT,
  actions: { cancel: true, applyAdvance: true, print: true },
};

export const SUPPLIER_STATEMENT: PartyStatement = {
  party: { type: "supplier", id: SUPPLIER_ID, name: "Chennai Cements" },
  place: PLACE,
  from: null,
  to: null,
  opening: 0,
  lines: [
    {
      id: "0199d200-0000-7000-8000-000000000001",
      entryDate: "2026-04-01",
      kind: "opening",
      amount: 5_000_00,
      balance: 5_000_00,
      document: {
        type: "party_opening",
        id: "0199d300-0000-7000-8000-000000000001",
        number: null,
      },
    },
    {
      id: "0199d200-0000-7000-8000-000000000002",
      entryDate: "2026-09-01",
      kind: "invoice",
      amount: 47_200_00,
      balance: 52_200_00,
      document: {
        type: "invoice",
        id: OVERDUE_INVOICE.id,
        number: OVERDUE_INVOICE.invoiceNumber,
      },
    },
    {
      id: "0199d200-0000-7000-8000-000000000003",
      entryDate: "2026-10-02",
      kind: "payment",
      amount: -20_000_00,
      balance: 32_200_00,
      document: {
        type: "party_payment",
        id: "0199d000-0000-7000-8000-000000000001",
        number: "PAY/26-27/00004",
      },
    },
  ],
  closing: 32_200_00,
  openInvoices: [OVERDUE_INVOICE],
};

export const SUPPLIER_OPENING: PartyOpening = {
  id: "0199d300-0000-7000-8000-000000000001",
  party: { type: "supplier", id: SUPPLIER_ID, name: "Chennai Cements" },
  place: { kind: "project", id: PROJECT_ID },
  asOfDate: "2026-04-01",
  amount: 5_000_00,
  updatedAt: AT,
};

export const TDS_LEDGER: TdsLedger = {
  contractor: {
    id: CONTRACTOR_ID,
    name: "Sri Murugan Builders",
    pan: "ABCPK1234F",
    payeeKind: "individual_huf",
  },
  financialYear: 2026,
  from: "2026-04-01",
  to: "2027-03-31",
  rows: [
    {
      paymentId: "0199d000-0000-7000-8000-000000000011",
      number: "PAY/26-27/00003",
      paymentDate: "2026-05-10",
      project: { id: PROJECT_ID, name: "Tower A" },
      paid: 25_000_00,
      section: "194C",
      base: 25_000_00,
      rate: "1.00",
      tds: 0,
      suggested: 0,
      overridden: false,
      overrideReason: null,
    },
    {
      paymentId: CONTRACTOR_PAYMENT.id,
      number: CONTRACTOR_PAYMENT.number,
      paymentDate: "2026-10-10",
      project: { id: PROJECT_ID, name: "Tower A" },
      paid: 49_500_00,
      section: "194C",
      base: 50_000_00,
      rate: "1.00",
      tds: 500_00,
      suggested: 500_00,
      overridden: false,
      overrideReason: null,
    },
  ],
  quarters: [
    { quarter: 1, label: "Q1 (Apr–Jun)", payments: 0, base: 0, tds: 0 },
    { quarter: 2, label: "Q2 (Jul–Sep)", payments: 0, base: 0, tds: 0 },
    {
      quarter: 3,
      label: "Q3 (Oct–Dec)",
      payments: 1,
      base: 50_000_00,
      tds: 500_00,
    },
    { quarter: 4, label: "Q4 (Jan–Mar)", payments: 0, base: 0, tds: 0 },
  ],
  totals: { base: 50_000_00, tds: 500_00, paid: 74_500_00 },
};

export function suggestionFor(settled: number): TdsSuggestion {
  if (settled <= 30_000_00)
    return {
      section: "194C",
      label: "393 (194C)",
      rate: "1.00",
      base: 0,
      amount: 0,
      reason: "below_threshold",
      catchUpBase: 0,
      payeeKind: "individual_huf",
    };
  const amount = Math.round(settled / 10_000) * 100;
  return {
    section: "194C",
    label: "393 (194C)",
    rate: "1.00",
    base: settled,
    amount,
    reason: "single",
    catchUpBase: 0,
    payeeKind: "individual_huf",
  };
}

export const SALES_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000020",
  party: {
    type: "other_party",
    id: OTHER_PARTY_ID,
    name: "Kumaran Consultants",
  },
  direction: "receivable",
  invoiceNumber: "INV/26-27/00003",
  invoiceDate: "2026-09-25",
  dueDate: "2026-10-25",
  amount: 25_000_00,
  balance: 25_000_00,
  overdue: false,
  daysOverdue: 0,
});

/** A Client Bill's receivable invoice to the Client (CM-1107), read-only here. */
export const CLIENT_INVOICE = invoice({
  id: "0199c000-0000-7000-8000-000000000030",
  party: {
    type: "client",
    id: CLIENT_ID,
    name: "Tamil Nadu Housing Board",
  },
  direction: "receivable",
  origin: "ra_bill",
  sourceId: CLIENT_BILL_ID,
  invoiceNumber: "RA/26-27/00002",
  invoiceDate: "2026-10-05",
  dueDate: null,
  taxableAmount: 6_10_559_32,
  gstAmount: 1_09_900_68,
  amount: 6_89_932_04,
  balance: 6_89_932_04,
  overdue: false,
  daysOverdue: 0,
  actions: { edit: false, delete: false, settle: true, pay: true },
});

export const CLIENT_BALANCES: PartyBalances = {
  partyType: "client",
  items: [
    {
      party: {
        type: "client",
        id: CLIENT_ID,
        name: "Tamil Nadu Housing Board",
      },
      assigned: true,
      opening: 0,
      invoiced: 0,
      billed: 13_79_864_08,
      paid: 0,
      received: 6_62_334_76,
      tds: 0,
      clientTds: 13_798_64,
      gstTds: 13_798_64,
      retentionReceivable: 61_055_93,
      writtenOff: 0,
      balance: -6_89_932_04,
      overdue: 0,
      advance: 0,
    },
  ],
  totals: {
    opening: 0,
    invoiced: 0,
    billed: 13_79_864_08,
    paid: 0,
    received: 6_62_334_76,
    tds: 0,
    clientTds: 13_798_64,
    gstTds: 13_798_64,
    retentionReceivable: 61_055_93,
    writtenOff: 0,
    balance: -6_89_932_04,
    overdue: 0,
    advance: 0,
  },
};

export const OTHER_PARTY_BALANCES: PartyBalances = {
  partyType: "other_party",
  items: [
    {
      party: {
        type: "other_party",
        id: OTHER_PARTY_ID,
        name: "Kumaran Consultants",
      },
      assigned: true,
      opening: 0,
      invoiced: 8_000_00,
      billed: 25_000_00,
      paid: 0,
      received: 10_000_00,
      tds: 0,
      clientTds: 0,
      gstTds: 0,
      retentionReceivable: 0,
      writtenOff: 0,
      balance: -7_000_00,
      overdue: 0,
      advance: 0,
    },
  ],
  totals: {
    opening: 0,
    invoiced: 8_000_00,
    billed: 25_000_00,
    paid: 0,
    received: 10_000_00,
    tds: 0,
    clientTds: 0,
    gstTds: 0,
    retentionReceivable: 0,
    writtenOff: 0,
    balance: -7_000_00,
    overdue: 0,
    advance: 0,
  },
};

function settlement(
  patch: Partial<Settlement> & Pick<Settlement, "id">,
): Settlement {
  return {
    amount: 800_00,
    reason: "Short supply agreed with the vendor",
    status: "pending",
    rejectReason: null,
    raisedBy: { userId: "user-karthik", name: "Karthik R" },
    decidedBy: null,
    createdAt: AT,
    decidedAt: null,
    invoice: {
      id: PARTLY_PAID_INVOICE.id,
      party: { type: "supplier", id: SUPPLIER_ID, name: "Chennai Cements" },
      place: PLACE,
      direction: "payable",
      invoiceNumber: PARTLY_PAID_INVOICE.invoiceNumber,
      invoiceDate: PARTLY_PAID_INVOICE.invoiceDate,
      amount: PARTLY_PAID_INVOICE.amount,
      balance: 800_00,
    },
    actions: { approve: true, reject: true },
    ...patch,
  };
}

export const PENDING_SETTLEMENTS: Settlement[] = [
  settlement({ id: "0199f000-0000-7000-8000-000000000011" }),
  settlement({
    id: "0199f000-0000-7000-8000-000000000012",
    amount: 1_500_00,
    reason: "Customer discount",
    invoice: {
      id: SALES_INVOICE.id,
      party: {
        type: "other_party",
        id: OTHER_PARTY_ID,
        name: "Kumaran Consultants",
      },
      place: PLACE,
      direction: "receivable",
      invoiceNumber: SALES_INVOICE.invoiceNumber,
      invoiceDate: SALES_INVOICE.invoiceDate,
      amount: SALES_INVOICE.amount,
      balance: 1_500_00,
    },
  }),
];

export const DECIDED_SETTLEMENTS: Settlement[] = [
  settlement({
    id: "0199f000-0000-7000-8000-000000000013",
    status: "rejected",
    rejectReason: "Collect the balance",
    decidedBy: { userId: "user-owner", name: "Arun Selva Kumar" },
    decidedAt: AT,
    actions: { approve: false, reject: false },
  }),
];

export const WORKSPACE_BALANCES: WorkspacePartyBalances = {
  partyType: "other_party",
  items: [
    {
      party: {
        type: "other_party",
        id: OTHER_PARTY_ID,
        name: "Kumaran Consultants",
      },
      balance: -7_000_00,
      projects: [
        { id: PROJECT_ID, name: "Tower A", balance: -10_000_00 },
        { id: OTHER_PROJECT_ID, name: "Tower B", balance: 3_000_00 },
      ],
    },
    {
      party: {
        type: "other_party",
        id: "0199a000-0000-7000-8000-0000000000d4",
        name: "Lakshmi Scrap Traders",
      },
      balance: 0,
      projects: [],
    },
  ],
  totals: { owedByCompany: 0, owedToCompany: 7_000_00, net: -7_000_00 },
};

const API = "/api/construction/finance";

/**
 * Answers every party money read (and the shared finance lookups);
 * `overrides` answer first, for writes and refusals.
 */
export function partyMoneyHandler(
  overrides: (call: ApiCall) => Response | undefined = () => undefined,
  options: {
    access?: FinanceAccess;
    empty?: boolean;
  } = {},
) {
  // Remarks and files of invoices and payments (the finance document thread).
  const documents = mockFinanceDocumentApi();
  return (call: ApiCall): Response | undefined => {
    const answered = overrides(call);
    if (answered != null) return answered;
    const thread = documents(call);
    if (thread != null) return thread;
    const path = call.path;
    const query = new URL(path, "http://storybook.local").searchParams;
    if (call.method !== "GET") return undefined;
    if (path.startsWith(`${API}/access`))
      return Response.json(options.access ?? FULL_ACCESS);
    if (
      path.startsWith(`${API}/counterparties/options`) &&
      query.get("kind") === "client"
    )
      return Response.json({
        items: [{ id: CLIENT_ID, name: "Tamil Nadu Housing Board" }],
      });
    if (
      path.startsWith(`${API}/counterparties/options`) &&
      query.get("kind") === "other_party"
    )
      return Response.json({
        items: [{ id: OTHER_PARTY_ID, name: "Kumaran Consultants" }],
      });
    if (path.startsWith(`${API}/party-balances`))
      return Response.json(
        options.empty === true
          ? {
              partyType: "other_party",
              items: [],
              totals: { owedByCompany: 0, owedToCompany: 0, net: 0 },
            }
          : WORKSPACE_BALANCES,
      );
    if (path.startsWith(`${API}/settlements`)) {
      if (options.empty === true) return Response.json({ items: [] });
      const status = query.get("status") ?? "pending";
      return Response.json({
        items:
          status === "pending"
            ? PENDING_SETTLEMENTS
            : DECIDED_SETTLEMENTS.filter((item) => item.status === status),
      });
    }
    const lookups = financeLookupsHandler(call);
    if (lookups != null) return lookups;
    if (path.startsWith(`${API}/parties/form-options`))
      return Response.json({
        departments: [
          { id: "0199a000-0000-7000-8000-0000000000e1", name: "RCC" },
          { id: "0199a000-0000-7000-8000-0000000000e2", name: "Plumbing" },
        ],
      });
    if (
      path.startsWith(`${API}/parties`) &&
      query.get("partyType") === "client"
    )
      return Response.json(
        options.empty === true
          ? { ...CLIENT_BALANCES, items: [] }
          : CLIENT_BALANCES,
      );
    if (
      path.startsWith(`${API}/parties`) &&
      query.get("partyType") === "other_party"
    )
      return Response.json(
        options.empty === true
          ? { ...OTHER_PARTY_BALANCES, items: [] }
          : OTHER_PARTY_BALANCES,
      );
    if (path.startsWith(`${API}/parties`)) {
      const type =
        query.get("partyType") === "contractor" ? "contractor" : "supplier";
      return Response.json(
        options.empty === true
          ? { partyType: type, items: [], totals: balances(type).totals }
          : balances(type),
      );
    }
    if (path.startsWith(`${API}/invoices/awaiting-goods-receipts`))
      return Response.json({
        items: options.empty === true ? [] : AWAITING_GRNS,
      });
    if (path.startsWith(`${API}/invoices/outstanding`))
      return Response.json({
        items:
          options.empty === true
            ? []
            : query.get("partyType") === "contractor"
              ? [CONTRACTOR_INVOICE]
              : query.get("partyType") === "client"
                ? [CLIENT_INVOICE]
                : query.get("direction") === "receivable"
                  ? [SALES_INVOICE]
                  : [OVERDUE_INVOICE, PARTLY_PAID_INVOICE],
      });
    const one = /^\/api\/construction\/finance\/invoices\/([^/?]+)$/.exec(
      path.split("?")[0] ?? "",
    );
    if (one != null) {
      const found = [
        ...SUPPLIER_INVOICES,
        CONTRACTOR_INVOICE,
        SALES_INVOICE,
        CLIENT_INVOICE,
      ].find((item) => item.id === one[1]);
      return found == null
        ? Response.json(
            { code: "INVOICE_NOT_FOUND", message: "Not found" },
            { status: 404 },
          )
        : Response.json(found);
    }
    if (path.startsWith(`${API}/invoices`))
      return Response.json({
        items: options.empty === true ? [] : SUPPLIER_INVOICES,
        nextCursor: null,
        prevCursor: null,
        total: options.empty === true ? 0 : SUPPLIER_INVOICES.length,
      });
    const payment =
      /^\/api\/construction\/finance\/party-payments\/([^/?]+)$/.exec(
        path.split("?")[0] ?? "",
      );
    if (payment != null) return Response.json(CONTRACTOR_PAYMENT);
    if (path.startsWith(`${API}/party-payments`))
      return Response.json({
        items: options.empty === true ? [] : [CONTRACTOR_PAYMENT],
        nextCursor: null,
        prevCursor: null,
        total: options.empty === true ? 0 : 1,
      });
    if (path.startsWith(`${API}/party-statements`))
      return Response.json(
        options.empty === true
          ? { ...SUPPLIER_STATEMENT, lines: [], closing: 0, openInvoices: [] }
          : SUPPLIER_STATEMENT,
      );
    if (path.startsWith(`${API}/party-openings`))
      return Response.json({
        items: options.empty === true ? [] : [SUPPLIER_OPENING],
      });
    if (path.startsWith(`${API}/tds`)) return Response.json(TDS_LEDGER);
    return undefined;
  };
}
