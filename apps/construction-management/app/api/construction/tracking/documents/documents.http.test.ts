import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listGallery } from "@/app/api/construction/projects/projects/[id]/gallery/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { trackingFilesMediaRemoved } from "@/src/tracking/domain/document-files";
import {
  attachEntryFiles,
  entryFiles,
  tombstoneEntryFiles,
} from "@/src/tracking/infrastructure/entry-files";
import {
  addProject,
  memberWith,
  newCompany,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";
import {
  trackingInspectionRow,
  trackingIssueRow,
  trackingTaskRow,
} from "@/test/tracking";

import { POST as removeFile } from "./[type]/[id]/files/[fileId]/delete/route";
import { GET as getFile } from "./[type]/[id]/files/[fileId]/route";
import { GET as getThumbnail } from "./[type]/[id]/files/[fileId]/thumbnail/route";
import { GET as listFiles } from "./[type]/[id]/files/route";
import { POST as startUpload } from "./[type]/[id]/files/uploads/route";
import {
  PDF,
  WEBP,
  get,
  jsonPost,
  trackingDocumentBase,
  trackingDocumentParams,
  trackingFileParams,
  uploadTrackingFile,
  type UploadedTrackingFile,
} from "./document-test-fixtures";
import { trackingFiles } from "./handlers";

type FileList = {
  items: UploadedTrackingFile[];
  totalBytes: number;
  canUpload: boolean;
};

const PNG = pngBytes();

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function list(cookie: string, type: string, id: string) {
  return listFiles(
    get(`${trackingDocumentBase(type, id)}/files`, cookie),
    trackingDocumentParams(type, id),
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
    jsonPost(`${trackingDocumentBase(type, id)}/files/uploads`, cookie, {
      fileName,
      bytes,
    }),
    trackingDocumentParams(type, id),
  );
}

function remove(cookie: string, type: string, id: string, fileId: string) {
  return removeFile(
    jsonPost(
      `${trackingDocumentBase(type, id)}/files/${fileId}/delete`,
      cookie,
      {},
    ),
    trackingFileParams(type, id, fileId),
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

async function setUp() {
  const company = await ownerWithCompany();
  const projectId = await addProject(company.workspaceId, company.userId);
  return { company, projectId };
}

describe("Files on tasks, issues and inspections (CM-0019 §11)", () => {
  it("keeps an issue's photos and PDFs, serves them and indexes them in the Gallery", async () => {
    const { company, projectId } = await setUp();
    const issue = await trackingIssueRow(
      company.workspaceId,
      projectId,
      company.userId,
    );
    const photo = await uploadTrackingFile(
      company.cookie,
      "issue",
      issue.id,
      "Crack.png",
      PNG,
      { thumbnail: WEBP },
    );
    const report = await uploadTrackingFile(
      company.cookie,
      "issue",
      issue.id,
      "Structural note.pdf",
      PDF,
    );
    expect(photo).toMatchObject({
      entryId: null,
      contentType: "image/png",
      url: `/api/construction/tracking/documents/issue/${issue.id}/files/${photo.id}`,
      thumbUrl: `/api/construction/tracking/documents/issue/${issue.id}/files/${photo.id}/thumbnail`,
      canRemove: true,
    });
    expect(report.contentType).toBe("application/pdf");

    const files = await json<FileList>(
      await list(company.cookie, "issue", issue.id),
    );
    expect(files.items.map((file) => file.fileName)).toEqual([
      "Crack.png",
      "Structural note.pdf",
    ]);
    expect(files).toMatchObject({
      totalBytes: PNG.byteLength + PDF.byteLength,
      canUpload: true,
    });

    const served = await getFile(
      get(`${TEST_ORIGIN}${photo.url}`, company.cookie),
      trackingFileParams("issue", issue.id, photo.id),
    );
    expect(served.status).toBe(StatusCodes.OK);
    expect(await bytesOf(served)).toEqual(PNG);
    const thumb = await getThumbnail(
      get(`${TEST_ORIGIN}${photo.url}/thumbnail`, company.cookie),
      trackingFileParams("issue", issue.id, photo.id),
    );
    expect(thumb.status).toBe(StatusCodes.OK);

    // Images and PDFs both join the Gallery, served by the tracking routes.
    const gallery = await galleryOf(company.cookie, projectId);
    expect(
      gallery.items
        .filter((item) => item.source === "issue")
        .map((item) => [item.fileName, item.fileUrl])
        .sort(),
    ).toEqual(
      [
        ["Crack.png", photo.url],
        ["Structural note.pdf", report.url],
      ].sort(),
    );

    expect(
      (await remove(company.cookie, "issue", issue.id, report.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    const after = await galleryOf(company.cookie, projectId);
    expect(after.items.map((item) => item.fileName)).toEqual(["Crack.png"]);
    expect(
      (
        await getFile(
          get(`${TEST_ORIGIN}${report.url}`, company.cookie),
          trackingFileParams("issue", issue.id, report.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          action: { startsWith: "tracking_document_file." },
        },
      }),
    ).toBe(3);
  });

  it("takes only photos on a task, uploaded with Task Update", async () => {
    const { company, projectId } = await setUp();
    const taskId = await trackingTaskRow(
      company.workspaceId,
      projectId,
      company.userId,
    );
    const pdf = await start(
      company.cookie,
      "task",
      taskId,
      "Bar bending schedule.pdf",
      PDF.byteLength,
    );
    expect(pdf.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(pdf)).toBe("FILE_TYPE_NOT_ALLOWED");

    const creator = await memberWith(company, {
      "tracking.tasks": ["create", "read", "view_all"],
    });
    await sharedAssign(creator.memberId, projectId);
    const refused = await start(
      creator.cookie,
      "task",
      taskId,
      "Slab.png",
      PNG.byteLength,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await json<FileList>(await list(creator.cookie, "task", taskId)))
        .canUpload,
    ).toBe(false);

    const updater = await memberWith(company, {
      "tracking.tasks": ["read", "update", "view_all"],
    });
    await sharedAssign(updater.memberId, projectId);
    const photo = await uploadTrackingFile(
      updater.cookie,
      "task",
      taskId,
      "Slab.png",
      PNG,
    );
    expect(photo.createdByName).toBe("Member");
  });

  it("lets a member without View all reach only issues they raised or are assigned", async () => {
    const { company, projectId } = await setUp();
    const reader = await memberWith(company, {
      "tracking.issues": ["create", "read"],
    });
    await sharedAssign(reader.memberId, projectId);
    const theirs = await trackingIssueRow(
      company.workspaceId,
      projectId,
      company.userId,
    );
    const denied = await list(reader.cookie, "issue", theirs.id);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(denied)).toBe("PERMISSION_DENIED");

    const assigned = await trackingIssueRow(
      company.workspaceId,
      projectId,
      company.userId,
      { assigneeMemberId: reader.memberId },
    );
    expect((await list(reader.cookie, "issue", assigned.id)).status).toBe(
      StatusCodes.OK,
    );
    const mine = await uploadTrackingFile(
      reader.cookie,
      "issue",
      assigned.id,
      "Leak.png",
      PNG,
    );
    expect(mine.canRemove).toBe(true);
    // The owner's file on the same issue: Create removes only its own.
    const owners = await uploadTrackingFile(
      company.cookie,
      "issue",
      assigned.id,
      "Owner.png",
      PNG,
    );
    const refused = await remove(
      reader.cookie,
      "issue",
      assigned.id,
      owners.id,
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await remove(reader.cookie, "issue", assigned.id, mine.id)).status,
    ).toBe(StatusCodes.NO_CONTENT);

    // Without View all the Gallery leaves issue files out: their routes
    // would refuse most of them.
    const galleryReader = await memberWith(company, {
      "tracking.issues": ["read"],
      "projects.gallery": ["read"],
    });
    await sharedAssign(galleryReader.memberId, projectId);
    expect(
      (await galleryOf(galleryReader.cookie, projectId)).items.filter(
        (item) => item.source === "issue",
      ),
    ).toEqual([]);
  });

  it("answers 404 for another Company's, a deleted or an unknown document", async () => {
    const { company, projectId } = await setUp();
    const stranger = await newCompany("Other Builders");
    const strangerProject = await addProject(
      stranger.workspaceId,
      stranger.ownerId,
    );
    const theirs = await trackingInspectionRow(
      stranger.workspaceId,
      strangerProject,
      stranger.ownerId,
    );
    const notOurs = await list(company.cookie, "inspection", theirs);
    expect(notOurs.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(notOurs)).toBe("INSPECTION_NOT_FOUND");

    const deleted = await trackingTaskRow(
      company.workspaceId,
      projectId,
      company.userId,
      { deleted: true },
    );
    expect(await codeOf(await list(company.cookie, "task", deleted))).toBe(
      "TASK_NOT_FOUND",
    );
    const unknown = await list(company.cookie, "worksheet", randomUUID());
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(unknown)).toBe("DOCUMENT_NOT_FOUND");
  });

  it("attaches uploads to an entry and takes them away with it", async () => {
    const { company, projectId } = await setUp();
    const inspectionId = await trackingInspectionRow(
      company.workspaceId,
      projectId,
      company.userId,
    );
    const first = await uploadTrackingFile(
      company.cookie,
      "inspection",
      inspectionId,
      "Cover blocks.png",
      PNG,
    );
    const second = await uploadTrackingFile(
      company.cookie,
      "inspection",
      inspectionId,
      "Checklist.pdf",
      PDF,
    );
    const inspector = await memberWith(company, {
      "tracking.inspection_requests": ["read", "update"],
    });
    await sharedAssign(inspector.memberId, projectId);
    const document = {
      workspaceId: company.workspaceId,
      type: "inspection" as const,
      documentId: inspectionId,
    };
    const observationId = randomUUID();

    // Someone else's upload cannot be posted by the inspector.
    await expect(
      prisma.$transaction((tx) =>
        attachEntryFiles(tx, {
          ...document,
          entryId: observationId,
          fileIds: [first.id],
          by: inspector.userId,
        }),
      ),
    ).rejects.toMatchObject({
      code: "DOCUMENT_FILE_NOT_FOUND",
      details: { fileIds: [first.id] },
    });

    const attached = await prisma.$transaction((tx) =>
      attachEntryFiles(tx, {
        ...document,
        entryId: observationId,
        fileIds: [first.id, second.id],
        by: company.userId,
      }),
    );
    expect(attached.map((file) => file.entryId)).toEqual([
      observationId,
      observationId,
    ]);
    const listed = await json<FileList>(
      await list(company.cookie, "inspection", inspectionId),
    );
    expect(listed.items.map((file) => file.entryId)).toEqual([
      observationId,
      observationId,
    ]);
    const byEntry = await entryFiles(prisma, {
      ...document,
      entryIds: [observationId],
    });
    expect(byEntry.get(observationId)?.map((file) => file.fileName)).toEqual([
      "Cover blocks.png",
      "Checklist.pdf",
    ]);
    // Posted once: a second entry cannot take them.
    await expect(
      prisma.$transaction((tx) =>
        attachEntryFiles(tx, {
          ...document,
          entryId: randomUUID(),
          fileIds: [first.id],
          by: company.userId,
        }),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_FILE_NOT_FOUND" });

    const at = new Date();
    const removed = await prisma.$transaction((tx) =>
      tombstoneEntryFiles(tx, {
        ...document,
        entryId: observationId,
        by: company.userId,
        at,
      }),
    );
    expect(removed).toHaveLength(2);
    await trackingFiles.dispatchRemoved(trackingFilesMediaRemoved(removed, at));
    expect(
      (await galleryOf(company.cookie, projectId)).items.filter(
        (item) => item.source === "inspection",
      ),
    ).toEqual([]);
    expect(
      (
        await json<FileList>(
          await list(company.cookie, "inspection", inspectionId),
        )
      ).items,
    ).toEqual([]);
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    const base = "/api/construction/tracking/documents/{type}/{id}/files";
    for (const path of [
      base,
      `${base}/uploads`,
      `${base}/uploads/presign`,
      `${base}/uploads/app`,
      `${base}/uploads/thumbnail`,
      `${base}/{fileId}`,
      `${base}/{fileId}/thumbnail`,
      `${base}/{fileId}/delete`,
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
