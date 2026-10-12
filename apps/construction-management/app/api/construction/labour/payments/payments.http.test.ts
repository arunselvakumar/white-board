import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as createVendor } from "@/app/api/construction/labour/vendors/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { accountBalance, addAccount, seededAccounts } from "@/test/finance";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as cancelPayment } from "./[id]/cancel/route";
import { POST as removeReceipt } from "./[id]/receipt/remove/route";
import { GET as getReceipt, POST as setReceipt } from "./[id]/receipt/route";
import { GET as getPayment } from "./[id]/route";
import { GET as listPayers } from "./payers/route";
import { GET as listPayments, POST as recordPayment } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/payments`;
const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;
const VENDORS = `${TEST_ORIGIN}/api/construction/labour/vendors`;

const TODAY = todayIn("Asia/Kolkata");

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Payment = {
  id: string;
  partyType: "labour" | "vendor";
  partyId: string;
  partyName: string;
  projectId: string;
  projectName: string | null;
  paymentDate: string;
  kind: "payment" | "advance";
  mode: "cash" | "bank";
  reference: string | null;
  amount: number | null;
  paidBy: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  remarks: string | null;
  receiptUrl: string | null;
  updatedAt: string;
};

type Page = {
  items: Payment[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
  totalAmount: number | null;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorCode(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function fixtures(company: Company) {
  const [tower, villa] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Tower A"),
    addProject(company.workspaceId, company.userId, "Villa"),
  ]);
  const labour = await json<{ id: string }>(
    await createLabour(
      jsonRequest(LABOURS, company.cookie, {
        name: "Dhuresh Nawin",
        joiningDate: "2026-08-01",
        wageType: "daily",
        wagePerDay: 70_000,
        overtimeWagePerHour: 10_000,
        weeklyHolidays: [0],
        currentProjectId: tower,
        openingBalance: 100_000,
      }),
    ),
  );
  const vendor = await json<{ id: string }>(
    await createVendor(
      jsonRequest(VENDORS, company.cookie, {
        name: "Prabhu Gang",
        joiningDate: "2026-08-01",
        projectIds: [villa],
        shifts: [],
      }),
    ),
  );
  const { cashId, bankId } = await seededAccounts(company.workspaceId);
  return {
    tower,
    villa,
    labourId: labour.id,
    vendorId: vendor.id,
    cashId,
    bankId,
  };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

/** Cash from the Company's Cash Account, Bank from its Bank Account. */
function payBody(f: Fixtures, overrides: Record<string, unknown> = {}) {
  return {
    partyType: "labour",
    partyId: f.labourId,
    projectId: f.tower,
    paymentDate: "2026-09-12",
    kind: "payment",
    mode: "cash",
    amount: 30_000,
    accountId: overrides["mode"] === "bank" ? f.bankId : f.cashId,
    ...overrides,
  };
}

function record(cookie: string, body: unknown) {
  return recordPayment(jsonRequest(BASE, cookie, body));
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function cancel(cookie: string, id: string, expectedUpdatedAt: string) {
  return cancelPayment(
    jsonRequest(`${BASE}/${id}/cancel`, cookie, { expectedUpdatedAt }),
    idContext(id),
  );
}

async function ledger(partyId: string) {
  return prisma.constructionLabourLedgerEntry.findMany({
    where: { partyId },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  });
}

async function balance(partyId: string): Promise<number> {
  const sum = await prisma.constructionLabourLedgerEntry.aggregate({
    where: { partyId },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
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

describe("wage payments HTTP", () => {
  it("records a payment and an advance as negative ledger entries, and cancels with expectedUpdatedAt", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const payers = await json<{
      items: { id: string; name: string }[];
      currentMemberId: string | null;
    }>(
      await listPayers(
        jsonRequest(
          `${BASE}/payers?projectId=${f.tower}&partyType=labour`,
          company.cookie,
        ),
      ),
    );
    expect(payers.currentMemberId).not.toBeNull();
    expect(payers.items.map((item) => item.id)).toContain(
      payers.currentMemberId,
    );

    const paid = await record(
      company.cookie,
      payBody(f, {
        paidByMemberId: payers.currentMemberId,
        remarks: " September wages ",
      }),
    );
    expect(paid.status).toBe(StatusCodes.CREATED);
    const payment = await json<Payment>(paid);
    expect(payment).toMatchObject({
      partyName: "Dhuresh Nawin",
      projectName: "Tower A",
      kind: "payment",
      mode: "cash",
      amount: 30_000,
      remarks: "September wages",
      receiptUrl: null,
    });
    expect(payment.paidBy?.id).toBe(payers.currentMemberId);
    expect(await balance(f.labourId)).toBe(70_000);
    const entries = await ledger(f.labourId);
    expect(entries.at(-1)).toMatchObject({
      kind: "payment",
      amount: -30_000,
      sourceType: "wage_payment",
      sourceId: payment.id,
      projectId: f.tower,
    });

    // Bank without a reference is allowed by the API (the screen asks for it).
    const advance = await record(
      company.cookie,
      payBody(f, {
        kind: "advance",
        mode: "bank",
        amount: 10_000,
        paymentDate: "2026-09-13",
      }),
    );
    expect(advance.status).toBe(StatusCodes.CREATED);
    expect(await json<Payment>(advance)).toMatchObject({
      kind: "advance",
      mode: "bank",
      reference: null,
    });
    expect(await balance(f.labourId)).toBe(60_000);

    const fetched = await getPayment(
      jsonRequest(`${BASE}/${payment.id}`, company.cookie),
      idContext(payment.id),
    );
    expect(fetched.status).toBe(StatusCodes.OK);

    const stale = await cancel(
      company.cookie,
      payment.id,
      new Date(Date.parse(payment.updatedAt) - 1000).toISOString(),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(stale)).toBe("PAYMENT_CHANGED");
    expect(await balance(f.labourId)).toBe(60_000);

    const cancelled = await cancel(
      company.cookie,
      payment.id,
      payment.updatedAt,
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    expect(await balance(f.labourId)).toBe(90_000);
    const reversal = (await ledger(f.labourId)).find(
      (entry) => entry.reversesEntryId != null,
    );
    expect(reversal).toMatchObject({ amount: 30_000, kind: "payment" });

    const again = await cancel(company.cookie, payment.id, payment.updatedAt);
    expect(again.status).toBe(StatusCodes.NOT_FOUND);
    const gone = await getPayment(
      jsonRequest(`${BASE}/${payment.id}`, company.cookie),
      idContext(payment.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses bad amounts, future dates, unknown members, a vendor not on the Project and another Company's party", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    for (const amount of [0, -500]) {
      const response = await record(company.cookie, payBody(f, { amount }));
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await errorCode(response)).toBe("PAYMENT_AMOUNT_INVALID");
    }
    const future = await record(
      company.cookie,
      payBody(f, { paymentDate: addDays(TODAY, 2) }),
    );
    expect(future.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(future)).toBe("PAYMENT_DATE_IN_FUTURE");
    const stranger = await record(
      company.cookie,
      payBody(f, { paidByMemberId: newId() }),
    );
    expect(stranger.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(stranger)).toBe("TEAM_MEMBER_NOT_FOUND");

    const offProject = await record(
      company.cookie,
      payBody(f, { partyType: "vendor", partyId: f.vendorId }),
    );
    expect(offProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(offProject)).toBe("VENDOR_NOT_ON_PROJECT");
    const onProject = await record(
      company.cookie,
      payBody(f, {
        partyType: "vendor",
        partyId: f.vendorId,
        projectId: f.villa,
        mode: "bank",
        reference: "UTR 1234",
      }),
    );
    expect(onProject.status).toBe(StatusCodes.CREATED);
    const vendorPayment = await json<Payment>(onProject);
    expect(await balance(f.vendorId)).toBe(-30_000);

    const other = await ownerWithCompany("Other Builders");
    const theirs = await fixtures(other);
    const foreign = await record(
      company.cookie,
      payBody(f, { partyId: theirs.labourId }),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(await errorCode(foreign)).toBe("LABOUR_NOT_FOUND");
    const foreignProject = await record(
      company.cookie,
      payBody(f, { projectId: theirs.tower }),
    );
    expect(foreignProject.status).toBe(StatusCodes.NOT_FOUND);
    const peek = await getPayment(
      jsonRequest(`${BASE}/${vendorPayment.id}`, other.cookie),
      idContext(vendorPayment.id),
    );
    expect(peek.status).toBe(StatusCodes.NOT_FOUND);
    expect(await balance(theirs.labourId)).toBe(100_000);
  });

  it("lists payments by type and kind with cursors and a total", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await record(company.cookie, payBody(f, { amount: 10_000 }));
    await record(
      company.cookie,
      payBody(f, { amount: 20_000, kind: "advance" }),
    );
    await record(
      company.cookie,
      payBody(f, {
        partyType: "vendor",
        partyId: f.vendorId,
        projectId: f.villa,
        amount: 5_000,
      }),
    );
    const all = await json<Page>(
      await listPayments(
        jsonRequest(`${BASE}?projectId=${f.tower}`, company.cookie),
      ),
    );
    expect(all.total).toBe(2);
    expect(all.totalAmount).toBe(30_000);
    expect(all.items.map((item) => item.amount)).toEqual([20_000, 10_000]);

    const advances = await json<Page>(
      await listPayments(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&kind=advance`,
          company.cookie,
        ),
      ),
    );
    expect(advances.items.map((item) => item.kind)).toEqual(["advance"]);

    const first = await json<Page>(
      await listPayments(
        jsonRequest(`${BASE}?projectId=${f.tower}&limit=1`, company.cookie),
      ),
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await json<Page>(
      await listPayments(
        jsonRequest(
          `${BASE}?projectId=${f.tower}&limit=1&after=${first.nextCursor ?? ""}`,
          company.cookie,
        ),
      ),
    );
    expect(second.items[0]?.amount).toBe(10_000);
    expect(second.prevCursor).not.toBeNull();

    const vendors = await json<Page>(
      await listPayments(
        jsonRequest(
          `${BASE}?projectId=${f.villa}&partyType=vendor`,
          company.cookie,
        ),
      ),
    );
    expect(vendors.items.map((item) => item.partyName)).toEqual([
      "Prabhu Gang",
    ]);
  });

  it("hides amounts without Financial, scopes to the Member's Projects, and needs delete to cancel", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clerk = await member(
      company,
      { "labour.labour": ["read", "create"] },
      [f.tower],
    );
    const recorded = await record(clerk.cookie, payBody(f));
    expect(recorded.status).toBe(StatusCodes.CREATED);
    const payment = await json<Payment>(recorded);
    expect(payment.amount).toBeNull();
    expect(await balance(f.labourId)).toBe(70_000);

    const page = await json<Page>(
      await listPayments(
        jsonRequest(`${BASE}?projectId=${f.tower}`, clerk.cookie),
      ),
    );
    expect(page.items[0]?.amount).toBeNull();
    expect(page.totalAmount).toBeNull();

    const vendorList = await listPayments(
      jsonRequest(
        `${BASE}?projectId=${f.tower}&partyType=vendor`,
        clerk.cookie,
      ),
    );
    expect(vendorList.status).toBe(StatusCodes.FORBIDDEN);
    const elsewhere = await record(
      clerk.cookie,
      payBody(f, { projectId: f.villa }),
    );
    expect(elsewhere.status).toBe(StatusCodes.FORBIDDEN);
    const noDelete = await cancel(clerk.cookie, payment.id, payment.updatedAt);
    expect(noDelete.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("applies the Company's back-dated limits to a Member, and the Owner passes them", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        createDays: 2,
        createOverrideDesignationIds: [],
        editDays: 2,
        editOverrideDesignationIds: [],
        modules: {},
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const clerk = await member(
      company,
      { "labour.labour": ["read", "create", "delete", "financial"] },
      [f.tower],
    );
    const old = addDays(TODAY, -5);
    const blocked = await record(
      clerk.cookie,
      payBody(f, { paymentDate: old }),
    );
    expect(blocked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(blocked)).toBe("BACKDATED_CREATE_BLOCKED");
    const recent = await record(
      clerk.cookie,
      payBody(f, { paymentDate: TODAY }),
    );
    expect(recent.status).toBe(StatusCodes.CREATED);

    const byOwner = await record(
      company.cookie,
      payBody(f, { paymentDate: old }),
    );
    expect(byOwner.status).toBe(StatusCodes.CREATED);
    const ownerPayment = await json<Payment>(byOwner);
    const editBlocked = await cancel(
      clerk.cookie,
      ownerPayment.id,
      ownerPayment.updatedAt,
    );
    expect(editBlocked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(editBlocked)).toBe("BACKDATED_EDIT_BLOCKED");
  });

  it("moves the account it was paid from, and cancel puts the money back (CM-707)", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const paid = await record(
      company.cookie,
      payBody(f, { amount: 45_000, reference: "Sept wages" }),
    );
    expect(paid.status).toBe(StatusCodes.CREATED);
    const payment = await json<Payment>(paid);
    expect(payment.account).toEqual({
      id: f.cashId,
      name: "Company's Cash Account",
    });
    expect(await accountBalance(company.workspaceId, f.cashId)).toBe(-45_000n);
    const entries = await prisma.constructionFinanceAccountEntry.findMany({
      where: { sourceType: "wage_payment", sourceId: payment.id },
    });
    expect(entries).toEqual([
      expect.objectContaining({
        accountId: f.cashId,
        projectId: f.tower,
        kind: "payment",
        amount: -45_000n,
        mode: "cash",
        counterpartyKind: "labour",
        counterpartyId: f.labourId,
        counterpartyName: "Dhuresh Nawin",
        narration: "Wage payment",
      }),
    ]);

    const advance = await json<Payment>(
      await record(
        company.cookie,
        payBody(f, {
          kind: "advance",
          mode: "bank",
          amount: 5_000,
          reference: "UTR 99",
        }),
      ),
    );
    expect(await accountBalance(company.workspaceId, f.bankId)).toBe(-5_000n);
    const advanceEntry = await prisma.constructionFinanceAccountEntry.findFirst(
      {
        where: { sourceType: "wage_payment", sourceId: advance.id },
      },
    );
    expect(advanceEntry).toMatchObject({
      mode: null,
      reference: "UTR 99",
      narration: "Advance",
    });

    const listed = await json<Page>(
      await listPayments(
        jsonRequest(`${BASE}?projectId=${f.tower}`, company.cookie),
      ),
    );
    expect(listed.items.map((item) => item.account?.name)).toEqual([
      "Company's Bank Account",
      "Company's Cash Account",
    ]);

    const cancelled = await cancel(
      company.cookie,
      payment.id,
      payment.updatedAt,
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(company.workspaceId, f.cashId)).toBe(0n);
    expect(await accountBalance(company.workspaceId, f.bankId)).toBe(-5_000n);
  });

  it("refuses a missing account, a wrong-kind account, someone else's petty cash and another Company's account", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const missing = await record(
      company.cookie,
      payBody(f, { accountId: undefined }),
    );
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(missing)).toBe("ACCOUNT_REQUIRED");

    const cashFromBank = await record(
      company.cookie,
      payBody(f, { accountId: f.bankId }),
    );
    expect(cashFromBank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(cashFromBank)).toBe("ACCOUNT_MODE_MISMATCH");
    const bankFromCash = await record(
      company.cookie,
      payBody(f, { mode: "bank", accountId: f.cashId }),
    );
    expect(bankFromCash.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(bankFromCash)).toBe("ACCOUNT_MODE_MISMATCH");

    const clerk = await member(
      company,
      { "labour.labour": ["read", "create", "financial"] },
      [f.tower],
    );
    const other = await member(company, {}, []);
    const theirPetty = await addAccount(company.workspaceId, company.userId, {
      kind: "petty_cash",
      holderMemberId: other.memberId,
    });
    const myPetty = await addAccount(company.workspaceId, company.userId, {
      kind: "petty_cash",
      holderMemberId: clerk.memberId,
    });
    const notYours = await record(
      clerk.cookie,
      payBody(f, { accountId: theirPetty }),
    );
    expect(notYours.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(notYours)).toBe("ACCOUNT_NOT_YOURS");
    const own = await record(clerk.cookie, payBody(f, { accountId: myPetty }));
    expect(own.status).toBe(StatusCodes.CREATED);
    expect(await accountBalance(company.workspaceId, myPetty)).toBe(-30_000n);
    // The Owner may pay from anyone's petty cash.
    const byOwner = await record(
      company.cookie,
      payBody(f, { accountId: theirPetty }),
    );
    expect(byOwner.status).toBe(StatusCodes.CREATED);

    const stranger = await ownerWithCompany("Other Builders");
    const theirs = await seededAccounts(stranger.workspaceId);
    const foreign = await record(
      company.cookie,
      payBody(f, { accountId: theirs.cashId }),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(await errorCode(foreign)).toBe("ACCOUNT_NOT_FOUND");
    // Nothing refused reached either ledger.
    expect(await balance(f.labourId)).toBe(40_000);
    expect(await accountBalance(company.workspaceId, f.cashId)).toBe(0n);
  });

  it("uses the Labour Payments back-dated module's own limits, and the closing date blocks cancel", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const owner = await json<Payment>(
      await record(company.cookie, payBody(f, { paymentDate: "2026-09-01" })),
    );
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        financialClosingDate: new Date("2026-09-05T00:00:00Z"),
        modules: {
          labour_payment: {
            mode: "custom",
            create: { days: 1, overrideDesignationIds: [] },
            edit: { days: 1, overrideDesignationIds: [] },
          },
        },
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const clerk = await member(
      company,
      {
        "labour.labour": ["read", "create", "financial"],
        "labour.vendor": ["read", "create", "financial"],
      },
      [f.tower, f.villa],
    );
    const old = addDays(TODAY, -3);
    const labour = await record(clerk.cookie, payBody(f, { paymentDate: old }));
    expect(labour.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(labour)).toBe("BACKDATED_CREATE_BLOCKED");
    // Vendor payments keep the Company's defaults (no limit here).
    const vendor = await record(
      clerk.cookie,
      payBody(f, {
        partyType: "vendor",
        partyId: f.vendorId,
        projectId: f.villa,
        paymentDate: old,
      }),
    );
    expect(vendor.status).toBe(StatusCodes.CREATED);

    const closed = await cancel(company.cookie, owner.id, owner.updatedAt);
    expect(closed.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(closed)).toBe("FINANCIAL_PERIOD_CLOSED");
  });

  it("keeps one receipt per payment: upload, stream, replace and remove", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const payment = await json<Payment>(
      await record(company.cookie, payBody(f)),
    );
    const upload = (bytes: Uint8Array<ArrayBuffer>, type: string) =>
      setReceipt(
        new Request(`${BASE}/${payment.id}/receipt`, {
          method: "POST",
          headers: { "content-type": type, cookie: company.cookie },
          body: bytes,
        }),
        idContext(payment.id),
      );
    const missing = await getReceipt(
      jsonRequest(`${BASE}/${payment.id}/receipt`, company.cookie),
      idContext(payment.id),
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);

    const pdf = new TextEncoder().encode("%PDF-1.4 receipt");
    const set = await upload(pdf, "application/pdf");
    expect(set.status).toBe(StatusCodes.OK);
    const withReceipt = await json<Payment>(set);
    expect(withReceipt.receiptUrl).toMatch(
      new RegExp(`/payments/${payment.id}/receipt\\?v=`),
    );
    const streamed = await getReceipt(
      jsonRequest(`${BASE}/${payment.id}/receipt`, company.cookie),
      idContext(payment.id),
    );
    expect(streamed.headers.get("content-type")).toBe("application/pdf");
    expect(await bytesOf(streamed)).toEqual(pdf);

    const replaced = await json<Payment>(await upload(pngBytes(), "image/png"));
    expect(replaced.receiptUrl).not.toBe(withReceipt.receiptUrl);
    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: company.workspaceId, kind: "wage_payment_receipt" },
    });
    expect(files).toHaveLength(2);
    expect(files.filter((file) => file.deletedAt == null)).toHaveLength(1);

    const wrongType = await upload(
      new TextEncoder().encode("GIF89a"),
      "image/gif",
    );
    expect(wrongType.status).toBe(StatusCodes.BAD_REQUEST);

    const removed = await removeReceipt(
      jsonRequest(`${BASE}/${payment.id}/receipt/remove`, company.cookie, {}),
      idContext(payment.id),
    );
    expect(removed.status).toBe(StatusCodes.OK);
    expect((await json<Payment>(removed)).receiptUrl).toBeNull();
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/labour/payments",
      "/api/construction/labour/payments/payers",
      "/api/construction/labour/payments/{id}",
      "/api/construction/labour/payments/{id}/cancel",
      "/api/construction/labour/payments/{id}/receipt",
      "/api/construction/labour/payments/{id}/receipt/remove",
      "/api/construction/labour/balances",
      "/api/construction/labour/balances/statement",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const schema of [
      "RecordConstructionLabourWagePaymentRequest",
      "ConstructionLabourWagePaymentResponse",
      "GetConstructionLabourBalancesResponse",
      "GetConstructionLabourStatementResponse",
    ])
      expect(document.components.schemas[schema], schema).toBeDefined();
  });
});
