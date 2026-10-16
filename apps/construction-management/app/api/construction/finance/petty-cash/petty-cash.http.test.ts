import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { unzipSync } from "fflate";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { watchEvents } from "@/test/dispatched-events";
import { accountBalance, seededAccounts } from "@/test/finance";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";

import { PDF, uploadFile } from "../documents/document-test-fixtures";
import { POST as closeAccount } from "./accounts/[id]/delete/route";
import { GET as exportReceipts } from "./accounts/[id]/receipts.zip/route";
import { GET as getAccount } from "./accounts/[id]/route";
import { GET as listAccounts, POST as openAccount } from "./accounts/route";
import { POST as approveVoucher } from "./vouchers/[id]/approve/route";
import { POST as deleteVoucher } from "./vouchers/[id]/delete/route";
import { POST as rejectVoucher } from "./vouchers/[id]/reject/route";
import { GET as getVoucher } from "./vouchers/[id]/route";
import { POST as updateVoucher } from "./vouchers/[id]/update/route";
import { POST as bulkApprove } from "./vouchers/bulk-approve/route";
import { POST as bulkReject } from "./vouchers/bulk-reject/route";
import { GET as listVouchers, POST as createVoucher } from "./vouchers/route";

const BASE = `${TEST_ORIGIN}/api/construction/finance/petty-cash`;

type Account = {
  id: string;
  name: string;
  holderMemberId: string;
  holderName: string;
  isOwn: boolean;
  balance: number;
  pendingTotal: number;
  pendingCount: number;
  lastVoucherDate: string | null;
  canClose: boolean;
};

type Voucher = {
  id: string;
  number: string;
  voucherType: string;
  voucherDate: string;
  amount: number;
  approvalStatus: string;
  rejectReason: string | null;
  paymentCategoryName: string | null;
  counterparty: { kind: string | null; id: string | null; name: string | null };
  toAccountName: string | null;
  updatedAt: string;
  actions: {
    edit: boolean;
    delete: boolean;
    approve: boolean;
    reject: boolean;
  };
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function ownerMemberId(company: Company): Promise<string> {
  const row = await prisma.constructionOrganizationTeamMember.findFirst({
    where: { workspaceId: company.workspaceId, userId: company.userId },
    select: { id: true },
  });
  if (row == null) throw new Error("No Owner Team Member");
  return row.id;
}

async function categoryId(workspaceId: string, name = "Fuel") {
  const row = await prisma.constructionFinancePaymentCategory.findFirst({
    where: { workspaceId, name, deletedAt: null },
    select: { id: true },
  });
  if (row == null) throw new Error(`No category ${name}`);
  return row.id;
}

async function open(
  cookie: string,
  body: {
    holderMemberId: string;
    name?: string;
    openingBalance?: number;
    openingDate?: string;
  },
) {
  return openAccount(jsonRequest(`${BASE}/accounts`, cookie, body));
}

async function opened(
  cookie: string,
  holderMemberId: string,
  openingBalance = 0,
) {
  const response = await open(cookie, { holderMemberId, openingBalance });
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Account>(response);
}

async function accounts(cookie: string) {
  const response = await listAccounts(jsonRequest(`${BASE}/accounts`, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<{ items: Account[]; viewAll: boolean }>(response);
}

type VoucherBody = {
  accountId: string;
  voucherType: "payment" | "receipt" | "transfer";
  voucherDate?: string;
  projectId?: string | null;
  amount: number;
  paymentCategoryId?: string | null;
  toAccountId?: string | null;
  counterparty?: {
    kind: string | null;
    id: string | null;
    name: string | null;
  };
  paidFor?: string;
  approve?: boolean;
};

function write(cookie: string, body: VoucherBody) {
  return createVoucher(
    jsonRequest(`${BASE}/vouchers`, cookie, {
      voucherDate: "2026-10-08",
      ...body,
    }),
  );
}

async function written(cookie: string, body: VoucherBody): Promise<Voucher> {
  const response = await write(cookie, body);
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  return json<Voucher>(response);
}

function act(
  route: (
    request: Request,
    context: ReturnType<typeof params>,
  ) => Promise<Response>,
  cookie: string,
  id: string,
  verb: string,
  body: unknown = {},
) {
  return route(
    jsonRequest(`${BASE}/vouchers/${id}/${verb}`, cookie, body),
    params(id),
  );
}

async function balanceOf(workspaceId: string, accountId: string) {
  return Number(await accountBalance(workspaceId, accountId));
}

/** A Company, a Project, the Owner's own petty cash and the Fuel category. */
async function setUp() {
  const company = await ownerWithCompany();
  const projectId = await addProject(company.workspaceId, company.userId);
  const account = await opened(company.cookie, await ownerMemberId(company));
  const fuel = await categoryId(company.workspaceId);
  return { company, projectId, account, fuel };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Petty Cash accounts (CM-703)", () => {
  it("lets Create alone open an account for another Team Member and get it back", async () => {
    const company = await ownerWithCompany();
    const clerk = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const engineer = await memberWith(company, {
      "finance.petty_cash": ["read"],
    });
    const response = await open(clerk.cookie, {
      holderMemberId: engineer.memberId,
      openingBalance: 2_000_00,
    });
    // The account and its opening entry are written, and the answer says so
    // (not a 404 for an account the clerk cannot list without View all).
    expect(response.status).toBe(StatusCodes.CREATED);
    const account = await json<Account>(response);
    expect(account).toMatchObject({ isOwn: false, balance: 2_000_00 });
    expect(await balanceOf(company.workspaceId, account.id)).toBe(2_000_00);
  });

  it("opens one account per Team Member with an opening balance entry", async () => {
    const company = await ownerWithCompany();
    const engineer = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const response = await open(company.cookie, {
      holderMemberId: engineer.memberId,
      openingBalance: 5_000_00,
      openingDate: "2026-10-01",
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    const account = await json<Account>(response);
    expect(account).toMatchObject({
      name: "Petty cash — Member",
      holderName: "Member",
      isOwn: false,
      balance: 5_000_00,
      pendingTotal: 0,
      canClose: true,
    });
    expect(await balanceOf(company.workspaceId, account.id)).toBe(5_000_00);
    const again = await open(company.cookie, {
      holderMemberId: engineer.memberId,
    });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("PETTY_CASH_ACCOUNT_EXISTS");
    const unknown = await open(company.cookie, {
      holderMemberId: randomUUID(),
    });
    expect(await codeOf(unknown)).toBe("TEAM_MEMBER_NOT_FOUND");
    // A typed name clashing with a company account.
    const owner = await ownerMemberId(company);
    const clash = await open(company.cookie, {
      holderMemberId: owner,
      name: "company's cash account",
    });
    expect(await codeOf(clash)).toBe("ACCOUNT_NAME_TAKEN");
    // Without Create: 403.
    const reader = await memberWith(company, {
      "finance.petty_cash": ["read"],
    });
    expect((await open(reader.cookie, { holderMemberId: owner })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("shows every account with View all, otherwise only the caller's own", async () => {
    const { company, account: ownersAccount } = await setUp();
    const holder = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const stranger = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const auditor = await memberWith(company, {
      "finance.petty_cash": ["read", "view_all"],
    });
    const holdersAccount = await opened(company.cookie, holder.memberId);

    expect((await accounts(company.cookie)).items).toHaveLength(2);
    const own = await accounts(holder.cookie);
    expect(own.viewAll).toBe(false);
    expect(own.items.map((item) => [item.id, item.isOwn])).toEqual([
      [holdersAccount.id, true],
    ]);
    expect((await accounts(stranger.cookie)).items).toEqual([]);
    const all = await accounts(auditor.cookie);
    expect(all.viewAll).toBe(true);
    expect(all.items.map((item) => item.id).sort()).toEqual(
      [holdersAccount.id, ownersAccount.id].sort(),
    );
    const hidden = await getAccount(
      jsonRequest(`${BASE}/accounts/${ownersAccount.id}`, holder.cookie),
      params(ownersAccount.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(hidden)).toBe("PETTY_CASH_ACCOUNT_NOT_FOUND");
    // Without Read on Petty Cash: 403.
    const outsider = await memberWith(company, {
      "finance.transactions": ["read"],
    });
    expect(
      (await listAccounts(jsonRequest(`${BASE}/accounts`, outsider.cookie)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("closes an account only while it has no vouchers", async () => {
    const { company, account, fuel } = await setUp();
    await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    const refused = await closeAccount(
      jsonRequest(`${BASE}/accounts/${account.id}/delete`, company.cookie, {}),
      params(account.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("PETTY_CASH_ACCOUNT_IN_USE");

    const member = await memberWith(company, {
      "finance.petty_cash": ["read"],
    });
    const spare = await opened(company.cookie, member.memberId, 1_000_00);
    expect(spare.canClose).toBe(true);
    const closed = await closeAccount(
      jsonRequest(`${BASE}/accounts/${spare.id}/delete`, company.cookie, {}),
      params(spare.id),
    );
    expect(closed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await accounts(company.cookie)).items.map((item) => item.id),
    ).not.toContain(spare.id);
    // The member may have a new one.
    expect(
      (await open(company.cookie, { holderMemberId: member.memberId })).status,
    ).toBe(StatusCodes.CREATED);
  });
});

describe("Petty-cash vouchers (CM-703)", () => {
  it("counts approved vouchers only: Payment out, Receipt in, pending beside", async () => {
    const { company, projectId, account, fuel } = await setUp();
    const payment = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      projectId,
      amount: 250_00,
      paymentCategoryId: fuel,
      counterparty: { kind: null, id: null, name: "Sri Murugan Fuels" },
      paidFor: "Diesel for the mixer",
    });
    expect(payment.number).toMatch(/^PC\/\d{2}-\d{2}\/\d{5}$/);
    expect(payment).toMatchObject({
      approvalStatus: "pending",
      paymentCategoryName: "Fuel",
      counterparty: { kind: null, name: "Sri Murugan Fuels" },
      actions: { edit: true, delete: true, approve: true, reject: true },
    });
    expect(await balanceOf(company.workspaceId, account.id)).toBe(0);
    const listed = (await accounts(company.cookie)).items[0];
    expect(listed).toMatchObject({
      balance: 0,
      pendingTotal: -250_00,
      pendingCount: 1,
      lastVoucherDate: "2026-10-08",
    });

    const approved = await act(
      approveVoucher,
      company.cookie,
      payment.id,
      "approve",
    );
    expect(approved.status).toBe(StatusCodes.OK);
    expect((await json<Voucher>(approved)).approvalStatus).toBe("approved");
    expect(await balanceOf(company.workspaceId, account.id)).toBe(-250_00);
    const twice = await act(
      approveVoucher,
      company.cookie,
      payment.id,
      "approve",
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(twice)).toBe("PETTY_CASH_VOUCHER_NOT_PENDING");

    // Save & Approve posts at once.
    await written(company.cookie, {
      accountId: account.id,
      voucherType: "receipt",
      amount: 1_000_00,
      paymentCategoryId: fuel,
      approve: true,
    });
    expect(await balanceOf(company.workspaceId, account.id)).toBe(750_00);
    const entries = await prisma.constructionFinanceAccountEntry.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
    });
    expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["payment", -250_00n],
      ["receipt", 1_000_00n],
    ]);
    expect(entries[0]).toMatchObject({
      projectId,
      paymentCategoryId: fuel,
      counterpartyName: "Sri Murugan Fuels",
      documentNumber: payment.number,
      narration: "Diesel for the mixer",
      sourceType: "petty_cash_voucher",
      mode: "cash",
    });
  });

  it("posts a Transfer on both accounts", async () => {
    const { company, account, fuel } = await setUp();
    const { cashId } = await seededAccounts(company.workspaceId);
    const transfer = await written(company.cookie, {
      accountId: account.id,
      voucherType: "transfer",
      amount: 300_00,
      toAccountId: cashId,
      paymentCategoryId: fuel,
    });
    expect(transfer.toAccountName).toBe("Company's Cash Account");
    expect(transfer.paymentCategoryName).toBeNull();
    await act(approveVoucher, company.cookie, transfer.id, "approve");
    expect(await balanceOf(company.workspaceId, account.id)).toBe(-300_00);
    expect(await balanceOf(company.workspaceId, cashId)).toBe(300_00);
    const same = await write(company.cookie, {
      accountId: account.id,
      voucherType: "transfer",
      amount: 1_00,
      toAccountId: account.id,
    });
    expect(await codeOf(same)).toBe("TO_ACCOUNT_SAME");
    const noCategory = await write(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      amount: 1_00,
    });
    expect(await codeOf(noCategory)).toBe("PAYMENT_CATEGORY_REQUIRED");
    const fromCompany = await write(company.cookie, {
      accountId: cashId,
      voucherType: "payment",
      amount: 1_00,
      paymentCategoryId: fuel,
    });
    expect(await codeOf(fromCompany)).toBe("ACCOUNT_NOT_PETTY_CASH");
  });

  it("rejects with a reason, resubmits on edit, and reverses an approved edit", async () => {
    const { company, account, fuel } = await setUp();
    const voucher = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      amount: 400_00,
      paymentCategoryId: fuel,
    });
    const noReason = await act(
      rejectVoucher,
      company.cookie,
      voucher.id,
      "reject",
      {
        reason: " ",
      },
    );
    expect(await codeOf(noReason)).toBe("REJECTION_REASON_REQUIRED");
    const rejected = await json<Voucher>(
      await act(rejectVoucher, company.cookie, voucher.id, "reject", {
        reason: "No bill attached",
      }),
    );
    expect(rejected).toMatchObject({
      approvalStatus: "rejected",
      rejectReason: "No bill attached",
      actions: { approve: false, reject: false, edit: true },
    });

    const fields = {
      voucherType: "payment",
      voucherDate: "2026-10-08",
      amount: 450_00,
      paymentCategoryId: fuel,
    };
    const resubmitted = await act(
      updateVoucher,
      company.cookie,
      voucher.id,
      "update",
      {
        ...fields,
        expectedUpdatedAt: rejected.updatedAt,
      },
    );
    expect(resubmitted.status).toBe(StatusCodes.OK);
    const pending = await json<Voucher>(resubmitted);
    expect(pending).toMatchObject({
      approvalStatus: "pending",
      rejectReason: null,
      amount: 450_00,
      number: voucher.number,
    });
    const stale = await act(
      updateVoucher,
      company.cookie,
      voucher.id,
      "update",
      {
        ...fields,
        expectedUpdatedAt: rejected.updatedAt,
      },
    );
    expect(await codeOf(stale)).toBe("PETTY_CASH_VOUCHER_CHANGED");

    const approved = await json<Voucher>(
      await act(approveVoucher, company.cookie, voucher.id, "approve"),
    );
    expect(await balanceOf(company.workspaceId, account.id)).toBe(-450_00);
    // Editing an approved voucher reverses it and returns it to pending.
    const edited = await json<Voucher>(
      await act(updateVoucher, company.cookie, voucher.id, "update", {
        ...fields,
        amount: 500_00,
        expectedUpdatedAt: approved.updatedAt,
      }),
    );
    expect(edited.approvalStatus).toBe("pending");
    expect(await balanceOf(company.workspaceId, account.id)).toBe(0);
    await act(approveVoucher, company.cookie, voucher.id, "approve");
    expect(await balanceOf(company.workspaceId, account.id)).toBe(-500_00);
    // Deleting it reverses again.
    expect(
      (await act(deleteVoucher, company.cookie, voucher.id, "delete")).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(await balanceOf(company.workspaceId, account.id)).toBe(0);
    const gone = await getVoucher(
      jsonRequest(`${BASE}/vouchers/${voucher.id}`, company.cookie),
      params(voucher.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    const entries = await prisma.constructionFinanceAccountEntry.count({
      where: { sourceId: voucher.id },
    });
    expect(entries).toBe(4);
  });

  it("approves and rejects in bulk, all or none", async () => {
    const { company, account, fuel } = await setUp();
    const make = () =>
      written(company.cookie, {
        accountId: account.id,
        voucherType: "payment",
        amount: 100_00,
        paymentCategoryId: fuel,
      });
    const [a, b, c] = [await make(), await make(), await make()];
    await act(rejectVoucher, company.cookie, c.id, "reject", {
      reason: "Twice",
    });
    const refused = await bulkApprove(
      jsonRequest(`${BASE}/vouchers/bulk-approve`, company.cookie, {
        ids: [a.id, b.id, c.id],
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const refusal = await json<{
      code: string;
      details: { refusals: { id: string; code: string }[] };
    }>(refused);
    expect(refusal.code).toBe("BULK_DECISION_REFUSED");
    expect(refusal.details.refusals).toEqual([
      expect.objectContaining({
        id: c.id,
        code: "PETTY_CASH_VOUCHER_NOT_PENDING",
      }),
    ]);
    expect(await balanceOf(company.workspaceId, account.id)).toBe(0);

    const done = await bulkApprove(
      jsonRequest(`${BASE}/vouchers/bulk-approve`, company.cookie, {
        ids: [a.id, b.id],
      }),
    );
    expect(await json<{ decided: number }>(done)).toEqual({ decided: 2 });
    expect(await balanceOf(company.workspaceId, account.id)).toBe(-200_00);

    const d = await make();
    const rejected = await bulkReject(
      jsonRequest(`${BASE}/vouchers/bulk-reject`, company.cookie, {
        ids: [d.id],
        reason: "Wrong account",
      }),
    );
    expect(rejected.status).toBe(StatusCodes.OK);
  });

  it("raises document.submitted, approved and rejected for notifications (CM-904)", async () => {
    const { company, projectId, account, fuel } = await setUp();
    const events = watchEvents();
    const voucher = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      projectId,
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    expect(events.of("document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "petty_cash_voucher",
        documentId: voucher.id,
        projectId,
        number: voucher.number,
        submittedBy: company.userId,
      }),
    ]);
    const rejected = await json<Voucher>(
      await bulkReject(
        jsonRequest(`${BASE}/vouchers/bulk-reject`, company.cookie, {
          ids: [voucher.id],
          reason: "No bill",
        }),
      ),
    );
    expect(events.of("document.rejected")).toEqual([
      expect.objectContaining({
        documentType: "petty_cash_voucher",
        documentId: voucher.id,
        number: voucher.number,
        rejectedBy: company.userId,
        createdBy: company.userId,
        reason: "No bill",
      }),
    ]);
    const current = await json<Voucher>(
      await getVoucher(
        jsonRequest(`${BASE}/vouchers/${voucher.id}`, company.cookie),
        params(voucher.id),
      ),
    );
    expect(rejected).toBeDefined();
    await act(updateVoucher, company.cookie, voucher.id, "update", {
      voucherType: "payment",
      voucherDate: "2026-10-08",
      projectId,
      amount: 120_00,
      paymentCategoryId: fuel,
      expectedUpdatedAt: current.updatedAt,
    });
    expect(events.of("document.submitted")).toHaveLength(2);
    await act(approveVoucher, company.cookie, voucher.id, "approve");
    expect(events.of("document.approved")).toEqual([
      expect.objectContaining({
        documentType: "petty_cash_voucher",
        documentId: voucher.id,
        projectId,
        number: voucher.number,
        approvedBy: company.userId,
        createdBy: company.userId,
      }),
    ]);
  });

  it("refuses to approve a voucher dated in a closed period", async () => {
    const { company, account, fuel } = await setUp();
    const old = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      voucherDate: "2026-09-15",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: company.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        financialClosingDate: new Date("2026-09-30T00:00:00.000Z"),
        modules: {},
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    for (const response of [
      await act(approveVoucher, company.cookie, old.id, "approve"),
      await act(rejectVoucher, company.cookie, old.id, "reject", {
        reason: "Late",
      }),
      await act(deleteVoucher, company.cookie, old.id, "delete"),
      await write(company.cookie, {
        accountId: account.id,
        voucherType: "payment",
        voucherDate: "2026-09-20",
        amount: 100_00,
        paymentCategoryId: fuel,
      }),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("FINANCIAL_PERIOD_CLOSED");
    }
    expect(await balanceOf(company.workspaceId, account.id)).toBe(0);
  });

  it("checks rights: own account, Save & Approve, hidden vouchers, Projects", async () => {
    const { company, projectId, account: ownersAccount, fuel } = await setUp();
    const engineer = await memberWith(company, {
      "finance.petty_cash": ["read", "create", "update"],
    });
    await sharedAssign(engineer.memberId, projectId);
    const mine = await opened(company.cookie, engineer.memberId);

    // On someone else's account: 403 ACCOUNT_NOT_YOURS.
    const notYours = await write(engineer.cookie, {
      accountId: ownersAccount.id,
      voucherType: "payment",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    expect(notYours.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(notYours)).toBe("ACCOUNT_NOT_YOURS");
    // Save & Approve needs Approve.
    const noApprove = await write(engineer.cookie, {
      accountId: mine.id,
      voucherType: "payment",
      amount: 100_00,
      paymentCategoryId: fuel,
      approve: true,
    });
    expect(noApprove.status).toBe(StatusCodes.FORBIDDEN);
    // A Project they are not on: 403.
    const otherProject = await addProject(company.workspaceId, company.userId);
    expect(
      (
        await write(engineer.cookie, {
          accountId: mine.id,
          voucherType: "payment",
          projectId: otherProject,
          amount: 100_00,
          paymentCategoryId: fuel,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const own = await written(engineer.cookie, {
      accountId: mine.id,
      voucherType: "payment",
      projectId,
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    expect(own.actions).toEqual({
      edit: true,
      delete: false,
      approve: false,
      reject: false,
    });
    expect(
      (await act(approveVoucher, engineer.cookie, own.id, "approve")).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const owners = await written(company.cookie, {
      accountId: ownersAccount.id,
      voucherType: "payment",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    const hidden = await getVoucher(
      jsonRequest(`${BASE}/vouchers/${owners.id}`, engineer.cookie),
      params(owners.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    const listed = await json<{ items: Voucher[]; total: number }>(
      await listVouchers(jsonRequest(`${BASE}/vouchers`, engineer.cookie)),
    );
    expect(listed.items.map((item) => item.id)).toEqual([own.id]);
    const theirs = await json<{ items: Voucher[] }>(
      await listVouchers(
        jsonRequest(
          `${BASE}/vouchers?accountId=${ownersAccount.id}`,
          engineer.cookie,
        ),
      ),
    );
    expect(theirs.items).toEqual([]);

    // The Owner lists by account, type and status, with totals.
    const page = await json<{
      items: Voucher[];
      total: number;
      totals: { payment: number; receipt: number; transfer: number };
    }>(
      await listVouchers(
        jsonRequest(
          `${BASE}/vouchers?accountId=${mine.id}&type=payment&status=pending&projectId=${projectId}`,
          company.cookie,
        ),
      ),
    );
    expect(page).toMatchObject({
      total: 1,
      totals: { payment: 100_00, receipt: 0, transfer: 0 },
    });
  });
});

describe("Export Receipts (CM-0017 §9)", () => {
  it("zips the vouchers' files named by voucher number", async () => {
    const { company, account, fuel } = await setUp();
    const first = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      voucherDate: "2026-10-02",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    const second = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      voucherDate: "2026-10-05",
      amount: 200_00,
      paymentCategoryId: fuel,
    });
    const outside = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      voucherDate: "2026-10-20",
      amount: 300_00,
      paymentCategoryId: fuel,
    });
    const png = pngBytes();
    await uploadFile(
      company.cookie,
      "petty_cash_voucher",
      first.id,
      "Bill.png",
      png,
    );
    await uploadFile(
      company.cookie,
      "petty_cash_voucher",
      first.id,
      "Back.PNG",
      png,
    );
    await uploadFile(
      company.cookie,
      "petty_cash_voucher",
      second.id,
      "Invoice.pdf",
      PDF,
    );
    await uploadFile(
      company.cookie,
      "petty_cash_voucher",
      outside.id,
      "Later.pdf",
      PDF,
    );

    const response = await exportReceipts(
      jsonRequest(
        `${BASE}/accounts/${account.id}/receipts.zip?from=2026-10-01&to=2026-10-10`,
        company.cookie,
      ),
      params(account.id),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const dash = (number: string) => number.replaceAll("/", "-");
    expect(Object.keys(files).sort()).toEqual(
      [
        `${dash(first.number)} 1.png`,
        `${dash(first.number)} 2.png`,
        `${dash(second.number)} 1.pdf`,
      ].sort(),
    );
    expect(files[`${dash(second.number)} 1.pdf`]).toEqual(PDF);

    // Another holder's account is not theirs to export.
    const member = await memberWith(company, {
      "finance.petty_cash": ["read", "print"],
    });
    const hidden = await exportReceipts(
      jsonRequest(
        `${BASE}/accounts/${account.id}/receipts.zip?from=2026-10-01&to=2026-10-10`,
        member.cookie,
      ),
      params(account.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses more than 500 files", async () => {
    const { company, account, fuel } = await setUp();
    const voucher = await written(company.cookie, {
      accountId: account.id,
      voucherType: "payment",
      amount: 100_00,
      paymentCategoryId: fuel,
    });
    await prisma.constructionFinanceDocumentFile.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: company.workspaceId,
        documentType: "petty_cash_voucher" as const,
        documentId: voucher.id,
        fileKey: `companies/${company.workspaceId}/finance-documents/${voucher.id}/${randomUUID()}.png`,
        fileName: `Bill ${String(index)}.png`,
        contentType: "image/png",
        bytes: 10,
        createdBy: company.userId,
      })),
    });
    const response = await exportReceipts(
      jsonRequest(
        `${BASE}/accounts/${account.id}/receipts.zip?from=2026-10-01&to=2026-10-31`,
        company.cookie,
      ),
      params(account.id),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(response)).toBe("TOO_MANY_RECEIPTS");
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const base = "/api/construction/finance/petty-cash";
    for (const [path, method] of [
      [`${base}/accounts`, "get"],
      [`${base}/accounts`, "post"],
      [`${base}/accounts/{id}`, "get"],
      [`${base}/accounts/{id}/delete`, "post"],
      [`${base}/accounts/{id}/receipts.zip`, "get"],
      [`${base}/vouchers`, "get"],
      [`${base}/vouchers`, "post"],
      [`${base}/vouchers/{id}`, "get"],
      [`${base}/vouchers/{id}/update`, "post"],
      [`${base}/vouchers/{id}/approve`, "post"],
      [`${base}/vouchers/{id}/reject`, "post"],
      [`${base}/vouchers/{id}/delete`, "post"],
      [`${base}/vouchers/bulk-approve`, "post"],
      [`${base}/vouchers/bulk-reject`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });
});
