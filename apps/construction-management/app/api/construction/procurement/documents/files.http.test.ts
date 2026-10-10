import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listGallery } from "@/app/api/construction/projects/projects/[id]/gallery/route";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { addProject, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { addStore } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as removeFile } from "./[type]/[id]/files/[fileId]/delete/route";
import { GET as getFile } from "./[type]/[id]/files/[fileId]/route";
import { GET as getThumbnail } from "./[type]/[id]/files/[fileId]/thumbnail/route";
import { GET as listFiles } from "./[type]/[id]/files/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";
import {
  EXE,
  PDF,
  WEBP,
  XLSX,
  addDocument,
  assign,
  documentBase,
  documentParams,
  fileParams,
  get,
  jsonPost,
  uploadFile,
  type UploadedFile,
} from "./document-test-fixtures";

type FileList = {
  items: UploadedFile[];
  totalBytes: number;
  canUpload: boolean;
};

const storage = objectStorage();

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function list(cookie: string, type: string, id: string) {
  return listFiles(
    get(`${documentBase(type, id)}/files`, cookie),
    documentParams(type, id),
  );
}

function open(
  cookie: string,
  type: string,
  id: string,
  fileId: string,
  query = "",
) {
  return getFile(
    get(`${documentBase(type, id)}/files/${fileId}${query}`, cookie),
    fileParams(type, id, fileId),
  );
}

function remove(cookie: string, type: string, id: string, fileId: string) {
  return removeFile(
    jsonPost(`${documentBase(type, id)}/files/${fileId}/delete`, cookie, {}),
    fileParams(type, id, fileId),
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

async function galleryOf(cookie: string, projectId: string) {
  const response = await listGallery(
    get(
      `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/gallery`,
      cookie,
    ),
    { params: Promise.resolve({ id: projectId }) },
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<{
    items: {
      source: string;
      sourceId: string;
      fileName: string;
      fileUrl: string;
      thumbUrl: string | null;
    }[];
  }>(response);
}

describe("Files on procurement documents (M5)", () => {
  it("uploads, lists, streams without caching and removes a file", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );
    const pdf = await uploadFile(
      company.cookie,
      "purchase_request",
      pr.id,
      "Required materials.pdf",
      PDF,
    );
    expect(pdf).toMatchObject({
      remarkId: null,
      contentType: "application/pdf",
      viewable: true,
      bytes: PDF.byteLength,
      url: `/api/construction/procurement/documents/purchase_request/${pr.id}/files/${pdf.id}`,
      thumbUrl: null,
      createdBy: company.userId,
      canRemove: true,
    });
    // The file's id is its key's uuid, so the Gallery can link to it.
    const row = await prisma.constructionProcurementDocumentFile.findUnique({
      where: { id: pdf.id },
    });
    expect(row?.fileKey).toContain(
      `/procurement-documents/${pr.id}/${pdf.id}.`,
    );
    const sheet = await uploadFile(
      company.cookie,
      "purchase_request",
      pr.id,
      "BOQ.xlsx",
      XLSX,
    );
    expect(sheet).toMatchObject({
      contentType: "application/octet-stream",
      viewable: false,
    });

    const listed = await json<FileList>(
      await list(company.cookie, "purchase_request", pr.id),
    );
    expect(listed.items.map((item) => item.fileName)).toEqual([
      "Required materials.pdf",
      "BOQ.xlsx",
    ]);
    expect(listed.totalBytes).toBe(PDF.byteLength + XLSX.byteLength);
    expect(listed.canUpload).toBe(true);

    const shown = await open(company.cookie, "purchase_request", pr.id, pdf.id);
    expect(shown.status).toBe(StatusCodes.OK);
    expect(shown.headers.get("content-type")).toBe("application/pdf");
    expect(shown.headers.get("cache-control")).toBe("private, no-store");
    expect(shown.headers.get("content-disposition")).toMatch(/^inline/);
    expect(await bytesOf(shown)).toEqual(PDF);
    const downloaded = await open(
      company.cookie,
      "purchase_request",
      pr.id,
      sheet.id,
    );
    expect(downloaded.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(downloaded.headers.get("content-disposition")).toMatch(
      /^attachment/,
    );

    const stored = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: company.workspaceId, key: row?.fileKey ?? "" },
    });
    expect(stored).toMatchObject([
      { kind: "procurement_document_file", deletedAt: null },
    ]);

    const removed = await remove(
      company.cookie,
      "purchase_request",
      pr.id,
      pdf.id,
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await open(company.cookie, "purchase_request", pr.id, pdf.id);
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(gone)).toBe("DOCUMENT_FILE_NOT_FOUND");
    expect(await storage.head(row?.fileKey ?? "")).toBeNull();
    const tombstone =
      await prisma.constructionProcurementDocumentFile.findUnique({
        where: { id: pdf.id },
      });
    expect(tombstone?.deletedBy).toBe(company.userId);
    expect(
      (
        await prisma.constructionOrganizationStoredFile.findFirst({
          where: { key: row?.fileKey ?? "" },
        })
      )?.deletedAt,
    ).not.toBeNull();
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          entityId: pdf.id,
          action: {
            in: [
              "procurement_document_file.added",
              "procurement_document_file.removed",
            ],
          },
        },
      }),
    ).toBe(2);
  });

  it("refuses programs and files over 25 MB", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const po = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_order",
      { location: { kind: "project", id: projectId } },
    );
    const program = await start(
      company.cookie,
      "purchase_order",
      po.id,
      "setup.exe",
      EXE.byteLength,
    );
    expect(program.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(program)).toBe("FILE_TYPE_NOT_ALLOWED");
    const big = await start(
      company.cookie,
      "purchase_order",
      po.id,
      "Scan.pdf",
      25 * 1024 * 1024 + 1,
    );
    expect(big.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(big)).toBe("FILE_TOO_LARGE");
  });

  it("puts a Project document's images and PDFs in its Gallery, with thumbnails", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const grn = await addDocument(
      company.workspaceId,
      company.userId,
      "goods_receipt",
      { location: { kind: "project", id: projectId } },
    );
    const photo = await uploadFile(
      company.cookie,
      "goods_receipt",
      grn.id,
      "Unloading.webp",
      WEBP,
      { thumbnail: WEBP },
    );
    expect(photo.thumbUrl).toBe(`${photo.url}/thumbnail`);
    await uploadFile(
      company.cookie,
      "goods_receipt",
      grn.id,
      "Invoice.xlsx",
      XLSX,
    );

    const thumb = await getThumbnail(
      get(`${TEST_ORIGIN}${photo.url}/thumbnail`, company.cookie),
      fileParams("goods_receipt", grn.id, photo.id),
    );
    expect(thumb.status).toBe(StatusCodes.OK);
    expect(thumb.headers.get("content-type")).toBe("image/webp");

    const gallery = await galleryOf(company.cookie, projectId);
    expect(gallery.items).toEqual([
      expect.objectContaining({
        source: "goods_receipt",
        sourceId: grn.id,
        fileName: "Unloading.webp",
        fileUrl: photo.url,
        thumbUrl: `${photo.url}/thumbnail`,
      }),
    ]);

    await remove(company.cookie, "goods_receipt", grn.id, photo.id);
    expect((await galleryOf(company.cookie, projectId)).items).toEqual([]);
  });

  it("keeps a Store document's files out of every Gallery", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const storeId = await addStore(company.workspaceId, company.userId, [
      projectId,
    ]);
    const po = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_order",
      { location: { kind: "store", id: storeId } },
    );
    await uploadFile(company.cookie, "purchase_order", po.id, "PO.pdf", PDF);
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(0);
  });

  it("uploads with Create or Update; removes any with Update, only one's own with Create", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const mt = await addDocument(
      company.workspaceId,
      company.userId,
      "material_transfer",
      {
        from: { kind: "project", id: projectId },
        to: {
          kind: "project",
          id: await addProject(company.workspaceId, company.userId),
        },
      },
    );
    const owners = await uploadFile(
      company.cookie,
      "material_transfer",
      mt.id,
      "Gate pass.pdf",
      PDF,
    );
    const reader = await memberWith(company, {
      "procurement.material_transfers": ["read"],
    });
    const creator = await memberWith(company, {
      "procurement.material_transfers": ["read", "create"],
    });
    const editor = await memberWith(company, {
      "procurement.material_transfers": ["read", "update"],
    });
    await assign(reader.memberId, projectId);
    await assign(creator.memberId, projectId);
    await assign(editor.memberId, projectId);

    const readOnly = await json<FileList>(
      await list(reader.cookie, "material_transfer", mt.id),
    );
    expect(readOnly.canUpload).toBe(false);
    expect(readOnly.items[0]?.canRemove).toBe(false);
    const refused = await start(
      reader.cookie,
      "material_transfer",
      mt.id,
      "Mine.pdf",
      PDF.byteLength,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(refused)).toBe("PERMISSION_DENIED");

    const created = await uploadFile(
      creator.cookie,
      "material_transfer",
      mt.id,
      "Loaded truck.pdf",
      PDF,
    );
    const asCreator = await json<FileList>(
      await list(creator.cookie, "material_transfer", mt.id),
    );
    expect(
      asCreator.items.map((item) => [item.fileName, item.canRemove]),
    ).toEqual([
      ["Gate pass.pdf", false],
      ["Loaded truck.pdf", true],
    ]);
    const notTheirs = await remove(
      creator.cookie,
      "material_transfer",
      mt.id,
      owners.id,
    );
    expect(notTheirs.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await remove(creator.cookie, "material_transfer", mt.id, created.id))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await remove(editor.cookie, "material_transfer", mt.id, owners.id))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
  });

  it("answers 404 for another Company's file and document", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const pr = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );
    const file = await uploadFile(
      company.cookie,
      "purchase_request",
      pr.id,
      "List.pdf",
      PDF,
    );
    expect(
      (await open(other.cookie, "purchase_request", pr.id, file.id)).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await list(other.cookie, "purchase_request", pr.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // A file of another document is not this document's.
    const second = await addDocument(
      company.workspaceId,
      company.userId,
      "purchase_request",
      { projectId },
    );
    expect(
      (await open(company.cookie, "purchase_request", second.id, file.id))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});
