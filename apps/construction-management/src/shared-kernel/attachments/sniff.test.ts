import { describe, expect, it } from "vitest";

import {
  acceptsContent,
  isDwg,
  isDxf,
  isViewableKind,
  sniffUpload,
} from "./sniff";

const text = (value: string) => new TextEncoder().encode(value);

const PDF = text("%PDF-1.7\n%âãÏÓ\n");
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);
const ELF = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
const DWG = text("AC1032\0\0\0\0\0\x01");
const DXF = text("  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n");
const DXF_COMMENT = text("999\nDXF written by a CAD tool\n  0\nSECTION\n");
const BINARY_DXF = text("AutoCAD Binary DXF\r\n\x1a\0");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);

describe("sniffUpload (CM-407)", () => {
  it("tells PDFs and images by their first bytes, whatever the name", () => {
    expect(sniffUpload(PDF, "scan.jpg")).toEqual({
      kind: "pdf",
      contentType: "application/pdf",
    });
    expect(sniffUpload(PNG, "x.pdf")).toEqual({
      kind: "image",
      contentType: "image/png",
    });
    expect(sniffUpload(JPEG, "x").contentType).toBe("image/jpeg");
    expect(sniffUpload(WEBP, "x").contentType).toBe("image/webp");
  });

  it("finds programs, even renamed to look like a PDF or a drawing", () => {
    expect(sniffUpload(EXE, "invoice.pdf").kind).toBe("program");
    expect(sniffUpload(ELF, "plan.dwg").kind).toBe("program");
  });

  it("knows DWG by its version string and serves it as a download", () => {
    expect(isDwg(DWG)).toBe(true);
    expect(isDwg(text("AC10"))).toBe(false);
    expect(isDwg(text("AC1X15"))).toBe(false);
    expect(sniffUpload(DWG, "GF plan.dwg")).toEqual({
      kind: "dwg",
      contentType: "application/octet-stream",
    });
  });

  it("knows DXF text only under a .dxf name", () => {
    expect(isDxf(DXF)).toBe(true);
    expect(isDxf(DXF_COMMENT)).toBe(true);
    expect(isDxf(BINARY_DXF)).toBe(true);
    expect(isDxf(text("hello\nworld"))).toBe(false);
    expect(isDxf(text("  0\nSECTION\0\0"))).toBe(false);
    expect(sniffUpload(DXF, "GF plan.dxf")).toEqual({
      kind: "dxf",
      contentType: "application/octet-stream",
    });
    expect(sniffUpload(DXF, "notes.txt").kind).toBe("other");
  });

  it("serves anything else as octet-stream", () => {
    expect(sniffUpload(ZIP, "BOQ.zip")).toEqual({
      kind: "other",
      contentType: "application/octet-stream",
    });
  });
});

describe("acceptsContent (CM-407)", () => {
  it("keeps only what each policy accepts", () => {
    expect(acceptsContent("images", "image")).toBe(true);
    expect(acceptsContent("images", "pdf")).toBe(false);
    expect(acceptsContent("pdf_or_image", "pdf")).toBe(true);
    expect(acceptsContent("pdf_or_image", "other")).toBe(false);
    expect(acceptsContent("drawing", "dwg")).toBe(true);
    expect(acceptsContent("drawing", "dxf")).toBe(true);
    expect(acceptsContent("drawing", "other")).toBe(false);
    expect(acceptsContent("any_but_programs", "other")).toBe(true);
    for (const accept of [
      "images",
      "pdf_or_image",
      "any_but_programs",
      "drawing",
    ] as const)
      expect(acceptsContent(accept, "program")).toBe(false);
  });

  it("shows PDFs and images only", () => {
    expect(isViewableKind("pdf")).toBe(true);
    expect(isViewableKind("image")).toBe(true);
    expect(isViewableKind("dwg")).toBe(false);
    expect(isViewableKind("other")).toBe(false);
  });
});
