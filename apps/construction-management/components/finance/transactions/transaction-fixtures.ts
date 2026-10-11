import type { ApiCall } from "../../../.storybook/mocks/api";
import {
  financeLookupsHandler,
  ACCOUNT_OPTIONS,
} from "@/components/finance/account-fixtures";
import {
  financeAccess,
  financeAccessHandler,
} from "@/components/finance/accounts/account-list-fixtures";
import type { FinanceAccess } from "@/src/queries/finance-access";
import type {
  RegisterItem,
  Transaction,
  TransactionPage,
  Transfer,
} from "@/src/queries/finance-transactions";

/** Story fixtures for the Transactions register (CM-702). */

export const STORY_TODAY = "2026-10-11";
export const PROJECT_ID = "0199a000-0000-7000-8000-00000000f001";

const [CASH, BANK, PETTY] = ACCOUNT_OPTIONS as [
  (typeof ACCOUNT_OPTIONS)[number],
  (typeof ACCOUNT_OPTIONS)[number],
  (typeof ACCOUNT_OPTIONS)[number],
];

const ALL_ACTIONS = { approve: true, reject: true, edit: true, delete: true };
const DECIDED = { approve: false, reject: false, edit: true, delete: true };

function transaction(n: number, extra: Partial<Transaction> = {}): Transaction {
  const at = `2026-10-0${String(n)}T05:30:00.000Z`;
  return {
    type: "transaction",
    id: `0199a000-0000-7000-8000-0000000010${String(n).padStart(2, "0")}`,
    number: `TXN/26-27/0000${String(n)}`,
    projectId: PROJECT_ID,
    projectName: "Green Meadows",
    storeId: null,
    storeName: null,
    transactionDate: `2026-10-0${String(n)}`,
    direction: "payment_out",
    account: { id: BANK.id, name: BANK.name, kind: "bank" },
    paymentCategoryId: "0199a000-0000-7000-8000-0000000000c3",
    paymentCategoryName: "Site Expenses",
    mode: "online",
    chequeNumber: null,
    reference: `UTR00${String(n)}`,
    modeDate: null,
    counterparty: { kind: null, id: null, name: "HDFC Bank" },
    amount: 1_250_00,
    description: "Quarterly charges",
    approvalStatus: "pending",
    rejectReason: null,
    decidedAt: null,
    decidedByName: null,
    importBatchId: null,
    createdAt: at,
    createdByName: "Arun Selva Kumar",
    updatedAt: at,
    actions: ALL_ACTIONS,
    ...extra,
  };
}

export const PENDING_OUT = transaction(1, {
  mode: "cheque",
  chequeNumber: "000123",
  reference: null,
  modeDate: "2026-10-01",
  counterparty: {
    kind: "contractor",
    id: "0199a000-0000-7000-8000-0000000000d1",
    name: "Sri Murugan Builders",
  },
  amount: 25_000_00,
  description: "Advance for scaffolding",
});

export const APPROVED_IN = transaction(2, {
  direction: "payment_in",
  account: { id: CASH.id, name: CASH.name, kind: "cash" },
  mode: "cash",
  reference: null,
  counterparty: { kind: null, id: null, name: "Owner's capital" },
  paymentCategoryId: null,
  paymentCategoryName: null,
  amount: 1_00_000_00,
  approvalStatus: "approved",
  decidedAt: "2026-10-02T06:00:00.000Z",
  decidedByName: "Arun Selva Kumar",
  actions: DECIDED,
});

export const REJECTED_OUT = transaction(3, {
  amount: 4_500_00,
  approvalStatus: "rejected",
  rejectReason: "Wrong account",
  decidedAt: "2026-10-03T06:00:00.000Z",
  decidedByName: "Arun Selva Kumar",
  actions: DECIDED,
});

export const PENDING_TRANSFER: Transfer = {
  type: "transfer",
  id: "0199a000-0000-7000-8000-000000001101",
  number: "TXN/26-27/00004",
  projectId: PROJECT_ID,
  projectName: "Green Meadows",
  transferDate: "2026-10-04",
  fromAccount: { id: BANK.id, name: BANK.name, kind: "bank" },
  toAccount: { id: PETTY.id, name: PETTY.name, kind: "petty_cash" },
  mode: "upi",
  reference: "UPI-7781",
  amount: 10_000_00,
  description: "Site float for Ravi",
  approvalStatus: "pending",
  rejectReason: null,
  decidedAt: null,
  decidedByName: null,
  createdAt: "2026-10-04T05:30:00.000Z",
  createdByName: "Arun Selva Kumar",
  updatedAt: "2026-10-04T05:30:00.000Z",
  actions: ALL_ACTIONS,
};

export const REGISTER: RegisterItem[] = [
  PENDING_TRANSFER,
  REJECTED_OUT,
  APPROVED_IN,
  PENDING_OUT,
];

function page(items: RegisterItem[]): TransactionPage {
  const counted = items.filter((item) => item.approvalStatus !== "rejected");
  const sum = (pick: (item: RegisterItem) => boolean) =>
    counted.filter(pick).reduce((total, item) => total + item.amount, 0);
  return {
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    totals: {
      in: sum(
        (item) =>
          item.type === "transaction" && item.direction === "payment_in",
      ),
      out: sum(
        (item) =>
          item.type === "transaction" && item.direction === "payment_out",
      ),
      transfer: sum((item) => item.type === "transfer"),
    },
  };
}

type Body = Record<string, unknown> & {
  reference?: string | null;
  chequeNumber?: string | null;
  confirmDuplicateReference?: boolean;
  approve?: boolean;
  amount?: number;
  reason?: string;
  items?: { type: string; id: string }[];
};

/**
 * An in-memory Transactions API plus the finance lookups and access. A
 * reference of `UTR555` is refused with `DUPLICATE_REFERENCE` unless
 * confirmed; `importErrors` makes the import fail with those rows.
 */
export function transactionsHandler(
  options: {
    initial?: RegisterItem[];
    access?: FinanceAccess;
    importErrors?: { row: number; field: string; message: string }[];
  } = {},
) {
  let items = [...(options.initial ?? REGISTER)];
  const access = options.access ?? financeAccess(undefined, PROJECT_ID);
  return (call: ApiCall): Response | undefined => {
    const shared =
      financeAccessHandler(call, access) ?? financeLookupsHandler(call);
    if (shared != null) return shared;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    const body = (call.body ?? {}) as Body;
    if (
      call.method === "GET" &&
      path === "/api/construction/finance/transactions"
    ) {
      const type = url.searchParams.get("type");
      const status = url.searchParams.get("approvalStatus");
      return Response.json(
        page(
          items.filter(
            (item) =>
              (type == null ||
                (type === "transfer"
                  ? item.type === "transfer"
                  : item.type === "transaction" &&
                    item.direction ===
                      (type === "in" ? "payment_in" : "payment_out"))) &&
              (status == null || item.approvalStatus === status),
          ),
        ),
      );
    }
    const detail =
      /^\/api\/construction\/finance\/(transactions|transfers)\/([0-9a-f-]{36})$/.exec(
        path,
      );
    if (call.method === "GET" && detail != null) {
      const found = items.find((item) => item.id === detail[2]);
      return found == null
        ? Response.json(
            { code: "TRANSACTION_NOT_FOUND", message: "Not found" },
            { status: 404 },
          )
        : Response.json(found);
    }
    if (call.method !== "POST") return undefined;
    if (path === "/api/construction/finance/transactions/bulk") {
      const chosen = items.filter((item) =>
        (body.items ?? []).some((entry) => entry.id === item.id),
      );
      if (chosen.some((item) => item.approvalStatus !== "pending"))
        return Response.json(
          {
            code: "BULK_DECISION_REFUSED",
            message: "One of them cannot be decided; nothing was changed.",
          },
          { status: 409 },
        );
      const status: RegisterItem["approvalStatus"] =
        body.approve === true ? "approved" : "rejected";
      items = items.map((item) =>
        chosen.includes(item)
          ? {
              ...item,
              approvalStatus: status,
              rejectReason: body.reason ?? null,
              actions: DECIDED,
            }
          : item,
      );
      return Response.json({ decided: chosen.length });
    }
    if (path === "/api/construction/finance/transactions/import") {
      if (options.importErrors != null)
        return Response.json(
          {
            code: "IMPORT_HAS_ERRORS",
            message: `${String(options.importErrors.length)} problems; nothing was imported.`,
            details: { errors: options.importErrors },
          },
          { status: 400 },
        );
      return Response.json(
        { imported: 3, importBatchId: "0199a000-0000-7000-8000-0000000012aa" },
        { status: 201 },
      );
    }
    const reference = body.chequeNumber ?? body.reference ?? "";
    if (
      (path.endsWith("/transactions") || path.endsWith("/transfers")) &&
      reference.replace(/\s/g, "").toUpperCase() === "UTR555" &&
      body.confirmDuplicateReference !== true
    )
      return Response.json(
        {
          code: "DUPLICATE_REFERENCE",
          message:
            "UTR555 is already on Transaction TXN/26-27/00002 of this account. Save anyway if it is right.",
          details: { field: "reference" },
        },
        { status: 409 },
      );
    if (path === "/api/construction/finance/transactions") {
      const created = transaction(5, {
        id: "0199a000-0000-7000-8000-000000001099",
        number: "TXN/26-27/00005",
        amount: body.amount ?? 0,
        approvalStatus: body.approve === true ? "approved" : "pending",
      });
      items = [created, ...items];
      return Response.json(created, { status: 201 });
    }
    if (path === "/api/construction/finance/transfers") {
      const created: Transfer = {
        ...PENDING_TRANSFER,
        id: "0199a000-0000-7000-8000-000000001199",
        number: "TXN/26-27/00006",
        amount: body.amount ?? 0,
      };
      items = [created, ...items];
      return Response.json(created, { status: 201 });
    }
    const action =
      /^\/api\/construction\/finance\/(transactions|transfers)\/([0-9a-f-]{36})\/([a-z]+)$/.exec(
        path,
      );
    if (action == null) return undefined;
    const target = items.find((item) => item.id === action[2]);
    if (target == null) return undefined;
    const verb = action[3];
    if (verb === "delete") {
      items = items.filter((item) => item !== target);
      return new Response(null, { status: 204 });
    }
    const patch: Pick<RegisterItem, "approvalStatus" | "actions"> &
      Partial<Pick<RegisterItem, "rejectReason" | "amount">> =
      verb === "approve"
        ? { approvalStatus: "approved", actions: DECIDED }
        : verb === "reject"
          ? {
              approvalStatus: "rejected",
              rejectReason: body.reason ?? null,
              actions: DECIDED,
            }
          : {
              approvalStatus: body.approve === true ? "approved" : "pending",
              amount: body.amount ?? target.amount,
              actions: ALL_ACTIONS,
            };
    const next: RegisterItem = { ...target, ...patch };
    items = items.map((item) => (item === target ? next : item));
    return Response.json(next);
  };
}
