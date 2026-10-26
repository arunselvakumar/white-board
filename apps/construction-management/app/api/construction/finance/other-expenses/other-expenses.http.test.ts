import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { watchEvents } from "@/test/dispatched-events";
import { accountBalance, addAccount, seededAccounts } from "@/test/finance";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as approveRoute } from "./[id]/approve/route";
import { POST as deleteRoute } from "./[id]/delete/route";
import { POST as rejectRoute } from "./[id]/reject/route";
import { GET as getRoute } from "./[id]/route";
import { POST as updateRoute } from "./[id]/update/route";
import { POST as bulkApproveRoute } from "./bulk-approve/route";
import { POST as bulkRejectRoute } from "./bulk-reject/route";
import type {
  ConstructionFinanceOtherExpenseResponseModel,
  ListConstructionFinanceOtherExpensesResponseModel,
} from "./other-expense-models";
import { GET as listRoute, POST as createRoute } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/finance/other-expenses`;
const TODAY = todayIn("Asia/Kolkata");

type Expense = ConstructionFinanceOtherExpenseResponseModel;
type Page = ListConstructionFinanceOtherExpensesResponseModel;
type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup(company: Company) {
  const tower = await addProject(
    company.workspaceId,
    company.userId,
    "Tower A",
  );
  const { cashId, bankId } = await seededAccounts(company.workspaceId);
  const categories = await prisma.constructionFinancePaymentCategory.findMany({
    where: { workspaceId: company.workspaceId, deletedAt: null },
    orderBy: { name: "asc" },
    take: 2,
  });
  const [fuel, other] = categories;
  if (fuel == null || other == null) throw new Error("No Payment Categories.");
  return {
    tower,
    cashId,
    bankId,
    categoryId: fuel.id,
    otherCategoryId: other.id,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function body(s: Setup, overrides: Record<string, unknown> = {}) {
  return {
    projectId: s.tower,
    expenseDate: TODAY,
    paymentCategoryId: s.categoryId,
    payeeName: "Tea stall",
    accountId: s.cashId,
    mode: "cash",
    amount: 45_000,
    description: "Tea for the slab pour crew",
    ...overrides,
  };
}

const create = (cookie: string, payload: unknown) =>
  createRoute(jsonRequest(BASE, cookie, payload));
const get = (cookie: string, id: string) =>
  getRoute(jsonRequest(`${BASE}/${id}`, cookie), params(id));
const update = (cookie: string, id: string, payload: unknown) =>
  updateRoute(jsonRequest(`${BASE}/${id}/update`, cookie, payload), params(id));
const remove = (cookie: string, id: string, payload: unknown = {}) =>
  deleteRoute(jsonRequest(`${BASE}/${id}/delete`, cookie, payload), params(id));
const approve = (cookie: string, id: string, payload: unknown = {}) =>
  approveRoute(
    jsonRequest(`${BASE}/${id}/approve`, cookie, payload),
    params(id),
  );
const reject = (cookie: string, id: string, payload: unknown) =>
  rejectRoute(jsonRequest(`${BASE}/${id}/reject`, cookie, payload), params(id));
const list = (cookie: string, query: string) =>
  listRoute(jsonRequest(`${BASE}?${query}`, cookie));

async function entries(id: string) {
  return prisma.constructionFinanceAccountEntry.findMany({
    where: { sourceType: "other_expense", sourceId: id },
    orderBy: { createdAt: "asc" },
  });
}

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Other Expenses HTTP (CM-704)", () => {
  it("numbers a pending expense, posts nothing until approved, and approval posts one entry", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const created = await create(company.cookie, body(s));
    expect(created.status).toBe(StatusCodes.CREATED);
    const expense = await json<Expense>(created);
    expect(expense).toMatchObject({
      number: expect.stringMatching(/^EXP\//) as unknown,
      projectName: "Tower A",
      status: "pending",
      amount: 45_000,
      payeeName: "Tea stall",
      account: { id: s.cashId, kind: "cash" },
      actions: { edit: true, delete: true, approve: true, reject: true },
    });
    expect(await entries(expense.id)).toEqual([]);
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(0n);

    const approved = await approve(company.cookie, expense.id, {
      expectedUpdatedAt: expense.updatedAt,
    });
    expect(approved.status).toBe(StatusCodes.OK);
    expect(await json<Expense>(approved)).toMatchObject({
      status: "approved",
      decidedBy: { id: company.userId },
      actions: { approve: false, reject: false },
    });
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(-45_000n);
    expect(await entries(expense.id)).toEqual([
      expect.objectContaining({
        accountId: s.cashId,
        projectId: s.tower,
        kind: "payment",
        amount: -45_000n,
        mode: "cash",
        paymentCategoryId: s.categoryId,
        counterpartyKind: null,
        counterpartyName: "Tea stall",
        documentNumber: expense.number,
        narration: "Tea for the slab pour crew",
      }),
    ]);
    const again = await approve(company.cookie, expense.id);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("OTHER_EXPENSE_NOT_PENDING");
  });

  it("reverses an approved expense on edit and delete, and resubmits a rejected one", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const expense = await json<Expense>(
      await create(company.cookie, body(s, { approve: true })),
    );
    expect(expense.status).toBe("approved");
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(-45_000n);

    // Edit an approved one: reversed, back to pending, new figures.
    const edited = await json<Expense>(
      await update(company.cookie, expense.id, {
        ...body(s, {
          amount: 60_000,
          accountId: s.bankId,
          mode: "online",
          reference: "UTR 7781",
        }),
        expectedUpdatedAt: expense.updatedAt,
      }),
    );
    expect(edited).toMatchObject({ status: "pending", amount: 60_000 });
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(0n);
    expect(await accountBalance(company.workspaceId, s.bankId)).toBe(0n);
    const stale = await update(company.cookie, expense.id, {
      ...body(s),
      expectedUpdatedAt: expense.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("OTHER_EXPENSE_CHANGED");

    // Save & Approve on edit posts the new entry.
    const reapproved = await json<Expense>(
      await update(company.cookie, expense.id, {
        ...body(s, {
          amount: 60_000,
          accountId: s.bankId,
          mode: "online",
          reference: "UTR 7781",
          approve: true,
        }),
        expectedUpdatedAt: edited.updatedAt,
      }),
    );
    expect(reapproved.status).toBe("approved");
    expect(await accountBalance(company.workspaceId, s.bankId)).toBe(-60_000n);
    expect((await entries(expense.id)).map((row) => row.amount)).toEqual([
      -45_000n,
      45_000n,
      -60_000n,
    ]);

    // Delete an approved one: reversed, then gone.
    expect(
      (
        await remove(company.cookie, expense.id, {
          expectedUpdatedAt: reapproved.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(company.workspaceId, s.bankId)).toBe(0n);
    expect((await get(company.cookie, expense.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    // Reject needs a reason; a rejected one returns to pending when edited.
    const second = await json<Expense>(await create(company.cookie, body(s)));
    const noReason = await reject(company.cookie, second.id, { reason: " " });
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(noReason)).toBe("REJECTION_REASON_REQUIRED");
    const rejected = await json<Expense>(
      await reject(company.cookie, second.id, { reason: "No bill attached" }),
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectReason: "No bill attached",
      actions: { approve: false },
    });
    expect(await entries(second.id)).toEqual([]);
    const resubmitted = await json<Expense>(
      await update(company.cookie, second.id, {
        ...body(s, { description: "Bill attached" }),
        expectedUpdatedAt: rejected.updatedAt,
      }),
    );
    expect(resubmitted).toMatchObject({
      status: "pending",
      rejectReason: null,
    });
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(0n);
  });

  it("checks the account, the mode's reference, the Payment Category and the date", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const cases: [Record<string, unknown>, number, string][] = [
      [{ accountId: s.bankId }, 400, "ACCOUNT_MODE_MISMATCH"],
      [
        { mode: "upi", accountId: s.cashId, reference: "x" },
        400,
        "ACCOUNT_MODE_MISMATCH",
      ],
      [{ mode: "cheque", accountId: s.bankId }, 400, "CHEQUE_NUMBER_REQUIRED"],
      [{ mode: "online", accountId: s.bankId }, 400, "REFERENCE_REQUIRED"],
      [{ accountId: newId() }, 404, "ACCOUNT_NOT_FOUND"],
      [{ paymentCategoryId: newId() }, 400, "PAYMENT_CATEGORY_NOT_FOUND"],
      [{ amount: 0 }, 400, "AMOUNT_INVALID"],
      [{ expenseDate: addDays(TODAY, 1) }, 400, "EXPENSE_DATE_IN_FUTURE"],
    ];
    for (const [overrides, status, code] of cases) {
      const response = await create(company.cookie, body(s, overrides));
      expect(response.status, code).toBe(status);
      expect(await codeOf(response)).toBe(code);
    }
    const cheque = await create(
      company.cookie,
      body(s, { mode: "cheque", accountId: s.bankId, reference: "000451" }),
    );
    expect(cheque.status).toBe(StatusCodes.CREATED);

    await prisma.constructionFinancePaymentCategory.update({
      where: { id: s.otherCategoryId },
      data: { disabledAt: new Date() },
    });
    const disabled = await create(
      company.cookie,
      body(s, { paymentCategoryId: s.otherCategoryId }),
    );
    expect(await codeOf(disabled)).toBe("PAYMENT_CATEGORY_NOT_FOUND");

    // Petty cash: your own, never someone else's.
    const clerk = await member(
      company,
      { "finance.other_expenses": ["read", "create"] },
      [s.tower],
    );
    const other = await member(company, {}, []);
    const mine = await addAccount(company.workspaceId, company.userId, {
      kind: "petty_cash",
      holderMemberId: clerk.memberId,
    });
    const theirs = await addAccount(company.workspaceId, company.userId, {
      kind: "petty_cash",
      holderMemberId: other.memberId,
    });
    const notYours = await create(clerk.cookie, body(s, { accountId: theirs }));
    expect(notYours.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(notYours)).toBe("ACCOUNT_NOT_YOURS");
    const own = await create(clerk.cookie, body(s, { accountId: mine }));
    expect(own.status).toBe(StatusCodes.CREATED);
    const ownExpense = await json<Expense>(own);
    expect(ownExpense.actions).toEqual({
      edit: false,
      delete: false,
      approve: false,
      reject: false,
    });
    // The Owner approves it onto the clerk's petty cash.
    expect((await approve(company.cookie, ownExpense.id)).status).toBe(
      StatusCodes.OK,
    );
    expect(await accountBalance(company.workspaceId, mine)).toBe(-45_000n);

    const stranger = await ownerWithCompany("Other Builders");
    const foreign = await seededAccounts(stranger.workspaceId);
    const foreignAccount = await create(
      company.cookie,
      body(s, { accountId: foreign.cashId }),
    );
    expect(foreignAccount.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses approve, reject, edit and delete in a closed period, and bulk decisions all or none", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const old = addDays(TODAY, -10);
    const [a, b, c] = await Promise.all(
      [old, TODAY, TODAY].map(async (expenseDate) =>
        json<Expense>(await create(company.cookie, body(s, { expenseDate }))),
      ),
    );
    if (a == null || b == null || c == null) throw new Error("not created");
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        createDays: 0,
        createOverrideRoleIds: [],
        editDays: 0,
        editOverrideRoleIds: [],
        financialClosingDate: calendarDateToDb(addDays(TODAY, -5)),
        modules: {},
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    for (const response of [
      await approve(company.cookie, a.id),
      await reject(company.cookie, a.id, { reason: "Late" }),
      await update(company.cookie, a.id, {
        ...body(s, { expenseDate: old }),
        expectedUpdatedAt: a.updatedAt,
      }),
      await remove(company.cookie, a.id),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("FINANCIAL_PERIOD_CLOSED");
    }

    const refused = await bulkApproveRoute(
      jsonRequest(`${BASE}/bulk-approve`, company.cookie, {
        projectId: s.tower,
        ids: [a.id, b.id, c.id],
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(
      await json<{ code: string; details: { refusals: { id: string }[] } }>(
        refused,
      ),
    ).toMatchObject({
      code: "BULK_DECISION_REFUSED",
      details: { refusals: [{ id: a.id, code: "FINANCIAL_PERIOD_CLOSED" }] },
    });
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(0n);

    const decided = await bulkApproveRoute(
      jsonRequest(`${BASE}/bulk-approve`, company.cookie, {
        projectId: s.tower,
        ids: [b.id, c.id],
      }),
    );
    expect(await json<{ decided: number }>(decided)).toEqual({ decided: 2 });
    expect(await accountBalance(company.workspaceId, s.cashId)).toBe(-90_000n);

    const d = await json<Expense>(await create(company.cookie, body(s)));
    const bulkRejected = await bulkRejectRoute(
      jsonRequest(`${BASE}/bulk-reject`, company.cookie, {
        projectId: s.tower,
        ids: [d.id],
        reason: "Duplicate",
      }),
    );
    expect(bulkRejected.status).toBe(StatusCodes.OK);
    expect(await json<Expense>(await get(company.cookie, d.id))).toMatchObject({
      status: "rejected",
      rejectReason: "Duplicate",
    });
  });

  it("raises document.submitted, approved and rejected for notifications (CM-904)", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const events = watchEvents();
    const expense = await json<Expense>(await create(company.cookie, body(s)));
    expect(events.of("document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "other_expense",
        documentId: expense.id,
        projectId: s.tower,
        number: expense.number,
        submittedBy: company.userId,
      }),
    ]);
    const rejected = await json<Expense>(
      await reject(company.cookie, expense.id, { reason: "Duplicate" }),
    );
    expect(events.of("document.rejected")).toEqual([
      expect.objectContaining({
        documentType: "other_expense",
        documentId: expense.id,
        number: expense.number,
        rejectedBy: company.userId,
        createdBy: company.userId,
        reason: "Duplicate",
      }),
    ]);
    await update(company.cookie, expense.id, {
      ...body(s),
      expectedUpdatedAt: rejected.updatedAt,
    });
    expect(events.of("document.submitted")).toHaveLength(2);
    await bulkApproveRoute(
      jsonRequest(`${BASE}/bulk-approve`, company.cookie, {
        projectId: s.tower,
        ids: [expense.id],
      }),
    );
    expect(events.of("document.approved")).toEqual([
      expect.objectContaining({
        documentType: "other_expense",
        documentId: expense.id,
        number: expense.number,
        approvedBy: company.userId,
        createdBy: company.userId,
      }),
    ]);
  });

  it("lists a Project's expenses with filters, totals and cursors", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const villa = await addProject(company.workspaceId, company.userId);
    await create(company.cookie, body(s, { amount: 10_000, approve: true }));
    await create(
      company.cookie,
      body(s, {
        amount: 20_000,
        paymentCategoryId: s.otherCategoryId,
        expenseDate: addDays(TODAY, -3),
      }),
    );
    await create(
      company.cookie,
      body(s, {
        amount: 40_000,
        accountId: s.bankId,
        mode: "upi",
        reference: "UPI 1",
      }),
    );
    await create(company.cookie, body(s, { projectId: villa }));

    const all = await json<Page>(
      await list(company.cookie, `projectId=${s.tower}`),
    );
    expect(all.total).toBe(3);
    expect(all.totals).toEqual({
      amount: 70_000,
      approved: 10_000,
      pending: 60_000,
      rejected: 0,
    });
    expect(all.items.map((item) => item.amount)).toEqual([
      40_000, 20_000, 10_000,
    ]);
    const pending = await json<Page>(
      await list(company.cookie, `projectId=${s.tower}&status=pending`),
    );
    expect(pending.total).toBe(2);
    const byCategory = await json<Page>(
      await list(
        company.cookie,
        `projectId=${s.tower}&paymentCategoryId=${s.otherCategoryId}`,
      ),
    );
    expect(byCategory.items.map((item) => item.amount)).toEqual([20_000]);
    const byAccount = await json<Page>(
      await list(company.cookie, `projectId=${s.tower}&accountId=${s.bankId}`),
    );
    expect(byAccount.items.map((item) => item.amount)).toEqual([40_000]);
    const byDate = await json<Page>(
      await list(
        company.cookie,
        `projectId=${s.tower}&from=${addDays(TODAY, -4)}&to=${addDays(TODAY, -2)}`,
      ),
    );
    expect(byDate.items.map((item) => item.amount)).toEqual([20_000]);
    const first = await json<Page>(
      await list(company.cookie, `projectId=${s.tower}&limit=2`),
    );
    expect(first.nextCursor).not.toBeNull();
    const second = await json<Page>(
      await list(
        company.cookie,
        `projectId=${s.tower}&limit=2&after=${first.nextCursor ?? ""}`,
      ),
    );
    expect(second.items.map((item) => item.amount)).toEqual([10_000]);
  });

  it("needs the menu's flags on the Project and hides another Company's", async () => {
    const company = await ownerWithCompany();
    const s = await setup(company);
    const villa = await addProject(company.workspaceId, company.userId);
    const expense = await json<Expense>(await create(company.cookie, body(s)));
    const clerk = await member(
      company,
      { "finance.other_expenses": ["read", "create", "update"] },
      [s.tower],
    );
    const saveAndApprove = await create(
      clerk.cookie,
      body(s, { approve: true }),
    );
    expect(saveAndApprove.status).toBe(StatusCodes.FORBIDDEN);
    expect((await approve(clerk.cookie, expense.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await remove(clerk.cookie, expense.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await create(clerk.cookie, body(s, { projectId: villa }))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const read = await json<Expense>(await get(clerk.cookie, expense.id));
    expect(read.actions).toEqual({
      edit: true,
      delete: false,
      approve: false,
      reject: false,
    });

    const other = await ownerWithCompany("Other Builders");
    expect((await get(other.cookie, expense.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/finance/other-expenses",
      "/api/construction/finance/other-expenses/{id}",
      "/api/construction/finance/other-expenses/{id}/update",
      "/api/construction/finance/other-expenses/{id}/delete",
      "/api/construction/finance/other-expenses/{id}/approve",
      "/api/construction/finance/other-expenses/{id}/reject",
      "/api/construction/finance/other-expenses/bulk-approve",
      "/api/construction/finance/other-expenses/bulk-reject",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionFinanceOtherExpenseResponse"],
    ).toBeDefined();
  });
});
