import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, newCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import { salesInquiryRow, salesProject } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as removeFile } from "./[type]/[id]/files/[fileId]/delete/route";
import { GET as readFile } from "./[type]/[id]/files/[fileId]/route";
import { GET as listFiles } from "./[type]/[id]/files/route";
import {
  SALES_PDF,
  salesDocumentBase,
  salesDocumentParams,
  salesFileParams,
  salesJsonPost,
  startSalesUpload,
  uploadSalesFile,
} from "./document-test-fixtures";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type ErrorBody = { code: string; details?: Record<string, unknown> };
type Files = {
  items: { id: string; role: string; canRemove: boolean }[];
  canUpload: boolean;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by);
  const inquiryId = await salesInquiryRow(ws, projectId, by);
  actAs(owner);
  return { ws, by, owner, projectId, inquiryId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[]) {
  const added = await addMember(ctx.ws, ctx.by, { "sales.inquiries": flags });
  await sharedAssign(added.memberId, ctx.projectId);
  return {
    memberId: added.memberId,
    actor: {
      userId: added.userId,
      workspaceId: ctx.ws,
      role: "member" as const,
    },
  };
}

const list = (id: string) =>
  listFiles(
    new Request(`${salesDocumentBase("inquiry", id)}/files`),
    salesDocumentParams("inquiry", id),
  );

describe("Sales document files (CM-1003)", () => {
  it("keeps one Visiting Card and photos on an inquiry, out of the Gallery", async () => {
    const ctx = await setup();
    const card = await uploadSalesFile(
      "inquiry",
      ctx.inquiryId,
      "visiting_card",
      "card.png",
      pngBytes(),
    );
    expect(card).toMatchObject({
      role: "visiting_card",
      fileName: "card.png",
      contentType: "image/png",
      canRemove: true,
    });
    await uploadSalesFile(
      "inquiry",
      ctx.inquiryId,
      "photo",
      "site.png",
      pngBytes(80),
    );
    const files = await json<Files>(await list(ctx.inquiryId));
    expect(files.items.map((file) => file.role)).toEqual([
      "visiting_card",
      "photo",
    ]);
    expect(files.canUpload).toBe(true);
    const second = await startSalesUpload(
      "inquiry",
      ctx.inquiryId,
      "visiting_card",
      "card2.png",
      64,
    );
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(second)).toMatchObject({
      code: "DOCUMENT_FILES_LIMIT",
      details: { role: "visiting_card" },
    });
    const form = await startSalesUpload(
      "inquiry",
      ctx.inquiryId,
      "booking_form",
      "form.pdf",
      SALES_PDF.byteLength,
    );
    expect((await json<ErrorBody>(form)).code).toBe("FILE_ROLE_NOT_ALLOWED");
    const pdfCard = await startSalesUpload(
      "inquiry",
      ctx.inquiryId,
      "photo",
      "scan.pdf",
      SALES_PDF.byteLength,
    );
    expect((await json<ErrorBody>(pdfCard)).code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { workspaceId: ctx.ws },
      }),
    ).toBe(0);
    const streamed = await readFile(
      new Request(
        `${salesDocumentBase("inquiry", ctx.inquiryId)}/files/${card.id}`,
      ),
      salesFileParams("inquiry", ctx.inquiryId, card.id),
    );
    expect(streamed.status).toBe(StatusCodes.OK);
    expect(streamed.headers.get("content-type")).toBe("image/png");
    // Removing the card makes room for another.
    const removed = await removeFile(
      salesJsonPost(
        `${salesDocumentBase("inquiry", ctx.inquiryId)}/files/${card.id}/delete`,
        {},
      ),
      salesFileParams("inquiry", ctx.inquiryId, card.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    await uploadSalesFile(
      "inquiry",
      ctx.inquiryId,
      "visiting_card",
      "card3.png",
      pngBytes(),
    );
  });

  it("follows the inquiry's View all, Create and Update", async () => {
    const ctx = await setup();
    const photo = await uploadSalesFile(
      "inquiry",
      ctx.inquiryId,
      "photo",
      "site.png",
      pngBytes(),
    );
    const seller = await member(ctx, ["create", "read"]);
    actAs(seller.actor);
    expect((await list(ctx.inquiryId)).status).toBe(StatusCodes.NOT_FOUND);
    // Assigned to them: they see it and add their own photos.
    await prisma.constructionSalesInquiry.update({
      where: { id: ctx.inquiryId },
      data: { assigneeMemberId: seller.memberId },
    });
    const files = await json<Files>(await list(ctx.inquiryId));
    expect(files.canUpload).toBe(true);
    expect(files.items[0]?.canRemove).toBe(false);
    const own = await uploadSalesFile(
      "inquiry",
      ctx.inquiryId,
      "photo",
      "mine.png",
      pngBytes(),
    );
    expect(own.canRemove).toBe(true);
    const others = await removeFile(
      salesJsonPost(
        `${salesDocumentBase("inquiry", ctx.inquiryId)}/files/${photo.id}/delete`,
        {},
      ),
      salesFileParams("inquiry", ctx.inquiryId, photo.id),
    );
    expect(others.status).toBe(StatusCodes.FORBIDDEN);

    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.actor);
    const read = await json<Files>(await list(ctx.inquiryId));
    expect(read.canUpload).toBe(false);
    const refused = await startSalesUpload(
      "inquiry",
      ctx.inquiryId,
      "photo",
      "x.png",
      64,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("answers 404 for a deleted inquiry, another Company's, or an unknown type", async () => {
    const ctx = await setup();
    const gone = await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      deletedAt: new Date(),
    });
    const deleted = await list(gone);
    expect((await json<ErrorBody>(deleted)).code).toBe("INQUIRY_NOT_FOUND");
    const unknown = await listFiles(
      new Request(`${salesDocumentBase("lead", ctx.inquiryId)}/files`),
      salesDocumentParams("lead", ctx.inquiryId),
    );
    expect((await json<ErrorBody>(unknown)).code).toBe("DOCUMENT_NOT_FOUND");
    const other = await newCompany();
    actAs({ userId: other.ownerId, workspaceId: other.workspaceId });
    expect((await list(ctx.inquiryId)).status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("Sales document files in the OpenAPI document (review of #93)", () => {
  it("lists every step of an upload", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    const files = "/api/construction/sales/documents/{type}/{id}/files";
    for (const path of [
      files,
      `${files}/uploads`,
      `${files}/uploads/presign`,
      `${files}/uploads/app`,
      `${files}/uploads/thumbnail`,
      `${files}/{fileId}/delete`,
    ])
      expect(document.paths, path).toHaveProperty([path]);
  });
});
