import { describe, expect, it } from "vitest";

import { DomainError } from "../domain-error";
import { checkDocument, sniffDocumentType } from "./document-file";

const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const GIF = new TextEncoder().encode("GIF89a......");

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
}

describe("checkDocument", () => {
  it("sniffs PDFs and the image types", () => {
    expect(sniffDocumentType(PDF)).toBe("application/pdf");
    expect(sniffDocumentType(PNG)).toBe("image/png");
    expect(sniffDocumentType(GIF)).toBeNull();
  });

  it("accepts a document whose declared type matches its content", () => {
    expect(checkDocument(PDF, "application/pdf", 1024)).toEqual({
      contentType: "application/pdf",
      extension: "pdf",
      bytes: PDF.byteLength,
    });
  });

  it("refuses empty, oversized, mislabelled and other files", () => {
    expect(
      codeOf(() => checkDocument(new Uint8Array(), "application/pdf", 9)),
    ).toBe("FILE_EMPTY");
    expect(codeOf(() => checkDocument(PDF, "application/pdf", 4))).toBe(
      "FILE_TOO_LARGE",
    );
    expect(codeOf(() => checkDocument(PDF, "image/png", 1024))).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(codeOf(() => checkDocument(GIF, "image/gif", 1024))).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
  });
});
