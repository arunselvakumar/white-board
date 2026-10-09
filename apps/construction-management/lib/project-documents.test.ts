import { describe, expect, it } from "vitest";

import {
  PROJECT_DOCUMENT_KIND_LABELS,
  checkDocumentFile,
  documentFileType,
  documentMeta,
  documentsSummary,
  formatBytes,
  groupDocumentsByKind,
  paperReference,
  type PaperReferences,
} from "./project-documents";

const MB = 1024 * 1024;

const NO_PAPERS: PaperReferences = {
  tenderRef: null,
  quotationNo: null,
  quotationDate: null,
  loaNo: null,
  loaDate: null,
  clientOrderNo: null,
  clientOrderDate: null,
  agreementNo: null,
  agreementDate: null,
};

describe("Project document helpers (CM-414)", () => {
  it("names each paper as screens do", () => {
    expect(PROJECT_DOCUMENT_KIND_LABELS).toEqual({
      tender: "Tender / RFQ ref.",
      quotation: "Quotation",
      loa: "LOA",
      client_order: "PO / WO",
      agreement: "Agreement",
      other: "Other",
    });
  });

  it("formats sizes in B, KB, MB and GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(1_258_291)).toBe("1.2 MB");
    expect(formatBytes(25 * MB)).toBe("25 MB");
    expect(formatBytes(6.8 * MB)).toBe("6.8 MB");
    expect(formatBytes(1.5 * 1024 * MB)).toBe("1.5 GB");
  });

  it("sums up the files", () => {
    expect(documentsSummary(5, 6.8 * MB)).toBe("5 files · 6.8 MB");
    expect(documentsSummary(1, 340 * 1024)).toBe("1 file · 340 KB");
  });

  it("refuses programs, empty files and files over 25 MB", () => {
    expect(checkDocumentFile({ name: "Work order signed.pdf", size: 10 })).toBe(
      null,
    );
    expect(checkDocumentFile({ name: "site photos.zip", size: 25 * MB })).toBe(
      null,
    );
    expect(checkDocumentFile({ name: "setup.EXE", size: 10 })?.code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    // Windows ignores trailing dots and spaces; so do we.
    expect(checkDocumentFile({ name: "setup.exe. ", size: 10 })?.code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(checkDocumentFile({ name: "app.apk", size: 10 })?.message).toBe(
      "Programs can't be kept on a Project.",
    );
    expect(checkDocumentFile({ name: "BOQ.xlsx", size: 0 })?.code).toBe(
      "FILE_EMPTY",
    );
    expect(checkDocumentFile({ name: "scan.pdf", size: 25 * MB + 1 })).toEqual({
      code: "FILE_TOO_LARGE",
      message: "Files can be at most 25 MB.",
    });
  });

  it("picks a file type from the content type, then the extension", () => {
    expect(documentFileType("scan", "application/pdf")).toBe("pdf");
    expect(documentFileType("site.bin", "image/jpeg")).toBe("image");
    expect(documentFileType("BOQ revised.xlsx")).toBe("spreadsheet");
    expect(documentFileType("photos.zip", "application/octet-stream")).toBe(
      "archive",
    );
    expect(documentFileType("plan.dwg")).toBe("drawing");
    expect(documentFileType("notes.docx")).toBe("text");
    expect(documentFileType("README")).toBe("file");
  });

  it("describes a file with its size, uploader and date", () => {
    expect(
      documentMeta({
        bytes: 1_258_291,
        createdAt: "2026-03-04T05:30:00.000Z",
        createdByName: "Karthik R",
      }),
    ).toBe("1.2 MB · Karthik R · 4 Mar 2026");
    // Dates are India's: 20:00 UTC is the next morning in Chennai.
    expect(
      documentMeta({
        bytes: 340 * 1024,
        createdAt: "2026-03-04T20:00:00.000Z",
        createdByName: null,
      }),
    ).toBe("340 KB · 5 Mar 2026");
  });

  it("finds each paper's number and date on the Project", () => {
    const project: PaperReferences = {
      ...NO_PAPERS,
      tenderRef: "TN/PWD/2026/88",
      quotationNo: "SBD/Q/2026/114",
      clientOrderNo: "WO/2026/031",
      clientOrderDate: "2026-03-03",
      agreementDate: "2026-03-20",
    };
    expect(paperReference("tender", project)).toEqual(["TN/PWD/2026/88"]);
    expect(paperReference("quotation", project)).toEqual(["SBD/Q/2026/114"]);
    expect(paperReference("client_order", project)).toEqual([
      "WO/2026/031",
      "3 Mar 2026",
    ]);
    expect(paperReference("agreement", project)).toEqual(["20 Mar 2026"]);
    expect(paperReference("loa", project)).toEqual([]);
    expect(paperReference("other", project)).toEqual([]);
  });

  it("groups files by paper in paper order, leaving empty papers out", () => {
    const groups = groupDocumentsByKind([
      { id: "1", kind: "other" as const },
      { id: "2", kind: "client_order" as const },
      { id: "3", kind: "quotation" as const },
      { id: "4", kind: "client_order" as const },
    ]);
    expect(
      groups.map((group) => [group.kind, group.items.map((item) => item.id)]),
    ).toEqual([
      ["quotation", ["3"]],
      ["client_order", ["2", "4"]],
      ["other", ["1"]],
    ]);
  });
});
