import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { createProjectMediaListener } from "@/src/projects/infrastructure/create-project-media-listener";
import type {
  ProjectMediaAttached,
  ProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteDocument } from "./[docId]/delete/route";
import { GET as getThumbnail } from "./[docId]/thumbnail/route";
import { POST as completeUpload } from "./route";
import { POST as receiveUpload } from "./uploads/app/route";
import { POST as startUpload } from "./uploads/route";
import { POST as sendThumbnail } from "./uploads/thumbnail/route";

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
  thumbnailUrl: string;
};

type Document = { id: string; thumbUrl: string | null; contentType: string };

const PDF = new TextEncoder().encode("%PDF-1.7\nLOA\n%%EOF");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0]);
/** A RIFF/WEBP header: the app sniffs only the signature. */
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x20,
]);

const storage = objectStorage();

function base(projectId: string): string {
  return `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/documents`;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function raw(cookie: string, url: string, bytes: Uint8Array, type: string) {
  return new Request(`${TEST_ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": type, cookie },
    body: Uint8Array.from(bytes),
  });
}

/** Start, send the bytes, maybe a thumbnail, complete. */
async function upload(
  cookie: string,
  projectId: string,
  fileName: string,
  bytes: Uint8Array,
  thumbnail?: Uint8Array,
): Promise<{ started: Started; document: Document }> {
  const started = (await (
    await startUpload(
      jsonRequest(`${base(projectId)}/uploads`, cookie, {
        kind: "other",
        fileName,
        bytes: bytes.byteLength,
      }),
      params(projectId),
    )
  ).json()) as Started;
  if (started.upload.via !== "app") throw new Error("Expected an app upload");
  expect(
    (
      await receiveUpload(
        raw(cookie, started.upload.url, bytes, "application/octet-stream"),
        params(projectId),
      )
    ).status,
  ).toBe(StatusCodes.NO_CONTENT);
  if (thumbnail != null)
    expect(
      (
        await sendThumbnail(
          raw(cookie, started.thumbnailUrl, thumbnail, "image/webp"),
          params(projectId),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
  const done = await completeUpload(
    jsonRequest(base(projectId), cookie, {
      key: started.key,
      kind: "other",
      fileName,
    }),
    params(projectId),
  );
  expect(done.status).toBe(StatusCodes.CREATED);
  return { started, document: (await done.json()) as Document };
}

function mediaOf(projectId: string) {
  return prisma.constructionProjectsMediaItem.findMany({
    where: { projectId },
    orderBy: { uploadedAt: "asc" },
  });
}

describe("Project documents on the attachments service (CM-407)", () => {
  it("indexes images and PDFs in the Gallery with the thumbnail, and removes them on delete", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);

    const photo = await upload(
      owner.cookie,
      projectId,
      "Site photo.png",
      pngBytes(),
      WEBP,
    );
    expect(photo.started.thumbnailUrl).toBe(
      `/api/construction/projects/projects/${projectId}/documents/uploads/thumbnail?key=${encodeURIComponent(photo.started.key)}`,
    );
    expect(photo.document).toMatchObject({
      contentType: "image/png",
      thumbUrl: `/api/construction/projects/projects/${projectId}/documents/${photo.document.id}/thumbnail`,
    });
    const loa = await upload(owner.cookie, projectId, "LOA.pdf", PDF);
    expect(loa.document.thumbUrl).toBeNull();
    await upload(owner.cookie, projectId, "BOQ.zip", ZIP);

    const media = await mediaOf(projectId);
    expect(
      media.map((item) => [item.source, item.sourceId, item.contentType]),
    ).toEqual([
      ["document", photo.document.id, "image/png"],
      ["document", loa.document.id, "application/pdf"],
    ]);
    expect(media[0]).toMatchObject({
      workspaceId: owner.workspaceId,
      fileKey: photo.started.key,
      thumbKey: `${photo.started.key}.thumb.webp`,
      fileName: "Site photo.png",
      uploadedBy: owner.userId,
      deletedAt: null,
    });

    const thumbnail = await getThumbnail(
      jsonRequest(
        `${TEST_ORIGIN}${photo.document.thumbUrl ?? ""}`,
        owner.cookie,
      ),
      { params: Promise.resolve({ id: projectId, docId: photo.document.id }) },
    );
    expect(thumbnail.status).toBe(StatusCodes.OK);
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    expect(await bytesOf(thumbnail)).toEqual(WEBP);
    const none = await getThumbnail(
      jsonRequest(
        `${base(projectId)}/${loa.document.id}/thumbnail`,
        owner.cookie,
      ),
      { params: Promise.resolve({ id: projectId, docId: loa.document.id }) },
    );
    expect(none.status).toBe(StatusCodes.NOT_FOUND);

    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: owner.workspaceId, deletedAt: null },
      orderBy: { kind: "asc" },
    });
    expect(
      files
        .filter((file) => file.key.startsWith(photo.started.key))
        .map((file) => [file.kind, file.contentType, file.bytes]),
    ).toEqual([
      ["project_document", "image/png", pngBytes().byteLength],
      ["project_document_thumbnail", "image/webp", WEBP.byteLength],
    ]);

    const deleted = await deleteDocument(
      jsonRequest(
        `${base(projectId)}/${photo.document.id}/delete`,
        owner.cookie,
        {},
      ),
      { params: Promise.resolve({ id: projectId, docId: photo.document.id }) },
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const after = await mediaOf(projectId);
    expect(
      after.find((item) => item.sourceId === photo.document.id)?.deletedAt,
    ).not.toBeNull();
    expect(
      after.find((item) => item.sourceId === loa.document.id)?.deletedAt,
    ).toBeNull();
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: {
          workspaceId: owner.workspaceId,
          key: { startsWith: photo.started.key },
          deletedAt: null,
        },
      }),
    ).toBe(0);
    await expect(storage.head(photo.started.key)).resolves.toBeNull();
    await expect(
      storage.head(`${photo.started.key}.thumb.webp`),
    ).resolves.toBeNull();
  });

  it("refuses a thumbnail that is not a small WebP or comes before the file", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const started = (await (
      await startUpload(
        jsonRequest(`${base(projectId)}/uploads`, owner.cookie, {
          kind: "other",
          fileName: "Site.png",
          bytes: 64,
        }),
        params(projectId),
      )
    ).json()) as Started;
    const send = (bytes: Uint8Array) =>
      sendThumbnail(
        raw(owner.cookie, started.thumbnailUrl, bytes, "image/webp"),
        params(projectId),
      );
    const early = await send(WEBP);
    expect(early.status).toBe(StatusCodes.BAD_REQUEST);
    expect(((await early.json()) as { code: string }).code).toBe(
      "UPLOAD_NOT_FOUND",
    );
    if (started.upload.via !== "app") throw new Error("Expected an app upload");
    await receiveUpload(
      raw(owner.cookie, started.upload.url, pngBytes(), "image/png"),
      params(projectId),
    );
    const png = await send(pngBytes());
    expect(((await png.json()) as { code: string }).code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    const large = new Uint8Array(300 * 1024 + 1);
    large.set(WEBP);
    const tooLarge = await send(large);
    expect(((await tooLarge.json()) as { code: string }).code).toBe(
      "FILE_TOO_LARGE",
    );
  });

  it("indexes other contexts' files through ProjectMediaAttached / ProjectMediaRemoved", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const other = await ownerWithCompany("Sakthi Constructions");
    const listener = createProjectMediaListener();
    const sourceId = newId();
    const event: ProjectMediaAttached = {
      type: "ProjectMediaAttached",
      workspaceId: owner.workspaceId,
      occurredAt: new Date(),
      projectId,
      source: "worksheet",
      sourceId,
      fileKey: `companies/${owner.workspaceId}/worksheet-photos/${projectId}/${newId()}.jpg`,
      thumbKey: null,
      fileName: "Slab casting.jpg",
      contentType: "image/jpeg",
      bytes: 1200,
      uploadedBy: owner.userId,
      uploadedAt: new Date(),
    };
    await listener.handle(event);
    // Replayed: still one row.
    await listener.handle(event);
    // Another Company's event cannot write into this Project.
    const foreign: ProjectMediaAttached = {
      ...event,
      workspaceId: other.workspaceId,
      fileKey: `${event.fileKey}.other.jpg`,
    };
    await listener.handle(foreign);
    // Not an image or a PDF: not indexed.
    const zip: ProjectMediaAttached = {
      ...event,
      fileKey: `${event.fileKey}.zip`,
      contentType: "application/octet-stream",
    };
    await listener.handle(zip);
    expect(
      (await mediaOf(projectId)).map((item) => [item.source, item.fileName]),
    ).toEqual([["worksheet", "Slab casting.jpg"]]);

    const removed: ProjectMediaRemoved = {
      type: "ProjectMediaRemoved",
      workspaceId: owner.workspaceId,
      occurredAt: new Date(),
      projectId,
      source: "worksheet",
      sourceId,
    };
    await listener.handle(removed);
    expect((await mediaOf(projectId))[0]?.deletedAt).not.toBeNull();
  });
});
