import { describe, expect, it } from "vitest";

import type { ObjectStorage } from "../files/object-storage";
import { UNLIMITED_PLAN } from "../plan";
import { thumbnailKeyOf } from "./attachment-key";
import {
  AttachmentUploads,
  THUMBNAIL_MAX_BYTES,
  storedFilesOf,
  type CheckedUpload,
  type UploadTarget,
} from "./attachment-uploads";
import { MULTIPART_FROM_BYTES } from "./upload-policy";

const PROJECT = "0199c3a0-0000-7000-8000-000000000001";
const text = (value: string) => new TextEncoder().encode(value);
const PDF = text("%PDF-1.7\nDrawing\n%%EOF");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const DWG = text("AC1027\0\0\0\0\0\x01");
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

const DRAWINGS: UploadTarget = {
  workspaceId: "w1",
  ownerId: PROJECT,
  policy: {
    purpose: "drawings",
    accept: "drawing",
    maxBytes: 100 * 1024 * 1024,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  },
};

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
    head: (key) => {
      const bytes = objects.get(key);
      return Promise.resolve(
        bytes == null
          ? null
          : {
              bytes: bytes.byteLength,
              contentType: "application/octet-stream",
            },
      );
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, objects };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

function setup() {
  const { storage, objects } = memoryStorage();
  const uploads = new AttachmentUploads(
    storage,
    UNLIMITED_PLAN,
    () => new Date("2026-10-10T10:00:00Z"),
  );
  const records = new Map<string, CheckedUpload>();
  /** Start, put the bytes, optionally a thumbnail, then complete. */
  const send = async (
    fileName: string,
    bytes: Uint8Array,
    thumbnail?: Uint8Array,
  ) => {
    const started = await uploads.start(DRAWINGS, {
      fileName,
      bytes: bytes.byteLength,
    });
    await uploads.receive(DRAWINGS, { key: started.key, bytes });
    if (thumbnail != null)
      await uploads.receiveThumbnail(DRAWINGS, {
        key: started.key,
        bytes: thumbnail,
      });
    return {
      key: started.key,
      completed: uploads.complete<CheckedUpload>(DRAWINGS, {
        key: started.key,
        fileName,
        recorded: () => {
          const found = records.get(started.key);
          return Promise.resolve(
            found == null ? null : { state: "live", value: found },
          );
        },
        record: (upload) => {
          records.set(upload.key, upload);
          return Promise.resolve(upload);
        },
      }),
    };
  };
  return { uploads, objects, records, send };
}

describe("AttachmentUploads (CM-407)", () => {
  it("keeps a DWG as a download and a PDF as viewable", async () => {
    const context = setup();
    const dwg = await context.send("GF plan.dwg", DWG);
    expect(await dwg.completed).toMatchObject({
      created: true,
      value: {
        kind: "dwg",
        contentType: "application/octet-stream",
        viewable: false,
        thumbnail: null,
        bytes: DWG.byteLength,
      },
    });
    const pdf = await context.send("GF plan.pdf", PDF);
    expect((await pdf.completed).value).toMatchObject({
      kind: "pdf",
      contentType: "application/pdf",
      viewable: true,
    });
  });

  it("refuses names and content the policy does not take, and drops the bytes", async () => {
    const context = setup();
    expect(
      await codeOf(
        context.uploads.start(DRAWINGS, { fileName: "BOQ.zip", bytes: 10 }),
      ),
    ).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(
      await codeOf(
        context.uploads.start(DRAWINGS, {
          fileName: "plan.pdf",
          bytes: DRAWINGS.policy.maxBytes + 1,
        }),
      ),
    ).toBe("FILE_TOO_LARGE");
    // A program renamed .pdf, and a zip renamed .pdf.
    for (const bytes of [EXE, Uint8Array.from([0x50, 0x4b, 3, 4, 0])]) {
      const sent = await context.send("plan.pdf", bytes);
      expect(await codeOf(sent.completed)).toBe("FILE_TYPE_NOT_ALLOWED");
      expect(context.objects.has(sent.key)).toBe(false);
    }
    expect(context.records.size).toBe(0);
  });

  it("records an image's thumbnail and counts it as a stored file", async () => {
    const context = setup();
    const sent = await context.send("site.png", PNG, WEBP);
    const { value } = await sent.completed;
    expect(value.thumbnail).toEqual({
      key: thumbnailKeyOf(sent.key),
      bytes: WEBP.byteLength,
    });
    const files = storedFilesOf(value, {
      workspaceId: "w1",
      kind: "drawing_revision",
      by: "u1",
      now: new Date("2026-10-10T10:00:00Z"),
    });
    expect(files.map((file) => [file.kind, file.contentType])).toEqual([
      ["drawing_revision", "image/png"],
      ["drawing_revision_thumbnail", "image/webp"],
    ]);
  });

  it("drops a thumbnail sent for a file that is not an image", async () => {
    const context = setup();
    const sent = await context.send("plan.pdf", PDF, WEBP);
    expect((await sent.completed).value.thumbnail).toBeNull();
    expect(context.objects.has(thumbnailKeyOf(sent.key))).toBe(false);
  });

  it("takes only a small WebP as a thumbnail, after the file arrived", async () => {
    const context = setup();
    const started = await context.uploads.start(DRAWINGS, {
      fileName: "site.png",
      bytes: PNG.byteLength,
    });
    const thumbnail = (bytes: Uint8Array, key = started.key) =>
      context.uploads.receiveThumbnail(DRAWINGS, { key, bytes });
    expect(await codeOf(thumbnail(WEBP))).toBe("UPLOAD_NOT_FOUND");
    await context.uploads.receive(DRAWINGS, { key: started.key, bytes: PNG });
    expect(await codeOf(thumbnail(PNG))).toBe("FILE_TYPE_NOT_ALLOWED");
    const large = new Uint8Array(THUMBNAIL_MAX_BYTES + 1);
    large.set(WEBP);
    expect(await codeOf(thumbnail(large))).toBe("FILE_TOO_LARGE");
    expect(await codeOf(thumbnail(WEBP, `${started.key}/../x.png`))).toBe(
      "UPLOAD_KEY_INVALID",
    );
    await thumbnail(WEBP);
    expect(context.objects.get(thumbnailKeyOf(started.key))).toEqual(WEBP);
  });

  it("is idempotent on the key and drops bytes sent to a deleted record", async () => {
    const context = setup();
    const sent = await context.send("plan.pdf", PDF);
    await sent.completed;
    const again = await context.uploads.complete(DRAWINGS, {
      key: sent.key,
      fileName: "plan.pdf",
      recorded: () =>
        Promise.resolve({ state: "live" as const, value: "first" }),
      record: () => Promise.reject(new Error("never called")),
    });
    expect(again).toEqual({ value: "first", created: false });
    expect(
      await codeOf(
        context.uploads.complete(DRAWINGS, {
          key: sent.key,
          fileName: "plan.pdf",
          recorded: () => Promise.resolve({ state: "deleted" as const }),
          record: () => Promise.reject(new Error("never called")),
        }),
      ),
    ).toBe("UPLOAD_NOT_FOUND");
    expect(context.objects.has(sent.key)).toBe(false);
  });

  it("splits large files into parts only where storage takes them directly", async () => {
    const context = setup();
    const started = await context.uploads.start(DRAWINGS, {
      fileName: "plan.pdf",
      bytes: MULTIPART_FROM_BYTES,
    });
    expect(started.upload).toEqual({ via: "app" });
    expect(context.uploads.takesDirectUploads()).toBe(false);

    const { storage } = memoryStorage();
    const direct = new AttachmentUploads(
      { ...storage, directUploads: { answer: () => Promise.resolve({}) } },
      UNLIMITED_PLAN,
    );
    const start = (bytes: number) =>
      direct.start(DRAWINGS, { fileName: "plan.pdf", bytes });
    expect((await start(MULTIPART_FROM_BYTES - 1)).upload).toEqual({
      via: "blob",
      multipart: false,
    });
    expect((await start(MULTIPART_FROM_BYTES)).upload).toEqual({
      via: "blob",
      multipart: true,
    });
    expect(
      await codeOf(direct.receive(DRAWINGS, { key: "x", bytes: PDF })),
    ).toBe("NOT_FOUND");
  });
});
