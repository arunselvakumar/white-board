import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { addProject, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";

import { POST as removeFile } from "./[type]/[id]/files/[fileId]/delete/route";
import { GET as getFile } from "./[type]/[id]/files/[fileId]/route";
import { GET as getThumbnail } from "./[type]/[id]/files/[fileId]/thumbnail/route";
import {
  POST as completeUpload,
  GET as listFiles,
} from "./[type]/[id]/files/route";
import { POST as receiveUpload } from "./[type]/[id]/files/uploads/app/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";
import {
  GET as listRemarks,
  POST as postRemark,
} from "./[type]/[id]/remarks/route";
import {
  PDF,
  WEBP,
  XLSX,
  documentBase,
  documentParams,
  fileParams,
  get,
  jsonPost,
  uploadFile,
  type UploadedFile,
} from "./document-test-fixtures";
import {
  addInvoiceRow,
  addPettyCashAccountRow,
  addSettlementRow,
  addTransactionRow,
  addVoucherRow,
  deleteFinanceRow,
} from "./document-test-rows";

type FileList = {
  items: UploadedFile[];
  totalBytes: number;
  canUpload: boolean;
};

type Thread = {
  items: {
    id: string;
    body: string;
    createdBy: string;
    createdByName: string | null;
    files: { id: string; remarkId: string | null; fileName: string }[];
  }[];
  canComment: boolean;
  canAttach: boolean;
};

const PNG = pngBytes();
const storage = objectStorage();

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function thread(cookie: string, type: string, id: string) {
  return listRemarks(
    get(`${documentBase(type, id)}/remarks`, cookie),
    documentParams(type, id),
  );
}

function post(
  cookie: string,
  type: string,
  id: string,
  body: { body: string; fileIds?: string[] },
) {
  return postRemark(
    jsonPost(`${documentBase(type, id)}/remarks`, cookie, body),
    documentParams(type, id),
  );
}

function list(cookie: string, type: string, id: string) {
  return listFiles(
    get(`${documentBase(type, id)}/files`, cookie),
    documentParams(type, id),
  );
}

function start(
  cookie: string,
  type: string,
  id: string,
  fileName: string,
  bytes: number,
) {
  return startUpload(
    jsonPost(`${documentBase(type, id)}/files/uploads`, cookie, {
      fileName,
      bytes,
    }),
    documentParams(type, id),
  );
}

function remove(cookie: string, type: string, id: string, fileId: string) {
  return removeFile(
    jsonPost(`${documentBase(type, id)}/files/${fileId}/delete`, cookie, {}),
    fileParams(type, id, fileId),
  );
}

/** A Company, a Project and the Owner. */
async function setUp() {
  const company = await ownerWithCompany();
  const projectId = await addProject(company.workspaceId, company.userId);
  return { company, projectId };
}

describe("Remarks and files on finance documents (ADR CM-0017)", () => {
  it("lets a member with Read only comment, but not upload", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const reader = await memberWith(company, {
      "finance.transactions": ["read"],
    });
    await sharedAssign(reader.memberId, projectId);

    const posted = await post(reader.cookie, "transaction", txn.id, {
      body: "  Bank charges for the October statement.  ",
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    const listed = await json<Thread>(
      await thread(reader.cookie, "transaction", txn.id),
    );
    expect(listed).toMatchObject({ canComment: true, canAttach: false });
    expect(listed.items).toEqual([
      expect.objectContaining({
        body: "Bank charges for the October statement.",
        createdBy: reader.userId,
        createdByName: "Member",
        files: [],
      }),
    ]);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          action: "finance_remark.created",
        },
      }),
    ).toBe(1);

    const refused = await start(
      reader.cookie,
      "transaction",
      txn.id,
      "Receipt.png",
      PNG.byteLength,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(refused)).toBe("PERMISSION_DENIED");
    expect(
      (await json<FileList>(await list(reader.cookie, "transaction", txn.id)))
        .canUpload,
    ).toBe(false);

    // Off the Project, or without Read on Transactions: 403.
    const elsewhere = await memberWith(company, {
      "finance.transactions": ["read"],
    });
    expect((await thread(elsewhere.cookie, "transaction", txn.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const otherMenu = await memberWith(company, {
      "finance.other_expenses": ["read", "create", "update"],
    });
    await sharedAssign(otherMenu.memberId, projectId);
    expect(
      (await post(otherMenu.cookie, "transaction", txn.id, { body: "Fine" }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);

    // A Transaction with no Project: the menu alone decides.
    const companyWide = await addTransactionRow(
      company.workspaceId,
      company.userId,
      null,
    );
    expect(
      (await thread(elsewhere.cookie, "transaction", companyWide.id)).status,
    ).toBe(StatusCodes.OK);
  });

  it("posts a remark with the poster's receipt and refuses an empty one", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const receipt = await uploadFile(
      company.cookie,
      "transaction",
      txn.id,
      "Bank slip.png",
      PNG,
    );
    const empty = await post(company.cookie, "transaction", txn.id, {
      body: "   ",
    });
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(empty)).toBe("REMARK_REQUIRED");
    const tooMany = await post(company.cookie, "transaction", txn.id, {
      body: "Receipts",
      fileIds: Array.from({ length: 11 }, () => randomUUID()),
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);

    const posted = await post(company.cookie, "transaction", txn.id, {
      body: "Deposit slip attached.",
      fileIds: [receipt.id],
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    const listed = await json<Thread>(
      await thread(company.cookie, "transaction", txn.id),
    );
    expect(listed.items[0]?.files).toEqual([
      expect.objectContaining({ id: receipt.id, fileName: "Bank slip.png" }),
    ]);
    const again = await post(company.cookie, "transaction", txn.id, {
      body: "Again",
      fileIds: [receipt.id],
    });
    expect(again.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(again)).toBe("DOCUMENT_FILE_NOT_FOUND");
  });

  it("takes PDFs and images, never other files, and keeps them out of the Gallery", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const bill = await uploadFile(
      company.cookie,
      "transaction",
      txn.id,
      "Cement bill.pdf",
      PDF,
    );
    expect(bill).toMatchObject({
      contentType: "application/pdf",
      viewable: true,
      url: `/api/construction/finance/documents/transaction/${txn.id}/files/${bill.id}`,
    });
    const photo = await uploadFile(
      company.cookie,
      "transaction",
      txn.id,
      "Receipt.webp",
      WEBP,
      { thumbnail: WEBP },
    );
    expect(photo.thumbUrl).toBe(`${photo.url}/thumbnail`);
    const row = await prisma.constructionFinanceDocumentFile.findUnique({
      where: { id: photo.id },
    });
    expect(row?.fileKey).toContain(`/finance-documents/${txn.id}/${photo.id}.`);
    const shown = await getFile(
      get(`${TEST_ORIGIN}${photo.url}`, company.cookie),
      fileParams("transaction", txn.id, photo.id),
    );
    expect(shown.status).toBe(StatusCodes.OK);
    expect(shown.headers.get("content-type")).toBe("image/webp");
    expect(shown.headers.get("cache-control")).toBe("private, no-store");
    expect(await bytesOf(shown)).toEqual(WEBP);
    const thumb = await getThumbnail(
      get(`${TEST_ORIGIN}${photo.url}/thumbnail`, company.cookie),
      fileParams("transaction", txn.id, photo.id),
    );
    expect(thumb.status).toBe(StatusCodes.OK);
    // A receipt is not a site photo.
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(0);

    const sheet = await start(
      company.cookie,
      "transaction",
      txn.id,
      "Statement.xlsx",
      XLSX.byteLength,
    );
    expect(sheet.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(sheet)).toBe("FILE_TYPE_NOT_ALLOWED");

    // An xlsx named like a PDF is refused by its content at completion.
    const context = documentParams("transaction", txn.id);
    const started = await start(
      company.cookie,
      "transaction",
      txn.id,
      "Disguised.pdf",
      XLSX.byteLength,
    );
    expect(started.status).toBe(StatusCodes.CREATED);
    const begun = await json<{
      key: string;
      fileName: string;
      upload: { via: "app"; url: string };
    }>(started);
    await receiveUpload(
      new Request(`${TEST_ORIGIN}${begun.upload.url}`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          cookie: company.cookie,
        },
        body: Uint8Array.from(XLSX),
      }),
      context,
    );
    const disguised = await completeUpload(
      jsonPost(`${documentBase("transaction", txn.id)}/files`, company.cookie, {
        key: begun.key,
        fileName: begun.fileName,
      }),
      context,
    );
    expect(disguised.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(disguised)).toBe("FILE_TYPE_NOT_ALLOWED");

    const big = await start(
      company.cookie,
      "transaction",
      txn.id,
      "Huge.jpg",
      25 * 1024 * 1024 + 1,
    );
    expect(big.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(big)).toBe("FILE_TOO_LARGE");
  });

  it("keeps at most 20 files on a document", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    await prisma.constructionFinanceDocumentFile.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: company.workspaceId,
        documentType: "transaction" as const,
        documentId: txn.id,
        fileKey: `companies/${company.workspaceId}/finance-documents/${txn.id}/${randomUUID()}.png`,
        fileName: `Receipt ${String(index + 1)}.png`,
        contentType: "image/png",
        bytes: 1000,
        createdBy: company.userId,
      })),
    });
    const full = await start(
      company.cookie,
      "transaction",
      txn.id,
      "One more.png",
      PNG.byteLength,
    );
    expect(full.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(full)).toBe("DOCUMENT_FILES_LIMIT");
    await prisma.constructionFinanceDocumentFile.updateMany({
      where: { documentId: txn.id, fileName: "Receipt 1.png" },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    const room = await start(
      company.cookie,
      "transaction",
      txn.id,
      "One more.png",
      PNG.byteLength,
    );
    expect(room.status).toBe(StatusCodes.CREATED);
  });

  it("removes any file with Update, only one's own with Create", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const owners = await uploadFile(
      company.cookie,
      "transaction",
      txn.id,
      "Statement.pdf",
      PDF,
    );
    const creator = await memberWith(company, {
      "finance.transactions": ["read", "create"],
    });
    const editor = await memberWith(company, {
      "finance.transactions": ["read", "update"],
    });
    await sharedAssign(creator.memberId, projectId);
    await sharedAssign(editor.memberId, projectId);

    const mine = await uploadFile(
      creator.cookie,
      "transaction",
      txn.id,
      "Counterfoil.png",
      PNG,
    );
    const asCreator = await json<FileList>(
      await list(creator.cookie, "transaction", txn.id),
    );
    expect(
      asCreator.items.map((item) => [item.fileName, item.canRemove]),
    ).toEqual([
      ["Statement.pdf", false],
      ["Counterfoil.png", true],
    ]);
    const notTheirs = await remove(
      creator.cookie,
      "transaction",
      txn.id,
      owners.id,
    );
    expect(notTheirs.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(notTheirs)).toBe("PERMISSION_DENIED");
    expect(
      (await remove(creator.cookie, "transaction", txn.id, mine.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await remove(editor.cookie, "transaction", txn.id, owners.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);

    const row = await prisma.constructionFinanceDocumentFile.findUnique({
      where: { id: owners.id },
    });
    expect(row?.deletedBy).toBe(editor.userId);
    expect(await storage.head(row?.fileKey ?? "")).toBeNull();
    const gone = await getFile(
      get(`${TEST_ORIGIN}${owners.url}`, company.cookie),
      fileParams("transaction", txn.id, owners.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(gone)).toBe("DOCUMENT_FILE_NOT_FOUND");
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          action: {
            in: [
              "finance_document_file.added",
              "finance_document_file.removed",
            ],
          },
        },
      }),
    ).toBe(4);
  });

  it("hides another holder's petty-cash voucher without View all", async () => {
    const { company, projectId } = await setUp();
    const holder = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const other = await memberWith(company, {
      "finance.petty_cash": ["read", "create"],
    });
    const auditor = await memberWith(company, {
      "finance.petty_cash": ["read", "view_all"],
    });
    for (const member of [holder, other, auditor])
      await sharedAssign(member.memberId, projectId);
    const accountId = await addPettyCashAccountRow(
      company.workspaceId,
      company.userId,
      holder.memberId,
    );
    const voucher = await addVoucherRow(
      company.workspaceId,
      holder.userId,
      accountId,
      projectId,
    );

    const hidden = await thread(other.cookie, "petty_cash_voucher", voucher.id);
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(hidden)).toBe("PETTY_CASH_VOUCHER_NOT_FOUND");
    const receipt = await uploadFile(
      holder.cookie,
      "petty_cash_voucher",
      voucher.id,
      "Tea bill.png",
      PNG,
    );
    expect(receipt.canRemove).toBe(true);
    const seen = await json<FileList>(
      await list(auditor.cookie, "petty_cash_voucher", voucher.id),
    );
    expect(seen).toMatchObject({ canUpload: false });
    expect(seen.items.map((item) => item.fileName)).toEqual(["Tea bill.png"]);
    expect(
      (
        await post(company.cookie, "petty_cash_voucher", voucher.id, {
          body: "Keep the shop's bill next time.",
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("keeps a Store-located invoice to the Owner, and settles on its invoice's Project", async () => {
    const { company, projectId } = await setUp();
    const parties = await memberWith(company, {
      "finance.parties": ["read", "create", "update"],
    });
    await sharedAssign(parties.memberId, projectId);
    const atStore = await addInvoiceRow(company.workspaceId, company.userId, {
      storeId: randomUUID(),
    });
    expect((await thread(parties.cookie, "invoice", atStore.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await thread(company.cookie, "invoice", atStore.id)).status).toBe(
      StatusCodes.OK,
    );

    const onProject = await addInvoiceRow(company.workspaceId, company.userId, {
      projectId,
    });
    const copy = await uploadFile(
      parties.cookie,
      "invoice",
      onProject.id,
      "Invoice copy.pdf",
      PDF,
    );
    expect(copy.fileName).toBe("Invoice copy.pdf");
    const settlementId = await addSettlementRow(
      company.workspaceId,
      company.userId,
      onProject.id,
    );
    expect(
      (
        await post(parties.cookie, "settlement", settlementId, {
          body: "The supplier agreed to waive the rest.",
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
    const offProject = await memberWith(company, {
      "finance.parties": ["read"],
    });
    expect(
      (await thread(offProject.cookie, "settlement", settlementId)).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("answers 404 for a deleted, unknown or another Company's document", async () => {
    const { company, projectId } = await setUp();
    const txn = await addTransactionRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const receipt = await uploadFile(
      company.cookie,
      "transaction",
      txn.id,
      "Before.png",
      PNG,
    );
    const other = await ownerWithCompany("Other Builders");
    const foreign = await thread(other.cookie, "transaction", txn.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(foreign)).toBe("TRANSACTION_NOT_FOUND");

    const unknown = await thread(company.cookie, "worksheet", txn.id);
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(unknown)).toBe("DOCUMENT_NOT_FOUND");
    const wrongType = await thread(company.cookie, "other_expense", txn.id);
    expect(await codeOf(wrongType)).toBe("OTHER_EXPENSE_NOT_FOUND");

    await deleteFinanceRow("transaction", txn.id);
    for (const response of [
      await thread(company.cookie, "transaction", txn.id),
      await list(company.cookie, "transaction", txn.id),
      await post(company.cookie, "transaction", txn.id, { body: "Here?" }),
      await start(
        company.cookie,
        "transaction",
        txn.id,
        "After.png",
        PNG.byteLength,
      ),
      await getFile(
        get(`${TEST_ORIGIN}${receipt.url}`, company.cookie),
        fileParams("transaction", txn.id, receipt.id),
      ),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(response)).toBe("TRANSACTION_NOT_FOUND");
    }
  });

  it("is on /api/docs", async () => {
    const response = getOpenApi();
    const document = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const base = "/api/construction/finance/documents/{type}/{id}";
    expect(Object.keys(document.paths[`${base}/remarks`] ?? {})).toEqual([
      "get",
      "post",
    ]);
    for (const path of [
      `${base}/files`,
      `${base}/files/uploads`,
      `${base}/files/uploads/presign`,
      `${base}/files/uploads/app`,
      `${base}/files/uploads/thumbnail`,
      `${base}/files/{fileId}`,
      `${base}/files/{fileId}/thumbnail`,
      `${base}/files/{fileId}/delete`,
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionFinanceRemarkResponse"],
    ).toBeDefined();
  });
});
