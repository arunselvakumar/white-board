import type { ApiCall } from "../../../.storybook/mocks/api";
import type { FinanceAccess } from "@/src/queries/finance-access";
import type {
  OtherExpense,
  OtherExpensePage,
} from "@/src/queries/finance-other-expenses";
import { FLAGS } from "@/src/shared-kernel/access";

import { ACCOUNT_OPTIONS, PAYMENT_CATEGORY_OPTIONS } from "../account-fixtures";

/** Story data for a Project's Other Expenses (CM-704). Amounts are paise. */

export const PROJECT_ID = "0199a000-0000-7000-8000-0000000000b1";
export const TODAY = "2026-10-11";

const AT = "2026-10-10T06:30:00.000Z";

const [CASH, BANK, PETTY] = ACCOUNT_OPTIONS;
const [CONVEYANCE, FUEL, SITE] = PAYMENT_CATEGORY_OPTIONS;

function account(option: (typeof ACCOUNT_OPTIONS)[number] | undefined) {
  if (option == null) throw new Error("fixture account");
  return { id: option.id, name: option.name, kind: option.kind };
}

function category(option: { id: string; name: string } | undefined) {
  if (option == null) throw new Error("fixture category");
  return option;
}

const ALL_ACTIONS = { edit: true, delete: true, approve: true, reject: true };

export const TEA_EXPENSE: OtherExpense = {
  id: "0199a000-0000-7000-8000-0000000000e1",
  number: "EXP/26-27/00001",
  projectId: PROJECT_ID,
  projectName: "Tower A",
  expenseDate: "2026-10-10",
  paymentCategory: category(SITE),
  payeeName: "Tea stall",
  account: account(CASH),
  mode: "cash",
  reference: null,
  amount: 45_000,
  description: "Tea for the slab pour crew",
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  rejectReason: null,
  createdBy: { id: "user-owner", name: "Arun Selva Kumar" },
  createdAt: AT,
  updatedAt: AT,
  actions: ALL_ACTIONS,
};

export const DIESEL_EXPENSE: OtherExpense = {
  ...TEA_EXPENSE,
  id: "0199a000-0000-7000-8000-0000000000e2",
  number: "EXP/26-27/00002",
  expenseDate: "2026-10-09",
  paymentCategory: category(FUEL),
  payeeName: "Indian Oil, Guindy",
  account: account(BANK),
  mode: "upi",
  reference: "UPI 4412 9981",
  amount: 1_250_000,
  description: "Diesel for the generator",
  status: "approved",
  decidedBy: { id: "user-owner", name: "Arun Selva Kumar" },
  decidedAt: AT,
  actions: { edit: true, delete: true, approve: false, reject: false },
};

export const AUTO_EXPENSE: OtherExpense = {
  ...TEA_EXPENSE,
  id: "0199a000-0000-7000-8000-0000000000e3",
  number: "EXP/26-27/00003",
  paymentCategory: category(CONVEYANCE),
  payeeName: "Auto to the cement depot",
  account: account(PETTY),
  amount: 30_000,
  description: null,
  status: "rejected",
  decidedBy: { id: "user-owner", name: "Arun Selva Kumar" },
  decidedAt: AT,
  rejectReason: "No bill attached",
  actions: { edit: true, delete: true, approve: false, reject: false },
};

export function expensePage(items: OtherExpense[]): OtherExpensePage {
  const sum = (status?: OtherExpense["status"]) =>
    items
      .filter((item) => status == null || item.status === status)
      .reduce((total, item) => total + item.amount, 0);
  return {
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    totals: {
      amount: sum(),
      approved: sum("approved"),
      pending: sum("pending"),
      rejected: sum("rejected"),
    },
  };
}

/** The finance access answer: every flag on Other Expenses, or `flags`. */
export function financeAccessHandler(
  call: ApiCall,
  flags: readonly (typeof FLAGS)[number][] = FLAGS,
): Response | undefined {
  if (
    call.method !== "GET" ||
    !call.path.startsWith("/api/construction/finance/access")
  )
    return undefined;
  const access: FinanceAccess = {
    projectId: PROJECT_ID,
    menus: {
      "finance.central_payment": [],
      "finance.payments": [],
      "finance.transactions": [],
      "finance.parties": [],
      "finance.petty_cash": [],
      "finance.other_expenses": [...flags],
      "masters.bank_accounts": [],
      "masters.payment_categories": [],
      "masters.other_parties": [],
      "masters.contractors": [],
      "masters.suppliers": [],
      "labour.labour": [],
      "labour.vendor": [],
    },
  };
  return Response.json(access);
}
