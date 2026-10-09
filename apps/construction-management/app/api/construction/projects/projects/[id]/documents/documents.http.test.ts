import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { PROJECT_DOCUMENT_MAX_BYTES } from "@/src/projects/domain/project-document-rules";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  givePlan,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "../delete/route";
import { POST as deleteDocument } from "./[docId]/delete/route";
import { GET as getDocument } from "./[docId]/route";
import { GET as listDocuments, POST as completeUpload } from "./route";
import { POST as receiveUpload } from "./uploads/app/route";
import { POST as presignUpload } from "./uploads/presign/route";
import { POST as startUpload } from "./uploads/route";

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Document = {
  id: string;
  kind: string;
  fileName: string;
  contentType: string;
  bytes: number;
  viewable: boolean;
  url: string;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
};

type Started = {
  key: string;
  fileName: string;
  upload: { via: "app"; url: string } | { via: "blob" };
};

const PDF = new TextEncoder().encode(
  "%PDF-1.7\n%âãÏÓ\nLetter of Acceptance\n%%EOF",
);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);

const storage = objectStorage();

function base(projectId: string): string {
  return `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/documents`;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function docParams(id: string, docId: string) {
  return { params: Promise.resolve({ id, docId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function start(
  cookie: string,
  projectId: string,
  body: { kind?: string; fileName: string; bytes: number },
) {
  return startUpload(
    jsonRequest(`${base(projectId)}/uploads`, cookie, {
      kind: "other",
      ...body,
    }),
    params(projectId),
  );
}

function send(
  cookie: string,
  projectId: string,
  url: string,
  bytes: Uint8Array,
) {
  return receiveUpload(
    new Request(`${TEST_ORIGIN}${url}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", cookie },
      body: Uint8Array.from(bytes),
    }),
    params(projectId),
  );
}

function complete(
  cookie: string,
  projectId: string,
  body: { key: string; kind?: string; fileName: string },
) {
  return completeUpload(
    jsonRequest(base(projectId), cookie, { kind: "other", ...body }),
    params(projectId),
  );
}

/** The whole browser flow through the app: start, send, complete. */
async function uploaded(
  company: { cookie: string },
  projectId: string,
  fileName: string,
  bytes: Uint8Array,
  kind = "other",
): Promise<Document> {
  const startResponse = await start(company.cookie, projectId, {
    kind,
    fileName,
    bytes: bytes.byteLength,
  });
  expect(startResponse.status).toBe(StatusCodes.CREATED);
  const started = await json<Started>(startResponse);
  if (started.upload.via !== "app") throw new Error("Expected an app upload");
  const sent = await send(company.cookie, projectId, started.upload.url, bytes);
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  const done = await complete(company.cookie, projectId, {
    key: started.key,
    kind,
    fileName,
  });
  expect(done.status).toBe(StatusCodes.CREATED);
  return json<Document>(done);
}

async function list(cookie: string, projectId: string) {
  const response = await listDocuments(
    jsonRequest(base(projectId), cookie),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<{ items: Document[]; totalBytes: number }>(response);
}

function download(
  cookie: string,
  projectId: string,
  document: Document,
  query = "",
) {
  return getDocument(
    jsonRequest(`${TEST_ORIGIN}${document.url}${query}`, cookie),
    docParams(projectId, document.id),
  );
}

async function project(company: Company): Promise<string> {
  return addProject(company.workspaceId, company.userId);
}

describe("Project documents HTTP (CM-414)", () => {
  it("uploads through the app, lists, shows, downloads and deletes", async () => {
    const company = await ownerWithCompany();
    const projectId = await project(company);

    const startResponse = await start(company.cookie, projectId, {
      kind: "loa",
      fileName: "C:\\scans\\LOA – Kumari Heights.pdf",
      bytes: PDF.byteLength,
    });
    expect(startResponse.status).toBe(StatusCodes.CREATED);
    const started = await json<Started>(startResponse);
    expect(started.fileName).toBe("LOA – Kumari Heights.pdf");
    expect(started.key).toMatch(
      new RegExp(
        `^companies/${company.workspaceId}/project-documents/${projectId}/[0-9a-f-]{36}\\.pdf$`,
      ),
    );
    expect(started.upload).toEqual({
      via: "app",
      url: `/api/construction/projects/projects/${projectId}/documents/uploads/app?key=${encodeURIComponent(started.key)}`,
    });
    if (started.upload.via !== "app") throw new Error("Expected an app upload");
    expect(
      (await send(company.cookie, projectId, started.upload.url, PDF)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    // Blob refuses to overwrite; so does the app route.
    const again = await send(
      company.cookie,
      projectId,
      started.upload.url,
      ZIP,
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("UPLOAD_EXISTS");

    const done = await complete(company.cookie, projectId, {
      key: started.key,
      kind: "loa",
      fileName: "LOA – Kumari Heights.pdf",
    });
    expect(done.status).toBe(StatusCodes.CREATED);
    const loa = await json<Document>(done);
    expect(loa).toMatchObject({
      kind: "loa",
      fileName: "LOA – Kumari Heights.pdf",
      contentType: "application/pdf",
      bytes: PDF.byteLength,
      viewable: true,
      url: `/api/construction/projects/projects/${projectId}/documents/${loa.id}`,
      createdBy: company.userId,
      createdByName: "Arun Selva Kumar",
    });
    // A retried completion returns the same document.
    const retried = await complete(company.cookie, projectId, {
      key: started.key,
      kind: "loa",
      fileName: "LOA – Kumari Heights.pdf",
    });
    expect(retried.status).toBe(StatusCodes.OK);
    expect((await json<Document>(retried)).id).toBe(loa.id);

    const zip = await uploaded(company, projectId, "BOQ & drawings.zip", ZIP);
    expect(zip).toMatchObject({
      contentType: "application/octet-stream",
      viewable: false,
    });

    const listed = await list(company.cookie, projectId);
    expect(listed.items.map((item) => item.id)).toEqual([zip.id, loa.id]);
    expect(listed.totalBytes).toBe(PDF.byteLength + ZIP.byteLength);

    const shown = await download(company.cookie, projectId, loa);
    expect(shown.status).toBe(StatusCodes.OK);
    expect(shown.headers.get("content-type")).toBe("application/pdf");
    expect(shown.headers.get("content-disposition")).toBe(
      `inline; filename="LOA _ Kumari Heights.pdf"; filename*=UTF-8''LOA%20%E2%80%93%20Kumari%20Heights.pdf`,
    );
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
    expect(shown.headers.get("cache-control")).toBe("private, no-store");
    expect(shown.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'self'",
    );
    expect(await bytesOf(shown)).toEqual(PDF);

    const saved = await download(company.cookie, projectId, loa, "?download=1");
    expect(saved.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(saved.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    await saved.body?.cancel();

    const zipped = await download(company.cookie, projectId, zip);
    expect(zipped.headers.get("content-type")).toBe("application/octet-stream");
    expect(zipped.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(await bytesOf(zipped)).toEqual(ZIP);

    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: company.workspaceId, kind: "project_document" },
    });
    expect(files).toHaveLength(2);
    expect(files.find((file) => file.key === started.key)).toMatchObject({
      contentType: "application/pdf",
      bytes: PDF.byteLength,
      deletedAt: null,
    });

    const deleted = await deleteDocument(
      jsonRequest(`${base(projectId)}/${loa.id}/delete`, company.cookie, {}),
      docParams(projectId, loa.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    await deleteDocument(
      jsonRequest(`${base(projectId)}/${zip.id}/delete`, company.cookie, {}),
      docParams(projectId, zip.id),
    );
    expect(await list(company.cookie, projectId)).toEqual({
      items: [],
      totalBytes: 0,
    });
    expect((await download(company.cookie, projectId, loa)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const row = await prisma.constructionProjectsDocument.findUnique({
      where: { id: loa.id },
    });
    expect(row?.deletedBy).toBe(company.userId);
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: {
          workspaceId: company.workspaceId,
          kind: "project_document",
          deletedAt: null,
        },
      }),
    ).toBe(0);
    await expect(storage.head(started.key)).resolves.toBeNull();

    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: projectId },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "project.document_added",
      "project.document_added",
      "project.document_deleted",
      "project.document_deleted",
    ]);
    expect(audits[0]).toMatchObject({
      entityType: "project",
      after: {
        documentId: loa.id,
        kind: "loa",
        fileName: "LOA – Kumari Heights.pdf",
        bytes: PDF.byteLength,
      },
    });
  });

  it("refuses programs by name at start and by content at completion", async () => {
    const company = await ownerWithCompany();
    const projectId = await project(company);
    for (const fileName of ["setup.exe", "report.PDF.exe", "RUN.BAT"]) {
      const refused = await start(company.cookie, projectId, {
        fileName,
        bytes: 10,
      });
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe("FILE_TYPE_NOT_ALLOWED");
    }
    const tooLarge = await start(company.cookie, projectId, {
      fileName: "survey.pdf",
      bytes: PROJECT_DOCUMENT_MAX_BYTES + 1,
    });
    expect(tooLarge.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(tooLarge)).toBe("FILE_TOO_LARGE");

    // A program renamed to look like a PDF is caught by its first bytes.
    const started = await json<Started>(
      await start(company.cookie, projectId, {
        fileName: "invoice.pdf",
        bytes: EXE.byteLength,
      }),
    );
    if (started.upload.via !== "app") throw new Error("Expected an app upload");
    await send(company.cookie, projectId, started.upload.url, EXE);
    await expect(storage.head(started.key)).resolves.not.toBeNull();
    const refused = await complete(company.cookie, projectId, {
      key: started.key,
      fileName: "invoice.pdf",
    });
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(refused)).toBe("FILE_TYPE_NOT_ALLOWED");
    await expect(storage.head(started.key)).resolves.toBeNull();
    expect((await list(company.cookie, projectId)).items).toEqual([]);

    // Nothing was sent: 400 UPLOAD_NOT_FOUND.
    const missing = await json<Started>(
      await start(company.cookie, projectId, { fileName: "a.pdf", bytes: 5 }),
    );
    const notSent = await complete(company.cookie, projectId, {
      key: missing.key,
      fileName: "a.pdf",
    });
    expect(await codeOf(notSent)).toBe("UPLOAD_NOT_FOUND");
  });

  it("refuses a key of another Project or Company", async () => {
    const company = await ownerWithCompany();
    const tower = await project(company);
    const villas = await project(company);
    const other = await ownerWithCompany("Sakthi Constructions");
    const theirs = await project(other);

    const started = await json<Started>(
      await start(company.cookie, tower, {
        fileName: "LOA.pdf",
        bytes: PDF.byteLength,
      }),
    );
    if (started.upload.via !== "app") throw new Error("Expected an app upload");
    await send(company.cookie, tower, started.upload.url, PDF);

    const elsewhere = await complete(company.cookie, villas, {
      key: started.key,
      fileName: "LOA.pdf",
    });
    expect(elsewhere.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(elsewhere)).toBe("UPLOAD_KEY_INVALID");

    // Another Company cannot record it, nor write into this Company's folder.
    const foreign = await complete(other.cookie, theirs, {
      key: started.key,
      fileName: "LOA.pdf",
    });
    expect(await codeOf(foreign)).toBe("UPLOAD_KEY_INVALID");
    const intrusion = await send(
      other.cookie,
      theirs,
      `/api/construction/projects/projects/${theirs}/documents/uploads/app?key=${encodeURIComponent(started.key.replace(tower, theirs))}`,
      PDF,
    );
    expect(await codeOf(intrusion)).toBe("UPLOAD_KEY_INVALID");
    const traversal = await send(
      company.cookie,
      tower,
      `/api/construction/projects/projects/${tower}/documents/uploads/app?key=${encodeURIComponent(`${started.key}/../../x.pdf`)}`,
      PDF,
    );
    expect(await codeOf(traversal)).toBe("UPLOAD_KEY_INVALID");
    // Their Project is not found from here.
    expect(
      (
        await listDocuments(
          jsonRequest(base(theirs), company.cookie),
          params(theirs),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("keeps at most 50 files on a Project and counts against the plan's storage", async () => {
    const company = await ownerWithCompany();
    const projectId = await project(company);
    const started = await json<Started>(
      await start(company.cookie, projectId, {
        fileName: "LOA.pdf",
        bytes: PDF.byteLength,
      }),
    );
    if (started.upload.via !== "app") throw new Error("Expected an app upload");
    await send(company.cookie, projectId, started.upload.url, PDF);

    const now = new Date();
    await prisma.constructionProjectsDocument.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        id: newId(),
        workspaceId: company.workspaceId,
        projectId,
        kind: "other" as const,
        fileKey: `seed/${projectId}/${String(index)}.pdf`,
        fileName: `Seed ${String(index)}.pdf`,
        contentType: "application/pdf",
        bytes: 1,
        createdAt: now,
        createdBy: company.userId,
      })),
    });
    const full = await start(company.cookie, projectId, {
      fileName: "one more.pdf",
      bytes: 10,
    });
    expect(full.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(full)).toBe("DOCUMENTS_LIMIT");
    // Started before the Project filled up: refused at completion too, and the bytes go.
    const late = await complete(company.cookie, projectId, {
      key: started.key,
      fileName: "LOA.pdf",
    });
    expect(late.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(late)).toBe("DOCUMENTS_LIMIT");
    await expect(storage.head(started.key)).resolves.toBeNull();

    // Basic allows 20 GB; 11 × 2 GB of other files leaves no room.
    const plan = await ownerWithCompany("Sakthi Constructions");
    await givePlan(plan.workspaceId);
    const planProject = await project(plan);
    await prisma.constructionOrganizationStoredFile.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        id: newId(),
        workspaceId: plan.workspaceId,
        key: `seed/${plan.workspaceId}/${String(index)}.bin`,
        kind: "project_document",
        contentType: "application/octet-stream",
        bytes: 2_000_000_000,
        createdBy: plan.userId,
      })),
    });
    const noRoom = await start(plan.cookie, planProject, {
      fileName: "LOA.pdf",
      bytes: 10,
    });
    expect(noRoom.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(await json(noRoom)).toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { grant: "storage_gb", limit: 20 },
    });
  });

  it("has no presign route while files are kept on disk", async () => {
    const company = await ownerWithCompany();
    const projectId = await project(company);
    const response = await presignUpload(
      jsonRequest(`${base(projectId)}/uploads/presign`, company.cookie, {
        type: "blob.generate-presigned-url",
        payload: {
          pathname: `companies/${company.workspaceId}/project-documents/${projectId}/${newId()}.pdf`,
          multipart: false,
          clientPayload: null,
        },
      }),
      params(projectId),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(response)).toBe("NOT_FOUND");
  });

  it("follows the Project's permissions and visibility", async () => {
    const owner = await ownerWithCompany();
    const tower = await project(owner);
    const villas = await project(owner);
    const loa = await uploaded(owner, tower, "LOA.pdf", PDF, "loa");
    const assign = (memberId: string, projectIds: string[]) =>
      prisma.constructionOrganizationTeamMemberProject.createMany({
        data: projectIds.map((projectId) => ({ memberId, projectId })),
      });

    const outsider = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    await assign(outsider.memberId, [tower]);
    for (const response of [
      await listDocuments(
        jsonRequest(base(tower), outsider.cookie),
        params(tower),
      ),
      await download(outsider.cookie, tower, loa),
      await start(outsider.cookie, tower, { fileName: "a.pdf", bytes: 5 }),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("PERMISSION_DENIED");
    }

    const reader = await memberWith(owner, { "projects.project": ["read"] });
    await assign(reader.memberId, [tower]);
    expect(
      (await list(reader.cookie, tower)).items.map((item) => item.id),
    ).toEqual([loa.id]);
    const read = await download(reader.cookie, tower, loa);
    expect(read.status).toBe(StatusCodes.OK);
    await read.body?.cancel();
    for (const response of [
      await start(reader.cookie, tower, { fileName: "a.pdf", bytes: 5 }),
      await complete(reader.cookie, tower, { key: "x", fileName: "a.pdf" }),
      await deleteDocument(
        jsonRequest(`${base(tower)}/${loa.id}/delete`, reader.cookie, {}),
        docParams(tower, loa.id),
      ),
    ])
      expect(response.status).toBe(StatusCodes.FORBIDDEN);

    // An editor sees only the Projects they are on.
    const editor = await memberWith(owner, {
      "projects.project": ["read", "update"],
    });
    await assign(editor.memberId, [villas]);
    const hidden = await start(editor.cookie, tower, {
      fileName: "a.pdf",
      bytes: 5,
    });
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(hidden)).toBe("PROJECT_NOT_FOUND");
    expect((await download(editor.cookie, tower, loa)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const mine = await uploaded(
      editor,
      villas,
      "Agreement.pdf",
      PDF,
      "agreement",
    );
    expect(mine.createdByName).toBe("Member");
  });

  it("keeps a Project with documents from being deleted", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const loa = await uploaded(owner, projectId, "LOA.pdf", PDF);
    const refused = await deleteProject(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/delete`,
        owner.cookie,
        {},
      ),
      params(projectId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("PROJECT_IN_USE");

    await deleteDocument(
      jsonRequest(`${base(projectId)}/${loa.id}/delete`, owner.cookie, {}),
      docParams(projectId, loa.id),
    );
    const allowed = await deleteProject(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/delete`,
        owner.cookie,
        {},
      ),
      params(projectId),
    );
    expect(allowed.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const item = "/api/construction/projects/projects/{id}/documents";
    for (const [path, method] of [
      [item, "get"],
      [item, "post"],
      [`${item}/uploads`, "post"],
      [`${item}/uploads/presign`, "post"],
      [`${item}/uploads/app`, "post"],
      [`${item}/{docId}`, "get"],
      [`${item}/{docId}/delete`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    expect(
      document.components.schemas[
        "StartConstructionProjectsDocumentUploadResponse"
      ],
    ).toBeDefined();
  });
});
