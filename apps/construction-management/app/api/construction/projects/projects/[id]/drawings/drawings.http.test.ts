import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { SEED_DRAWING_ALBUMS } from "@/src/projects/domain/project-seeds";
import { DRAWING_MAX_BYTES } from "@/src/projects/domain/project-upload-policies";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "../delete/route";
import { POST as deleteAlbum } from "./albums/[albumId]/delete/route";
import { GET as getAlbum } from "./albums/[albumId]/route";
import { POST as renameAlbum } from "./albums/[albumId]/update/route";
import { GET as listAlbums, POST as addAlbum } from "./albums/route";
import { POST as deleteDrawing } from "./[drawingId]/delete/route";
import { POST as moveDrawing } from "./[drawingId]/move/route";
import { GET as getRevisionFile } from "./[drawingId]/revisions/[revisionId]/file/route";
import { GET as getRevisionThumbnail } from "./[drawingId]/revisions/[revisionId]/thumbnail/route";
import { POST as addRevision } from "./[drawingId]/revisions/route";
import { GET as getDrawing } from "./[drawingId]/route";
import { POST as renameDrawing } from "./[drawingId]/update/route";
import { POST as completeDrawing } from "./route";
import { POST as receiveUpload } from "./uploads/app/route";
import { POST as startUpload } from "./uploads/route";
import { POST as sendThumbnail } from "./uploads/thumbnail/route";

type Company = { cookie: string; workspaceId: string; userId: string };

type Album = {
  id: string;
  name: string;
  isSeed: boolean;
  drawingCount: number;
  updatedAt: string;
};

type Revision = {
  id: string;
  revision: number;
  label: string;
  fileName: string;
  contentType: string;
  bytes: number;
  viewable: boolean;
  url: string;
  thumbUrl: string | null;
  createdByName: string | null;
};

type Drawing = {
  id: string;
  albumId: string;
  albumName: string;
  name: string;
  revisions: Revision[];
  updatedAt: string;
};

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
  thumbnailUrl: string;
};

const text = (value: string) => new TextEncoder().encode(value);
const PDF = text("%PDF-1.7\nGround floor plan\n%%EOF");
const DWG = text("AC1032\0\0\0\0\0\x01\x02\x03");
const DXF = text("  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n");
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

const storage = objectStorage();

function base(projectId: string): string {
  return `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/drawings`;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function albumParams(id: string, albumId: string) {
  return { params: Promise.resolve({ id, albumId }) };
}

function drawingParams(id: string, drawingId: string) {
  return { params: Promise.resolve({ id, drawingId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

/** The four seed albums CM-401 gives every new Project, written directly. */
async function seedAlbums(company: Company, projectId: string) {
  const now = new Date();
  await prisma.constructionProjectsDrawingAlbum.createMany({
    data: SEED_DRAWING_ALBUMS.map((name) => ({
      id: newId(),
      workspaceId: company.workspaceId,
      projectId,
      name,
      isSeed: true,
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system",
    })),
    skipDuplicates: true,
  });
}

async function project(company: Company): Promise<string> {
  const projectId = await addProject(company.workspaceId, company.userId);
  await seedAlbums(company, projectId);
  return projectId;
}

async function albums(cookie: string, projectId: string): Promise<Album[]> {
  const response = await listAlbums(
    jsonRequest(`${base(projectId)}/albums`, cookie),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: Album[] }>(response)).items;
}

async function albumNamed(
  cookie: string,
  projectId: string,
  name: string,
): Promise<Album> {
  const found = (await albums(cookie, projectId)).find(
    (album) => album.name === name,
  );
  if (found == null) throw new Error(`No album ${name}`);
  return found;
}

function start(
  cookie: string,
  projectId: string,
  fileName: string,
  bytes: number,
) {
  return startUpload(
    jsonRequest(`${base(projectId)}/uploads`, cookie, { fileName, bytes }),
    params(projectId),
  );
}

/** Start and send the bytes (and a thumbnail) as the browser does. */
async function sent(
  cookie: string,
  projectId: string,
  fileName: string,
  bytes: Uint8Array,
  thumbnail?: Uint8Array,
): Promise<Started> {
  const response = await start(cookie, projectId, fileName, bytes.byteLength);
  expect(response.status).toBe(StatusCodes.CREATED);
  const started = await json<Started>(response);
  if (started.upload.via !== "app") throw new Error("Expected an app upload");
  const received = await receiveUpload(
    new Request(`${TEST_ORIGIN}${started.upload.url}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", cookie },
      body: Uint8Array.from(bytes),
    }),
    params(projectId),
  );
  expect(received.status).toBe(StatusCodes.NO_CONTENT);
  if (thumbnail != null) {
    const kept = await sendThumbnail(
      new Request(`${TEST_ORIGIN}${started.thumbnailUrl}`, {
        method: "POST",
        headers: { "content-type": "image/webp", cookie },
        body: Uint8Array.from(thumbnail),
      }),
      params(projectId),
    );
    expect(kept.status).toBe(StatusCodes.NO_CONTENT);
  }
  return started;
}

function complete(
  cookie: string,
  projectId: string,
  body: { key: string; fileName: string; albumId: string; name?: string },
) {
  return completeDrawing(
    jsonRequest(base(projectId), cookie, body),
    params(projectId),
  );
}

function completeRevision(
  cookie: string,
  projectId: string,
  drawingId: string,
  body: { key: string; fileName: string },
) {
  return addRevision(
    jsonRequest(`${base(projectId)}/${drawingId}/revisions`, cookie, body),
    drawingParams(projectId, drawingId),
  );
}

/** A whole new drawing in `albumId`. */
async function uploadDrawing(
  company: { cookie: string },
  projectId: string,
  albumId: string,
  fileName: string,
  bytes: Uint8Array,
  name?: string,
): Promise<Drawing> {
  const started = await sent(company.cookie, projectId, fileName, bytes);
  const done = await complete(company.cookie, projectId, {
    key: started.key,
    fileName,
    albumId,
    ...(name == null ? {} : { name }),
  });
  expect(done.status).toBe(StatusCodes.CREATED);
  return json<Drawing>(done);
}

function firstOf(drawing: Drawing): Revision {
  const revision = drawing.revisions[0];
  if (revision == null) throw new Error("Expected a revision");
  return revision;
}

function file(cookie: string, revision: Revision, query = "") {
  const [, projectId, drawingId] =
    /projects\/([^/]+)\/drawings\/([^/]+)\/revisions/.exec(revision.url) ?? [];
  return getRevisionFile(
    jsonRequest(`${TEST_ORIGIN}${revision.url}${query}`, cookie),
    {
      params: Promise.resolve({
        id: projectId ?? "",
        drawingId: drawingId ?? "",
        revisionId: revision.id,
      }),
    },
  );
}

/** Tests that sign in several Team Members take longer under load. */
const MANY_MEMBERS_MS = 20_000;

describe("Project Drawings HTTP (CM-408)", () => {
  it("lists the seed albums, adds and renames albums with unique names", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const seeded = await albums(owner.cookie, projectId);
    expect(
      seeded.map((album) => [album.name, album.isSeed, album.drawingCount]),
    ).toEqual([
      ["Architect", true, 0],
      ["Electrical", true, 0],
      ["Plumbing", true, 0],
      ["Structural Drawing", true, 0],
    ]);

    const added = await addAlbum(
      jsonRequest(`${base(projectId)}/albums`, owner.cookie, {
        name: "  Fire   fighting ",
      }),
      params(projectId),
    );
    expect(added.status).toBe(StatusCodes.CREATED);
    const fire = await json<Album>(added);
    expect(fire).toMatchObject({ name: "Fire fighting", isSeed: false });

    const duplicate = await addAlbum(
      jsonRequest(`${base(projectId)}/albums`, owner.cookie, {
        name: "fire FIGHTING",
      }),
      params(projectId),
    );
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(duplicate)).toBe("ALBUM_NAME_IN_USE");
    const blank = await addAlbum(
      jsonRequest(`${base(projectId)}/albums`, owner.cookie, { name: " " }),
      params(projectId),
    );
    expect(await codeOf(blank)).toBe("ALBUM_NAME_REQUIRED");

    const rename = (name: string, updatedAt: string) =>
      renameAlbum(
        jsonRequest(
          `${base(projectId)}/albums/${fire.id}/update`,
          owner.cookie,
          {
            name,
            updatedAt,
          },
        ),
        albumParams(projectId, fire.id),
      );
    const taken = await rename("ARCHITECT", fire.updatedAt);
    expect(await codeOf(taken)).toBe("ALBUM_NAME_IN_USE");
    const renamed = await rename("Fire & safety", fire.updatedAt);
    expect(renamed.status).toBe(StatusCodes.OK);
    expect((await json<Album>(renamed)).name).toBe("Fire & safety");
    const stale = await rename("Fire", fire.updatedAt);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("ALBUM_CHANGED");

    // Another Project may use the same name.
    const other = await project(owner);
    const elsewhere = await addAlbum(
      jsonRequest(`${base(other)}/albums`, owner.cookie, {
        name: "Fire & safety",
      }),
      params(other),
    );
    expect(elsewhere.status).toBe(StatusCodes.CREATED);
  });

  it("uploads a drawing and numbered revisions, shows the latest and keeps the history", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const architect = await albumNamed(owner.cookie, projectId, "Architect");

    const plan = await uploadDrawing(
      owner,
      projectId,
      architect.id,
      "GF Plan.pdf",
      PDF,
    );
    expect(plan).toMatchObject({
      name: "GF Plan",
      albumId: architect.id,
      albumName: "Architect",
    });
    expect(plan.revisions).toHaveLength(1);
    expect(plan.revisions[0]).toMatchObject({
      revision: 1,
      label: "R1",
      contentType: "application/pdf",
      viewable: true,
      thumbUrl: null,
      createdByName: "Arun Selva Kumar",
    });

    // R2 is a DWG: stored, download only.
    const dwg = await sent(owner.cookie, projectId, "GF Plan rev B.dwg", DWG);
    const r2 = await completeRevision(owner.cookie, projectId, plan.id, {
      key: dwg.key,
      fileName: "GF Plan rev B.dwg",
    });
    expect(r2.status).toBe(StatusCodes.CREATED);
    // A retry returns the same drawing without a third revision.
    const retried = await completeRevision(owner.cookie, projectId, plan.id, {
      key: dwg.key,
      fileName: "GF Plan rev B.dwg",
    });
    expect(retried.status).toBe(StatusCodes.OK);

    // R3 is an image with a browser-made thumbnail.
    const png = await sent(
      owner.cookie,
      projectId,
      "GF Plan.png",
      pngBytes(),
      WEBP,
    );
    const r3 = await json<Drawing>(
      await completeRevision(owner.cookie, projectId, plan.id, {
        key: png.key,
        fileName: "GF Plan.png",
      }),
    );
    expect(r3.revisions.map((revision) => revision.label)).toEqual([
      "R3",
      "R2",
      "R1",
    ]);
    const [latest, cad, first] = r3.revisions;
    if (latest == null || cad == null || first == null)
      throw new Error("Expected three revisions");
    expect(cad).toMatchObject({
      contentType: "application/octet-stream",
      viewable: false,
    });
    expect(latest.thumbUrl).toBe(
      `/api/construction/projects/projects/${projectId}/drawings/${plan.id}/revisions/${latest.id}/thumbnail`,
    );

    const album = await json<{
      album: Album;
      drawings: {
        id: string;
        name: string;
        revisionCount: number;
        latest: Revision;
      }[];
    }>(
      await getAlbum(
        jsonRequest(`${base(projectId)}/albums/${architect.id}`, owner.cookie),
        albumParams(projectId, architect.id),
      ),
    );
    expect(album.album).toMatchObject({ name: "Architect", drawingCount: 1 });
    expect(album.drawings).toMatchObject([
      { id: plan.id, revisionCount: 3, latest: { label: "R3" } },
    ]);
    expect(
      (await albums(owner.cookie, projectId)).find(
        (item) => item.id === architect.id,
      )?.drawingCount,
    ).toBe(1);

    // PDFs and images show; DWG downloads; every revision downloads.
    const shown = await file(owner.cookie, first);
    expect(shown.headers.get("content-type")).toBe("application/pdf");
    expect(shown.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(await bytesOf(shown)).toEqual(PDF);
    const cadFile = await file(owner.cookie, cad);
    expect(cadFile.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(cadFile.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(cadFile.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(await bytesOf(cadFile)).toEqual(DWG);
    const saved = await file(owner.cookie, first, "?download=1");
    expect(saved.headers.get("content-disposition")).toMatch(/^attachment;/);
    await saved.body?.cancel();
    const thumbnail = await getRevisionThumbnail(
      jsonRequest(`${TEST_ORIGIN}${latest.thumbUrl ?? ""}`, owner.cookie),
      {
        params: Promise.resolve({
          id: projectId,
          drawingId: plan.id,
          revisionId: latest.id,
        }),
      },
    );
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    expect(await bytesOf(thumbnail)).toEqual(WEBP);

    // Every PDF or image revision is in the Gallery; the DWG is not.
    const media = await prisma.constructionProjectsMediaItem.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { uploadedAt: "asc" },
    });
    expect(
      media.map((item) => [
        item.source,
        item.sourceId,
        item.fileName,
        item.thumbKey,
      ]),
    ).toEqual([
      ["drawing", plan.id, "GF Plan.pdf", null],
      ["drawing", plan.id, "GF Plan.png", `${png.key}.thumb.webp`],
    ]);
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: {
          workspaceId: owner.workspaceId,
          kind: { in: ["drawing_revision", "drawing_revision_thumbnail"] },
          deletedAt: null,
        },
      }),
    ).toBe(4);

    const detail = await json<Drawing>(
      await getDrawing(
        jsonRequest(`${base(projectId)}/${plan.id}`, owner.cookie),
        drawingParams(projectId, plan.id),
      ),
    );
    expect(detail.revisions.map((revision) => revision.label)).toEqual([
      "R3",
      "R2",
      "R1",
    ]);
  });

  it("renames, moves and deletes drawings; an album with drawings cannot be deleted", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const architect = await albumNamed(owner.cookie, projectId, "Architect");
    const structural = await albumNamed(
      owner.cookie,
      projectId,
      "Structural Drawing",
    );
    const plan = await uploadDrawing(
      owner,
      projectId,
      architect.id,
      "plan.pdf",
      PDF,
      "Column layout",
    );
    expect(plan.name).toBe("Column layout");

    const notEmpty = await deleteAlbum(
      jsonRequest(
        `${base(projectId)}/albums/${architect.id}/delete`,
        owner.cookie,
        {},
      ),
      albumParams(projectId, architect.id),
    );
    expect(notEmpty.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(notEmpty)).toBe("ALBUM_NOT_EMPTY");

    const renamed = await renameDrawing(
      jsonRequest(`${base(projectId)}/${plan.id}/update`, owner.cookie, {
        name: "Column layout – level 1",
        updatedAt: plan.updatedAt,
      }),
      drawingParams(projectId, plan.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const afterRename = await json<Drawing>(renamed);
    const stale = await moveDrawing(
      jsonRequest(`${base(projectId)}/${plan.id}/move`, owner.cookie, {
        albumId: structural.id,
        updatedAt: plan.updatedAt,
      }),
      drawingParams(projectId, plan.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("DRAWING_CHANGED");

    // Not an album of this Project.
    const other = await project(owner);
    const foreignAlbum = await albumNamed(owner.cookie, other, "Architect");
    const foreign = await moveDrawing(
      jsonRequest(`${base(projectId)}/${plan.id}/move`, owner.cookie, {
        albumId: foreignAlbum.id,
        updatedAt: afterRename.updatedAt,
      }),
      drawingParams(projectId, plan.id),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(foreign)).toBe("ALBUM_NOT_FOUND");

    const moved = await json<Drawing>(
      await moveDrawing(
        jsonRequest(`${base(projectId)}/${plan.id}/move`, owner.cookie, {
          albumId: structural.id,
          updatedAt: afterRename.updatedAt,
        }),
        drawingParams(projectId, plan.id),
      ),
    );
    expect(moved).toMatchObject({
      albumId: structural.id,
      albumName: "Structural Drawing",
      name: "Column layout – level 1",
    });

    // A Project with drawings cannot be deleted.
    const inUse = await deleteProject(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/delete`,
        owner.cookie,
        {},
      ),
      params(projectId),
    );
    expect(await codeOf(inUse)).toBe("PROJECT_IN_USE");

    const key = (
      await prisma.constructionProjectsDrawingRevision.findFirstOrThrow({
        where: { drawingId: plan.id },
      })
    ).fileKey;
    const deleted = await deleteDrawing(
      jsonRequest(`${base(projectId)}/${plan.id}/delete`, owner.cookie, {}),
      drawingParams(projectId, plan.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (
        await getDrawing(
          jsonRequest(`${base(projectId)}/${plan.id}`, owner.cookie),
          drawingParams(projectId, plan.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      await prisma.constructionProjectsDrawingRevision.count({
        where: { drawingId: plan.id, deletedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { sourceId: plan.id, deletedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: { key, deletedAt: null },
      }),
    ).toBe(0);
    await expect(storage.head(key)).resolves.toBeNull();

    const emptied = await deleteAlbum(
      jsonRequest(
        `${base(projectId)}/albums/${architect.id}/delete`,
        owner.cookie,
        {},
      ),
      albumParams(projectId, architect.id),
    );
    expect(emptied.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await albums(owner.cookie, projectId)).map((album) => album.name),
    ).toEqual(["Electrical", "Plumbing", "Structural Drawing"]);

    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: plan.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "drawing.created",
      "drawing.renamed",
      "drawing.moved",
      "drawing.deleted",
    ]);
  });

  it("takes PDFs, images, DWG and DXF up to 100 MB and refuses the rest", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const album = await albumNamed(owner.cookie, projectId, "Electrical");
    for (const fileName of [
      "BOQ.zip",
      "setup.exe",
      "notes.txt",
      "plan.PDF.exe",
    ]) {
      const refused = await start(owner.cookie, projectId, fileName, 10);
      expect(refused.status, fileName).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe("FILE_TYPE_NOT_ALLOWED");
    }
    const tooLarge = await start(
      owner.cookie,
      projectId,
      "survey.pdf",
      DRAWING_MAX_BYTES + 1,
    );
    expect(await codeOf(tooLarge)).toBe("FILE_TOO_LARGE");
    const large = await start(
      owner.cookie,
      projectId,
      "survey.pdf",
      DRAWING_MAX_BYTES,
    );
    expect(large.status).toBe(StatusCodes.CREATED);

    // A program, or a zip, renamed .pdf is caught by its content.
    for (const bytes of [EXE, ZIP]) {
      const started = await sent(owner.cookie, projectId, "invoice.pdf", bytes);
      const refused = await complete(owner.cookie, projectId, {
        key: started.key,
        fileName: "invoice.pdf",
        albumId: album.id,
      });
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe("FILE_TYPE_NOT_ALLOWED");
      await expect(storage.head(started.key)).resolves.toBeNull();
    }

    const dxf = await uploadDrawing(
      owner,
      projectId,
      album.id,
      "Wiring.dxf",
      DXF,
    );
    expect(dxf.revisions[0]).toMatchObject({
      contentType: "application/octet-stream",
      viewable: false,
    });
    expect(dxf.name).toBe("Wiring");
  });

  it(
    "follows projects.drawings flags and Project visibility",
    async () => {
      const owner = await ownerWithCompany();
      const tower = await project(owner);
      const villas = await project(owner);
      const architect = await albumNamed(owner.cookie, tower, "Architect");
      const plan = await uploadDrawing(
        owner,
        tower,
        architect.id,
        "GF.pdf",
        PDF,
      );
      const assign = (memberId: string, projectIds: string[]) =>
        prisma.constructionOrganizationTeamMemberProject.createMany({
          data: projectIds.map((projectId) => ({ memberId, projectId })),
        });

      // No Drawings flag at all.
      const outsider = await memberWith(owner, {
        "projects.project": ["read"],
      });
      await assign(outsider.memberId, [tower]);
      const denied = await listAlbums(
        jsonRequest(`${base(tower)}/albums`, outsider.cookie),
        params(tower),
      );
      expect(denied.status).toBe(StatusCodes.FORBIDDEN);
      expect((await file(outsider.cookie, firstOf(plan))).status).toBe(
        StatusCodes.FORBIDDEN,
      );

      // Read only: sees and downloads, changes nothing.
      const reader = await memberWith(owner, { "projects.drawings": ["read"] });
      await assign(reader.memberId, [tower]);
      expect((await albums(reader.cookie, tower)).length).toBe(4);
      const read = await file(reader.cookie, firstOf(plan));
      expect(read.status).toBe(StatusCodes.OK);
      await read.body?.cancel();
      for (const response of [
        await addAlbum(
          jsonRequest(`${base(tower)}/albums`, reader.cookie, { name: "MEP" }),
          params(tower),
        ),
        await start(reader.cookie, tower, "a.pdf", 5),
        await deleteDrawing(
          jsonRequest(`${base(tower)}/${plan.id}/delete`, reader.cookie, {}),
          drawingParams(tower, plan.id),
        ),
      ])
        expect(response.status).toBe(StatusCodes.FORBIDDEN);

      // Create only: may upload a new drawing, not a new revision.
      const creator = await memberWith(owner, {
        "projects.drawings": ["read", "create"],
      });
      await assign(creator.memberId, [tower]);
      const mine = await uploadDrawing(
        creator,
        tower,
        architect.id,
        "Mine.pdf",
        PDF,
      );
      expect(mine.revisions[0]?.createdByName).toBe("Member");
      const started = await sent(creator.cookie, tower, "Mine R2.pdf", PDF);
      const noRevision = await completeRevision(
        creator.cookie,
        tower,
        mine.id,
        {
          key: started.key,
          fileName: "Mine R2.pdf",
        },
      );
      expect(noRevision.status).toBe(StatusCodes.FORBIDDEN);

      // Update only: may upload a new revision.
      const updater = await memberWith(owner, {
        "projects.drawings": ["read", "update"],
      });
      await assign(updater.memberId, [tower]);
      const revisionFile = await sent(updater.cookie, tower, "GF R2.pdf", PDF);
      const r2 = await completeRevision(updater.cookie, tower, plan.id, {
        key: revisionFile.key,
        fileName: "GF R2.pdf",
      });
      expect(r2.status).toBe(StatusCodes.CREATED);

      // A member not on the Project: not found.
      const elsewhere = await memberWith(owner, {
        "projects.drawings": ["read", "create", "update", "delete"],
      });
      await assign(elsewhere.memberId, [villas]);
      const hidden = await listAlbums(
        jsonRequest(`${base(tower)}/albums`, elsewhere.cookie),
        params(tower),
      );
      expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(hidden)).toBe("PROJECT_NOT_FOUND");
      expect((await file(elsewhere.cookie, firstOf(plan))).status).toBe(
        StatusCodes.NOT_FOUND,
      );

      // Another Company: not found, and its keys are refused.
      const rival = await ownerWithCompany("Sakthi Constructions");
      const theirs = await project(rival);
      expect(
        (
          await listAlbums(
            jsonRequest(`${base(tower)}/albums`, rival.cookie),
            params(tower),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      const theirAlbum = await albumNamed(rival.cookie, theirs, "Architect");
      const stolen = await complete(rival.cookie, theirs, {
        key: revisionFile.key,
        fileName: "GF R2.pdf",
        albumId: theirAlbum.id,
      });
      expect(await codeOf(stolen)).toBe("UPLOAD_KEY_INVALID");
      // A drawing cannot be filed in another Project's album.
      const own = await sent(owner.cookie, tower, "x.pdf", PDF);
      const wrongAlbum = await complete(owner.cookie, tower, {
        key: own.key,
        fileName: "x.pdf",
        albumId: theirAlbum.id,
      });
      expect(wrongAlbum.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(wrongAlbum)).toBe("ALBUM_NOT_FOUND");
    },
    MANY_MEMBERS_MS,
  );

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const item = "/api/construction/projects/projects/{id}/drawings";
    for (const [path, method] of [
      [`${item}/albums`, "get"],
      [`${item}/albums`, "post"],
      [`${item}/albums/{albumId}`, "get"],
      [`${item}/albums/{albumId}/update`, "post"],
      [`${item}/albums/{albumId}/delete`, "post"],
      [`${item}/uploads`, "post"],
      [`${item}/uploads/presign`, "post"],
      [`${item}/uploads/app`, "post"],
      [`${item}/uploads/thumbnail`, "post"],
      [item, "post"],
      [`${item}/{drawingId}`, "get"],
      [`${item}/{drawingId}/revisions`, "post"],
      [`${item}/{drawingId}/update`, "post"],
      [`${item}/{drawingId}/move`, "post"],
      [`${item}/{drawingId}/delete`, "post"],
      [`${item}/{drawingId}/revisions/{revisionId}/file`, "get"],
      [`${item}/{drawingId}/revisions/{revisionId}/thumbnail`, "get"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });
});
