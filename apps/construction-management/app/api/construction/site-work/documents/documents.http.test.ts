import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listGallery } from "@/app/api/construction/projects/projects/[id]/gallery/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { addProject, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  sharedAddEquipmentUsageRow,
  sharedAddHindranceRow,
  sharedAddSiteDiaryRow,
  sharedAddWorksheetRow,
  sharedAssign,
  sharedDeleteDocumentRow,
} from "@/test/site-work";

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

/** A Company, a Project and the Owner. */
async function setUp() {
  const company = await ownerWithCompany();
  const projectId = await addProject(company.workspaceId, company.userId);
  return { company, projectId };
}

describe("Remarks and files on site-work documents (CM-0016 §8)", () => {
  it("lets a member with Read only comment, but not upload", async () => {
    const { company, projectId } = await setUp();
    const ws = await sharedAddWorksheetRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const reader = await memberWith(company, {
      "site_work.daily_worksheet": ["read"],
    });
    await sharedAssign(reader.memberId, projectId);

    const posted = await post(reader.cookie, "worksheet", ws.id, {
      body: "  Shuttering on grid C is loose; check before casting.  ",
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    const listed = await json<Thread>(
      await thread(reader.cookie, "worksheet", ws.id),
    );
    expect(listed).toMatchObject({ canComment: true, canAttach: false });
    expect(listed.items).toEqual([
      expect.objectContaining({
        body: "Shuttering on grid C is loose; check before casting.",
        createdBy: reader.userId,
        createdByName: "Member",
        files: [],
      }),
    ]);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          action: "site_work_remark.created",
        },
      }),
    ).toBe(1);

    const refused = await start(
      reader.cookie,
      "worksheet",
      ws.id,
      "Slab.png",
      PNG.byteLength,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(refused)).toBe("PERMISSION_DENIED");
    expect(
      (await json<FileList>(await list(reader.cookie, "worksheet", ws.id)))
        .canUpload,
    ).toBe(false);

    // Off the Project, or without Read on this menu: 403.
    const elsewhere = await memberWith(company, {
      "site_work.daily_worksheet": ["read"],
    });
    expect((await thread(elsewhere.cookie, "worksheet", ws.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const otherMenu = await memberWith(company, {
      "site_work.hindrances": ["read", "create", "update"],
    });
    await sharedAssign(otherMenu.memberId, projectId);
    expect(
      (
        await post(otherMenu.cookie, "worksheet", ws.id, {
          body: "Looks fine",
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("posts a remark with the poster's photos and refuses an empty one", async () => {
    const { company, projectId } = await setUp();
    const diary = await sharedAddSiteDiaryRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const photo = await uploadFile(
      company.cookie,
      "site_diary",
      diary.id,
      "Rain at 3 pm.png",
      PNG,
    );
    const empty = await post(company.cookie, "site_diary", diary.id, {
      body: "   ",
    });
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(empty)).toBe("REMARK_REQUIRED");
    const tooMany = await post(company.cookie, "site_diary", diary.id, {
      body: "Photos",
      fileIds: Array.from({ length: 11 }, () => randomUUID()),
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);

    const posted = await post(company.cookie, "site_diary", diary.id, {
      body: "Work stopped for two hours.",
      fileIds: [photo.id],
    });
    expect(posted.status).toBe(StatusCodes.CREATED);
    const listed = await json<Thread>(
      await thread(company.cookie, "site_diary", diary.id),
    );
    expect(listed.items[0]?.files).toEqual([
      expect.objectContaining({ id: photo.id, fileName: "Rain at 3 pm.png" }),
    ]);
    // A file already posted cannot be posted again.
    const again = await post(company.cookie, "site_diary", diary.id, {
      body: "Again",
      fileIds: [photo.id],
    });
    expect(again.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(again)).toBe("DOCUMENT_FILE_NOT_FOUND");
  });

  it("takes only images on a worksheet, and a PDF on a usage sheet or hindrance", async () => {
    const { company, projectId } = await setUp();
    const ws = await sharedAddWorksheetRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const pdfOnWorksheet = await start(
      company.cookie,
      "worksheet",
      ws.id,
      "Report.pdf",
      PDF.byteLength,
    );
    expect(pdfOnWorksheet.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(pdfOnWorksheet)).toBe("FILE_TYPE_NOT_ALLOWED");

    // A PDF named like a photo is refused by its content at completion.
    const context = documentParams("worksheet", ws.id);
    const started = await start(
      company.cookie,
      "worksheet",
      ws.id,
      "Disguised.png",
      PDF.byteLength,
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
        body: Uint8Array.from(PDF),
      }),
      context,
    );
    const disguised = await completeUpload(
      jsonPost(`${documentBase("worksheet", ws.id)}/files`, company.cookie, {
        key: begun.key,
        fileName: begun.fileName,
      }),
      context,
    );
    expect(disguised.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(disguised)).toBe("FILE_TYPE_NOT_ALLOWED");

    const big = await start(
      company.cookie,
      "worksheet",
      ws.id,
      "Huge.jpg",
      25 * 1024 * 1024 + 1,
    );
    expect(big.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(big)).toBe("FILE_TOO_LARGE");

    const sheet = await sharedAddEquipmentUsageRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const log = await uploadFile(
      company.cookie,
      "equipment_usage",
      sheet.id,
      "Breakdown log.pdf",
      PDF,
    );
    expect(log).toMatchObject({
      contentType: "application/pdf",
      viewable: true,
      url: `/api/construction/site-work/documents/equipment_usage/${sheet.id}/files/${log.id}`,
    });
    const hindrance = await sharedAddHindranceRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    await uploadFile(
      company.cookie,
      "hindrance",
      hindrance.id,
      "Letter.pdf",
      PDF,
    );
    const sheetOnHindrance = await start(
      company.cookie,
      "hindrance",
      hindrance.id,
      "Delay.xlsx",
      XLSX.byteLength,
    );
    expect(sheetOnHindrance.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(sheetOnHindrance)).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("keeps at most 20 files on a document", async () => {
    const { company, projectId } = await setUp();
    const ws = await sharedAddWorksheetRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    await prisma.constructionSiteWorkDocumentFile.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: company.workspaceId,
        documentType: "worksheet" as const,
        documentId: ws.id,
        fileKey: `companies/${company.workspaceId}/site-work-documents/${ws.id}/${randomUUID()}.png`,
        fileName: `Photo ${String(index + 1)}.png`,
        contentType: "image/png",
        bytes: 1000,
        createdBy: company.userId,
      })),
    });
    const full = await start(
      company.cookie,
      "worksheet",
      ws.id,
      "One more.png",
      PNG.byteLength,
    );
    expect(full.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(full)).toBe("DOCUMENT_FILES_LIMIT");
    // A removed file frees its place.
    await prisma.constructionSiteWorkDocumentFile.updateMany({
      where: { documentId: ws.id, fileName: "Photo 1.png" },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    const room = await start(
      company.cookie,
      "worksheet",
      ws.id,
      "One more.png",
      PNG.byteLength,
    );
    expect(room.status).toBe(StatusCodes.CREATED);
  });

  it("removes any file with Update, only one's own with Create", async () => {
    const { company, projectId } = await setUp();
    const hindrance = await sharedAddHindranceRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const owners = await uploadFile(
      company.cookie,
      "hindrance",
      hindrance.id,
      "Notice.pdf",
      PDF,
    );
    const creator = await memberWith(company, {
      "site_work.hindrances": ["read", "create"],
    });
    const editor = await memberWith(company, {
      "site_work.hindrances": ["read", "update"],
    });
    await sharedAssign(creator.memberId, projectId);
    await sharedAssign(editor.memberId, projectId);

    const mine = await uploadFile(
      creator.cookie,
      "hindrance",
      hindrance.id,
      "Flooded pit.png",
      PNG,
    );
    const asCreator = await json<FileList>(
      await list(creator.cookie, "hindrance", hindrance.id),
    );
    expect(
      asCreator.items.map((item) => [item.fileName, item.canRemove]),
    ).toEqual([
      ["Notice.pdf", false],
      ["Flooded pit.png", true],
    ]);
    const notTheirs = await remove(
      creator.cookie,
      "hindrance",
      hindrance.id,
      owners.id,
    );
    expect(notTheirs.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(notTheirs)).toBe("PERMISSION_DENIED");
    expect(
      (await remove(creator.cookie, "hindrance", hindrance.id, mine.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await remove(editor.cookie, "hindrance", hindrance.id, owners.id))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);

    const row = await prisma.constructionSiteWorkDocumentFile.findUnique({
      where: { id: owners.id },
    });
    expect(row?.deletedBy).toBe(editor.userId);
    expect(await storage.head(row?.fileKey ?? "")).toBeNull();
    const gone = await getFile(
      get(`${TEST_ORIGIN}${owners.url}`, company.cookie),
      fileParams("hindrance", hindrance.id, owners.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(gone)).toBe("DOCUMENT_FILE_NOT_FOUND");
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          action: {
            in: [
              "site_work_document_file.added",
              "site_work_document_file.removed",
            ],
          },
        },
      }),
    ).toBe(4);
  });

  it("puts a worksheet's photo in the Project Gallery, but not a PDF", async () => {
    const { company, projectId } = await setUp();
    const ws = await sharedAddWorksheetRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const photo = await uploadFile(
      company.cookie,
      "worksheet",
      ws.id,
      "Column C4.webp",
      WEBP,
      { thumbnail: WEBP },
    );
    expect(photo.thumbUrl).toBe(`${photo.url}/thumbnail`);
    const row = await prisma.constructionSiteWorkDocumentFile.findUnique({
      where: { id: photo.id },
    });
    expect(row?.fileKey).toContain(
      `/site-work-documents/${ws.id}/${photo.id}.`,
    );

    const shown = await getFile(
      get(`${TEST_ORIGIN}${photo.url}`, company.cookie),
      fileParams("worksheet", ws.id, photo.id),
    );
    expect(shown.status).toBe(StatusCodes.OK);
    expect(shown.headers.get("content-type")).toBe("image/webp");
    expect(shown.headers.get("cache-control")).toBe("private, no-store");
    expect(await bytesOf(shown)).toEqual(WEBP);
    const thumb = await getThumbnail(
      get(`${TEST_ORIGIN}${photo.url}/thumbnail`, company.cookie),
      fileParams("worksheet", ws.id, photo.id),
    );
    expect(thumb.status).toBe(StatusCodes.OK);

    const sheet = await sharedAddEquipmentUsageRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    await uploadFile(
      company.cookie,
      "equipment_usage",
      sheet.id,
      "Log.pdf",
      PDF,
    );

    const gallery = await galleryOf(company.cookie, projectId);
    expect(gallery.items).toEqual([
      expect.objectContaining({
        source: "worksheet",
        sourceId: ws.id,
        fileName: "Column C4.webp",
        fileUrl: photo.url,
        thumbUrl: `${photo.url}/thumbnail`,
      }),
    ]);

    // Shown only to members who can read worksheets.
    const viewer = await memberWith(company, {
      "projects.gallery": ["read"],
      "site_work.hindrances": ["read"],
    });
    await sharedAssign(viewer.memberId, projectId);
    expect((await galleryOf(viewer.cookie, projectId)).items).toEqual([]);

    expect(
      (await remove(company.cookie, "worksheet", ws.id, photo.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await galleryOf(company.cookie, projectId)).items).toEqual([]);
  });

  it("answers 404 for a deleted, unknown or another Company's document", async () => {
    const { company, projectId } = await setUp();
    const ws = await sharedAddWorksheetRow(
      company.workspaceId,
      company.userId,
      projectId,
    );
    const photo = await uploadFile(
      company.cookie,
      "worksheet",
      ws.id,
      "Before.png",
      PNG,
    );
    const other = await ownerWithCompany("Other Builders");
    const foreign = await thread(other.cookie, "worksheet", ws.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(foreign)).toBe("WORKSHEET_NOT_FOUND");

    const unknown = await thread(company.cookie, "purchase_order", ws.id);
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(unknown)).toBe("DOCUMENT_NOT_FOUND");
    // The id names a worksheet, not a hindrance.
    const wrongType = await thread(company.cookie, "hindrance", ws.id);
    expect(await codeOf(wrongType)).toBe("HINDRANCE_NOT_FOUND");

    await sharedDeleteDocumentRow("worksheet", ws.id);
    for (const response of [
      await thread(company.cookie, "worksheet", ws.id),
      await list(company.cookie, "worksheet", ws.id),
      await post(company.cookie, "worksheet", ws.id, { body: "Still here?" }),
      await start(
        company.cookie,
        "worksheet",
        ws.id,
        "After.png",
        PNG.byteLength,
      ),
      await getFile(
        get(`${TEST_ORIGIN}${photo.url}`, company.cookie),
        fileParams("worksheet", ws.id, photo.id),
      ),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(response)).toBe("WORKSHEET_NOT_FOUND");
    }
  });

  it("is on /api/docs", async () => {
    const response = getOpenApi();
    const document = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const base = "/api/construction/site-work/documents/{type}/{id}";
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
      document.components.schemas["ConstructionSiteWorkRemarkResponse"],
    ).toBeDefined();
  });
});
