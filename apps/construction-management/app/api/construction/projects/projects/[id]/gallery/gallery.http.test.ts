import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getDocument } from "../documents/[docId]/route";
import { GET as getRevisionFile } from "../drawings/[drawingId]/revisions/[revisionId]/file/route";
import { GET as listGallery } from "./route";
import { GET as listUploaders } from "./uploaders/route";

type Company = { cookie: string; workspaceId: string; userId: string };

type Item = {
  id: string;
  type: "image" | "pdf";
  source: string;
  sourceId: string;
  fileName: string;
  fileUrl: string;
  thumbUrl: string | null;
  uploadedBy: string;
  uploadedByName: string | null;
  uploadedAt: string;
};

type Page = {
  items: Item[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

const PDF = new TextEncoder().encode("%PDF-1.7\nplan\n%%EOF");
const storage = objectStorage();

function base(projectId: string): string {
  return `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/gallery`;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function gallery(
  cookie: string,
  projectId: string,
  query = "",
): Promise<Page> {
  const response = await listGallery(
    jsonRequest(`${base(projectId)}${query}`, cookie),
    params(projectId),
  );
  expect(response.status, query).toBe(StatusCodes.OK);
  return json<Page>(response);
}

function names(page: Page): string[] {
  return page.items.map((item) => item.fileName);
}

/**
 * Files on a Project as their owners record them: the source rows and the
 * Gallery rows, written directly (the owners' HTTP tests cover uploads).
 */
async function seed(company: Company, projectId: string) {
  const { workspaceId, userId } = company;
  const at = (day: string, time = "06:00:00") =>
    new Date(`${day}T${time}.000Z`);
  const media = (input: {
    source: string;
    sourceId: string;
    fileName: string;
    contentType: string;
    uploadedAt: Date;
    uploadedBy?: string;
    thumb?: boolean;
    fileKey?: string;
  }) => {
    const fileKey =
      input.fileKey ??
      `companies/${workspaceId}/test/${projectId}/${newId()}.bin`;
    return prisma.constructionProjectsMediaItem.create({
      data: {
        id: newId(input.uploadedAt.getTime()),
        workspaceId,
        projectId,
        source: input.source,
        sourceId: input.sourceId,
        fileKey,
        thumbKey: input.thumb === true ? `${fileKey}.thumb.webp` : null,
        fileName: input.fileName,
        contentType: input.contentType,
        bytes: 100,
        uploadedBy: input.uploadedBy ?? userId,
        uploadedAt: input.uploadedAt,
      },
    });
  };

  const documentId = newId();
  await media({
    source: "document",
    sourceId: documentId,
    fileName: "Work order 100%.pdf",
    contentType: "application/pdf",
    uploadedAt: at("2026-09-01"),
  });
  await media({
    source: "document",
    sourceId: newId(),
    fileName: "Site photo.jpg",
    contentType: "image/jpeg",
    uploadedAt: at("2026-09-15"),
    thumb: true,
  });

  // A drawing with a real file at R1, so its route can be opened.
  const albumId = newId();
  const drawingId = newId();
  const revisionId = newId();
  const drawingKey = `companies/${workspaceId}/drawings/${projectId}/${newId()}.pdf`;
  const now = new Date();
  await prisma.constructionProjectsDrawingAlbum.create({
    data: {
      id: albumId,
      workspaceId,
      projectId,
      name: "Architect",
      createdBy: userId,
      updatedBy: userId,
    },
  });
  await prisma.constructionProjectsDrawing.create({
    data: {
      id: drawingId,
      workspaceId,
      projectId,
      albumId,
      name: "GF Plan",
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.constructionProjectsDrawingRevision.create({
    data: {
      id: revisionId,
      workspaceId,
      drawingId,
      revision: 1,
      fileKey: drawingKey,
      fileName: "GF Plan.pdf",
      contentType: "application/pdf",
      bytes: PDF.byteLength,
      createdBy: userId,
    },
  });
  await storage.put(drawingKey, PDF, "application/pdf");
  await media({
    source: "drawing",
    sourceId: drawingId,
    fileName: "GF Plan.pdf",
    contentType: "application/pdf",
    uploadedAt: at("2026-10-01"),
    fileKey: drawingKey,
  });

  await media({
    source: "testing_report",
    sourceId: newId(),
    fileName: "Cube test 28 day.png",
    contentType: "image/png",
    uploadedAt: at("2026-10-05", "20:00:00"),
  });
  // A later module's file: listed only once its source has a menu here.
  await media({
    source: "worksheet",
    sourceId: newId(),
    fileName: "Slab casting.jpg",
    contentType: "image/jpeg",
    uploadedAt: at("2026-10-06"),
  });
  // Deleted: never listed.
  const gone = await media({
    source: "document",
    sourceId: newId(),
    fileName: "Old LOA.pdf",
    contentType: "application/pdf",
    uploadedAt: at("2026-10-07"),
  });
  await prisma.constructionProjectsMediaItem.update({
    where: { id: gone.id },
    data: { deletedAt: new Date() },
  });
  return { documentId, drawingId, revisionId };
}

describe("Project Gallery HTTP (CM-410)", () => {
  it("lists the Project's images and PDFs newest first with links to their sources", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const { documentId, drawingId, revisionId } = await seed(owner, projectId);

    const all = await gallery(owner.cookie, projectId);
    expect(names(all)).toEqual([
      "Cube test 28 day.png",
      "GF Plan.pdf",
      "Site photo.jpg",
      "Work order 100%.pdf",
    ]);
    expect(all.total).toBe(4);
    const path = `/api/construction/projects/projects/${projectId}`;
    expect(all.items[1]).toMatchObject({
      type: "pdf",
      source: "drawing",
      sourceId: drawingId,
      fileUrl: `${path}/drawings/${drawingId}/revisions/${revisionId}/file`,
      thumbUrl: null,
      uploadedByName: "Arun Selva Kumar",
    });
    expect(all.items[2]).toMatchObject({
      type: "image",
      source: "document",
      thumbUrl: `${all.items[2]?.fileUrl ?? ""}/thumbnail`,
    });
    expect(all.items[3]?.fileUrl).toBe(`${path}/documents/${documentId}`);
    expect(all.items[0]?.fileUrl).toMatch(
      new RegExp(`^${path}/testing-reports/reports/[0-9a-f-]{36}/file$`),
    );

    const one = await gallery(owner.cookie, projectId, "?limit=1");
    expect(names(one)).toEqual(["Cube test 28 day.png"]);
    expect(one.prevCursor).toBeNull();
    const two = await gallery(
      owner.cookie,
      projectId,
      `?limit=2&after=${one.nextCursor ?? ""}`,
    );
    expect(names(two)).toEqual(["GF Plan.pdf", "Site photo.jpg"]);
    const back = await gallery(
      owner.cookie,
      projectId,
      `?limit=1&before=${two.prevCursor ?? ""}`,
    );
    expect(names(back)).toEqual(["Cube test 28 day.png"]);
  });

  it("filters by type, source, uploader, upload day and file name", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    await seed(owner, projectId);
    const member = await memberWith(owner, {
      "projects.project": ["read"],
      "projects.gallery": ["read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId },
    });
    await prisma.constructionProjectsMediaItem.create({
      data: {
        id: newId(),
        workspaceId: owner.workspaceId,
        projectId,
        source: "document",
        sourceId: newId(),
        fileKey: `companies/${owner.workspaceId}/test/${newId()}.pdf`,
        fileName: "Member upload.pdf",
        contentType: "application/pdf",
        bytes: 10,
        uploadedBy: member.userId,
        uploadedAt: new Date("2026-08-01T06:00:00Z"),
      },
    });

    expect(names(await gallery(owner.cookie, projectId, "?type=pdf"))).toEqual([
      "GF Plan.pdf",
      "Work order 100%.pdf",
      "Member upload.pdf",
    ]);
    expect(
      names(await gallery(owner.cookie, projectId, "?type=image")),
    ).toEqual(["Cube test 28 day.png", "Site photo.jpg"]);
    expect(
      names(await gallery(owner.cookie, projectId, "?source=drawing")),
    ).toEqual(["GF Plan.pdf"]);
    expect(
      (await gallery(owner.cookie, projectId, "?source=worksheet")).total,
    ).toBe(0);
    const byMember = await gallery(
      owner.cookie,
      projectId,
      `?uploadedBy=${member.userId}`,
    );
    expect(byMember.items).toMatchObject([
      { fileName: "Member upload.pdf", uploadedByName: "Member" },
    ]);
    // Upload days are Company days (Asia/Kolkata): 20:00 UTC on 5 Oct is 6 Oct.
    expect(
      names(
        await gallery(
          owner.cookie,
          projectId,
          "?from=2026-09-15&to=2026-10-05",
        ),
      ),
    ).toEqual(["GF Plan.pdf", "Site photo.jpg"]);
    expect(
      names(await gallery(owner.cookie, projectId, "?from=2026-10-06")),
    ).toEqual(["Cube test 28 day.png"]);
    expect(names(await gallery(owner.cookie, projectId, "?q=PLAN"))).toEqual([
      "GF Plan.pdf",
    ]);
    // `%` is a character, not a wildcard.
    expect(names(await gallery(owner.cookie, projectId, "?q=100%25"))).toEqual([
      "Work order 100%.pdf",
    ]);
    const combined = await gallery(
      owner.cookie,
      projectId,
      "?type=pdf&source=document&q=order",
    );
    expect(combined.total).toBe(1);

    const uploaders = await json<{
      items: { userId: string; name: string | null }[];
    }>(
      await listUploaders(
        jsonRequest(`${base(projectId)}/uploaders`, owner.cookie),
        params(projectId),
      ),
    );
    expect(uploaders.items).toEqual([
      { userId: owner.userId, name: "Arun Selva Kumar" },
      { userId: member.userId, name: "Member" },
    ]);

    const invalid = await listGallery(
      jsonRequest(`${base(projectId)}?type=video`, owner.cookie),
      params(projectId),
    );
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("shows only sources the member may read, and their routes check again", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const other = await addProject(owner.workspaceId, owner.userId);
    const { revisionId, drawingId, documentId } = await seed(owner, projectId);
    const assign = (memberId: string, projectIds: string[]) =>
      prisma.constructionOrganizationTeamMemberProject.createMany({
        data: projectIds.map((id) => ({ memberId, projectId: id })),
      });

    // Gallery and Drawings: drawings only; their file opens.
    const drawings = await memberWith(owner, {
      "projects.gallery": ["read"],
      "projects.drawings": ["read"],
    });
    await assign(drawings.memberId, [projectId]);
    const visible = await gallery(drawings.cookie, projectId);
    expect(names(visible)).toEqual(["GF Plan.pdf"]);
    expect(visible.total).toBe(1);
    const opened = await getRevisionFile(
      jsonRequest(
        `${TEST_ORIGIN}${visible.items[0]?.fileUrl ?? ""}`,
        drawings.cookie,
      ),
      { params: Promise.resolve({ id: projectId, drawingId, revisionId }) },
    );
    expect(opened.status).toBe(StatusCodes.OK);
    await opened.body?.cancel();
    // A document's route refuses them: the Gallery never linked it.
    const document = await getDocument(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/documents/${documentId}`,
        drawings.cookie,
      ),
      { params: Promise.resolve({ id: projectId, docId: documentId }) },
    );
    expect(document.status).toBe(StatusCodes.FORBIDDEN);
    const uploaders = await json<{ items: unknown[] }>(
      await listUploaders(
        jsonRequest(`${base(projectId)}/uploaders`, drawings.cookie),
        params(projectId),
      ),
    );
    expect(uploaders.items).toHaveLength(1);

    // Gallery only: nothing to show.
    const galleryOnly = await memberWith(owner, {
      "projects.gallery": ["read"],
    });
    await assign(galleryOnly.memberId, [projectId]);
    expect(await gallery(galleryOnly.cookie, projectId)).toEqual({
      items: [],
      nextCursor: null,
      prevCursor: null,
      total: 0,
    });

    // No Gallery flag: 403.
    const noGallery = await memberWith(owner, {
      "projects.drawings": ["read"],
    });
    await assign(noGallery.memberId, [projectId]);
    const denied = await listGallery(
      jsonRequest(base(projectId), noGallery.cookie),
      params(projectId),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);

    // Not on the Project: 404.
    const elsewhere = await memberWith(owner, {
      "projects.gallery": ["read"],
      "projects.drawings": ["read"],
    });
    await assign(elsewhere.memberId, [other]);
    const hidden = await listGallery(
      jsonRequest(base(projectId), elsewhere.cookie),
      params(projectId),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);

    // Another Company: 404.
    const rival = await ownerWithCompany("Sakthi Constructions");
    const foreign = await listGallery(
      jsonRequest(base(projectId), rival.cookie),
      params(projectId),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const item = "/api/construction/projects/projects/{id}/gallery";
    expect(document.paths[item]?.["get"]).toBeDefined();
    expect(document.paths[`${item}/uploaders`]?.["get"]).toBeDefined();
  });
});
