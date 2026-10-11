import type { ApiCall } from "../../../.storybook/mocks/api";
import { financeLookupsHandler } from "@/components/finance/account-fixtures";
import { mockFinanceDocumentApi } from "@/components/finance/documents/finance-document-fixtures";
import { financeAccessHandler } from "@/components/finance/payment-categories/payment-category-fixtures";
import type {
  AccountStatement,
  PettyCashAccount,
  PettyCashVoucher,
} from "@/src/queries/finance-petty-cash";
import type { Flag } from "@/src/shared-kernel/access";

/** Story fixtures for Petty Cash (CM-703). */

export const STORY_PROJECT_ID = "0199a000-0000-7000-8000-00000000b001";

const AT = "2026-10-08T06:30:00.000Z";
const LATER = "2026-10-08T07:00:00.000Z";

export const RAVI_ACCOUNT: PettyCashAccount = {
  id: "0199a000-0000-7000-8000-000000000003",
  name: "Petty cash — Ravi Kumar",
  holderMemberId: "0199a000-0000-7000-8000-0000000000a1",
  holderName: "Ravi Kumar",
  isOwn: true,
  openingDate: "2026-10-01",
  balance: 4_250_00,
  pendingTotal: -1_200_00,
  pendingCount: 2,
  lastVoucherDate: "2026-10-08",
  canClose: false,
};

export const MEENA_ACCOUNT: PettyCashAccount = {
  id: "0199a000-0000-7000-8000-000000000004",
  name: "Petty cash — Meena S",
  holderMemberId: "0199a000-0000-7000-8000-0000000000a2",
  holderName: "Meena S",
  isOwn: false,
  openingDate: "2026-10-01",
  balance: -350_00,
  pendingTotal: 0,
  pendingCount: 0,
  lastVoucherDate: "2026-10-06",
  canClose: false,
};

export const EMPTY_ACCOUNT: PettyCashAccount = {
  id: "0199a000-0000-7000-8000-000000000005",
  name: "Petty cash — Suresh P",
  holderMemberId: "0199a000-0000-7000-8000-0000000000a3",
  holderName: "Suresh P",
  isOwn: false,
  openingDate: "2026-10-01",
  balance: 0,
  pendingTotal: 0,
  pendingCount: 0,
  lastVoucherDate: null,
  canClose: true,
};

const ALL_ACTIONS = { edit: true, delete: true, approve: true, reject: true };

function voucher(
  n: number,
  extra: Partial<PettyCashVoucher> = {},
): PettyCashVoucher {
  return {
    id: `0199a000-0000-7000-8000-0000000c00${String(n).padStart(2, "0")}`,
    number: `PC/26-27/000${String(n).padStart(2, "0")}`,
    accountId: RAVI_ACCOUNT.id,
    accountName: RAVI_ACCOUNT.name,
    voucherType: "payment",
    voucherDate: "2026-10-08",
    projectId: STORY_PROJECT_ID,
    projectName: "Green Meadows",
    counterparty: { kind: null, id: null, name: "Sri Murugan Fuels" },
    toAccountId: null,
    toAccountName: null,
    paymentCategoryId: "0199a000-0000-7000-8000-0000000000c2",
    paymentCategoryName: "Fuel",
    amount: 700_00,
    paidFor: "Diesel for the mixer",
    reference: "B-1182",
    description: null,
    approvalStatus: "pending",
    decidedAt: null,
    decidedByName: null,
    rejectReason: null,
    fileCount: 1,
    createdAt: AT,
    createdBy: "user-ravi",
    createdByName: "Ravi Kumar",
    updatedAt: AT,
    actions: ALL_ACTIONS,
    ...extra,
  };
}

export const STORY_VOUCHERS: PettyCashVoucher[] = [
  voucher(12),
  voucher(11, {
    voucherType: "receipt",
    amount: 2_000_00,
    counterparty: {
      kind: "team_member",
      id: "0199a000-0000-7000-8000-0000000000a1",
      name: "Ravi Kumar",
    },
    paymentCategoryName: "Site Expenses",
    paidFor: "Cash for the week",
    approvalStatus: "approved",
    decidedByName: "Arun Selva Kumar",
    actions: { ...ALL_ACTIONS, approve: false, reject: false },
    fileCount: 0,
  }),
  voucher(10, {
    voucherType: "transfer",
    amount: 500_00,
    counterparty: { kind: null, id: null, name: null },
    toAccountId: "0199a000-0000-7000-8000-000000000001",
    toAccountName: "Company's Cash Account",
    paymentCategoryId: null,
    paymentCategoryName: null,
    paidFor: null,
    voucherDate: "2026-10-05",
    actions: ALL_ACTIONS,
    fileCount: 0,
  }),
  voucher(9, {
    amount: 300_00,
    paidFor: "Tea for the crew",
    counterparty: { kind: null, id: null, name: "Tea stall" },
    paymentCategoryName: "Site Expenses",
    approvalStatus: "rejected",
    rejectReason: "No bill attached",
    decidedByName: "Arun Selva Kumar",
    actions: { ...ALL_ACTIONS, approve: false, reject: false },
    voucherDate: "2026-10-04",
    fileCount: 0,
  }),
];

export const STORY_STATEMENT: AccountStatement = {
  account: { id: RAVI_ACCOUNT.id, name: RAVI_ACCOUNT.name, kind: "petty_cash" },
  from: "2026-10-01",
  to: "2026-10-31",
  opening: 3_000_00,
  entries: [
    {
      id: "e1",
      entryDate: "2026-10-02",
      kind: "receipt",
      amount: 2_000_00,
      balance: 5_000_00,
      sourceType: "petty_cash_voucher",
      sourceId: "v11",
      documentNumber: "PC/26-27/00011",
      counterpartyName: "Arun Selva Kumar",
      mode: "cash",
      reference: null,
      paymentCategoryName: "Site Expenses",
      projectName: "Green Meadows",
      narration: "Cash for the week",
      isReversal: false,
    },
    {
      id: "e2",
      entryDate: "2026-10-05",
      kind: "payment",
      amount: -750_00,
      balance: 4_250_00,
      sourceType: "petty_cash_voucher",
      sourceId: "v8",
      documentNumber: "PC/26-27/00008",
      counterpartyName: "Hardware shop",
      mode: "cash",
      reference: "H-22",
      paymentCategoryName: "Hardware",
      projectName: "Green Meadows",
      narration: "Binding wire",
      isReversal: false,
    },
  ],
  totalIn: 2_000_00,
  totalOut: 750_00,
  closing: 4_250_00,
};

export type PettyCashApiOptions = {
  accounts?: PettyCashAccount[];
  vouchers?: PettyCashVoucher[];
  viewAll?: boolean;
  /** Petty Cash flags; every flag by default. */
  flags?: Flag[];
  statement?: AccountStatement;
  /** Refuses bulk approve with BULK_DECISION_REFUSED. */
  refuseBulk?: boolean;
  /** Refuses creating a voucher with this error. */
  createError?: { status: number; code: string; message: string };
};

const PETTY = "/api/construction/finance/petty-cash";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * A stateful Petty Cash API for one story, with the finance access, the
 * shared lookups and the document thread: accounts, vouchers (list,
 * detail, create, update, approve, reject, bulk, delete) and the
 * statement. Unknown calls fall through (404 in `mockApi`).
 */
export function pettyCashHandler(
  options: PettyCashApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let accounts = [...(options.accounts ?? [RAVI_ACCOUNT, MEENA_ACCOUNT])];
  let vouchers = [...(options.vouchers ?? STORY_VOUCHERS)];
  const access = financeAccessHandler({
    "finance.petty_cash": options.flags ?? [
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "reject",
      "print",
      "view_all",
    ],
  });
  const documents = mockFinanceDocumentApi({ remarks: [], files: [] });
  let next = 20;
  return (call) => {
    const answered =
      access(call) ?? financeLookupsHandler(call) ?? documents(call);
    if (answered != null) return answered;
    const url = new URL(call.path, "http://storybook.local");
    const path = url.pathname;
    if (
      path.startsWith("/api/construction/finance/accounts/") &&
      path.endsWith("/statement")
    )
      return json(options.statement ?? STORY_STATEMENT);
    if (path === `${PETTY}/accounts`) {
      if (call.method === "GET")
        return json({ items: accounts, viewAll: options.viewAll ?? true });
      const body = call.body as {
        holderMemberId: string;
        openingBalance?: number;
      };
      const opened: PettyCashAccount = {
        ...EMPTY_ACCOUNT,
        id: `0199a000-0000-7000-8000-0000000d00${String((next += 1))}`,
        holderMemberId: body.holderMemberId,
        holderName: "Ravi Kumar",
        name: "Petty cash — Ravi Kumar",
        balance: body.openingBalance ?? 0,
      };
      accounts = [...accounts, opened];
      return json(opened, 201);
    }
    const closed = new RegExp(`^${PETTY}/accounts/([^/]+)/delete$`).exec(path);
    if (closed != null) {
      accounts = accounts.filter((account) => account.id !== closed[1]);
      return new Response(null, { status: 204 });
    }
    if (path === `${PETTY}/vouchers`) {
      if (call.method === "POST") {
        if (options.createError != null)
          return json(
            {
              code: options.createError.code,
              message: options.createError.message,
            },
            options.createError.status,
          );
        const body = call.body as Partial<PettyCashVoucher> & {
          approve?: boolean;
          counterparty?: PettyCashVoucher["counterparty"];
        };
        const created = voucher((next += 1), {
          voucherType: body.voucherType ?? "payment",
          voucherDate: body.voucherDate ?? "2026-10-08",
          amount: body.amount ?? 0,
          counterparty: body.counterparty ?? {
            kind: null,
            id: null,
            name: null,
          },
          paidFor: body.paidFor ?? null,
          approvalStatus: body.approve === true ? "approved" : "pending",
          fileCount: 0,
        });
        vouchers = [created, ...vouchers];
        return json(created, 201);
      }
      const accountId = url.searchParams.get("accountId");
      const status = url.searchParams.get("status");
      const type = url.searchParams.get("type");
      const items = vouchers.filter(
        (item) =>
          (accountId == null || item.accountId === accountId) &&
          (status == null || item.approvalStatus === status) &&
          (type == null || item.voucherType === type),
      );
      const sum = (kind: PettyCashVoucher["voucherType"]) =>
        items
          .filter((item) => item.voucherType === kind)
          .reduce((total, item) => total + item.amount, 0);
      return json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
        totals: {
          payment: sum("payment"),
          receipt: sum("receipt"),
          transfer: sum("transfer"),
        },
      });
    }
    if (call.method === "POST" && path === `${PETTY}/vouchers/bulk-approve`) {
      if (options.refuseBulk === true)
        return json(
          {
            code: "BULK_DECISION_REFUSED",
            message: "One of them cannot be decided; nothing was changed.",
            details: { refusals: [] },
          },
          409,
        );
      const ids = (call.body as { ids: string[] }).ids;
      vouchers = vouchers.map((item) =>
        ids.includes(item.id)
          ? {
              ...item,
              approvalStatus: "approved",
              actions: { ...item.actions, approve: false, reject: false },
            }
          : item,
      );
      return json({ decided: ids.length });
    }
    if (call.method === "POST" && path === `${PETTY}/vouchers/bulk-reject`) {
      const { ids, reason } = call.body as { ids: string[]; reason: string };
      vouchers = vouchers.map((item) =>
        ids.includes(item.id)
          ? {
              ...item,
              approvalStatus: "rejected",
              rejectReason: reason,
              actions: { ...item.actions, approve: false, reject: false },
            }
          : item,
      );
      return json({ decided: ids.length });
    }
    const one = new RegExp(`^${PETTY}/vouchers/([^/]+)(?:/(\\w+))?$`).exec(
      path,
    );
    if (one == null) return undefined;
    const [, id, verb] = one;
    const current = vouchers.find((item) => item.id === id);
    if (current == null)
      return json(
        {
          code: "PETTY_CASH_VOUCHER_NOT_FOUND",
          message: "This petty-cash voucher was not found.",
        },
        404,
      );
    const replace = (changed: PettyCashVoucher) => {
      vouchers = vouchers.map((item) =>
        item.id === changed.id ? changed : item,
      );
      return json(changed);
    };
    switch (verb) {
      case undefined:
        return json(current);
      case "approve":
        return replace({
          ...current,
          approvalStatus: "approved",
          decidedByName: "Arun Selva Kumar",
          updatedAt: LATER,
          actions: { ...current.actions, approve: false, reject: false },
        });
      case "reject":
        return replace({
          ...current,
          approvalStatus: "rejected",
          rejectReason: (call.body as { reason: string }).reason,
          decidedByName: "Arun Selva Kumar",
          updatedAt: LATER,
          actions: { ...current.actions, approve: false, reject: false },
        });
      case "update": {
        const body = call.body as Partial<PettyCashVoucher>;
        return replace({
          ...current,
          ...(body.amount == null ? {} : { amount: body.amount }),
          approvalStatus: "pending",
          rejectReason: null,
          updatedAt: LATER,
          actions: ALL_ACTIONS,
        });
      }
      case "delete":
        vouchers = vouchers.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}
