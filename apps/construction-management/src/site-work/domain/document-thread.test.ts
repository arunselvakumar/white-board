import { describe, expect, it } from "vitest";

import {
  assertNameAccepted,
  assertSizeAccepted,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  SITE_WORK_DOCUMENT_FILES_MAX,
  SITE_WORK_FILE_MAX_BYTES,
  SITE_WORK_REMARK_FILES_MAX,
  joinsGallery,
  siteWorkDocumentMediaRemoved,
  siteWorkDocumentNotFound,
  siteWorkFileIdOfKey,
  siteWorkFilePolicy,
  takesImagesOnly,
} from "./document-thread";

function codeOf(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
}

function nameCode(policy: UploadPolicy, fileName: string): string | null {
  return codeOf(() => {
    assertNameAccepted(policy, fileName);
  });
}

function sizeCode(policy: UploadPolicy, bytes: number): string | null {
  return codeOf(() => {
    assertSizeAccepted(policy, bytes);
  });
}

describe("site-work document files (CM-0016 §8)", () => {
  it("takes images only on a worksheet and a Site Diary", () => {
    for (const type of ["worksheet", "site_diary"] as const) {
      const policy = siteWorkFilePolicy(type);
      expect(takesImagesOnly(type)).toBe(true);
      expect(nameCode(policy, "Slab.jpg")).toBeNull();
      expect(nameCode(policy, "Slab.webp")).toBeNull();
      expect(nameCode(policy, "Report.pdf")).toBe("FILE_TYPE_NOT_ALLOWED");
    }
  });

  it("takes a PDF or an image on a usage sheet and a hindrance", () => {
    for (const type of ["equipment_usage", "hindrance"] as const) {
      const policy = siteWorkFilePolicy(type);
      expect(takesImagesOnly(type)).toBe(false);
      expect(nameCode(policy, "Log.pdf")).toBeNull();
      expect(nameCode(policy, "Meter.png")).toBeNull();
      expect(nameCode(policy, "Log.xlsx")).toBe("FILE_TYPE_NOT_ALLOWED");
      expect(nameCode(policy, "setup.exe")).toBe("FILE_TYPE_NOT_ALLOWED");
    }
  });

  it("keeps 25 MB a file, 20 a document and 10 a remark", () => {
    expect(SITE_WORK_FILE_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(SITE_WORK_DOCUMENT_FILES_MAX).toBe(20);
    expect(SITE_WORK_REMARK_FILES_MAX).toBe(10);
    const policy = siteWorkFilePolicy("hindrance");
    expect(policy.purpose).toBe("site-work-documents");
    expect(sizeCode(policy, SITE_WORK_FILE_MAX_BYTES)).toBeNull();
    expect(sizeCode(policy, SITE_WORK_FILE_MAX_BYTES + 1)).toBe(
      "FILE_TOO_LARGE",
    );
  });

  it("puts images in the Gallery, not PDFs", () => {
    expect(joinsGallery("image/jpeg")).toBe(true);
    expect(joinsGallery("image/png")).toBe(true);
    expect(joinsGallery("image/webp")).toBe(true);
    expect(joinsGallery("application/pdf")).toBe(false);
  });

  it("takes a file's id from its key", () => {
    expect(
      siteWorkFileIdOfKey(
        "companies/w1/site-work-documents/0199c4a0-0000-7000-8000-000000000001/0199c4a0-0000-7000-8000-00000000f001.jpg",
      ),
    ).toBe("0199c4a0-0000-7000-8000-00000000f001");
    expect(siteWorkFileIdOfKey("companies/w1/x/y/not-a-uuid.jpg")).toBeNull();
  });

  it("names a missing document by its type", () => {
    expect(siteWorkDocumentNotFound("worksheet")).toMatchObject({
      code: "WORKSHEET_NOT_FOUND",
      kind: "not_found",
    });
    expect(siteWorkDocumentNotFound("equipment_usage").code).toBe(
      "EQUIPMENT_SHEET_NOT_FOUND",
    );
    expect(siteWorkDocumentNotFound("site_diary").code).toBe(
      "SITE_DIARY_NOT_FOUND",
    );
    expect(siteWorkDocumentNotFound("hindrance").code).toBe(
      "HINDRANCE_NOT_FOUND",
    );
  });

  it("takes a deleted document's photos out of the Gallery", () => {
    const at = new Date("2026-10-08T10:00:00.000Z");
    expect(
      siteWorkDocumentMediaRemoved({
        workspaceId: "w1",
        projectId: "p1",
        type: "site_diary",
        documentId: "d1",
        at,
      }),
    ).toEqual({
      type: "ProjectMediaRemoved",
      workspaceId: "w1",
      occurredAt: at,
      projectId: "p1",
      source: "site_diary",
      sourceId: "d1",
    });
  });
});
