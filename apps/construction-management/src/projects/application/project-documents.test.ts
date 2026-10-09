import { describe, expect, it } from "vitest";

import type { DirectUploads, ObjectStorage } from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  PROJECT_DOCUMENT_MAX_BYTES,
  PROJECT_DOCUMENT_MULTIPART_FROM_BYTES,
  PROJECT_DOCUMENTS_MAX,
} from "../domain/project-document-rules";
import type { Project } from "../domain/project";
import type { ProjectViewer } from "./project-handlers";
import {
  ProjectDocuments,
  type ProjectDocumentStore,
  type StoredProjectDocument,
} from "./project-documents";

const WORKSPACE = "w1";
const PROJECT = "0199c3a0-0000-7000-8000-000000000001";
const HIDDEN = "0199c3a0-0000-7000-8000-000000000002";
const OWNER: ProjectViewer = {
  workspaceId: WORKSPACE,
  userId: "u1",
  role: "owner",
  projectIds: new Set(),
};
const MEMBER: ProjectViewer = {
  workspaceId: WORKSPACE,
  userId: "u2",
  role: "member",
  projectIds: new Set([PROJECT]),
};

const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\nhello");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

function memoryStorage(direct: boolean) {
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const directUploads: DirectUploads = {
    answer: async ({ body, allow }) => {
      const { pathname } = (body as { payload: { pathname: string } }).payload;
      return { signed: pathname, ...(await allow(pathname)) };
    },
  };
  const storage: ObjectStorage = {
    put: (key, bytes) => {
      objects.set(key, bytes);
      return Promise.resolve();
    },
    get: (key) => {
      const bytes = objects.get(key);
      return Promise.resolve(
        bytes == null
          ? null
          : {
              body: new Blob([Uint8Array.from(bytes)]).stream(),
              contentType: "application/octet-stream",
              contentLength: bytes.byteLength,
            },
      );
    },
    head: (key) => {
      const bytes = objects.get(key);
      return Promise.resolve(
        bytes == null
          ? null
          : { bytes: bytes.byteLength, contentType: "application/pdf" },
      );
    },
    delete: (key) => {
      deleted.push(key);
      objects.delete(key);
      return Promise.resolve();
    },
    ...(direct ? { directUploads } : {}),
  };
  return { storage, objects, deleted };
}

function memoryStore(options: { failAdd?: boolean } = {}) {
  const rows: StoredProjectDocument[] = [];
  const actions: string[] = [];
  const files: string[] = [];
  const live = (projectId: string) =>
    rows.filter((row) => row.projectId === projectId && row.deletedAt == null);
  const store: ProjectDocumentStore = {
    list: (_w, projectId) => Promise.resolve(live(projectId).reverse()),
    count: (_w, projectId) => Promise.resolve(live(projectId).length),
    find: (_w, projectId, id) =>
      Promise.resolve(live(projectId).find((row) => row.id === id) ?? null),
    findByKey: (_w, projectId, key) =>
      Promise.resolve(
        rows.find(
          (row) => row.projectId === projectId && row.fileKey === key,
        ) ?? null,
      ),
    add: (input) => {
      if (options.failAdd === true)
        return Promise.reject(new Error("database down"));
      if (rows.some((row) => row.fileKey === input.document.fileKey))
        return Promise.resolve("duplicate");
      if (live(input.document.projectId).length >= input.maxDocuments)
        return Promise.reject(
          Object.assign(new Error("limit"), { code: "DOCUMENTS_LIMIT" }),
        );
      rows.push({ ...input.document, deletedAt: null });
      files.push(input.file.kind);
      actions.push(input.audit.action);
      return Promise.resolve("added");
    },
    remove: (input) => {
      const row = rows.find((item) => item.id === input.document.id);
      if (row == null || row.deletedAt != null) return Promise.resolve(false);
      row.deletedAt = input.now;
      actions.push(input.audit.action);
      return Promise.resolve(true);
    },
  };
  return { store, rows, actions, files };
}

function setup(
  options: { direct?: boolean; failAdd?: boolean; plan?: PlanGate } = {},
) {
  const { storage, objects, deleted } = memoryStorage(options.direct ?? false);
  const { store, rows, actions, files } = memoryStore(options);
  const planCalls: [string, string, number | undefined][] = [];
  const plan: PlanGate = options.plan ?? {
    assertCanAdd: (workspaceId, grant, quantity) => {
      planCalls.push([workspaceId, grant, quantity]);
      return Promise.resolve();
    },
  };
  const documents = new ProjectDocuments(
    {
      findById: (_w, id) =>
        Promise.resolve(
          id === PROJECT || id === HIDDEN ? ({ id } as Project) : null,
        ),
    },
    store,
    storage,
    plan,
    {
      namesOf: (_w, ids) =>
        Promise.resolve(
          new Map(ids.filter((id) => id === "u1").map((id) => [id, "Arun"])),
        ),
    },
    () => new Date("2026-10-09T10:00:00Z"),
  );
  return { documents, objects, deleted, rows, actions, files, planCalls };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

/** start → bytes in storage → complete, as the browser does it. */
async function upload(
  context: ReturnType<typeof setup>,
  bytes: Uint8Array,
  fileName = "LOA.pdf",
) {
  const started = await context.documents.start({
    viewer: OWNER,
    projectId: PROJECT,
    fileName,
    bytes: bytes.byteLength,
  });
  context.objects.set(started.key, bytes);
  return {
    key: started.key,
    result: await context.documents.complete({
      viewer: OWNER,
      projectId: PROJECT,
      key: started.key,
      kind: "loa",
      fileName,
      by: "u1",
    }),
  };
}

describe("ProjectDocuments", () => {
  it("starts an upload: the key, the cleaned name and the route", async () => {
    const local = setup();
    const started = await local.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: 'C:\\scans\\"LOA".PDF',
      bytes: 1000,
    });
    expect(started.fileName).toBe("LOA.PDF");
    expect(started.key).toMatch(
      new RegExp(`^companies/w1/project-documents/${PROJECT}/.+\\.pdf$`),
    );
    expect(started.upload).toEqual({ via: "app" });
    expect(local.planCalls).toEqual([
      [WORKSPACE, "storage_gb", 1000 / 1024 ** 3],
    ]);

    const direct = setup({ direct: true });
    const small = await direct.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: "a.pdf",
      bytes: PROJECT_DOCUMENT_MULTIPART_FROM_BYTES - 1,
    });
    expect(small.upload).toEqual({ via: "blob", multipart: false });
    const large = await direct.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: "a.pdf",
      bytes: PROJECT_DOCUMENT_MULTIPART_FROM_BYTES,
    });
    expect(large.upload).toEqual({ via: "blob", multipart: true });
  });

  it("refuses programs, files over 25 MB, a full Project and a full plan at start", async () => {
    const context = setup();
    const start = (fileName: string, bytes = 10) =>
      context.documents.start({
        viewer: OWNER,
        projectId: PROJECT,
        fileName,
        bytes,
      });
    expect(await codeOf(start("report.PDF.exe"))).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(await codeOf(start("a.pdf", PROJECT_DOCUMENT_MAX_BYTES + 1))).toBe(
      "FILE_TOO_LARGE",
    );
    for (let index = 0; index < PROJECT_DOCUMENTS_MAX; index += 1)
      context.rows.push({
        id: `d${String(index)}`,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        kind: "other",
        fileKey: `k${String(index)}`,
        fileName: "x.pdf",
        contentType: "application/pdf",
        bytes: 1,
        createdAt: new Date(),
        createdBy: "u1",
        deletedAt: null,
      });
    expect(await codeOf(start("a.pdf"))).toBe("DOCUMENTS_LIMIT");

    const full = setup({
      plan: {
        assertCanAdd: () =>
          Promise.reject(
            Object.assign(new Error("plan"), { code: "PLAN_LIMIT_EXCEEDED" }),
          ),
      },
    });
    expect(
      await codeOf(
        full.documents.start({
          viewer: OWNER,
          projectId: PROJECT,
          fileName: "a.pdf",
          bytes: 10,
        }),
      ),
    ).toBe("PLAN_LIMIT_EXCEEDED");
  });

  it("hides Projects a Member is not on", async () => {
    const context = setup();
    expect(
      await codeOf(
        context.documents.start({
          viewer: MEMBER,
          projectId: HIDDEN,
          fileName: "a.pdf",
          bytes: 10,
        }),
      ),
    ).toBe("PROJECT_NOT_FOUND");
    expect(await codeOf(context.documents.list(MEMBER, HIDDEN))).toBe(
      "PROJECT_NOT_FOUND",
    );
    await expect(context.documents.list(MEMBER, PROJECT)).resolves.toEqual({
      items: [],
      totalBytes: 0,
    });
  });

  it("records what arrived: sniffed type, size, stored file and audit", async () => {
    const context = setup();
    const { key, result } = await upload(context, PDF);
    expect(result.created).toBe(true);
    expect(result.document).toMatchObject({
      kind: "loa",
      fileKey: key,
      fileName: "LOA.pdf",
      contentType: "application/pdf",
      bytes: PDF.byteLength,
      viewable: true,
      createdBy: "u1",
      createdByName: "Arun",
    });
    expect(context.files).toEqual(["project_document"]);
    expect(context.actions).toEqual(["project.document_added"]);

    const zip = await upload(context, ZIP, "papers.zip");
    expect(zip.result.document).toMatchObject({
      contentType: "application/octet-stream",
      viewable: false,
    });
    const listed = await context.documents.list(OWNER, PROJECT);
    expect(listed.items.map((item) => item.fileName)).toEqual([
      "papers.zip",
      "LOA.pdf",
    ]);
    expect(listed.totalBytes).toBe(PDF.byteLength + ZIP.byteLength);
  });

  it("is idempotent: completing the same key again returns the document", async () => {
    const context = setup();
    const { key, result } = await upload(context, PDF);
    const again = await context.documents.complete({
      viewer: OWNER,
      projectId: PROJECT,
      key,
      kind: "loa",
      fileName: "LOA.pdf",
      by: "u1",
    });
    expect(again.created).toBe(false);
    expect(again.document.id).toBe(result.document.id);
    expect(context.rows).toHaveLength(1);
    expect(context.deleted).toEqual([]);
  });

  it("deletes the object when it is a program, too large, or empty", async () => {
    const context = setup();
    for (const [bytes, code] of [
      [EXE, "FILE_TYPE_NOT_ALLOWED"],
      [new Uint8Array(PROJECT_DOCUMENT_MAX_BYTES + 1), "FILE_TOO_LARGE"],
      [new Uint8Array(), "FILE_EMPTY"],
    ] as const) {
      const started = await context.documents.start({
        viewer: OWNER,
        projectId: PROJECT,
        fileName: "innocent.pdf",
        bytes: 10,
      });
      context.objects.set(started.key, bytes);
      expect(
        await codeOf(
          context.documents.complete({
            viewer: OWNER,
            projectId: PROJECT,
            key: started.key,
            kind: "other",
            fileName: "innocent.pdf",
            by: "u1",
          }),
        ),
      ).toBe(code);
      expect(context.objects.has(started.key)).toBe(false);
    }
    expect(context.rows).toEqual([]);
  });

  it("discards an orphaned object when the insert fails, and refuses other keys", async () => {
    const context = setup({ failAdd: true });
    const started = await context.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: "LOA.pdf",
      bytes: PDF.byteLength,
    });
    context.objects.set(started.key, PDF);
    const complete = (key: string, projectId = PROJECT) =>
      context.documents.complete({
        viewer: OWNER,
        projectId,
        key,
        kind: "loa",
        fileName: "LOA.pdf",
        by: "u1",
      });
    await expect(complete(started.key)).rejects.toThrow("database down");
    expect(context.deleted).toEqual([started.key]);

    expect(await codeOf(complete(started.key, HIDDEN))).toBe(
      "UPLOAD_KEY_INVALID",
    );
    expect(
      await codeOf(
        complete(started.key.replace("companies/w1", "companies/w2")),
      ),
    ).toBe("UPLOAD_KEY_INVALID");
    expect(await codeOf(complete(started.key))).toBe("UPLOAD_NOT_FOUND");
  });

  it("never deletes a recorded object on a retry", async () => {
    const context = setup();
    const { key } = await upload(context, PDF);
    // A retry finds the row first and never reaches the plan or storage.
    const retry = await context.documents.complete({
      viewer: OWNER,
      projectId: PROJECT,
      key,
      kind: "loa",
      fileName: "LOA.pdf",
      by: "u1",
    });
    expect(retry.created).toBe(false);
    expect(context.objects.has(key)).toBe(true);
  });

  it("receives bytes only where storage is on disk, never over an object", async () => {
    const local = setup();
    const started = await local.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: "a.pdf",
      bytes: 3,
    });
    const receive = (key: string) =>
      local.documents.receive({
        viewer: OWNER,
        projectId: PROJECT,
        key,
        bytes: PDF,
      });
    await receive(started.key);
    expect(local.objects.get(started.key)).toEqual(PDF);
    expect(await codeOf(receive(started.key))).toBe("UPLOAD_EXISTS");
    expect(await codeOf(receive(started.key.replace(PROJECT, HIDDEN)))).toBe(
      "UPLOAD_KEY_INVALID",
    );
    expect(
      await codeOf(
        local.documents.answerDirectUpload({
          viewer: OWNER,
          projectId: PROJECT,
          request: new Request("http://localhost/"),
          body: {},
        }),
      ),
    ).toBe("NOT_FOUND");

    const direct = setup({ direct: true });
    expect(
      await codeOf(
        direct.documents.receive({
          viewer: OWNER,
          projectId: PROJECT,
          key: started.key,
          bytes: PDF,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("presigns only this Project's keys for a viewer who may see it", async () => {
    const direct = setup({ direct: true });
    const started = await direct.documents.start({
      viewer: OWNER,
      projectId: PROJECT,
      fileName: "a.pdf",
      bytes: 3,
    });
    const answer = (key: string, viewer = OWNER, projectId = PROJECT) =>
      direct.documents.answerDirectUpload({
        viewer,
        projectId,
        request: new Request("http://localhost/"),
        body: { payload: { pathname: key } },
      });
    await expect(answer(started.key)).resolves.toEqual({
      signed: started.key,
      maxBytes: PROJECT_DOCUMENT_MAX_BYTES,
    });
    expect(await codeOf(answer(`${started.key}/../x.pdf`))).toBe(
      "UPLOAD_KEY_INVALID",
    );
    expect(await codeOf(answer(started.key, MEMBER, HIDDEN))).toBe(
      "PROJECT_NOT_FOUND",
    );
  });

  it("deletes: tombstone, audit, then the object", async () => {
    const context = setup();
    const { key, result } = await upload(context, PDF);
    const read = await context.documents.read(
      OWNER,
      PROJECT,
      result.document.id,
    );
    expect(read.document.viewable).toBe(true);
    await context.documents.delete({
      viewer: OWNER,
      projectId: PROJECT,
      documentId: result.document.id,
      by: "u1",
    });
    expect(context.actions).toEqual([
      "project.document_added",
      "project.document_deleted",
    ]);
    expect(context.deleted).toEqual([key]);
    expect(
      await codeOf(context.documents.read(OWNER, PROJECT, result.document.id)),
    ).toBe("DOCUMENT_NOT_FOUND");
    // Bytes sent again to a deleted document's key are not kept.
    context.objects.set(key, PDF);
    expect(
      await codeOf(
        context.documents.complete({
          viewer: OWNER,
          projectId: PROJECT,
          key,
          kind: "loa",
          fileName: "LOA.pdf",
          by: "u1",
        }),
      ),
    ).toBe("UPLOAD_NOT_FOUND");
    expect(context.objects.has(key)).toBe(false);
  });
});
