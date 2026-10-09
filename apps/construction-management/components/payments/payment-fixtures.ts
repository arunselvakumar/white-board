import type {
  PartyBalanceRow,
  PartyBalances,
  PartyStatement,
} from "@/src/queries/balances";
import type {
  PaymentPayers,
  WagePayment,
  WagePaymentPage,
} from "@/src/queries/payments";

/** Story data for the Payments screens (CM-216). Amounts are paise. */

export const PROJECT_ID = "0199a000-0000-7000-8000-000000000001";
export const VILLA_ID = "0199a000-0000-7000-8000-000000000002";
export const TODAY = "2026-09-20";

export const RAJU_ID = "0199a000-0000-7000-8000-0000000000a1";
export const SEEMA_ID = "0199a000-0000-7000-8000-0000000000a2";
export const OWNER_MEMBER = "0199a000-0000-7000-8000-0000000000c1";
export const SUNIL_MEMBER = "0199a000-0000-7000-8000-0000000000c2";

function row(
  partyId: string,
  name: string,
  figures: Omit<
    PartyBalanceRow,
    "partyId" | "name" | "code" | "isActive" | "onProject"
  >,
  extra: Partial<PartyBalanceRow> = {},
): PartyBalanceRow {
  return {
    partyId,
    name,
    code: null,
    isActive: true,
    onProject: true,
    ...figures,
    ...extra,
  };
}

export const RAJU_SEPTEMBER = row(
  RAJU_ID,
  "Raju Pawar",
  {
    previousBalance: 150_000,
    earned: 70_000,
    overtime: 20_000,
    toPay: 90_000,
    advance: 10_000,
    paid: 30_000,
    finalAmount: 200_000,
  },
  { code: "L-07" },
);

export const SEEMA_SEPTEMBER = row(
  SEEMA_ID,
  "Seema Kale",
  {
    previousBalance: 100_000,
    earned: 35_000,
    overtime: 0,
    toPay: 35_000,
    advance: 0,
    paid: 0,
    finalAmount: 135_000,
  },
  { onProject: false },
);

function totals(items: PartyBalanceRow[]): PartyBalances["totals"] {
  const sum = (key: keyof PartyBalances["totals"]) =>
    items.reduce((total, item) => total + (item[key] ?? 0), 0);
  return {
    previousBalance: sum("previousBalance"),
    earned: sum("earned"),
    overtime: sum("overtime"),
    toPay: sum("toPay"),
    advance: sum("advance"),
    paid: sum("paid"),
    finalAmount: sum("finalAmount"),
  };
}

export function balances(
  partyType: PartyBalances["partyType"],
  kind: PartyBalances["kind"],
  from: string,
  to: string,
  items: PartyBalanceRow[],
): PartyBalances {
  return {
    projectId: PROJECT_ID,
    partyType,
    kind,
    from,
    to,
    financial: true,
    items,
    totals: totals(items),
  };
}

export const LABOUR_SEPTEMBER = balances(
  "labour",
  "monthly",
  "2026-09-01",
  "2026-09-30",
  [RAJU_SEPTEMBER, SEEMA_SEPTEMBER],
);

export const LABOUR_WEEK = balances(
  "labour",
  "weekly",
  "2026-09-14",
  "2026-09-20",
  [
    row(RAJU_ID, "Raju Pawar", {
      previousBalance: 200_000,
      earned: 0,
      overtime: 0,
      toPay: 0,
      advance: 0,
      paid: 0,
      finalAmount: 200_000,
    }),
  ],
);

export const NO_VENDORS = balances(
  "vendor",
  "monthly",
  "2026-09-01",
  "2026-09-30",
  [],
);

export const PAYERS: PaymentPayers = {
  items: [
    { id: SUNIL_MEMBER, name: "Sunil Jadhav" },
    { id: OWNER_MEMBER, name: "Ramesh Patil" },
  ],
  currentMemberId: OWNER_MEMBER,
};

export const RAJU_STATEMENT: PartyStatement = {
  partyType: "labour",
  partyId: RAJU_ID,
  name: "Raju Pawar",
  code: "L-07",
  from: "2026-09-01",
  to: "2026-09-30",
  financial: true,
  openingBalance: 150_000,
  closingBalance: 230_000,
  lines: [
    {
      id: "0199a000-0000-7000-8000-0000000000e1",
      date: "2026-09-10",
      kind: "earned",
      amount: 70_000,
      balance: 220_000,
      projectId: PROJECT_ID,
      projectName: "Tower A",
      sourceType: "labour_attendance",
      sourceId: "0199a000-0000-7000-8000-0000000000f1",
      isReversal: false,
      isReversed: false,
      payment: null,
    },
    {
      id: "0199a000-0000-7000-8000-0000000000e2",
      date: "2026-09-11",
      kind: "overtime",
      amount: 20_000,
      balance: 240_000,
      projectId: VILLA_ID,
      projectName: "Villa",
      sourceType: "labour_attendance",
      sourceId: "0199a000-0000-7000-8000-0000000000f2",
      isReversal: false,
      isReversed: false,
      payment: null,
    },
    {
      id: "0199a000-0000-7000-8000-0000000000e3",
      date: "2026-09-12",
      kind: "payment",
      amount: -30_000,
      balance: 210_000,
      projectId: PROJECT_ID,
      projectName: "Tower A",
      sourceType: "wage_payment",
      sourceId: "0199a000-0000-7000-8000-0000000000d1",
      isReversal: false,
      isReversed: false,
      payment: {
        id: "0199a000-0000-7000-8000-0000000000d1",
        mode: "bank",
        reference: "UTR 88231",
        remarks: "First week",
        cancelled: false,
        updatedAt: "2026-09-12T10:00:00.000Z",
        hasReceipt: true,
      },
    },
    {
      id: "0199a000-0000-7000-8000-0000000000e4",
      date: "2026-09-13",
      kind: "advance",
      amount: 20_000,
      balance: 230_000,
      projectId: PROJECT_ID,
      projectName: "Tower A",
      sourceType: "wage_payment",
      sourceId: "0199a000-0000-7000-8000-0000000000d2",
      isReversal: true,
      isReversed: false,
      payment: {
        id: "0199a000-0000-7000-8000-0000000000d2",
        mode: "cash",
        reference: null,
        remarks: null,
        cancelled: true,
        updatedAt: "2026-09-13T10:00:00.000Z",
        hasReceipt: false,
      },
    },
  ],
};

export const EMPTY_STATEMENT: PartyStatement = {
  ...RAJU_STATEMENT,
  openingBalance: 150_000,
  closingBalance: 150_000,
  lines: [],
};

export const RAJU_PAYMENT: WagePayment = {
  id: "0199a000-0000-7000-8000-0000000000d1",
  partyType: "labour",
  partyId: RAJU_ID,
  partyName: "Raju Pawar",
  projectId: PROJECT_ID,
  projectName: "Tower A",
  paymentDate: "2026-09-12",
  kind: "payment",
  mode: "bank",
  reference: "UTR 88231",
  amount: 30_000,
  paidBy: { id: OWNER_MEMBER, name: "Ramesh Patil" },
  remarks: "First week",
  receiptUrl: `/api/construction/labour/payments/0199a000-0000-7000-8000-0000000000d1/receipt?v=1`,
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

export const GANG_ADVANCE: WagePayment = {
  ...RAJU_PAYMENT,
  id: "0199a000-0000-7000-8000-0000000000d3",
  partyType: "vendor",
  partyId: "0199a000-0000-7000-8000-0000000000b1",
  partyName: "Suresh Gang",
  kind: "advance",
  mode: "cash",
  reference: null,
  amount: 500_000,
  remarks: null,
  receiptUrl: null,
  paymentDate: "2026-09-14",
};

export function page(items: WagePayment[]): WagePaymentPage {
  return {
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    totalAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0),
  };
}
