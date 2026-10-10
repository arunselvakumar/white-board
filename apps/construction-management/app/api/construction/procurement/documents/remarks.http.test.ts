import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  givePlan,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addStore } from "@/test/procurement";

import {
  GET as listRemarks,
  POST as postRemark,
} from "./[type]/[id]/remarks/route";
import {
  addDocument,
  assign,
  deleteDocument,
  documentBase,
  documentParams,
  get,
  jsonPost,
  PDF,
  uploadFile,
  WEBP,
} from "./document-test-fixtures";

type Remark = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
  files: { id: string; remarkId: string | null; fileName: string }[];
};

type Thread = { items: Remark[]; canComment: boolean; canAttach: boolean };

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

async function ownerName(workspaceId: string, userId: string) {
  const row = await prisma.constructionOrganizationTeamMember.findFirst({
    where: { workspaceId, userId },
    select: { name: true },
  });
  return row?.name ?? null;
}

describe("Remarks and comments on procurement documents (M5)", () => {
  it("posts remarks oldest first with the author's name, and audits them", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );

    const empty = await thread(company.cookie, "purchase_request", pr.id);
    expect(empty.status).toBe(StatusCodes.OK);
    expect(await json<Thread>(empty)).toEqual({
      items: [],
      canComment: true,
      canAttach: true,
    });

    const first = await post(company.cookie, "purchase_request", pr.id, {
      body: "  Need this before the slab on Friday.  ",
    });
    expect(first.status).toBe(StatusCodes.CREATED);
    const created = await json<Remark>(first);
    expect(created).toMatchObject({
      body: "Need this before the slab on Friday.",
      createdBy: company.userId,
      createdByName: await ownerName(company.workspaceId, company.userId),
      files: [],
    });
    expect(created.createdByName).not.toBeNull();
    await post(company.cookie, "purchase_request", pr.id, {
      body: "Supplier confirmed.",
    });

    const list = await json<Thread>(
      await thread(company.cookie, "purchase_request", pr.id),
    );
    expect(list.items.map((item) => item.body)).toEqual([
      "Need this before the slab on Friday.",
      "Supplier confirmed.",
    ]);

    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: {
        workspaceId: company.workspaceId,
        action: "procurement_remark.created",
        entityId: created.id,
      },
    });
    expect(audit?.after).toMatchObject({
      documentType: "purchase_request",
      documentId: pr.id,
      number: pr.number,
    });
  });

  it("refuses an empty or too long remark", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );
    const blank = await post(company.cookie, "purchase_request", pr.id, {
      body: "   ",
    });
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(blank)).toBe("REMARK_REQUIRED");
    const long = await post(company.cookie, "purchase_request", pr.id, {
      body: "x".repeat(501),
    });
    expect(long.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(long)).toBe("TEXT_TOO_LONG");
    const exact = await post(company.cookie, "purchase_request", pr.id, {
      body: "x".repeat(500),
    });
    expect(exact.status).toBe(StatusCodes.CREATED);
  });

  it("answers 401, and 404 for an unknown type, an unknown, deleted or another Company's document", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );

    const anonymous = await listRemarks(
      new Request(`${documentBase("purchase_request", pr.id)}/remarks`),
      documentParams("purchase_request", pr.id),
    );
    expect(anonymous.status).toBe(StatusCodes.UNAUTHORIZED);

    const unknownType = await thread(company.cookie, "quotation", pr.id);
    expect(unknownType.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(unknownType)).toBe("DOCUMENT_NOT_FOUND");

    const unknown = await thread(
      company.cookie,
      "purchase_request",
      randomUUID(),
    );
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(unknown)).toBe("PURCHASE_REQUEST_NOT_FOUND");

    // The right id under the wrong type is not found either.
    const wrongType = await thread(company.cookie, "purchase_order", pr.id);
    expect(await codeOf(wrongType)).toBe("PURCHASE_ORDER_NOT_FOUND");

    const foreign = await post(other.cookie, "purchase_request", pr.id, {
      body: "Not ours.",
    });
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);

    const badId = await thread(company.cookie, "purchase_request", "nope");
    expect(badId.status).toBe(StatusCodes.BAD_REQUEST);

    await deleteDocument("purchase_request", pr.id);
    const deleted = await post(company.cookie, "purchase_request", pr.id, {
      body: "Too late.",
    });
    expect(deleted.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(deleted)).toBe("PURCHASE_REQUEST_NOT_FOUND");
  });

  it("lets anyone with Read on the document's Project comment, but not attach", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const elsewhere = await addProject(company.workspaceId, company.userId);
    const po = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_order",
      { location: { kind: "project", id: projectId } },
    );
    const reader = await memberWith(company, {
      "procurement.purchase_orders": ["read"],
    });
    await assign(reader.memberId, projectId);
    const offProject = await memberWith(company, {
      "procurement.purchase_orders": ["read", "create", "update"],
    });
    await assign(offProject.memberId, elsewhere);
    const noRead = await memberWith(company, {
      "procurement.purchase_requests": ["read"],
    });
    await assign(noRead.memberId, projectId);

    const seen = await json<Thread>(
      await thread(reader.cookie, "purchase_order", po.id),
    );
    expect(seen).toMatchObject({ canComment: true, canAttach: false });
    const posted = await post(reader.cookie, "purchase_order", po.id, {
      body: "Received the revised quote.",
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    expect((await json<Remark>(posted)).createdByName).toBe("Member");

    for (const cookie of [offProject.cookie, noRead.cookie]) {
      const refused = await thread(cookie, "purchase_order", po.id);
      expect(refused.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(refused)).toBe("PERMISSION_DENIED");
      const write = await post(cookie, "purchase_order", po.id, {
        body: "No.",
      });
      expect(write.status).toBe(StatusCodes.FORBIDDEN);
    }
  });

  it("opens a transfer from either side, a Store side on the Company menu", async () => {
    const company = await ownerWithCompany();
    const siteA = await addProject(company.workspaceId, company.userId);
    const siteB = await addProject(company.workspaceId, company.userId);
    const siteC = await addProject(company.workspaceId, company.userId);
    const storeId = await addStore(company.workspaceId, company.userId, [
      siteA,
    ]);
    const betweenSites = await addDocument(
      company.workspaceId,
      company.userId,
      "material_transfer",
      {
        from: { kind: "project", id: siteA },
        to: { kind: "project", id: siteB },
      },
    );
    const fromStore = await addDocument(
      company.workspaceId,
      company.userId,
      "material_transfer",
      {
        from: { kind: "store", id: storeId },
        to: { kind: "project", id: siteA },
      },
    );
    const receiver = await memberWith(company, {
      "procurement.material_transfers": ["read"],
    });
    await assign(receiver.memberId, siteB);
    const stranger = await memberWith(company, {
      "procurement.material_transfers": ["read"],
    });
    await assign(stranger.memberId, siteC);

    expect(
      (await thread(receiver.cookie, "material_transfer", betweenSites.id))
        .status,
    ).toBe(StatusCodes.OK);
    expect(
      (await thread(stranger.cookie, "material_transfer", betweenSites.id))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    // The Store side is checked on the Company-level menu.
    expect(
      (await thread(stranger.cookie, "material_transfer", fromStore.id)).status,
    ).toBe(StatusCodes.OK);
  });

  it("checks store documents on the Company-level menu", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const storeId = await addStore(company.workspaceId, company.userId, [
      projectId,
    ]);
    const dn = await addDocument(
      company.workspaceId,
      company.userId,
      "delivery_note",
      { projectId, storeId },
    );
    const keeper = await memberWith(company, {
      "procurement.delivery_notes": ["read"],
    });
    const none = await memberWith(company, {
      "procurement.material_requests": ["read"],
    });
    const posted = await post(keeper.cookie, "delivery_note", dn.id, {
      body: "Loaded on the 407 at 9 am.",
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    expect((await thread(none.cookie, "delivery_note", dn.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("attaches the poster's own uploads to a comment", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const storeId = await addStore(company.workspaceId, company.userId, [
      projectId,
    ]);
    const mr = await addDocument(
      company.workspaceId,
      company.userId,
      "material_request",
      { projectId, storeId },
    );
    const photo = await uploadFile(
      company.cookie,
      "material_request",
      mr.id,
      "Cement bags.webp",
      WEBP,
    );
    const challan = await uploadFile(
      company.cookie,
      "material_request",
      mr.id,
      "Challan.pdf",
      PDF,
    );
    const helper = await memberWith(company, {
      "procurement.material_requests": ["read", "create"],
    });
    const theirs = await uploadFile(
      helper.cookie,
      "material_request",
      mr.id,
      "Theirs.pdf",
      PDF,
    );

    // Someone else's upload cannot be posted.
    const hijack = await post(company.cookie, "material_request", mr.id, {
      body: "Photos",
      fileIds: [theirs.id],
    });
    expect(hijack.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(hijack)).toBe("DOCUMENT_FILE_NOT_FOUND");

    const posted = await post(company.cookie, "material_request", mr.id, {
      body: "Bags and the challan.",
      fileIds: [photo.id, challan.id, photo.id],
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    const remark = await json<Remark>(posted);
    expect(remark.files.map((file) => file.fileName)).toEqual([
      "Cement bags.webp",
      "Challan.pdf",
    ]);
    expect(remark.files.every((file) => file.remarkId === remark.id)).toBe(
      true,
    );

    // Already posted: not again.
    const again = await post(company.cookie, "material_request", mr.id, {
      body: "Again",
      fileIds: [photo.id],
    });
    expect(await codeOf(again)).toBe("DOCUMENT_FILE_NOT_FOUND");

    const listed = await json<Thread>(
      await thread(company.cookie, "material_request", mr.id),
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.files).toHaveLength(2);
  });

  it("refuses posting on an ended plan", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );
    await givePlan(company.workspaceId, {
      endsAt: new Date(Date.now() - 86_400_000),
    });
    const refused = await post(company.cookie, "purchase_request", pr.id, {
      body: "Late",
    });
    expect(refused.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(
      (await thread(company.cookie, "purchase_request", pr.id)).status,
    ).toBe(StatusCodes.OK);
  });

  it("is on /api/docs", async () => {
    const response = getOpenApi();
    const document = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const base = "/api/construction/procurement/documents/{type}/{id}";
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
      document.components.schemas["ConstructionProcurementRemarkResponse"],
    ).toBeDefined();
  });
});
