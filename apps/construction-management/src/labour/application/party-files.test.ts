import { describe, expect, it } from "vitest";

import type { ObjectStorage } from "@/src/shared-kernel/files";

import {
  PartyFiles,
  cleanFileName,
  type PartyDocumentRecord,
  type PartyFilesStore,
  type PartyRef,
} from "./party-files";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n...");

function memoryStorage() {
  const objects = new Map<string, Uint8Array>();
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
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return { objects, storage };
}

function memoryStore(owners: string[]) {
  const photos = new Map<string, string | null>(owners.map((id) => [id, null]));
  const documents: (PartyDocumentRecord & {
    ownerId: string;
    deleted: boolean;
  })[] = [];
  const actions: string[] = [];
  const store: PartyFilesStore = {
    owner: (ref) =>
      Promise.resolve(
        photos.has(ref.ownerId)
          ? { photoKey: photos.get(ref.ownerId) ?? null }
          : null,
      ),
    setPhoto: (input) => {
      if (photos.get(input.ref.ownerId) !== input.loadedKey)
        return Promise.reject(new Error("PHOTO_CHANGED"));
      photos.set(input.ref.ownerId, input.key);
      actions.push(input.audit.action);
      return Promise.resolve();
    },
    documents: (ref) =>
      Promise.resolve(
        documents.filter((doc) => doc.ownerId === ref.ownerId && !doc.deleted),
      ),
    document: (ref, id) =>
      Promise.resolve(
        documents.find(
          (doc) => doc.ownerId === ref.ownerId && doc.id === id && !doc.deleted,
        ) ?? null,
      ),
    addDocument: (input) => {
      documents.push({
        ...input.document,
        ownerId: input.ref.ownerId,
        deleted: false,
      });
      actions.push(input.audit.action);
      return Promise.resolve();
    },
    removeDocument: (input) => {
      const found = documents.find((doc) => doc.id === input.document.id);
      if (found == null || found.deleted) return Promise.resolve(false);
      found.deleted = true;
      actions.push(input.audit.action);
      return Promise.resolve(true);
    },
  };
  return { store, photos, actions };
}

const VENDOR: PartyRef = {
  workspaceId: "w1",
  ownerType: "vendor",
  ownerId: "v1",
};

describe("PartyFiles", () => {
  it("replaces a photo and deletes the old object", async () => {
    const { objects, storage } = memoryStorage();
    const { store, photos, actions } = memoryStore(["v1"]);
    const files = new PartyFiles(storage, store);
    const first = await files.setPhoto({
      ...VENDOR,
      bytes: PNG,
      contentType: "image/png",
      by: "u1",
    });
    expect(first.photoKey).toMatch(/^companies\/w1\/vendor-photos\/.+\.png$/);
    const second = await files.setPhoto({
      ...VENDOR,
      bytes: PNG,
      contentType: "image/png",
      by: "u1",
    });
    expect(objects.has(first.photoKey)).toBe(false);
    expect(photos.get("v1")).toBe(second.photoKey);
    await files.removePhoto({ ...VENDOR, by: "u1" });
    expect(objects.size).toBe(0);
    expect(actions).toEqual([
      "vendor.photo_changed",
      "vendor.photo_changed",
      "vendor.photo_removed",
    ]);
  });

  it("keeps documents under the owner and refuses other file types", async () => {
    const { storage } = memoryStorage();
    const { store } = memoryStore(["v1"]);
    const files = new PartyFiles(storage, store);
    const added = await files.addDocument({
      ...VENDOR,
      fileName: "C:\\scans\\licence.pdf",
      bytes: PDF,
      contentType: "application/pdf",
      by: "u1",
    });
    expect(added.fileName).toBe("licence.pdf");
    expect((await files.documents(VENDOR)).map((doc) => doc.id)).toEqual([
      added.id,
    ]);
    const read = await files.readDocument(VENDOR, added.id);
    expect(read.document.contentType).toBe("application/pdf");
    await expect(
      files.addDocument({
        ...VENDOR,
        fileName: "x.gif",
        bytes: new TextEncoder().encode("GIF89a"),
        contentType: "image/gif",
        by: "u1",
      }),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    await files.deleteDocument({ ...VENDOR, documentId: added.id, by: "u1" });
    await expect(files.readDocument(VENDOR, added.id)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_FOUND",
    });
    await expect(
      files.documents({ ...VENDOR, ownerId: "missing" }),
    ).rejects.toMatchObject({ code: "VENDOR_NOT_FOUND" });
  });

  it("cleans file names", () => {
    expect(cleanFileName("../../etc/passwd", "pdf")).toBe("passwd");
    expect(cleanFileName("  ", "pdf")).toBe("document.pdf");
    expect(cleanFileName(null, "png")).toBe("document.png");
  });
});
