import { describe, expect, it } from "vitest";

import {
  isAttachmentKey,
  newAttachmentKey,
  thumbnailKeyOf,
} from "./attachment-key";
import { isProgramName } from "./program-names";
import {
  MULTIPART_FROM_BYTES,
  acceptedExtensions,
  assertNameAccepted,
  assertSizeAccepted,
  type UploadAccept,
  type UploadPolicy,
} from "./upload-policy";

const MB = 1024 * 1024;

function policy(accept: UploadAccept, maxBytes = 25 * MB): UploadPolicy {
  return {
    purpose: "test-files",
    accept,
    maxBytes,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  };
}

function codeOf(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("upload policies (CM-407)", () => {
  it("refuses programs by name under every policy", () => {
    for (const accept of [
      "images",
      "pdf_or_image",
      "any_but_programs",
      "drawing",
    ] as const)
      for (const name of ["setup.exe", "report.PDF.exe", "RUN.BAT", "x.js "])
        expect(
          codeOf(() => {
            assertNameAccepted(policy(accept), name);
          }),
          `${accept} ${name}`,
        ).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(isProgramName("setup.exe. ")).toBe(true);
    expect(isProgramName("plan.dwg")).toBe(false);
  });

  it("accepts only its own extensions when restricted", () => {
    const accepted = (accept: UploadAccept, name: string) =>
      codeOf(() => {
        assertNameAccepted(policy(accept), name);
      }) == null;
    expect(accepted("images", "site.JPEG")).toBe(true);
    expect(accepted("images", "site.pdf")).toBe(false);
    expect(accepted("pdf_or_image", "cube test.pdf")).toBe(true);
    expect(accepted("pdf_or_image", "cube test.docx")).toBe(false);
    expect(accepted("pdf_or_image", "no extension")).toBe(false);
    expect(accepted("drawing", "GF plan.dwg")).toBe(true);
    expect(accepted("drawing", "GF plan.DXF")).toBe(true);
    expect(accepted("drawing", "GF plan.zip")).toBe(false);
    expect(accepted("any_but_programs", "BOQ.zip")).toBe(true);
    expect(accepted("any_but_programs", "README")).toBe(true);
    expect(acceptedExtensions("any_but_programs")).toBeNull();
    expect(acceptedExtensions("drawing")).toContain("dwg");
  });

  it("refuses an empty file and one over the policy's largest", () => {
    const drawing = policy("drawing", 100 * MB);
    expect(
      codeOf(() => {
        assertSizeAccepted(drawing, 0);
      }),
    ).toBe("FILE_EMPTY");
    expect(
      codeOf(() => {
        assertSizeAccepted(drawing, 100 * MB);
      }),
    ).toBeNull();
    expect(
      codeOf(() => {
        assertSizeAccepted(drawing, 100 * MB + 1);
      }),
    ).toBe("FILE_TOO_LARGE");
  });

  it("uses the owner's words for a refused program", () => {
    const named: UploadPolicy = {
      ...policy("any_but_programs"),
      programMessage: "Programs cannot be kept on a Project.",
    };
    try {
      assertNameAccepted(named, "setup.exe");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Programs cannot be kept on a Project.",
      );
    }
  });
});

describe("attachment keys (CM-407)", () => {
  const WORKSPACE = "ws_Anugraha-1";
  const PROJECT = "0199c3a0-0000-7000-8000-000000000001";

  it("files the object under the Company, purpose and owner", () => {
    const key = newAttachmentKey(WORKSPACE, "drawings", PROJECT, "GF.Plan.DWG");
    expect(key).toMatch(
      new RegExp(
        `^companies/${WORKSPACE}/drawings/${PROJECT}/[0-9a-f-]{36}\\.dwg$`,
      ),
    );
    expect(isAttachmentKey(key, WORKSPACE, "drawings", PROJECT)).toBe(true);
    expect(isAttachmentKey(key, WORKSPACE, "testing-reports", PROJECT)).toBe(
      false,
    );
    expect(
      isAttachmentKey(`${key}/../x.pdf`, WORKSPACE, "drawings", PROJECT),
    ).toBe(false);
    expect(
      isAttachmentKey(thumbnailKeyOf(key), WORKSPACE, "drawings", PROJECT),
    ).toBe(false);
    expect(thumbnailKeyOf(key)).toBe(`${key}.thumb.webp`);
  });

  it("refuses unsafe ids", () => {
    expect(() =>
      newAttachmentKey("../x", "drawings", PROJECT, "a.pdf"),
    ).toThrow();
    expect(() =>
      newAttachmentKey(WORKSPACE, "a/b", PROJECT, "a.pdf"),
    ).toThrow();
  });
});
