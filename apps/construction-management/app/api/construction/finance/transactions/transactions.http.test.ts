import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openApiDocument } from "@/app/api/_lib/openapi-document";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { watchEvents } from "@/test/dispatched-events";
import { accountBalance, addAccount, seededAccounts } from "@/test/finance";
import { addContractor } from "@/test/procurement";
import { sharedAssign } from "@/test/site-work";

import { POST as approveTransfer } from "../transfers/[id]/approve/route";
import { POST as deleteTransfer } from "../transfers/[id]/delete/route";
import { POST as updateTransfer } from "../transfers/[id]/update/route";
import { POST as createTransfer } from "../transfers/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as bulk } from "./bulk/route";
import { POST as importRoute } from "./import/route";
import { GET as sample } from "./import-sample/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/finance/transactions";
const TRANSFERS = "http://localhost/api/construction/finance/transfers";
const TODAY = todayIn("Asia/Kolkata");

type Txn = {
  type: "transaction";
  id: string;
  number: string;
  approvalStatus: string;
  amount: number;
  updatedAt: string;
  counterparty: { kind: string | null; name: string } | null;
  actions: Record<string, boolean>;
};
type Transfer = Omit<Txn, "type" | "counterparty"> & { type: "transfer" };
type Envelope = { code: string; message: string; details?: unknown };

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup() {
  const company = await newCompany();
  const projectId = await addProject(company.workspaceId, company.ownerId);
  const accounts = await seededAccounts(company.workspaceId);
  actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
  return { ...company, projectId, ...accounts };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function body(s: Setup, extra: Record<string, unknown> = {}) {
  return {
    projectId: s.projectId,
    transactionDate: TODAY,
    type: "payment_out",
    accountId: s.bankId,
    mode: "online",
    reference: `UTR${randomUUID().slice(0, 8)}`,
    counterparty: { kind: null, id: null, name: "HDFC Bank" },
    amount: 1_000_00,
    description: "Bank charges",
    ...extra,
  };
}

async function createTxn(
  s: Setup,
  extra: Record<string, unknown> = {},
): Promise<Txn> {
  const response = await create(post(BASE, body(s, extra)));
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await response.json()) as Txn;
}

async function code(response: Response): Promise<string> {
  return ((await response.json()) as Envelope).code;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Transactions (CM-702)", () => {
  it("is pending and moves nothing until approved; approval posts the entry", async () => {
    const s = await setup();
    const txn = await createTxn(s);
    expect(txn.number).toMatch(/^TXN\/\d{2}-\d{2}\/00001$/);
    expect(txn.approvalStatus).toBe("pending");
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);

    const approved = await approve(
      post(`${BASE}/${txn.id}/approve`, { expectedUpdatedAt: txn.updatedAt }),
      params(txn.id),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    expect(((await approved.json()) as Txn).approvalStatus).toBe("approved");
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(-1_000_00n);
    const entry = await prisma.constructionFinanceAccountEntry.findFirstOrThrow(
      {
        where: { sourceId: txn.id },
      },
    );
    expect(entry).toMatchObject({
      kind: "payment",
      mode: "online",
      counterpartyName: "HDFC Bank",
      documentNumber: txn.number,
      projectId: s.projectId,
      narration: "Bank charges",
    });

    // Approving twice is refused.
    const again = await approve(
      post(`${BASE}/${txn.id}/approve`, {}),
      params(txn.id),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await code(again)).toBe("TRANSACTION_NOT_PENDING");
  });

  it("Save & Approve posts at once; Payment In adds money", async () => {
    const s = await setup();
    const txn = await createTxn(s, {
      type: "payment_in",
      accountId: s.cashId,
      mode: "cash",
      reference: null,
      amount: 5_000_00,
      approve: true,
    });
    expect(txn.approvalStatus).toBe("approved");
    expect(await accountBalance(s.workspaceId, s.cashId)).toBe(5_000_00n);
  });

  it("checks the mode against the account and the reference", async () => {
    const s = await setup();
    const upiOnCash = await create(
      post(BASE, body(s, { accountId: s.cashId, mode: "upi" })),
    );
    expect(upiOnCash.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(upiOnCash)).toBe("ACCOUNT_MODE_MISMATCH");
    const noCheque = await create(
      post(BASE, body(s, { mode: "cheque", chequeNumber: "" })),
    );
    expect(await code(noCheque)).toBe("CHEQUE_NUMBER_REQUIRED");
    const noRef = await create(post(BASE, body(s, { reference: "" })));
    expect(await code(noRef)).toBe("REFERENCE_REQUIRED");
    const zero = await create(post(BASE, body(s, { amount: 0 })));
    expect(await code(zero)).toBe("AMOUNT_INVALID");
  });

  it("refuses someone else's petty cash with 403", async () => {
    const s = await setup();
    const ravi = await addMember(s.workspaceId, s.ownerId, {
      "finance.transactions": ["create", "read"],
    });
    const meena = await addMember(s.workspaceId, s.ownerId, {});
    await sharedAssign(ravi.memberId, s.projectId);
    const meenaPetty = await addAccount(s.workspaceId, s.ownerId, {
      kind: "petty_cash",
      holderMemberId: meena.memberId,
    });
    const raviPetty = await addAccount(s.workspaceId, s.ownerId, {
      kind: "petty_cash",
      holderMemberId: ravi.memberId,
    });
    actAs({ userId: ravi.userId, workspaceId: s.workspaceId, role: "member" });
    const other = await create(
      post(
        BASE,
        body(s, { accountId: meenaPetty, mode: "cash", reference: null }),
      ),
    );
    expect(other.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(other)).toBe("ACCOUNT_NOT_YOURS");
    const own = await create(
      post(
        BASE,
        body(s, { accountId: raviPetty, mode: "cash", reference: null }),
      ),
    );
    expect(own.status).toBe(StatusCodes.CREATED);
    // Without Approve, Save & Approve is refused.
    const saveApprove = await create(post(BASE, body(s, { approve: true })));
    expect(saveApprove.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("validates the Paid To party and keeps its name", async () => {
    const s = await setup();
    const contractorId = await addContractor(s.workspaceId, s.ownerId, [
      s.projectId,
    ]);
    const txn = await createTxn(s, {
      counterparty: { kind: "contractor", id: contractorId, name: "" },
    });
    expect(txn.counterparty?.kind).toBe("contractor");
    expect(txn.counterparty?.name).toMatch(/^Velan Constructions/);
    const missing = await create(
      post(
        BASE,
        body(s, {
          counterparty: { kind: "supplier", id: randomUUID(), name: "" },
        }),
      ),
    );
    expect(await code(missing)).toBe("COUNTERPARTY_NOT_FOUND");
  });

  it("editing an approved Transaction reverses it and returns it to pending", async () => {
    const s = await setup();
    const txn = await createTxn(s, { approve: true });
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(-1_000_00n);
    const edited = await update(
      post(`${BASE}/${txn.id}/update`, {
        ...body(s, { amount: 1_500_00 }),
        expectedUpdatedAt: txn.updatedAt,
      }),
      params(txn.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const pending = (await edited.json()) as Txn;
    expect(pending.approvalStatus).toBe("pending");
    expect(pending.amount).toBe(1_500_00);
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);

    const stale = await update(
      post(`${BASE}/${txn.id}/update`, {
        ...body(s),
        expectedUpdatedAt: txn.updatedAt,
      }),
      params(txn.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await code(stale)).toBe("TRANSACTION_CHANGED");

    await approve(post(`${BASE}/${txn.id}/approve`, {}), params(txn.id));
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(-1_500_00n);
  });

  it("a rejected Transaction is edited back to pending; delete of an approved one reverses", async () => {
    const s = await setup();
    const txn = await createTxn(s);
    const noReason = await reject(
      post(`${BASE}/${txn.id}/reject`, { reason: " " }),
      params(txn.id),
    );
    expect(await code(noReason)).toBe("REJECTION_REASON_REQUIRED");
    const rejected = (await (
      await reject(
        post(`${BASE}/${txn.id}/reject`, { reason: "Wrong account" }),
        params(txn.id),
      )
    ).json()) as Txn & { rejectReason: string };
    expect(rejected.approvalStatus).toBe("rejected");
    expect(rejected.rejectReason).toBe("Wrong account");
    const resubmitted = (await (
      await update(
        post(`${BASE}/${txn.id}/update`, {
          ...body(s),
          expectedUpdatedAt: rejected.updatedAt,
        }),
        params(txn.id),
      )
    ).json()) as Txn;
    expect(resubmitted.approvalStatus).toBe("pending");

    const approved = (await (
      await approve(post(`${BASE}/${txn.id}/approve`, {}), params(txn.id))
    ).json()) as Txn;
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(-1_000_00n);
    const deleted = await remove(
      post(`${BASE}/${txn.id}/delete`, {
        expectedUpdatedAt: approved.updatedAt,
      }),
      params(txn.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);
    const gone = await getOne(new Request(`${BASE}/${txn.id}`), params(txn.id));
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses to approve on or before the Financial Closing Date", async () => {
    const s = await setup();
    const yesterday = addDays(TODAY, -1);
    const txn = await createTxn(s, { transactionDate: yesterday });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: s.workspaceId,
        createDays: 0,
        createOverrideRoleIds: [],
        editDays: 0,
        editOverrideRoleIds: [],
        financialClosingDate: calendarDateToDb(yesterday),
        modules: {},
        createdBy: s.ownerId,
        updatedBy: s.ownerId,
      },
    });
    const refused = await approve(
      post(`${BASE}/${txn.id}/approve`, {}),
      params(txn.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(refused)).toBe("FINANCIAL_PERIOD_CLOSED");
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);
  });

  it("refuses a duplicate reference on the account unless confirmed", async () => {
    const s = await setup();
    const first = await createTxn(s, { reference: "UTR 555" });
    const second = await create(post(BASE, body(s, { reference: "utr555" })));
    expect(second.status).toBe(StatusCodes.CONFLICT);
    const envelope = (await second.json()) as Envelope & {
      details: { document: { number: string; id: string } };
    };
    expect(envelope.code).toBe("DUPLICATE_REFERENCE");
    expect(envelope.details.document.id).toBe(first.id);
    const confirmed = await create(
      post(
        BASE,
        body(s, { reference: "utr555", confirmDuplicateReference: true }),
      ),
    );
    expect(confirmed.status).toBe(StatusCodes.CREATED);
    // A rejected one no longer counts.
    await reject(
      post(`${BASE}/${first.id}/reject`, { reason: "dup" }),
      params(first.id),
    );
  });

  it("lists with filters and totals, and bulk-decides all or none", async () => {
    const s = await setup();
    const out1 = await createTxn(s, { amount: 300_00 });
    const out2 = await createTxn(s, { amount: 200_00 });
    const in1 = await createTxn(s, {
      type: "payment_in",
      accountId: s.cashId,
      mode: "cash",
      reference: null,
      amount: 1_000_00,
    });
    const transfer = (await (
      await createTransfer(
        post(TRANSFERS, {
          projectId: s.projectId,
          transferDate: TODAY,
          fromAccountId: s.cashId,
          toAccountId: s.bankId,
          mode: "cash",
          amount: 50_00,
        }),
      )
    ).json()) as Transfer;
    // Another Project's Transaction is not listed.
    const other = await addProject(s.workspaceId, s.ownerId);
    await createTxn(s, { projectId: other });

    const page = (await (
      await list(new Request(`${BASE}?projectId=${s.projectId}`))
    ).json()) as {
      items: (Txn | Transfer)[];
      total: number;
      totals: { in: number; out: number; transfer: number };
    };
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.id)).toEqual([
      transfer.id,
      in1.id,
      out2.id,
      out1.id,
    ]);
    expect(page.totals).toEqual({ in: 1_000_00, out: 500_00, transfer: 50_00 });

    const outs = (await (
      await list(
        new Request(`${BASE}?projectId=${s.projectId}&type=out&limit=1`),
      )
    ).json()) as { items: Txn[]; total: number; nextCursor: string };
    expect(outs.total).toBe(2);
    expect(outs.items.map((item) => item.id)).toEqual([out2.id]);
    const next = (await (
      await list(
        new Request(
          `${BASE}?projectId=${s.projectId}&type=out&limit=1&after=${outs.nextCursor}`,
        ),
      )
    ).json()) as { items: Txn[] };
    expect(next.items.map((item) => item.id)).toEqual([out1.id]);

    // One already rejected: the bulk approve refuses and changes nothing.
    await reject(
      post(`${BASE}/${out1.id}/reject`, { reason: "No" }),
      params(out1.id),
    );
    const refused = await bulk(
      post(`${BASE}/bulk`, {
        approve: true,
        items: [
          { type: "transaction", id: out2.id },
          { type: "transaction", id: out1.id },
        ],
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("BULK_DECISION_REFUSED");
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);

    const done = await bulk(
      post(`${BASE}/bulk`, {
        approve: true,
        items: [
          { type: "transaction", id: out2.id },
          { type: "transaction", id: in1.id },
          { type: "transfer", id: transfer.id },
        ],
      }),
    );
    expect(done.status).toBe(StatusCodes.OK);
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(
      -200_00n + 50_00n,
    );
    expect(await accountBalance(s.workspaceId, s.cashId)).toBe(
      1_000_00n - 50_00n,
    );

    // The company-wide list is the Owner's.
    const all = (await (await list(new Request(BASE))).json()) as {
      total: number;
    };
    expect(all.total).toBe(5);
  });

  it("raises document.submitted, approved and rejected for notifications (CM-904)", async () => {
    const s = await setup();
    const events = watchEvents();
    const txn = await createTxn(s);
    expect(events.of("document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "transaction",
        documentId: txn.id,
        projectId: s.projectId,
        number: txn.number,
        submittedBy: s.ownerId,
      }),
    ]);
    const rejected = (await (
      await reject(
        post(`${BASE}/${txn.id}/reject`, { reason: "Wrong account" }),
        params(txn.id),
      )
    ).json()) as Txn;
    expect(events.of("document.rejected")).toEqual([
      expect.objectContaining({
        documentType: "transaction",
        documentId: txn.id,
        number: txn.number,
        rejectedBy: s.ownerId,
        createdBy: s.ownerId,
        reason: "Wrong account",
      }),
    ]);
    await update(
      post(`${BASE}/${txn.id}/update`, {
        ...body(s),
        expectedUpdatedAt: rejected.updatedAt,
      }),
      params(txn.id),
    );
    expect(events.of("document.submitted")).toHaveLength(2);
    await bulk(
      post(`${BASE}/bulk`, {
        approve: true,
        items: [{ type: "transaction", id: txn.id }],
      }),
    );
    expect(events.of("document.approved")).toEqual([
      expect.objectContaining({
        documentType: "transaction",
        documentId: txn.id,
        number: txn.number,
        approvedBy: s.ownerId,
        createdBy: s.ownerId,
      }),
    ]);
    const direct = await createTxn(s, { approve: true });
    expect(events.of("document.submitted")).toHaveLength(2);
    expect(events.of("document.approved").at(-1)).toMatchObject({
      documentId: direct.id,
    });
  });

  it("needs Transactions flags on the Project", async () => {
    const s = await setup();
    const txn = await createTxn(s);
    const reader = await addMember(s.workspaceId, s.ownerId, {
      "finance.transactions": ["read"],
    });
    actAs({
      userId: reader.userId,
      workspaceId: s.workspaceId,
      role: "member",
    });
    // Not on the Project yet.
    const off = await list(new Request(`${BASE}?projectId=${s.projectId}`));
    expect(off.status).toBe(StatusCodes.FORBIDDEN);
    await sharedAssign(reader.memberId, s.projectId);
    const on = await getOne(new Request(`${BASE}/${txn.id}`), params(txn.id));
    expect(on.status).toBe(StatusCodes.OK);
    expect(((await on.json()) as Txn).actions).toEqual({
      approve: false,
      reject: false,
      edit: false,
      delete: false,
    });
    expect((await create(post(BASE, body(s)))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await approve(post(`${BASE}/${txn.id}/approve`, {}), params(txn.id)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await list(new Request(BASE))).status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", () => {
    const paths = Object.keys(openApiDocument.paths);
    for (const path of [
      "/api/construction/finance/transactions",
      "/api/construction/finance/transactions/{id}/approve",
      "/api/construction/finance/transactions/bulk",
      "/api/construction/finance/transactions/import",
      "/api/construction/finance/transfers",
      "/api/construction/finance/transfers/{id}/update",
      "/api/construction/finance/accounts/{id}/statement",
    ])
      expect(paths).toContain(path);
  });
});

describe("Transfers (CM-702)", () => {
  it("posts both sides on approval; edit and delete reverse both", async () => {
    const s = await setup();
    const ravi = await addMember(s.workspaceId, s.ownerId, {});
    const petty = await addAccount(s.workspaceId, s.ownerId, {
      kind: "petty_cash",
      holderMemberId: ravi.memberId,
    });
    const created = await createTransfer(
      post(TRANSFERS, {
        projectId: s.projectId,
        transferDate: TODAY,
        fromAccountId: s.bankId,
        toAccountId: petty,
        mode: "upi",
        reference: "UPI-1",
        amount: 2_000_00,
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const transfer = (await created.json()) as Transfer;
    expect(transfer.number).toMatch(/^TXN\//);
    await approveTransfer(
      post(`${TRANSFERS}/${transfer.id}/approve`, {}),
      params(transfer.id),
    );
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(-2_000_00n);
    expect(await accountBalance(s.workspaceId, petty)).toBe(2_000_00n);
    const kinds = (
      await prisma.constructionFinanceAccountEntry.findMany({
        where: { sourceId: transfer.id },
        orderBy: { amount: "asc" },
      })
    ).map((entry) => entry.kind);
    expect(kinds).toEqual(["transfer_out", "transfer_in"]);

    const current = (await (
      await import("../transfers/[id]/route").then((route) =>
        route.GET(
          new Request(`${TRANSFERS}/${transfer.id}`),
          params(transfer.id),
        ),
      )
    ).json()) as Transfer;
    const edited = await updateTransfer(
      post(`${TRANSFERS}/${transfer.id}/update`, {
        transferDate: TODAY,
        fromAccountId: s.bankId,
        toAccountId: petty,
        mode: "upi",
        reference: "UPI-1",
        amount: 3_000_00,
        expectedUpdatedAt: current.updatedAt,
      }),
      params(transfer.id),
    );
    expect(((await edited.json()) as Transfer).approvalStatus).toBe("pending");
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);
    expect(await accountBalance(s.workspaceId, petty)).toBe(0n);

    const approved = (await (
      await approveTransfer(
        post(`${TRANSFERS}/${transfer.id}/approve`, {}),
        params(transfer.id),
      )
    ).json()) as Transfer;
    expect(await accountBalance(s.workspaceId, petty)).toBe(3_000_00n);
    const deleted = await deleteTransfer(
      post(`${TRANSFERS}/${transfer.id}/delete`, {
        expectedUpdatedAt: approved.updatedAt,
      }),
      params(transfer.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(await accountBalance(s.workspaceId, petty)).toBe(0n);
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);
  });

  it("checks the mode against the from account and refuses the same account", async () => {
    const s = await setup();
    const cashUpi = await createTransfer(
      post(TRANSFERS, {
        transferDate: TODAY,
        fromAccountId: s.cashId,
        toAccountId: s.bankId,
        mode: "upi",
        reference: "X",
        amount: 100,
        projectId: s.projectId,
      }),
    );
    expect(await code(cashUpi)).toBe("ACCOUNT_MODE_MISMATCH");
    const same = await createTransfer(
      post(TRANSFERS, {
        transferDate: TODAY,
        fromAccountId: s.cashId,
        toAccountId: s.cashId,
        mode: "cash",
        amount: 100,
        projectId: s.projectId,
      }),
    );
    expect(await code(same)).toBe("TRANSFER_SAME_ACCOUNT");
    // Cash deposited into the bank: Cash fits the from (cash) account.
    const deposit = await createTransfer(
      post(TRANSFERS, {
        transferDate: TODAY,
        fromAccountId: s.cashId,
        toAccountId: s.bankId,
        mode: "cash",
        amount: 100,
        projectId: s.projectId,
      }),
    );
    expect(deposit.status).toBe(StatusCodes.CREATED);
  });
});

async function workbook(rows: unknown[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Transactions");
  sheet.addRow([
    "Date",
    "Type",
    "Account",
    "Mode",
    "Cheque No / Reference",
    "Payment Category",
    "Paid To / Received From",
    "Amount (₹)",
    "Description",
  ]);
  for (const row of rows) sheet.addRow(row);
  return Uint8Array.from(
    (await book.xlsx.writeBuffer()) as unknown as Uint8Array,
  );
}

function upload(url: string, bytes: Uint8Array): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    body: Buffer.from(bytes),
  });
}

describe("Transactions import (CM-702)", () => {
  it("downloads a sample with the headers", async () => {
    const s = await setup();
    const response = await sample(
      new Request(`${BASE}/import-sample?projectId=${s.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await response.arrayBuffer());
    const header = book.getWorksheet("Transactions")?.getRow(1).values;
    expect(header).toContain("Paid To / Received From");
    expect(book.getWorksheet("Transactions")?.getRow(2).getCell(3).value).toBe(
      "Company's Bank Account",
    );
  });

  it("imports every row as pending, or none with per-row errors", async () => {
    const s = await setup();
    const bad = await workbook([
      [
        "05/10/2026",
        "Payment Out",
        "Company's Bank Account",
        "Online",
        "U1",
        "Fuel",
        "Indian Oil",
        1200,
        "Diesel",
      ],
      ["31/02/2026", "Payment Sideways", "Nope", "UPI", "", "", "", "abc", ""],
      [
        "06/10/2026",
        "Payment In",
        "Company's Cash Account",
        "UPI",
        "U2",
        "",
        "",
        10,
        "",
      ],
    ]);
    const refused = await importRoute(
      upload(`${BASE}/import?projectId=${s.projectId}`, bad),
    );
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    const envelope = (await refused.json()) as Envelope & {
      details: { errors: { row: number; field: string }[] };
    };
    expect(envelope.code).toBe("IMPORT_HAS_ERRORS");
    expect(envelope.details.errors.map((e) => [e.row, e.field])).toEqual([
      [3, "Date"],
      [3, "Type"],
      [3, "Account"],
      [3, "Amount (₹)"],
      [4, "Account"],
    ]);
    expect(
      await prisma.constructionFinanceTransaction.count({
        where: { workspaceId: s.workspaceId },
      }),
    ).toBe(0);

    const good = await workbook([
      [
        new Date(Date.UTC(2026, 9, 5)),
        "Payment Out",
        "company's bank account",
        "Online",
        "U1",
        "Fuel",
        "Indian Oil",
        1200.5,
        "Diesel",
      ],
      [
        "06-10-2026",
        "payment in",
        "Company's Cash Account",
        "Cash",
        "",
        "",
        "Owner",
        "25,000",
        "Capital",
      ],
    ]);
    const imported = await importRoute(
      upload(`${BASE}/import?projectId=${s.projectId}`, good),
    );
    expect(imported.status).toBe(StatusCodes.CREATED);
    const result = (await imported.json()) as {
      imported: number;
      importBatchId: string;
    };
    expect(result.imported).toBe(2);
    const rows = await prisma.constructionFinanceTransaction.findMany({
      where: { importBatchId: result.importBatchId },
      orderBy: { number: "asc" },
    });
    expect(
      rows.map((row) => [
        row.approvalStatus,
        Number(row.amount),
        row.counterpartyName,
      ]),
    ).toEqual([
      ["pending", 1_200_50, "Indian Oil"],
      ["pending", 25_000_00, "Owner"],
    ]);
    expect(await accountBalance(s.workspaceId, s.bankId)).toBe(0n);

    // A reference already used on the account is a row error.
    const dup = await importRoute(
      upload(
        `${BASE}/import?projectId=${s.projectId}`,
        await workbook([
          [
            "07/10/2026",
            "Payment Out",
            "Company's Bank Account",
            "Online",
            "U1",
            "",
            "",
            1,
            "",
          ],
        ]),
      ),
    );
    const dupErrors = (
      (await dup.json()) as {
        details: { errors: { field: string; message: string }[] };
      }
    ).details.errors;
    expect(dupErrors[0]?.field).toBe("Cheque No / Reference");
  });
});
