import type { ApiCall } from "../../../.storybook/mocks/api";
import type { FinanceAccess } from "@/src/queries/finance-access";
import type {
  AccountStatement,
  CompanyAccount,
} from "@/src/queries/finance-accounts";

/** Story fixtures for Company's Bank A/C (CM-701) and the finance access read. */

const AT = "2026-10-08T06:30:00.000Z";

export const STORY_TODAY = "2026-10-11";

export const CASH_ID = "0199a000-0000-7000-8000-000000000001";
export const BANK_ID = "0199a000-0000-7000-8000-000000000002";
export const SBI_ID = "0199a000-0000-7000-8000-000000000004";

export const COMPANY_ACCOUNTS: CompanyAccount[] = [
  {
    id: CASH_ID,
    kind: "cash",
    name: "Company's Cash Account",
    bankName: null,
    accountNumber: null,
    ifsc: null,
    branch: null,
    isPrimary: true,
    isSeed: true,
    openingBalance: 0,
    openingDate: "2026-04-01",
    balance: -12_500_00,
    pending: { count: 0, total: 0 },
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: BANK_ID,
    kind: "bank",
    name: "HDFC Current A/c",
    bankName: "HDFC Bank",
    accountNumber: "50100123456789",
    ifsc: "HDFC0001234",
    branch: "Anna Nagar",
    isPrimary: false,
    isSeed: true,
    openingBalance: 5_00_000_00,
    openingDate: "2026-04-01",
    balance: 4_62_350_00,
    pending: { count: 2, total: -37_650_00 },
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: SBI_ID,
    kind: "bank",
    name: "SBI Savings",
    bankName: "State Bank of India",
    accountNumber: "30214567890",
    ifsc: "SBIN0000456",
    branch: "T. Nagar",
    isPrimary: false,
    isSeed: false,
    openingBalance: 0,
    openingDate: "2026-10-01",
    balance: 0,
    pending: { count: 0, total: 0 },
    createdAt: AT,
    updatedAt: AT,
  },
];

const ALL_FLAGS = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "report",
  "notification",
  "view_all",
] as const;

/** Every finance flag (the Owner), or only `flags` on every finance menu. */
export function financeAccess(
  flags: readonly (typeof ALL_FLAGS)[number][] = ALL_FLAGS,
  projectId: string | null = null,
): FinanceAccess {
  const menus = Object.fromEntries(
    [
      "finance.central_payment",
      "finance.payments",
      "finance.transactions",
      "finance.parties",
      "finance.petty_cash",
      "finance.other_expenses",
      "masters.bank_accounts",
      "masters.payment_categories",
      "masters.other_parties",
      "masters.contractors",
      "masters.suppliers",
      "labour.labour",
      "labour.vendor",
    ].map((menu) => [menu, [...flags]]),
  ) as FinanceAccess["menus"];
  return { projectId, menus };
}

export function financeAccessHandler(
  call: ApiCall,
  access: FinanceAccess = financeAccess(),
): Response | undefined {
  if (
    call.method === "GET" &&
    call.path.startsWith("/api/construction/finance/access")
  )
    return Response.json(access);
  return undefined;
}

type AccountBody = {
  kind?: string;
  name?: string;
  bankName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  openingBalance?: number;
  openingDate?: string;
};

/**
 * An in-memory Company's Bank A/C API: list, add, edit, Set As Primary
 * and delete (refused with `ACCOUNT_IN_USE` for the names in `inUse`).
 */
export function companyAccountsHandler(
  options: {
    initial?: CompanyAccount[];
    inUse?: string[];
    access?: FinanceAccess;
  } = {},
) {
  let accounts = [...(options.initial ?? COMPANY_ACCOUNTS)];
  return (call: ApiCall): Response | undefined => {
    const access = financeAccessHandler(call, options.access);
    if (access != null) return access;
    const base = "/api/construction/finance/accounts";
    if (call.method === "GET" && call.path === base)
      return Response.json({ items: accounts });
    if (call.method === "POST" && call.path === base) {
      const body = call.body as AccountBody;
      if (body.ifsc === "HDFC0000000")
        return Response.json(
          {
            code: "IFSC_INVALID",
            message:
              "An IFSC is four letters, a zero, then six letters or digits (like HDFC0001234).",
          },
          { status: 400 },
        );
      const [, , template] = COMPANY_ACCOUNTS;
      if (template == null) return undefined;
      const created: CompanyAccount = {
        ...template,
        id: `0199a000-0000-7000-8000-0000000001${String(accounts.length).padStart(2, "0")}`,
        kind: body.kind === "cash" ? "cash" : "bank",
        name: String(body.name),
        bankName: body.bankName ?? null,
        accountNumber: body.accountNumber ?? null,
        ifsc: body.ifsc ?? null,
        branch: body.branch ?? null,
        isPrimary: false,
        openingBalance: Number(body.openingBalance),
        balance: Number(body.openingBalance),
        openingDate: String(body.openingDate),
      };
      accounts = [...accounts, created];
      return Response.json(created, { status: 201 });
    }
    const match =
      /^\/api\/construction\/finance\/accounts\/([^/?]+)\/([a-z-]+)$/.exec(
        call.path,
      );
    if (call.method !== "POST" || match == null) return undefined;
    const [, id, action] = match;
    const account = accounts.find((item) => item.id === id);
    if (account == null)
      return Response.json(
        {
          code: "ACCOUNT_NOT_FOUND",
          message: "That account no longer exists.",
        },
        { status: 404 },
      );
    if (action === "set-primary") {
      accounts = accounts.map((item) => ({
        ...item,
        isPrimary: item.id === id,
      }));
      return Response.json(accounts.find((item) => item.id === id));
    }
    if (action === "delete") {
      if ((options.inUse ?? []).includes(account.name))
        return Response.json(
          {
            code: "ACCOUNT_IN_USE",
            message:
              "Money has moved through this account, so it cannot be deleted.",
          },
          { status: 409 },
        );
      accounts = accounts.filter((item) => item.id !== id);
      return new Response(null, { status: 204 });
    }
    if (action === "update") {
      const body = call.body as AccountBody;
      const next = { ...account, name: String(body.name) };
      accounts = accounts.map((item) => (item.id === id ? next : item));
      return Response.json(next);
    }
    return undefined;
  };
}

export const STATEMENT: AccountStatement = {
  account: {
    id: BANK_ID,
    name: "HDFC Current A/c",
    kind: "bank",
    holderName: null,
  },
  from: "2026-10-01",
  to: STORY_TODAY,
  opening: 5_00_000_00,
  entries: [
    {
      id: "0199a000-0000-7000-8000-0000000002e1",
      entryDate: "2026-10-03",
      kind: "payment",
      amount: -25_000_00,
      balance: 4_75_000_00,
      sourceType: "transaction",
      sourceId: "0199a000-0000-7000-8000-0000000003e1",
      documentNumber: "TXN/26-27/00004",
      counterpartyName: "Sri Murugan Builders",
      mode: "cheque",
      reference: "000123",
      paymentCategoryName: "Site Expenses",
      projectName: "Green Meadows",
      narration: "Advance for scaffolding",
      isReversal: false,
    },
    {
      id: "0199a000-0000-7000-8000-0000000002e2",
      entryDate: "2026-10-05",
      kind: "transfer_out",
      amount: -12_650_00,
      balance: 4_62_350_00,
      sourceType: "account_transfer",
      sourceId: "0199a000-0000-7000-8000-0000000003e2",
      documentNumber: "TXN/26-27/00005",
      counterpartyName: "Company's Cash Account",
      mode: "online",
      reference: "UTR9988",
      paymentCategoryName: null,
      projectName: null,
      narration: "Transfer to Company's Cash Account",
      isReversal: false,
    },
  ],
  totalIn: 0,
  totalOut: 37_650_00,
  closing: 4_62_350_00,
};

export function statementHandler(
  call: ApiCall,
  statement: AccountStatement = STATEMENT,
): Response | undefined {
  if (call.method === "GET" && /\/accounts\/[^/]+\/statement/.test(call.path)) {
    const url = new URL(call.path, "http://storybook.local");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return Response.json({
      ...statement,
      from: from ?? statement.from,
      to: to ?? statement.to,
      entries: statement.entries.filter(
        (line) =>
          (from == null || line.entryDate >= from) &&
          (to == null || line.entryDate <= to),
      ),
    });
  }
  return undefined;
}
